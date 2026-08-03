// The metadata seam.
//
// An app declares WHICH columns it cares about; a provider decides whether the
// selected location actually has them and translates values to and from its
// native shape. Neither side hard-codes the other's vocabulary, so DCSPad's
// three fields (Title / _ExtendedDescription / DocVersion) and a future app's
// twenty are the same code path.
//
// Field types are provider-neutral on purpose. A SharePoint column's
// TypeAsString is mapped onto one of these by the SharePoint provider; a
// hypothetical Graph or filesystem-sidecar provider maps its own.

export const FIELD_TYPES = Object.freeze([
  'text',        // single-line string
  'multiline',   // paragraph string
  'choice',      // one of `choices`
  'multichoice', // any of `choices`; value is string[]
  'boolean',     // true / false
  'number',      // finite number, held as a string in the UI
  'date',        // ISO-8601 instant, edited as datetime-local
  'url',         // { url, description }
  'tags',        // free-form string[]
]);

const DEFAULT_TYPE = 'text';

/**
 * Normalize one field declaration.
 *
 * @param {object} field
 * @param {string} field.key        stable app-side identifier (required)
 * @param {string} [field.label]    what the form shows
 * @param {string} [field.type]     one of FIELD_TYPES
 * @param {string} [field.name]     native column name, when it is the same everywhere
 * @param {object} [field.target]   per-provider native name: { sharepoint: '_ExtendedDescription' }
 * @param {boolean} [field.required]  block save when empty AND available
 * @param {string} [field.hint]     helper text under the control
 * @param {string[]} [field.choices]
 * @param {number} [field.maxLength]
 * @param {*} [field.default]       value or () => value, used to prefill a new file
 * @param {boolean} [field.readOnly]  show the value, never write it
 */
export function normalizeField(field) {
  const key = String(field?.key || '').trim();
  if (!key) throw new Error('A metadata field needs a key.');
  const type = FIELD_TYPES.includes(field.type) ? field.type : DEFAULT_TYPE;
  return Object.freeze({
    key,
    label: field.label || key,
    type,
    name: field.name || key,
    target: Object.freeze({ ...(field.target || {}) }),
    required: Boolean(field.required),
    hint: field.hint || '',
    choices: Object.freeze([...(field.choices || [])]),
    maxLength: Number(field.maxLength) || 0,
    default: field.default,
    readOnly: Boolean(field.readOnly),
  });
}

export function normalizeSchema(schema) {
  return (Array.isArray(schema) ? schema : []).map(normalizeField);
}

// The native column name a provider should read/write for this field.
export function fieldTarget(field, providerId) {
  return field?.target?.[providerId] || field?.name || field?.key;
}

export function defaultValue(field, context = {}) {
  const declared = typeof field.default === 'function'
    ? field.default(context)
    : field.default;
  if (declared !== undefined && declared !== null) return declared;
  return emptyValue(field);
}

export function emptyValue(field) {
  switch (field.type) {
    case 'multichoice':
    case 'tags': return [];
    case 'boolean': return false;
    case 'url': return { url: '', description: '' };
    default: return '';
  }
}

export function isEmptyValue(field, value) {
  switch (field.type) {
    case 'multichoice':
    case 'tags': return !Array.isArray(value) || value.length === 0;
    case 'boolean': return value !== true;
    case 'url': return !String(value?.url || '').trim();
    default: return String(value ?? '').trim() === '';
  }
}

// Coerce whatever the caller passed for a field into that field's value shape,
// so `metadata: { title: 'x', tags: 'a, b' }` prefills work without ceremony.
export function coerceValue(field, value) {
  if (value === undefined || value === null) return emptyValue(field);
  switch (field.type) {
    case 'multichoice':
    case 'tags':
      if (Array.isArray(value)) return value.map((v) => String(v)).filter(Boolean);
      return String(value).split(/[;,]/).map((v) => v.trim()).filter(Boolean);
    case 'boolean':
      return value === true || value === 1 || /^(1|true|yes)$/i.test(String(value));
    case 'number':
      return value === '' ? '' : String(value);
    case 'url':
      if (typeof value === 'string') return { url: value, description: '' };
      return {
        url: String(value.url ?? value.Url ?? '').trim(),
        description: String(value.description ?? value.Description ?? '').trim(),
      };
    default:
      return String(value);
  }
}

// Per-field validation the dialog runs before it lets a save start. Providers
// still surface their own rejections; this only catches what is knowable here.
export function validateValue(field, value) {
  if (field.required && isEmptyValue(field, value)) return `${field.label} is required.`;
  if (field.type === 'number' && !isEmptyValue(field, value)
      && !Number.isFinite(Number(String(value).replace(',', '.')))) {
    return `${field.label} must be a number.`;
  }
  if (field.type === 'date' && !isEmptyValue(field, value)
      && Number.isNaN(new Date(value).getTime())) {
    return `${field.label} must be a date.`;
  }
  if (field.type === 'url' && !isEmptyValue(field, value)) {
    try { new URL(String(value.url)); } catch { return `${field.label} must be a URL.`; }
  }
  if (field.maxLength && String(value ?? '').length > field.maxLength) {
    return `${field.label} is limited to ${field.maxLength} characters.`;
  }
  return '';
}

export function validateValues(schema, values) {
  const errors = {};
  for (const field of schema) {
    if (field.readOnly) continue;
    const message = validateValue(field, values?.[field.key]);
    if (message) errors[field.key] = message;
  }
  return errors;
}

/**
 * Resolve the app's `metadata` config into a schema for one operation.
 *
 * Config forms:
 *   undefined                    metadata is off
 *   [ {...field}, ... ]          a fixed schema
 *   { fields, mode, ... }        a fixed schema plus options
 *   async (context) => fields    computed per location — the seam a future
 *                                "let the user choose columns" UI plugs into
 *
 * `mode` is a hint the provider reads:
 *   'declared'  (default) only these fields, marked unavailable when missing
 *   'discover'  these fields first, then every other writable column the
 *               location exposes (the workbench-style full editor)
 */
export async function resolveMetadataConfig(config, context = {}) {
  if (!config) return { enabled: false, schema: [], mode: 'declared', options: {} };

  if (typeof config === 'function') {
    return resolveMetadataConfig(await config(context), context);
  }
  if (Array.isArray(config)) {
    return { enabled: true, schema: normalizeSchema(config), mode: 'declared', options: {} };
  }
  const fields = config.fields || config.schema || [];
  return {
    enabled: config.enabled !== false,
    schema: normalizeSchema(fields),
    mode: config.mode === 'discover' ? 'discover' : 'declared',
    options: { ...config },
  };
}

/**
 * The state a provider returns from getMetadata(): the resolved schema with
 * availability and current values attached. `available: false` is normal —
 * a library simply may not have the column — and must never block the transfer.
 */
export function metadataState(entries = [], { supported = true, notice = '' } = {}) {
  return {
    supported,
    notice,
    fields: entries.map((entry) => ({
      available: true,
      reason: '',
      value: emptyValue(entry.field || entry),
      ...entry,
    })),
  };
}

export function valuesOf(state) {
  const values = {};
  for (const entry of state?.fields || []) values[entry.field.key] = entry.value;
  return values;
}

export function availableCount(state) {
  return (state?.fields || []).filter((entry) => entry.available && !entry.field.readOnly).length;
}

// A ready-made schema matching what DCSPad writes today, so an app that just
// wants "the usual three" does not restate them. Apps are free to ignore it.
export const DCSPAD_METADATA_FIELDS = Object.freeze([
  {
    key: 'title',
    label: 'Title',
    type: 'text',
    name: 'Title',
    maxLength: 255,
    hint: 'Shown in library views and search results.',
  },
  {
    key: 'description',
    label: 'Description',
    type: 'multiline',
    name: '_ExtendedDescription',
    hint: 'What this file is for.',
  },
  {
    key: 'docVersion',
    label: 'DocVersion',
    type: 'text',
    name: 'DocVersion',
    maxLength: 255,
    hint: 'App-managed version stamp, independent of SharePoint versioning.',
  },
]);
