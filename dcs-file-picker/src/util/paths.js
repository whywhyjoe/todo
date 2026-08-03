// Path helpers shared by every provider. Providers address locations with
// POSIX-style absolute paths ('/sites/Team/Shared Documents/sub'), whatever
// their native addressing looks like — the dialog only ever handles these.

export function normalizePath(value) {
  let path = String(value ?? '').trim().replaceAll('\\', '/');
  if (!path.startsWith('/')) path = `/${path}`;
  path = path.replace(/\/{2,}/g, '/');
  if (path.length > 1) path = path.replace(/\/+$/, '');
  return path;
}

export function joinPath(base, segment) {
  const root = normalizePath(base);
  const name = String(segment ?? '').replace(/^\/+/, '');
  if (!name) return root;
  return normalizePath(root === '/' ? `/${name}` : `${root}/${name}`);
}

export function parentPath(path, rootPath = '/') {
  const current = normalizePath(path);
  const root = normalizePath(rootPath);
  if (current === root || current === '/') return root;
  const parent = normalizePath(current.slice(0, current.lastIndexOf('/')) || '/');
  return parent.length < root.length ? root : parent;
}

export function baseName(path) {
  const normalized = normalizePath(path);
  return normalized.slice(normalized.lastIndexOf('/') + 1);
}

// Every path a provider hands back is checked against the boundary it declared,
// so a mis-built OData response can never walk the dialog out of its own site.
export function isWithin(path, rootPath) {
  const root = normalizePath(rootPath);
  if (root === '/') return true;
  const target = normalizePath(path);
  return target === root || target.startsWith(`${root}/`);
}

export function extensionOf(fileName) {
  const name = String(fileName ?? '').trim();
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : '';
}

export function stripExtension(fileName) {
  const name = String(fileName ?? '').trim();
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(0, dot) : name;
}

// Windows and SharePoint both reject these; catching them here turns a server
// 400 into an inline message before anything is uploaded.
const ILLEGAL_NAME = /[\\/:*?"<>|]/;

export function isValidFileName(name) {
  const trimmed = String(name ?? '').trim();
  if (!trimmed || trimmed === '.' || trimmed === '..') return false;
  if (ILLEGAL_NAME.test(trimmed)) return false;
  if (trimmed.startsWith('~$')) return false;
  return true;
}

export function fileNameProblem(name) {
  const trimmed = String(name ?? '').trim();
  if (!trimmed) return 'Enter a file name.';
  if (trimmed === '.' || trimmed === '..') return 'Enter a file name, not a folder path.';
  if (/[\\/]/.test(trimmed)) return 'Enter a file name without folder separators.';
  if (ILLEGAL_NAME.test(trimmed)) return 'A file name cannot contain : * ? " < > |';
  if (trimmed.startsWith('~$')) return 'File names cannot start with ~$.';
  return '';
}

export function formatBytes(value) {
  const bytes = Number(value);
  if (!Number.isFinite(bytes) || bytes < 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function formatDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
  return date.toLocaleDateString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
  });
}
