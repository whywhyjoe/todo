// SharePoint provider — document libraries in the current tenant.
//
// Self-contained: it talks to /_api directly with `credentials: same-origin`
// and needs no PnPjs, no SPFx context, and no import from any host app. Drop it
// into any page served from the same tenant and it works.
//
// What it carries over from DCSPad, all of it paid for in production:
//   · one digest per web, cached with a 60 s safety margin, re-fetched on 403
//   · same-origin guard + per-web root boundary on every path it returns
//   · AddUsingPath for the bytes, ValidateUpdateListItem for the columns —
//     never $metadata-typed MERGE payloads
//   · a failed metadata write never re-uploads the file (the caller is handed
//     an uploaded-but-unlabelled result to retry against)
//   · document-library root folders have no list item, so the parent list is
//     resolved through GetList(@listUrl) when ListItemAllFields is empty
//
// Off SharePoint (no _spPageContextInfo) isAvailable() is false and the dialog
// simply does not offer this location.

import { defineProvider, finalizeListing } from '../provider.js';
import { FileBrokerError } from '../util/errors.js';
import { categoryOf, mimeForFileName } from '../categories.js';
import {
  normalizePath, parentPath, isWithin, joinPath, baseName,
} from '../util/paths.js';
import { fieldTarget, emptyValue } from '../metadata.js';
import { normalizeSiteCatalog } from '../site-catalog.js';

const ACCEPT_JSON = 'application/json;odata=nometadata';
const DIGEST_SAFETY_MS = 60_000;
const GUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

// ---- OData plumbing --------------------------------------------------------

function odataPathLiteral(value) {
  // Encode URL-significant characters such as # and %, but keep OData's
  // doubled-apostrophe escaping inside the surrounding string literal.
  return encodeURIComponent(String(value)).replaceAll("'", "''");
}

function resultArray(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.results)) return value.results;
  if (Array.isArray(value?.value)) return value.value;
  return [];
}

function unwrapJson(data) {
  return data?.d?.GetContextWebInformation || data?.GetContextWebInformation || data?.d || data;
}

async function responseMessage(response) {
  try {
    const body = await response.clone().json();
    return body?.error?.message?.value || body?.error?.message
      || body?.['odata.error']?.message?.value || '';
  } catch {
    try { return (await response.text()).trim(); } catch { return ''; }
  }
}

async function requireOk(response, fallback, code) {
  if (response.ok) return response;
  const detail = await responseMessage(response);
  let message = detail || `${fallback} (HTTP ${response.status})`;
  let normalized = code;
  if (response.status === 401 || response.status === 403) {
    message = detail || 'SharePoint denied this request. Check library permissions and try again.';
    normalized = 'permission';
  } else if (response.status === 404) {
    message = detail || 'The SharePoint file or folder was not found.';
    normalized = 'not-found';
  } else if (response.status === 409) {
    message = detail || 'A SharePoint file with that name already exists.';
    normalized = 'conflict';
  }
  throw new FileBrokerError(message, { code: normalized, status: response.status });
}

// ---- SharePoint column type <-> neutral field type -------------------------

const NEUTRAL_TYPE = {
  Text: 'text',
  Note: 'multiline',
  Choice: 'choice',
  MultiChoice: 'multichoice',
  Boolean: 'boolean',
  Number: 'number',
  Currency: 'number',
  DateTime: 'date',
  URL: 'url',
};

// Columns that are item *content*, not metadata — corrupting a modern page
// body from a metadata form is the one unrecoverable mistake available here.
const NEVER_EDIT = new Set([
  'CanvasContent1', 'LayoutWebpartsContent', 'ContentType', 'Attachments',
]);

export function neutralTypeFor(typeAsString) {
  return NEUTRAL_TYPE[String(typeAsString || '')] || '';
}

/**
 * Neutral value -> the FieldValue *string* ValidateUpdateListItem expects.
 * Conventions (verified against SPO):
 *   text/multiline/choice  the string verbatim ('' clears)
 *   multichoice/tags       ';#A;#B;#' — ;#-delimited, leading AND trailing ;#
 *   boolean                '1' / '0'
 *   number                 invariant numeric string, '.' decimal separator
 *   date                   ISO 8601
 *   url                    'https://…, description'
 * Not written by this provider (formats recorded for a later tier):
 *   User/UserMulti     '[{"Key":"i:0#.f|membership|user@x"}]'
 *   Lookup(Multi)      '1' / '1;#2;#'
 *   TaxonomyFieldType  'Label|guid;'
 */
export function toFormValue(field, value) {
  switch (field.type) {
    case 'multichoice':
    case 'tags': {
      const list = Array.isArray(value) ? value.filter(Boolean) : [];
      return list.length ? `;#${list.join(';#')};#` : '';
    }
    case 'boolean':
      return value ? '1' : '0';
    case 'number': {
      const text = String(value ?? '').trim();
      return text === '' ? '' : String(Number(text.replace(',', '.')));
    }
    case 'date': {
      const text = String(value ?? '').trim();
      if (!text) return '';
      const date = new Date(text);
      return Number.isNaN(date.getTime()) ? text : date.toISOString();
    }
    case 'url': {
      const url = String(value?.url ?? '').trim();
      const description = String(value?.description ?? '').trim();
      if (!url) return '';
      return description ? `${url}, ${description}` : url;
    }
    default:
      return String(value ?? '');
  }
}

/** A REST item value -> the neutral value the form edits. */
export function fromItemValue(field, value) {
  switch (field.type) {
    case 'multichoice':
    case 'tags': {
      if (Array.isArray(value)) return value;
      if (Array.isArray(value?.results)) return value.results;
      return String(value ?? '').split(';#').filter(Boolean);
    }
    case 'boolean':
      return value === true || value === 1 || /^(1|true|yes)$/i.test(String(value ?? ''));
    case 'number':
      return value === null || value === undefined ? '' : String(value);
    case 'date': {
      const text = String(value ?? '').trim();
      if (!text) return '';
      const date = new Date(text);
      if (Number.isNaN(date.getTime())) return text;
      const pad = (n) => String(n).padStart(2, '0');
      // The form edits dates with <input type="datetime-local">, which wants
      // local 'YYYY-MM-DDTHH:mm' with no zone suffix.
      return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
        + `T${pad(date.getHours())}:${pad(date.getMinutes())}`;
    }
    case 'url':
      return {
        url: String(value?.Url ?? value?.url ?? '').trim(),
        description: String(value?.Description ?? value?.description ?? '').trim(),
      };
    default:
      return value === null || value === undefined ? '' : String(value);
  }
}

// ---- context ---------------------------------------------------------------

function readPageContext() {
  const context = globalThis._spPageContextInfo
    || globalThis._spPageContextInfo?.legacyPageContext
    || globalThis.moduleLoaderPageContext?.legacyPageContext
    || null;
  if (!context?.webAbsoluteUrl) return null;
  return context;
}

// ---- provider --------------------------------------------------------------

/**
 * @param {object} [options]
 * @param {Function} [options.fetchImpl]     injectable fetch (tests)
 * @param {Function} [options.getContext]    () => _spPageContextInfo-shaped object
 * @param {string}   [options.webUrl]        pin to one web instead of the page's
 * @param {boolean}  [options.allowSiteSwitch] show the "SharePoint site" locator (default true)
 * @param {number}   [options.pageSize]      $top for listings (default 5000)
 * @param {*}        [options.sites]         standard-sites catalog: an array, a
 *                                           `{ sites: [...] }` document, or an
 *                                           async loader returning either (see
 *                                           site-catalog.js and loadSiteCatalog)
 * @param {boolean}  [options.discoverLibraries] also list the libraries the site
 *                                           actually has (default true; set false
 *                                           to offer only the configured ones)
 */
export function sharePointProvider(options = {}) {
  const fetchImpl = options.fetchImpl || ((...args) => globalThis.fetch(...args));
  const getContext = options.getContext || readPageContext;
  const pageSize = Number(options.pageSize) || 5000;
  const digestCache = new Map();
  const listIdCache = new Map();
  const fieldsCache = new Map();
  let catalogPromise = null;

  // The catalog is resolved once and reused: a loader that fetches a config
  // file should not run again every time the dialog opens.
  function catalog() {
    if (!catalogPromise) {
      catalogPromise = Promise.resolve(
        typeof options.sites === 'function' ? options.sites() : options.sites,
      ).then(normalizeSiteCatalog).catch(() => normalizeSiteCatalog(null));
    }
    return catalogPromise;
  }

  function hostWebUrl() {
    const pinned = options.webUrl || getContext()?.webAbsoluteUrl;
    if (!pinned) {
      throw new FileBrokerError(
        'SharePoint file transfer needs a live SharePoint page context.',
        { code: 'not-available' },
      );
    }
    return String(pinned).replace(/\/+$/, '');
  }

  // Every candidate web is checked against the page's own origin — this
  // provider is same-tenant by construction, never a generic HTTP client.
  function resolveWeb(candidate = '') {
    const host = hostWebUrl();
    if (!candidate) return host;
    try {
      const url = new URL(String(candidate).trim(), host);
      if (!/^https?:$/.test(url.protocol) || url.origin !== new URL(host).origin) {
        throw new Error('origin');
      }
      url.hash = '';
      url.search = '';
      return url.href.replace(/\/+$/, '');
    } catch {
      throw new FileBrokerError(
        'Enter a SharePoint site URL on this tenant, such as /sites/ProjectName.',
        { code: 'invalid-location' },
      );
    }
  }

  // Where the dialog starts when nothing else says otherwise: the catalog's
  // default site if it is on this tenant, else the page's own web.
  async function defaultWeb() {
    const site = (await catalog()).defaultSite();
    if (site) {
      try { return resolveWeb(site.url); }
      catch { /* configured for another tenant — fall through to the page's web */ }
    }
    return hostWebUrl();
  }

  function rootPathOf(webUrl) {
    try {
      return normalizePath(decodeURIComponent(new URL(webUrl).pathname));
    } catch { return '/'; }
  }

  function checkedPath(path, rootPath) {
    const normalized = normalizePath(path || rootPath);
    if (!isWithin(normalized, rootPath)) {
      throw new FileBrokerError('That path is outside the current SharePoint site.', {
        code: 'outside-root',
      });
    }
    return normalized;
  }

  function webOf(location) {
    const webUrl = resolveWeb(location?.webUrl || location?.providerData?.webUrl || '');
    return { webUrl, rootPath: rootPathOf(webUrl) };
  }

  async function request(url, init = {}) {
    try {
      return await fetchImpl(url, { credentials: 'same-origin', ...init });
    } catch (cause) {
      throw new FileBrokerError(`Could not reach SharePoint (${cause.message || cause}).`, {
        code: 'network', cause,
      });
    }
  }

  async function getJson(url, fallback, code) {
    const response = await request(url, { headers: { Accept: ACCEPT_JSON } });
    await requireOk(response, fallback, code);
    return unwrapJson(await response.json()) || {};
  }

  async function fetchContextInfo(webUrl) {
    const response = await request(`${webUrl}/_api/contextinfo`, {
      method: 'POST',
      headers: { Accept: ACCEPT_JSON },
    });
    await requireOk(response, 'Could not obtain a SharePoint request context', 'permission');
    const info = unwrapJson(await response.json()) || {};
    const value = info.FormDigestValue || info.formDigestValue;
    if (!value) {
      throw new FileBrokerError('SharePoint returned no request digest.', { code: 'write' });
    }
    const seconds = Number(info.FormDigestTimeoutSeconds || info.formDigestTimeoutSeconds) || 1800;
    const canonical = resolveWeb(info.WebFullUrl || info.webFullUrl || webUrl);
    const cached = { value, expiresAt: Date.now() + seconds * 1000, webUrl: canonical };
    digestCache.set(webUrl.toLowerCase(), cached);
    digestCache.set(canonical.toLowerCase(), cached);
    return cached;
  }

  async function getDigest(webUrl, { force = false } = {}) {
    const cached = digestCache.get(webUrl.toLowerCase());
    if (!force && cached && cached.expiresAt - DIGEST_SAFETY_MS > Date.now()) return cached.value;

    // The page digest is only a candidate for the web that served the page;
    // any other site always gets its own /contextinfo call.
    if (!force && !cached && webUrl === hostWebUrl()) {
      const context = getContext();
      const seconds = Number(context?.formDigestTimeoutSeconds) || 0;
      if (context?.formDigestValue && seconds > 0) {
        const page = {
          value: context.formDigestValue,
          expiresAt: Date.now() + seconds * 1000,
          webUrl,
        };
        digestCache.set(webUrl.toLowerCase(), page);
        if (page.expiresAt - DIGEST_SAFETY_MS > Date.now()) return page.value;
      }
    }
    return (await fetchContextInfo(webUrl)).value;
  }

  // POST with the digest, retrying once on the 403 that a stale digest gives.
  async function post(webUrl, url, { body, contentType = ACCEPT_JSON }, fallback, code) {
    const attempt = async (force) => request(url, {
      method: 'POST',
      headers: {
        Accept: ACCEPT_JSON,
        'Content-Type': contentType,
        'X-RequestDigest': await getDigest(webUrl, { force }),
      },
      body,
    });
    let response = await attempt(false);
    if (response.status === 403) response = await attempt(true);
    await requireOk(response, fallback, code);
    try { return unwrapJson(await response.json()) || {}; }
    catch { return {}; }   // a successful write may return no JSON body
  }

  // ---- listing ------------------------------------------------------------

  async function collect(webUrl, endpoint) {
    const items = [];
    let url = endpoint;
    let guard = 0;
    while (url && guard < 20) {
      const data = await getJson(url, 'Could not list the SharePoint folder', 'read');
      items.push(...resultArray(data.value ?? data));
      url = data['odata.nextLink'] || data.__next || '';
      guard += 1;
    }
    return { items, partial: Boolean(url) };
  }

  async function documentLibraries(webUrl) {
    const data = await getJson(
      `${webUrl}/_api/web/lists?$select=Title,BaseType,Hidden,RootFolder/ServerRelativeUrl`
      + '&$expand=RootFolder&$orderby=Title&$top=500',
      'Could not list the document libraries', 'read',
    );
    return resultArray(data.value ?? data)
      .filter((list) => list.BaseType === 1 && !list.Hidden && list.RootFolder?.ServerRelativeUrl)
      .map((list) => ({
        path: normalizePath(list.RootFolder.ServerRelativeUrl),
        label: list.Title,
      }));
  }

  // ---- metadata -----------------------------------------------------------

  async function listIdFor(webUrl, folderPath) {
    const key = `${webUrl}|${folderPath}`.toLowerCase();
    if (listIdCache.has(key)) return listIdCache.get(key);

    const promise = (async () => {
      const viaItem = await getJson(
        `${webUrl}/_api/web/GetFolderByServerRelativePath(decodedUrl='${odataPathLiteral(folderPath)}')`
        + '?$select=ListItemAllFields/ParentList/Id'
        + '&$expand=ListItemAllFields,ListItemAllFields/ParentList',
        'Could not resolve the destination library', 'metadata-read',
      ).catch(() => ({}));
      let id = String(viaItem?.ListItemAllFields?.ParentList?.Id
        || viaItem?.ListItemAllFields?.ParentList?.ID || '').replace(/[{}]/g, '').trim();

      // A library's ROOT folder has no list item, so ParentList comes back
      // empty even though files can be saved there. Resolve by URL instead.
      if (!GUID.test(id)) {
        const viaUrl = await getJson(
          `${webUrl}/_api/web/GetList(@listUrl)?@listUrl='${odataPathLiteral(folderPath)}'&$select=Id`,
          'Could not resolve the destination library', 'metadata-read',
        );
        id = String(viaUrl.Id || viaUrl.ID || '').replace(/[{}]/g, '').trim();
      }
      if (!GUID.test(id)) {
        throw new FileBrokerError('SharePoint did not identify the destination library.', {
          code: 'metadata-read',
        });
      }
      return id;
    })().catch((error) => { listIdCache.delete(key); throw error; });

    listIdCache.set(key, promise);
    return promise;
  }

  function listFields(webUrl, listId) {
    const key = `${webUrl}|${listId}`.toLowerCase();
    if (!fieldsCache.has(key)) {
      fieldsCache.set(key, getJson(
        `${webUrl}/_api/web/lists(guid'${listId}')/Fields`
        + '?$select=InternalName,EntityPropertyName,Title,TypeAsString,ReadOnlyField,'
        + 'Hidden,Required,Description,Choices,FillInChoice&$top=500',
        'Could not inspect the library columns', 'metadata-read',
      ).then((data) => resultArray(data.value ?? data))
        .catch((error) => { fieldsCache.delete(key); throw error; }));
    }
    return fieldsCache.get(key);
  }

  // Why a declared field is not writable here — the message the dialog shows
  // next to a greyed-out control.
  function unavailableReason(column, field) {
    if (!column) return `${fieldTarget(field, 'sharepoint')} is not a column in this library.`;
    if (column.ReadOnlyField) return `${column.InternalName} is read-only.`;
    if (column.Hidden) return `${column.InternalName} is hidden in this library.`;
    if (NEVER_EDIT.has(column.InternalName)) return `${column.InternalName} holds page content, not metadata.`;
    const neutral = neutralTypeFor(column.TypeAsString);
    if (!neutral) return `${column.InternalName} is a ${column.TypeAsString} column, which this editor cannot write yet.`;
    if (field && field.type !== neutral) {
      return `${column.InternalName} is a ${column.TypeAsString} column; the app declared it as ${field.type}.`;
    }
    return '';
  }

  function fieldFromColumn(column) {
    return {
      key: column.InternalName,
      label: column.Title || column.InternalName,
      type: neutralTypeFor(column.TypeAsString) || 'text',
      name: column.InternalName,
      target: {},
      required: Boolean(column.Required),
      hint: String(column.Description || ''),
      choices: resultArray(column.Choices),
      maxLength: 0,
      readOnly: false,
    };
  }

  return defineProvider({
    id: options.id || 'sharepoint',
    label: options.label || 'SharePoint',
    hint: options.hint || 'Document libraries in this tenant',
    capabilities: {
      browse: true,
      read: true,
      write: true,
      metadata: true,
      discoverMetadata: true,
      overwriteCheck: true,
      locator: options.allowSiteSwitch !== false,
    },

    isAvailable: () => Boolean(options.webUrl || getContext()?.webAbsoluteUrl),

    /** The configured catalog, for apps that want to render their own chooser. */
    sites: () => catalog(),

    // "Pick a site, or paste one" — the dialog renders `options()` as a select
    // and the input as the paste-an-address escape hatch.
    locator: options.allowSiteSwitch === false ? undefined : {
      label: 'SharePoint site',
      placeholder: 'https://tenant.sharepoint.com/sites/project',
      hint: 'Any site on this tenant.',
      current: () => hostWebUrl(),
      // Standard sites for the dropdown. Empty array → the dialog shows only
      // the paste box, which is the no-catalog behaviour.
      async options() {
        const { sites } = await catalog();
        return sites.map((site) => ({
          value: site.url,
          label: site.label,
          hint: site.hint,
          isDefault: site.isDefault,
        }));
      },
      async resolve(text) {
        const webUrl = resolveWeb(text);
        // /contextinfo both proves the site exists and warms its digest.
        const info = await fetchContextInfo(webUrl);
        return {
          path: rootPathOf(info.webUrl),
          label: baseName(rootPathOf(info.webUrl)) || info.webUrl,
          rootPath: rootPathOf(info.webUrl),
          webUrl: info.webUrl,
        };
      },
    },

    // Places for one web: the libraries the app configured for it, then the
    // ones the site actually has, then the site root. `location` is omitted on
    // the first call, which is what makes the catalog's default site the
    // starting point when the app has one.
    async roots(location = null) {
      const cat = await catalog();
      let webUrl;
      try {
        webUrl = location?.webUrl ? resolveWeb(location.webUrl) : await defaultWeb();
      } catch { webUrl = hostWebUrl(); }
      const rootPath = rootPathOf(webUrl);
      const entry = cat.byUrl(webUrl);
      const places = [];
      const seen = new Set();
      const add = (place) => {
        const key = place.path.toLowerCase();
        if (seen.has(key)) return;
        seen.add(key);
        places.push({ ...place, rootPath, webUrl });
      };

      for (const library of entry?.libraries || []) {
        add({ path: library.path, label: library.label, hint: library.hint });
      }
      // A catalog that lists libraries is a curated set; discovery is still on
      // by default so nothing becomes unreachable, and off when the app says so.
      if (options.discoverLibraries !== false || !entry?.libraries.length) {
        try {
          for (const library of await documentLibraries(webUrl)) add(library);
        } catch { /* a permissions-trimmed site still browses from its root */ }
      }
      add({ path: rootPath, label: 'Site root' });
      return places;
    },

    async list(location, { accept } = {}) {
      const { webUrl, rootPath } = webOf(location);
      const path = checkedPath(location?.path, rootPath);
      const [folders, files] = await Promise.all([
        collect(webUrl,
          `${webUrl}/_api/web/GetFolderByServerRelativePath(decodedUrl='${odataPathLiteral(path)}')`
          + `/Folders?$select=Name,ServerRelativeUrl,ItemCount,TimeLastModified&$top=${pageSize}`),
        collect(webUrl,
          `${webUrl}/_api/web/GetFolderByServerRelativePath(decodedUrl='${odataPathLiteral(path)}')`
          + '/Files?$select=Name,ServerRelativeUrl,Length,TimeLastModified,UIVersionLabel'
          + `&$top=${pageSize}`),
      ]);
      return finalizeListing({
        path,
        rootPath,
        parentPath: parentPath(path, rootPath),
        partial: folders.partial || files.partial,
        accept,
        folders: folders.items
          .filter((folder) => folder.Name && !String(folder.Name).startsWith('_'))
          .map((folder) => ({
            name: String(folder.Name),
            path: checkedPath(folder.ServerRelativeUrl, rootPath),
            modified: folder.TimeLastModified || '',
            providerData: { webUrl },
          })),
        files: files.items.map((file) => ({
          name: String(file.Name),
          path: checkedPath(file.ServerRelativeUrl, rootPath),
          size: Number(file.Length) || 0,
          modified: file.TimeLastModified || '',
          version: file.UIVersionLabel || '',
          mimeType: mimeForFileName(file.Name),
          category: categoryOf(file.Name),
          url: `${new URL(webUrl).origin}${encodeURI(checkedPath(file.ServerRelativeUrl, rootPath))}`,
          providerData: { webUrl },
        })),
      });
    },

    async read(entry, { as = 'text' } = {}) {
      const { webUrl, rootPath } = webOf(entry.providerData ? { webUrl: entry.providerData.webUrl } : {});
      const path = checkedPath(entry.path, rootPath);
      const response = await request(
        `${webUrl}/_api/web/GetFileByServerRelativePath(decodedUrl='${odataPathLiteral(path)}')/$value`,
      );
      await requireOk(response, 'Could not download the SharePoint file', 'read');
      const base = {
        name: baseName(path),
        path,
        mimeType: mimeForFileName(path),
        size: Number(response.headers.get('content-length')) || 0,
      };
      if (as === 'none') return base;
      if (as === 'blob') return { ...base, blob: await response.blob() };
      if (as === 'arrayBuffer') return { ...base, data: await response.arrayBuffer() };
      return { ...base, text: await response.text() };
    },

    async write(location, name, data, { overwrite = false } = {}) {
      const { webUrl, rootPath } = webOf(location);
      const folder = checkedPath(location?.path, rootPath);
      const result = await post(
        webUrl,
        `${webUrl}/_api/web/GetFolderByServerRelativePath(decodedUrl='${odataPathLiteral(folder)}')`
        + `/Files/AddUsingPath(decodedUrl='${odataPathLiteral(name)}',`
        + `overwrite=${overwrite ? 'true' : 'false'})`,
        { body: data, contentType: 'application/octet-stream' },
        'Could not upload the SharePoint file', 'write',
      );
      const path = normalizePath(result.ServerRelativeUrl || joinPath(folder, name));
      return {
        name,
        path,
        url: `${new URL(webUrl).origin}${encodeURI(path)}`,
        overwritten: Boolean(overwrite),
        providerData: { webUrl },
      };
    },

    /**
     * target: { path (file, optional), folderPath (required), webUrl }
     * mode:   'declared' → only the app's schema, each marked available or not
     *         'discover' → the schema first, then every other writable column
     */
    async getMetadata(target, { schema = [], mode = 'declared' } = {}) {
      const { webUrl, rootPath } = webOf(target);
      const folder = checkedPath(target.folderPath || parentPath(target.path, rootPath), rootPath);
      const listId = await listIdFor(webUrl, folder);
      const columns = await listFields(webUrl, listId);
      const byInternal = new Map(columns.map((c) => [String(c.InternalName).toLowerCase(), c]));

      const entries = [];
      const claimed = new Set();
      for (const field of schema) {
        const internal = fieldTarget(field, 'sharepoint');
        const column = byInternal.get(String(internal).toLowerCase());
        if (column) claimed.add(String(column.InternalName).toLowerCase());
        const reason = field.readOnly ? '' : unavailableReason(column, field);
        entries.push({
          field: {
            ...field,
            // A declared choice field inherits the library's actual choices.
            choices: field.choices?.length ? field.choices : resultArray(column?.Choices),
          },
          internalName: column?.InternalName || internal,
          entityPropertyName: column?.EntityPropertyName || column?.InternalName || internal,
          available: !reason && !field.readOnly,
          reason,
          value: emptyValue(field),
        });
      }

      if (mode === 'discover') {
        for (const column of columns) {
          if (claimed.has(String(column.InternalName).toLowerCase())) continue;
          if (column.Hidden || column.ReadOnlyField) continue;
          if (NEVER_EDIT.has(column.InternalName)) continue;
          if (!neutralTypeFor(column.TypeAsString)) continue;
          const field = fieldFromColumn(column);
          entries.push({
            field,
            internalName: column.InternalName,
            entityPropertyName: column.EntityPropertyName || column.InternalName,
            available: true,
            reason: '',
            value: emptyValue(field),
            discovered: true,
          });
        }
      }

      // Existing file → read the current values for every column we can write.
      if (target.path) {
        const path = checkedPath(target.path, rootPath);
        const selected = entries.filter((e) => e.available).map((e) => e.entityPropertyName);
        if (selected.length) {
          const item = await getJson(
            `${webUrl}/_api/web/GetFileByServerRelativePath(decodedUrl='${odataPathLiteral(path)}')`
            + `/ListItemAllFields?$select=${selected.map(encodeURIComponent).join(',')}`,
            'Could not read the file metadata', 'metadata-read',
          );
          for (const entry of entries) {
            if (!entry.available) continue;
            const raw = item[entry.entityPropertyName] ?? item[entry.internalName];
            entry.value = fromItemValue(entry.field, raw);
          }
        }
      }

      const supported = entries.some((entry) => entry.available);
      return {
        supported: true,
        notice: supported ? '' :
          'None of the requested metadata columns are writable in this library. '
          + 'The file can still be saved.',
        fields: entries,
        providerData: { webUrl, listId, folder },
      };
    },

    async setMetadata(target, state, values) {
      const { webUrl, rootPath } = webOf(target);
      const path = checkedPath(target.path, rootPath);
      const formValues = (state?.fields || [])
        .filter((entry) => entry.available && Object.hasOwn(values || {}, entry.field.key))
        .map((entry) => ({
          FieldName: entry.internalName,
          FieldValue: toFormValue(entry.field, values[entry.field.key]),
        }));
      if (!formValues.length) return { updated: [] };

      const data = await post(
        webUrl,
        `${webUrl}/_api/web/GetFileByServerRelativePath(decodedUrl='${odataPathLiteral(path)}')`
        + '/ListItemAllFields/ValidateUpdateListItem',
        { body: JSON.stringify({ formValues, bNewDocumentUpdate: true }) },
        'Could not save the SharePoint file metadata', 'metadata-write',
      );

      const results = resultArray(data.value || data.ValidateUpdateListItem || data);
      const failures = results.filter((r) => r.HasException || String(r.ErrorMessage || '').trim());
      if (failures.length) {
        // Map SharePoint's per-column rejections back onto app-side field keys
        // so the form can put each message under the control that caused it.
        const keyByInternal = new Map((state?.fields || [])
          .map((entry) => [entry.internalName, entry.field.key]));
        const fieldErrors = {};
        for (const failure of failures) {
          fieldErrors[keyByInternal.get(failure.FieldName) || failure.FieldName || ''] =
            failure.ErrorMessage || 'SharePoint rejected the value.';
        }
        throw new FileBrokerError(
          `SharePoint rejected the metadata. ${failures
            .map((f) => `${f.FieldName || 'Field'}: ${f.ErrorMessage || 'rejected'}`).join(' ')}`,
          { code: 'metadata-write', fieldErrors },
        );
      }
      return { updated: formValues.map((value) => value.FieldName) };
    },

    downloadUrl(entry) {
      const { webUrl } = webOf(entry.providerData ? { webUrl: entry.providerData.webUrl } : {});
      return `${webUrl}/_layouts/15/download.aspx?SourceUrl=${encodeURIComponent(entry.path)}`;
    },
  });
}
