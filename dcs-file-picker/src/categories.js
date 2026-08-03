// File-type categories and the `accept` grammar built on them.
//
// A category is a named bundle of extensions plus the MIME types a browser
// file input reports for them. Apps say `accept: ['data', 'text']` instead of
// spelling out a dozen extensions, and every provider filters its listing
// through the same compiled matcher, so a category means the same thing on a
// SharePoint library as it does on the local disk.
//
// Extension seam: registerCategory() adds or replaces one. Do that once at
// startup, before any dialog opens.

import { extensionOf } from './util/paths.js';

const defineCategory = (id, label, description, extensions, mime = []) => ({
  id,
  label,
  description,
  extensions: extensions.map((e) => e.toLowerCase()),
  mime,
});

const BUILT_IN = [
  defineCategory(
    'web', 'Web code', 'Markup and stylesheets that render in a browser',
    ['html', 'htm', 'css', 'scss', 'less', 'svg'],
    ['text/html', 'text/css', 'image/svg+xml'],
  ),
  defineCategory(
    'code', 'Code', 'Scripts and source files',
    ['js', 'mjs', 'cjs', 'jsx', 'ts', 'tsx', 'json5', 'py', 'ps1', 'psm1',
      'cs', 'java', 'rb', 'go', 'rs', 'php', 'sql', 'sh', 'bat', 'yml', 'yaml'],
    ['text/javascript', 'application/javascript', 'application/x-typescript'],
  ),
  defineCategory(
    'text', 'Text', 'Plain and lightly marked-up prose',
    ['txt', 'md', 'markdown', 'rst', 'log', 'rtf'],
    ['text/plain', 'text/markdown'],
  ),
  defineCategory(
    'data', 'Data', 'Structured, machine-readable files',
    ['csv', 'tsv', 'json', 'xml', 'ndjson', 'parquet'],
    ['text/csv', 'application/json', 'application/xml', 'text/xml'],
  ),
  defineCategory(
    'office', 'Office documents', 'Word, Excel, PowerPoint, Visio, PDF',
    ['doc', 'docx', 'docm', 'dot', 'dotx', 'xls', 'xlsx', 'xlsm', 'xlsb',
      'csv', 'ppt', 'pptx', 'ppsx', 'vsd', 'vsdx', 'one', 'pdf'],
    [
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'application/pdf',
    ],
  ),
  defineCategory(
    'image', 'Images', 'Static raster and vector graphics',
    ['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'bmp', 'tif', 'tiff', 'ico', 'svg', 'heic'],
    ['image/*'],
  ),
  defineCategory(
    'video', 'Video', 'Video files',
    ['mp4', 'm4v', 'mov', 'webm', 'avi', 'mkv', 'wmv', 'mpg', 'mpeg'],
    ['video/*'],
  ),
  defineCategory(
    'audio', 'Audio', 'Audio files',
    ['mp3', 'm4a', 'aac', 'wav', 'flac', 'ogg', 'oga', 'wma'],
    ['audio/*'],
  ),
  defineCategory(
    'archive', 'Archives', 'Compressed bundles',
    ['zip', '7z', 'rar', 'tar', 'gz', 'tgz'],
    ['application/zip'],
  ),
];

const registry = new Map(BUILT_IN.map((category) => [category.id, category]));

// Categories deliberately overlap (csv is both data and office; svg is both
// web and image), so "which category is this file" answers with the first
// match in this order. Registered categories are consulted after these.
const PRIMARY_ORDER = ['web', 'code', 'data', 'text', 'office', 'image', 'video', 'audio', 'archive'];

export function registerCategory(definition) {
  const id = String(definition?.id || '').trim();
  if (!id) throw new Error('A category needs an id.');
  registry.set(id, {
    id,
    label: definition.label || id,
    description: definition.description || '',
    extensions: (definition.extensions || []).map((e) => String(e).replace(/^\./, '').toLowerCase()),
    mime: definition.mime || [],
  });
  return registry.get(id);
}

export function getCategory(id) {
  return registry.get(String(id)) || null;
}

export function listCategories() {
  return [...registry.values()];
}

// The category a file belongs to, for display ('CSV · Data') and for grouping.
export function categoryOf(fileName) {
  const extension = extensionOf(fileName);
  if (!extension) return '';
  const ordered = [
    ...PRIMARY_ORDER.map((id) => registry.get(id)).filter(Boolean),
    ...[...registry.values()].filter((c) => !PRIMARY_ORDER.includes(c.id)),
  ];
  return ordered.find((category) => category.extensions.includes(extension))?.id || '';
}

function ruleMatcher(rule) {
  if (typeof rule === 'function') return { test: rule, attribute: [], label: 'custom' };

  const text = String(rule || '').trim();
  if (!text || text === '*' || text === '*/*') {
    return { test: () => true, attribute: [], label: 'any file' };
  }

  const category = registry.get(text.toLowerCase());
  if (category) {
    const extensions = new Set(category.extensions);
    return {
      test: (entry) => extensions.has(extensionOf(entry?.name)),
      attribute: [
        ...category.extensions.map((e) => `.${e}`),
        ...category.mime,
      ],
      label: category.label,
    };
  }

  if (text.startsWith('.') || /^[A-Za-z0-9]+$/.test(text)) {
    const extension = text.replace(/^\./, '').toLowerCase();
    return {
      test: (entry) => extensionOf(entry?.name) === extension,
      attribute: [`.${extension}`],
      label: `.${extension}`,
    };
  }

  if (text.includes('/')) {
    const [type, subtype] = text.toLowerCase().split('/');
    return {
      test: (entry) => {
        const mime = String(entry?.mimeType || '').toLowerCase();
        if (!mime) return false;
        const [entryType, entrySubtype] = mime.split('/');
        return entryType === type && (subtype === '*' || entrySubtype === subtype);
      },
      attribute: [text.toLowerCase()],
      label: text.toLowerCase(),
    };
  }

  // Unrecognised token: match nothing rather than silently matching everything.
  return { test: () => false, attribute: [], label: text };
}

/**
 * Compile an accept spec into one reusable matcher.
 *
 * Accepted rule forms, mixed freely in an array:
 *   'data'            a category id
 *   '.csv' / 'csv'    an extension
 *   'text/csv'        a MIME type
 *   'image/*'         a MIME wildcard
 *   (entry) => bool   a predicate over { name, mimeType, size, ... }
 *   '*'               everything (also the default when accept is omitted)
 *
 * @returns {{ matches(entry): boolean, attribute: string, describe(): string,
 *             categories: string[], isAny: boolean, rules: any[] }}
 */
export function compileAccept(accept) {
  const rules = (Array.isArray(accept) ? accept : [accept])
    .filter((rule) => rule !== undefined && rule !== null && rule !== '');

  if (!rules.length) {
    return {
      matches: () => true,
      attribute: '',
      describe: () => 'any file',
      categories: [],
      isAny: true,
      rules: [],
    };
  }

  const matchers = rules.map(ruleMatcher);
  const isAny = matchers.some((m) => m.label === 'any file');
  const attribute = [...new Set(matchers.flatMap((m) => m.attribute))].join(',');
  const categories = rules
    .filter((rule) => typeof rule === 'string' && registry.has(rule.toLowerCase()))
    .map((rule) => rule.toLowerCase());

  return {
    matches: (entry) => isAny || matchers.some((matcher) => matcher.test(entry)),
    attribute: isAny ? '' : attribute,
    describe: () => (isAny ? 'any file' : [...new Set(matchers.map((m) => m.label))].join(', ')),
    categories,
    isAny,
    rules,
  };
}

// Best-effort MIME for a name, so providers that only know file names still
// satisfy MIME-shaped accept rules.
const MIME_BY_EXTENSION = {
  html: 'text/html', htm: 'text/html', css: 'text/css', svg: 'image/svg+xml',
  js: 'text/javascript', mjs: 'text/javascript', json: 'application/json',
  csv: 'text/csv', tsv: 'text/tab-separated-values', xml: 'application/xml',
  txt: 'text/plain', md: 'text/markdown', markdown: 'text/markdown',
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
  webp: 'image/webp', avif: 'image/avif', ico: 'image/x-icon',
  mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime',
  mp3: 'audio/mpeg', wav: 'audio/wav', m4a: 'audio/mp4', ogg: 'audio/ogg',
  zip: 'application/zip',
};

export function mimeForFileName(fileName) {
  return MIME_BY_EXTENSION[extensionOf(fileName)] || '';
}

// Files a category can sensibly be read as text. Providers use this to decide
// whether `read: 'text'` is safe, and the dialog uses it for previews.
const TEXT_CATEGORIES = new Set(['web', 'code', 'text', 'data']);

export function isTextual(fileName) {
  const category = categoryOf(fileName);
  if (TEXT_CATEGORIES.has(category)) return true;
  return ['svg', 'xml', 'yml', 'yaml'].includes(extensionOf(fileName));
}
