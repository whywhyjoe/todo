// Memory provider — a fake document library that lives in a JS object.
//
// It exists so the dialog, the metadata form, and an app's own wiring can be
// exercised with zero network: the demo page runs on it, the tests assert
// against it, and an app developing off-tenant can keep working. It implements
// the full contract, including declared/discovered metadata, so behaviour seen
// here is behaviour to expect from SharePoint.

import { defineProvider, finalizeListing } from '../provider.js';
import { FileBrokerError } from '../util/errors.js';
import { categoryOf, mimeForFileName } from '../categories.js';
import { normalizePath, parentPath, joinPath, baseName, isWithin } from '../util/paths.js';
import { fieldTarget, emptyValue } from '../metadata.js';

const DEFAULT_COLUMNS = [
  { internalName: 'Title', title: 'Title', type: 'text' },
  { internalName: '_ExtendedDescription', title: 'Description', type: 'multiline' },
  { internalName: 'DocVersion', title: 'DocVersion', type: 'text' },
  {
    internalName: 'Audience',
    title: 'Audience',
    type: 'choice',
    choices: ['Internal', 'Partner', 'Public'],
  },
];

const DEFAULT_SEED = {
  root: '/sites/Demo',
  folders: [
    '/sites/Demo/Shared Documents',
    '/sites/Demo/Shared Documents/branding',
    '/sites/Demo/Site Assets',
  ],
  files: [
    { path: '/sites/Demo/Shared Documents/readme.md', text: '# Demo library\n\nSample content.\n' },
    { path: '/sites/Demo/Shared Documents/report.csv', text: 'quarter,revenue\nQ1,1200\nQ2,1500\n' },
    { path: '/sites/Demo/Shared Documents/app.js', text: 'console.log("hello from the demo library");\n' },
    { path: '/sites/Demo/Shared Documents/notes.txt', text: 'Plain text file.\n' },
    { path: '/sites/Demo/Shared Documents/branding/logo.png', text: 'not-really-a-png' },
    { path: '/sites/Demo/Shared Documents/branding/style.css', text: ':root { --brand: #0b5cab; }\n' },
    { path: '/sites/Demo/Site Assets/intro.mp4', text: 'not-really-a-video' },
  ],
};

/**
 * @param {object} [options]
 * @param {object} [options.seed]     { root, folders[], files[{ path, text, metadata }] }
 * @param {object[]} [options.columns]  emulated library columns
 * @param {number} [options.latency]  ms of artificial delay, to see loading states
 * @param {object[]} [options.places]  named shortcuts, mirroring a site's libraries
 */
export function memoryProvider(options = {}) {
  const seed = options.seed || DEFAULT_SEED;
  const columns = options.columns || DEFAULT_COLUMNS;
  const rootPath = normalizePath(seed.root || '/');
  const latency = Number(options.latency) || 0;

  const folders = new Set([rootPath, ...(seed.folders || []).map(normalizePath)]);
  const files = new Map();
  for (const file of seed.files || []) {
    const path = normalizePath(file.path);
    files.set(path.toLowerCase(), {
      name: baseName(path),
      path,
      text: file.text ?? '',
      data: file.data ?? null,
      modified: file.modified || new Date(2026, 0, 15).toISOString(),
      metadata: { ...(file.metadata || {}) },
    });
    folders.add(parentPath(path, rootPath));
  }

  const wait = () => (latency ? new Promise((r) => { setTimeout(r, latency); }) : Promise.resolve());

  const sizeOf = (file) => (file.data?.byteLength ?? new Blob([file.text || '']).size);

  const providerId = options.id || 'memory';

  const columnFor = (internalName) => columns.find(
    (column) => column.internalName.toLowerCase() === String(internalName).toLowerCase(),
  ) || null;

  function checked(path) {
    const normalized = normalizePath(path || rootPath);
    if (!isWithin(normalized, rootPath)) {
      throw new FileBrokerError('That path is outside this library.', { code: 'outside-root' });
    }
    return normalized;
  }

  return defineProvider({
    id: providerId,
    label: options.label || 'Demo library',
    hint: options.hint || 'An in-memory stand-in for a document library',
    capabilities: {
      browse: true,
      read: true,
      write: true,
      metadata: true,
      discoverMetadata: true,
      overwriteCheck: true,
    },

    isAvailable: () => true,

    async roots() {
      await wait();
      if (options.places?.length) {
        return options.places
          .map((place) => ({ ...place, path: normalizePath(place.path), rootPath }))
          .concat([{ path: rootPath, label: 'Site root', rootPath }]);
      }
      return [...folders]
        .filter((path) => parentPath(path, rootPath) === rootPath && path !== rootPath)
        .map((path) => ({ path, label: baseName(path), rootPath }))
        .concat([{ path: rootPath, label: 'Site root', rootPath }]);
    },

    async list(location, { accept } = {}) {
      await wait();
      const path = checked(location?.path);
      if (!folders.has(path)) {
        throw new FileBrokerError(`No folder at ${path}.`, { code: 'not-found' });
      }
      return finalizeListing({
        path,
        rootPath,
        parentPath: parentPath(path, rootPath),
        accept,
        folders: [...folders]
          .filter((candidate) => candidate !== path && parentPath(candidate, rootPath) === path)
          .map((candidate) => ({ name: baseName(candidate), path: candidate })),
        files: [...files.values()]
          .filter((file) => parentPath(file.path, rootPath) === path)
          .map((file) => ({
            name: file.name,
            path: file.path,
            size: sizeOf(file),
            modified: file.modified,
            mimeType: mimeForFileName(file.name),
            category: categoryOf(file.name),
          })),
      });
    },

    async read(entry, { as = 'text' } = {}) {
      await wait();
      const file = files.get(checked(entry.path).toLowerCase());
      if (!file) throw new FileBrokerError(`No file at ${entry.path}.`, { code: 'not-found' });
      const base = {
        name: file.name,
        path: file.path,
        size: sizeOf(file),
        mimeType: mimeForFileName(file.name),
      };
      if (as === 'none') return base;
      const bytes = file.data || new TextEncoder().encode(file.text).buffer;
      if (as === 'blob') return { ...base, blob: new Blob([bytes], { type: base.mimeType }) };
      if (as === 'arrayBuffer') return { ...base, data: bytes };
      return { ...base, text: file.text };
    },

    async write(location, name, data, { overwrite = false } = {}) {
      await wait();
      const folder = checked(location?.path);
      const path = joinPath(folder, name);
      const key = path.toLowerCase();
      if (files.has(key) && !overwrite) {
        throw new FileBrokerError(`"${name}" already exists here.`, { code: 'conflict' });
      }
      const existing = files.get(key);
      const record = {
        name,
        path,
        text: typeof data === 'string' ? data : '',
        data: typeof data === 'string' ? null : data,
        modified: new Date().toISOString(),
        metadata: { ...(existing?.metadata || {}) },
      };
      files.set(key, record);
      folders.add(folder);
      return { name, path, url: `memory:${path}`, overwritten: Boolean(existing) };
    },

    async getMetadata(target, { schema = [], mode = 'declared' } = {}) {
      await wait();
      const file = target.path ? files.get(normalizePath(target.path).toLowerCase()) : null;
      const entries = [];
      const claimed = new Set();

      for (const field of schema) {
        const internal = fieldTarget(field, providerId);
        const column = columnFor(internal);
        if (column) claimed.add(column.internalName.toLowerCase());
        let reason = '';
        if (!column) reason = `${internal} is not a column in this library.`;
        else if (column.type !== field.type) {
          reason = `${internal} is a ${column.type} column; the app declared it as ${field.type}.`;
        }
        entries.push({
          field: { ...field, choices: field.choices?.length ? field.choices : (column?.choices || []) },
          internalName: column?.internalName || internal,
          available: !reason && !field.readOnly,
          reason,
          value: file?.metadata?.[column?.internalName || internal] ?? emptyValue(field),
        });
      }

      if (mode === 'discover') {
        for (const column of columns) {
          if (claimed.has(column.internalName.toLowerCase())) continue;
          const field = {
            key: column.internalName,
            label: column.title || column.internalName,
            type: column.type,
            name: column.internalName,
            target: {},
            required: false,
            hint: '',
            choices: column.choices || [],
            maxLength: 0,
            readOnly: false,
          };
          entries.push({
            field,
            internalName: column.internalName,
            available: true,
            reason: '',
            value: file?.metadata?.[column.internalName] ?? emptyValue(field),
            discovered: true,
          });
        }
      }

      return {
        supported: true,
        notice: entries.some((entry) => entry.available) ? '' :
          'No requested column exists in this library. The file can still be saved.',
        fields: entries,
      };
    },

    async setMetadata(target, state, values) {
      await wait();
      const file = files.get(normalizePath(target.path).toLowerCase());
      if (!file) throw new FileBrokerError('That file no longer exists.', { code: 'not-found' });
      const updated = [];
      for (const entry of state?.fields || []) {
        if (!entry.available || !Object.hasOwn(values || {}, entry.field.key)) continue;
        file.metadata[entry.internalName] = values[entry.field.key];
        updated.push(entry.internalName);
      }
      return { updated };
    },

    // Test/demo affordance — not part of the provider contract.
    inspect: () => ({ folders: [...folders], files: [...files.values()] }),
  });
}
