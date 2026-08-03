// DCS File Broker — public entry point.
//
// One component for every "get a file in" / "put a file out" moment in a DCS
// app, across the local disk and SharePoint document libraries, with the
// library's metadata columns handled in the same breath.
//
//   const broker = createFileBroker({
//     providers: [localProvider(), sharePointProvider()],
//     metadata: DCSPAD_METADATA_FIELDS,
//   });
//
//   const picked = await broker.open({ accept: ['web', 'code'], read: 'text' });
//   const saved  = await broker.save({ data: text, suggestedName: 'app.js' });
//
// Both resolve `null` when the user cancels — cancelling is not an error.
//
// Everything below the dialog is usable headlessly: broker.list/read/write/
// getMetadata/setMetadata drive the same providers with no UI at all, which is
// how an app builds a bespoke picker without giving up the plumbing.

import { compileAccept, categoryOf, mimeForFileName } from './categories.js';
import {
  resolveMetadataConfig, coerceValue, valuesOf, availableCount, normalizeSchema,
} from './metadata.js';
import { FileBrokerError, brokerError } from './util/errors.js';
import { normalizePath, isWithin, fileNameProblem } from './util/paths.js';
import { createFileDialog } from './dialog.js';
import { resolveStore, createRecall } from './storage.js';

export const DEFAULT_MAX_READ_BYTES = 25 * 1024 * 1024;
// SharePoint's single-request AddUsingPath ceiling; chunked upload is not v1.
export const DEFAULT_MAX_WRITE_BYTES = 50 * 1024 * 1024;

function byteLength(data) {
  if (data === undefined || data === null) return 0;
  if (typeof data === 'string') return new Blob([data]).size;
  return data.byteLength ?? data.size ?? 0;
}

/**
 * @param {object} config
 * @param {object[]} config.providers        provider objects (see provider.js)
 * @param {string}  [config.defaultProvider] provider id the dialog opens on
 * @param {*}       [config.metadata]        schema, { fields, mode }, or an async resolver
 * @param {*}       [config.accept]          default accept spec for every call
 * @param {number}  [config.maxReadBytes]
 * @param {number}  [config.maxWriteBytes]
 * @param {Function}[config.dialog]          swap the whole UI: (deps) => { open(request) }
 * @param {object}  [config.strings]         label overrides, merged into the dialog's
 * @param {'dcs'|'basic'|'none'} [config.theme]  visual style; default 'dcs'
 * @param {boolean} [config.injectStyles]    default true; false if you ship your own CSS
 * @param {Element} [config.mount]           where the <dialog> is appended (default body)
 * @param {*}       [config.storage]         false to remember nothing, or a custom
 *                                           { read, write } store; default localStorage
 * @param {string}  [config.storageKey]      localStorage key (default dcs-file-broker.v1)
 * @param {Function}[config.onEvent]         (name, detail) telemetry hook
 */
export function createFileBroker(config = {}) {
  const providers = [...(config.providers || [])];
  if (!providers.length) {
    throw new FileBrokerError('A file broker needs at least one provider.', {
      code: 'not-available',
    });
  }
  const dialogFactory = config.dialog || createFileDialog;
  // Where "open where I left off" lives. One seam, per invariant: nothing else
  // in the package touches persistent storage.
  const recall = createRecall(resolveStore(config.storage, { key: config.storageKey }));
  const emit = (name, detail) => {
    try { config.onEvent?.(name, detail); } catch { /* telemetry never breaks a transfer */ }
  };

  const byId = new Map(providers.map((provider) => [provider.id, provider]));

  function provider(id) {
    const found = byId.get(id);
    if (!found) {
      throw new FileBrokerError(`Unknown provider "${id}".`, { code: 'not-available' });
    }
    return found;
  }

  async function availableProviders(ids = null) {
    const candidates = ids?.length
      ? ids.map((id) => provider(id))
      : providers;
    const flags = await Promise.all(candidates.map(async (candidate) => {
      try { return await candidate.isAvailable(); }
      catch { return false; }
    }));
    return candidates.map((candidate, index) => ({
      provider: candidate,
      available: Boolean(flags[index]),
    }));
  }

  // ---- headless plumbing -------------------------------------------------

  async function list(providerId, location, { accept } = {}) {
    const target = provider(providerId);
    const compiled = accept?.matches ? accept : compileAccept(accept ?? config.accept);
    const listing = await target.list(location, { accept: compiled });
    // Trust boundary: a provider's own rootPath is the only place its paths
    // may point at, however the underlying service answered.
    const rootPath = normalizePath(listing.rootPath || '/');
    for (const entry of listing.entries) {
      if (!isWithin(entry.path, rootPath)) {
        throw new FileBrokerError(
          `"${entry.name}" resolved outside ${rootPath}.`,
          { code: 'outside-root' },
        );
      }
      entry.category ||= categoryOf(entry.name);
      if (entry.kind === 'file') entry.mimeType ||= mimeForFileName(entry.name);
    }
    return listing;
  }

  async function read(providerId, entry, { as = 'text', maxBytes = config.maxReadBytes } = {}) {
    const target = provider(providerId);
    const ceiling = Number(maxBytes) || DEFAULT_MAX_READ_BYTES;
    if (entry.size && entry.size > ceiling) {
      throw new FileBrokerError(
        `"${entry.name}" is larger than the ${Math.round(ceiling / 1048576)} MB read limit.`,
        { code: 'too-large' },
      );
    }
    const result = await target.read(entry, { as });
    const size = result.size ?? byteLength(result.data ?? result.blob ?? result.text);
    if (size > ceiling) {
      throw new FileBrokerError(
        `"${entry.name}" is larger than the ${Math.round(ceiling / 1048576)} MB read limit.`,
        { code: 'too-large' },
      );
    }
    return {
      name: entry.name,
      path: entry.path,
      mimeType: entry.mimeType || mimeForFileName(entry.name),
      category: entry.category || categoryOf(entry.name),
      size,
      ...result,
    };
  }

  async function write(providerId, location, name, data, options = {}) {
    const target = provider(providerId);
    const problem = fileNameProblem(name);
    if (problem) throw new FileBrokerError(problem, { code: 'invalid-name' });
    const ceiling = Number(options.maxBytes ?? config.maxWriteBytes) || DEFAULT_MAX_WRITE_BYTES;
    const size = byteLength(data);
    if (size > ceiling) {
      throw new FileBrokerError(
        `"${name}" is larger than the ${Math.round(ceiling / 1048576)} MB upload limit.`,
        { code: 'too-large' },
      );
    }
    const result = await target.write(location, name.trim(), data, options);
    emit('write', { provider: providerId, path: result.path, size });
    return { name: name.trim(), ...result };
  }

  async function getMetadata(providerId, target, { schema, mode = 'declared' } = {}) {
    const source = provider(providerId);
    if (!source.capabilities.metadata) {
      return { supported: false, notice: '', fields: [] };
    }
    return source.getMetadata(target, { schema: normalizeSchema(schema), mode });
  }

  async function setMetadata(providerId, target, state, values) {
    const source = provider(providerId);
    if (!source.capabilities.metadata) return { updated: [] };
    const result = await source.setMetadata(target, state, values);
    emit('metadata-write', { provider: providerId, updated: result.updated });
    return result;
  }

  // ---- request normalization --------------------------------------------

  async function buildRequest(mode, options = {}) {
    const accept = compileAccept(options.accept ?? config.accept);
    const metadataConfig = options.metadata === false
      ? null
      : (options.metadata && (Array.isArray(options.metadata)
          || typeof options.metadata === 'function'
          || options.metadata.fields || options.metadata.schema)
        ? options.metadata
        : config.metadata);
    const metadata = await resolveMetadataConfig(metadataConfig, {
      mode, accept, options,
    });

    // `metadata: { title: 'x' }` on a save is prefill, not a schema.
    const prefill = {};
    if (options.metadata && !Array.isArray(options.metadata)
        && typeof options.metadata === 'object'
        && !options.metadata.fields && !options.metadata.schema) {
      for (const field of metadata.schema) {
        if (Object.hasOwn(options.metadata, field.key)) {
          prefill[field.key] = coerceValue(field, options.metadata[field.key]);
        }
      }
    }
    for (const field of metadata.schema) {
      if (Object.hasOwn(options.metadataValues || {}, field.key)) {
        prefill[field.key] = coerceValue(field, options.metadataValues[field.key]);
      }
    }

    const enabled = await availableProviders(options.providers);
    if (!enabled.some((entry) => entry.available)) {
      throw new FileBrokerError(
        'No file location is available right now.',
        { code: 'not-available' },
      );
    }

    return {
      mode,
      accept,
      metadata,
      metadataPrefill: prefill,
      providers: enabled,
      start: options.start || config.start || null,
      title: options.title || '',
      description: options.description || '',
      multiple: Boolean(options.multiple),
      read: options.read || 'text',
      data: options.data,
      suggestedName: options.suggestedName || '',
      confirmOverwrite: options.confirmOverwrite !== false,
      maxReadBytes: options.maxReadBytes ?? config.maxReadBytes ?? DEFAULT_MAX_READ_BYTES,
      maxWriteBytes: options.maxWriteBytes ?? config.maxWriteBytes ?? DEFAULT_MAX_WRITE_BYTES,
      options,
    };
  }

  function openDialog(request) {
    const dialog = dialogFactory({
      broker: api,
      strings: config.strings || {},
      mount: config.mount || null,
      theme: config.theme || 'dcs',
      injectStyles: config.injectStyles !== false,
      className: config.className || '',
      recall,
    });
    return dialog.open(request);
  }

  // ---- public API ---------------------------------------------------------

  const api = {
    id: config.id || 'file-broker',
    config,
    providers,
    provider,
    availableProviders,
    list,
    read,
    write,
    getMetadata,
    setMetadata,
    compileAccept,

    /**
     * Choose one (or, with `multiple: true`, several) existing files.
     * @returns {Promise<object|object[]|null>} null when cancelled.
     */
    async open(options = {}) {
      const request = await buildRequest('open', options);
      emit('open:start', { accept: request.accept.describe() });
      const result = await openDialog(request);
      emit('open:end', { cancelled: !result });
      return result;
    },

    /**
     * Write `data` somewhere the user chooses, then collect metadata for it.
     * @returns {Promise<object|null>} null when cancelled.
     */
    async save(options = {}) {
      if (options.data === undefined || options.data === null) {
        throw new FileBrokerError('save() needs data.', { code: 'write' });
      }
      const request = await buildRequest('save', options);
      emit('save:start', { name: request.suggestedName });
      const result = await openDialog(request);
      emit('save:end', { cancelled: !result, path: result?.file?.path });
      return result;
    },

    /** Metadata values from a state object, for apps driving providers directly. */
    valuesOf,
    availableCount,

    /** What the dialog remembers — read it, seed it, or clear it. */
    recall,
  };

  return api;
}

export { FileBrokerError, brokerError };
export { compileAccept, categoryOf, listCategories, registerCategory, isTextual } from './categories.js';
export {
  DCSPAD_METADATA_FIELDS, FIELD_TYPES, normalizeSchema, normalizeField, fieldTarget,
} from './metadata.js';
export { defineProvider, finalizeListing, CAPABILITY_DEFAULTS } from './provider.js';
export { formatBytes, formatDate } from './util/paths.js';
export { normalizeSiteCatalog, loadSiteCatalog } from './site-catalog.js';
export { createLocalStore, createMemoryStore, createNullStore, createRecall } from './storage.js';
export { FILE_BROKER_THEMES, ensureStyles } from './styles.js';
