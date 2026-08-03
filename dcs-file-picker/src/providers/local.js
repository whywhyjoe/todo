// Local provider — the browser's own file system.
//
// It cannot be browsed (no web app can enumerate a user's disk), so it
// declares browse:false and answers pick() instead: the dialog renders a
// "Choose from this device" button that opens the OS file picker. Saving uses
// the File System Access API when the browser offers it — a real Save As with
// a chosen folder and overwrite — and falls back to a download otherwise.
//
// No metadata: a local file has no columns. The dialog says so plainly rather
// than pretending, and the transfer still completes.

import { defineProvider } from '../provider.js';
import { FileBrokerError } from '../util/errors.js';
import { categoryOf, mimeForFileName } from '../categories.js';
import { extensionOf } from '../util/paths.js';

function supportsFileSystemAccess() {
  try {
    return typeof globalThis.showSaveFilePicker === 'function'
      && globalThis.isSecureContext !== false;
  } catch { return false; }
}

function entryForFile(file) {
  return {
    kind: 'file',
    name: file.name,
    path: `/${file.name}`,
    size: file.size,
    modified: file.lastModified ? new Date(file.lastModified).toISOString() : '',
    mimeType: file.type || mimeForFileName(file.name),
    category: categoryOf(file.name),
    file,
  };
}

// Group the accept attribute into the { description, accept } shape
// showSaveFilePicker wants, so the OS dialog offers the right extensions.
function pickerTypes(accept, name) {
  const extension = extensionOf(name);
  const extensions = new Set(extension ? [`.${extension}`] : []);
  for (const token of String(accept?.attribute || '').split(',')) {
    if (token.startsWith('.')) extensions.add(token);
  }
  if (!extensions.size) return [];
  const mime = mimeForFileName(name) || 'application/octet-stream';
  return [{
    description: accept?.describe?.() || 'File',
    accept: { [mime]: [...extensions] },
  }];
}

function downloadBlob(name, blob) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  // Revoke on a delay: some engines abort a download whose blob URL is
  // revoked before the download manager has claimed it.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function toBlob(data, mimeType) {
  if (data instanceof Blob) return data;
  return new Blob([data], { type: mimeType || 'application/octet-stream' });
}

/**
 * @param {object} [options]
 * @param {string} [options.label]
 * @param {'auto'|'always'|'never'} [options.fileSystemAccess]  Save As behaviour
 * @param {Document} [options.document]  injectable for tests
 */
export function localProvider(options = {}) {
  const mode = options.fileSystemAccess || 'auto';
  const useFsa = () => (mode === 'never' ? false : supportsFileSystemAccess());

  return defineProvider({
    id: options.id || 'local',
    label: options.label || 'This device',
    hint: options.hint || 'Files on the computer you are using',
    capabilities: {
      browse: false,
      read: true,
      write: true,
      multiple: true,
      metadata: false,
      overwriteCheck: false,
    },

    isAvailable: () => typeof document !== 'undefined',

    // The OS picker. Resolves [] when the user dismisses it — a cancel here is
    // a cancel of the step, not of the whole dialog.
    pick({ accept, multiple = false } = {}) {
      const doc = options.document || document;
      return new Promise((resolve) => {
        const input = doc.createElement('input');
        input.type = 'file';
        input.hidden = true;
        if (accept?.attribute) input.accept = accept.attribute;
        if (multiple) input.multiple = true;
        let settled = false;
        const finish = (files) => {
          if (settled) return;
          settled = true;
          input.remove();
          resolve(files);
        };
        input.addEventListener('change', () => {
          finish([...(input.files || [])].map(entryForFile));
        });
        // 'cancel' is not universal; the dialog also treats "no change event"
        // as a no-op, so a missed cancel just leaves the picker step idle.
        input.addEventListener('cancel', () => finish([]));
        doc.body.append(input);
        input.click();
      });
    },

    async read(entry, { as = 'text' } = {}) {
      const file = entry.file;
      if (!file) {
        throw new FileBrokerError('This file is no longer available on the device.', {
          code: 'not-found',
        });
      }
      const base = {
        name: file.name,
        path: entry.path,
        size: file.size,
        mimeType: file.type || mimeForFileName(file.name),
        file,
      };
      if (as === 'none') return base;
      if (as === 'blob') return { ...base, blob: file };
      if (as === 'arrayBuffer') return { ...base, data: await file.arrayBuffer() };
      return { ...base, text: await file.text() };
    },

    async write(location, name, data, { accept, mimeType } = {}) {
      const blob = toBlob(data, mimeType || mimeForFileName(name));
      if (useFsa()) {
        try {
          const handle = await globalThis.showSaveFilePicker({
            suggestedName: name,
            types: pickerTypes(accept, name),
          });
          const writable = await handle.createWritable();
          await writable.write(blob);
          await writable.close();
          return { name: handle.name || name, path: `/${handle.name || name}`, handle };
        } catch (error) {
          if (error?.name === 'AbortError') {
            throw new FileBrokerError('Save cancelled.', { code: 'cancelled', cause: error });
          }
          // Any other failure (a sandboxed frame, a policy block) falls back to
          // the download path rather than stranding the user's bytes.
        }
      }
      downloadBlob(name, blob);
      return { name, path: `/${name}`, downloaded: true };
    },
  });
}
