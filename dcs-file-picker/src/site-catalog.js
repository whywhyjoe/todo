// The standard-sites catalog.
//
// Most apps do not want people hunting for a library: they want a short list
// of the two or three places files belong, with pasting an address still
// possible for everything else. That list is data, not code — a JSON document
// an app ships, fetches from a config file, or builds at runtime.
//
//   {
//     "sites": [
//       {
//         "label": "Team site",
//         "url": "https://contoso.sharepoint.com/sites/Team",
//         "default": true,
//         "libraries": [
//           { "label": "Documents", "path": "Shared Documents" },
//           { "label": "Pad exports", "path": "Shared Documents/pad", "hint": "Generated files" }
//         ]
//       },
//       { "label": "Brand assets", "url": "/sites/Brand", "libraries": ["Site Assets"] }
//     ]
//   }
//
// Every shorthand below is accepted, because a config file written by hand
// should not need to be exact:
//   · the top level may be the array itself, or { sites: [...] }
//   · a site may be a bare URL string
//   · a library may be a bare string — absolute ('/sites/Team/Shared Documents')
//     or relative to the site ('Shared Documents/pad')
//   · `url` may be absolute or server-relative ('/sites/Team')
//
// This module is pure: no network, no DOM, no origin checks. The provider
// applies the same-origin guard when it actually resolves a site.

import { normalizePath, joinPath, baseName } from './util/paths.js';

function pathOfUrl(url) {
  try { return normalizePath(decodeURIComponent(new URL(url, 'https://x.invalid').pathname)); }
  catch { return '/'; }
}

function normalizeSiteUrl(value) {
  const text = String(value || '').trim().replace(/\/+$/, '');
  if (!text) return '';
  // Server-relative ('/sites/Team') stays as-is; the provider resolves it
  // against the page's own origin, which is the only origin it will accept.
  return text;
}

function normalizeLibrary(entry, site) {
  const raw = typeof entry === 'string' ? { path: entry } : (entry || {});
  const given = String(raw.path || raw.url || '').trim();
  if (!given) return null;
  const path = given.startsWith('/')
    ? normalizePath(given)
    : joinPath(site.rootPath, given);
  return {
    path,
    label: String(raw.label || baseName(path) || path),
    hint: String(raw.hint || ''),
    siteUrl: site.url,
  };
}

function normalizeSite(entry, index) {
  const raw = typeof entry === 'string' ? { url: entry } : (entry || {});
  const url = normalizeSiteUrl(raw.url || raw.webUrl || raw.site);
  if (!url) return null;
  const rootPath = pathOfUrl(url);
  const site = {
    id: String(raw.id || url).toLowerCase(),
    url,
    rootPath,
    label: String(raw.label || raw.title || baseName(rootPath) || url),
    hint: String(raw.hint || raw.description || ''),
    isDefault: Boolean(raw.default ?? raw.isDefault ?? (index === 0 && raw.default !== false)),
    libraries: [],
  };
  const libraries = raw.libraries || raw.folders || [];
  site.libraries = (Array.isArray(libraries) ? libraries : [libraries])
    .map((library) => normalizeLibrary(library, site))
    .filter(Boolean);
  return site;
}

/**
 * @param {*} input  an array, a { sites } object, or anything falsy
 * @returns {{ sites: object[], byUrl(url): object|null, defaultSite(): object|null }}
 */
export function normalizeSiteCatalog(input) {
  const raw = Array.isArray(input) ? input : (input?.sites || input?.value || []);
  const sites = (Array.isArray(raw) ? raw : [])
    .map((entry, index) => normalizeSite(entry, index))
    .filter(Boolean);

  // First-listed wins as the default unless one is marked explicitly.
  const explicit = sites.find((site) => site.isDefault && site !== sites[0]);
  for (const site of sites) site.isDefault = false;
  const preferred = explicit || sites[0];
  if (preferred) preferred.isDefault = true;

  const index = new Map(sites.map((site) => [site.url.toLowerCase(), site]));
  const byPath = new Map(sites.map((site) => [site.rootPath.toLowerCase(), site]));

  return {
    sites,
    /** Match a resolved web URL back to its catalog entry (by URL or by path). */
    byUrl(url) {
      const text = String(url || '').trim().replace(/\/+$/, '');
      if (!text) return null;
      return index.get(text.toLowerCase())
        || byPath.get(pathOfUrl(text).toLowerCase())
        || null;
    },
    defaultSite() {
      return sites.find((site) => site.isDefault) || sites[0] || null;
    },
  };
}

/** Fetch a catalog document — `sites: loadSiteCatalog('/sites/App/config.json')`. */
export function loadSiteCatalog(url, { fetchImpl = (...args) => globalThis.fetch(...args) } = {}) {
  return async () => {
    const response = await fetchImpl(url, {
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
      cache: 'no-cache',
    });
    if (!response.ok) return [];
    try { return await response.json(); }
    catch { return []; }
  };
}
