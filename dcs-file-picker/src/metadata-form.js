// The metadata form: one control per field, driven entirely by the neutral
// field type. It knows nothing about SharePoint — a provider hands it a
// metadata state (schema + availability + current values) and gets values back.
//
// Unavailable fields stay visible but disabled, with the provider's reason
// underneath. That is deliberate: a missing column is information the person
// saving the file wants ("Description isn't in this library"), not something to
// hide, and the file still saves either way.

import {
  validateValue, isEmptyValue, emptyValue, coerceValue,
} from './metadata.js';

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

function createControl(field, value, onInput) {
  const wrap = el('div', 'dfb-field-control');
  let read = () => '';
  const inputs = [];

  const simple = (type, initial) => {
    const input = el(type === 'multiline' ? 'textarea' : 'input');
    if (type === 'multiline') input.rows = 3;
    else input.type = type;
    input.value = initial ?? '';
    if (field.maxLength) input.maxLength = field.maxLength;
    wrap.append(input);
    inputs.push(input);
    return input;
  };

  switch (field.type) {
    case 'multiline': {
      const input = simple('multiline', value);
      read = () => input.value;
      break;
    }
    case 'choice': {
      const select = el('select');
      const blank = el('option', '', '—');
      blank.value = '';
      select.append(blank);
      const choices = [...(field.choices || [])];
      if (value && !choices.includes(value)) choices.push(value);
      for (const choice of choices) {
        const option = el('option', '', choice);
        option.value = choice;
        select.append(option);
      }
      select.value = value ?? '';
      wrap.append(select);
      inputs.push(select);
      read = () => select.value;
      break;
    }
    case 'multichoice': {
      const box = el('div', 'dfb-choices');
      const selected = new Set(Array.isArray(value) ? value : []);
      const boxes = [];
      for (const choice of field.choices || []) {
        const label = el('label', 'dfb-choice');
        const input = el('input');
        input.type = 'checkbox';
        input.value = choice;
        input.checked = selected.has(choice);
        label.append(input, document.createTextNode(choice));
        box.append(label);
        boxes.push(input);
        inputs.push(input);
      }
      if (!boxes.length) box.append(el('span', 'dfb-field-note', 'This column has no choices.'));
      wrap.append(box);
      read = () => boxes.filter((b) => b.checked).map((b) => b.value);
      break;
    }
    case 'tags': {
      const input = simple('text', (Array.isArray(value) ? value : []).join(', '));
      input.placeholder = 'Comma-separated';
      read = () => coerceValue(field, input.value);
      break;
    }
    case 'boolean': {
      const label = el('label', 'dfb-choice');
      const input = el('input');
      input.type = 'checkbox';
      input.checked = value === true;
      label.append(input, document.createTextNode(field.hint || 'Yes'));
      wrap.append(label);
      inputs.push(input);
      read = () => input.checked;
      break;
    }
    case 'number': {
      const input = simple('number', value);
      input.step = 'any';
      read = () => input.value;
      break;
    }
    case 'date': {
      const input = simple('datetime-local', value);
      read = () => input.value;
      break;
    }
    case 'url': {
      const url = simple('text', value?.url);
      url.placeholder = 'https://…';
      const description = simple('text', value?.description);
      description.placeholder = 'Link text';
      read = () => ({ url: url.value, description: description.value });
      break;
    }
    default: {
      const input = simple('text', value);
      read = () => input.value;
    }
  }

  for (const input of inputs) {
    input.addEventListener('input', onInput);
    input.addEventListener('change', onInput);
  }

  return {
    el: wrap,
    read,
    setDisabled(disabled) {
      for (const input of inputs) input.disabled = disabled;
    },
  };
}

/**
 * @param {object} params
 * @param {object} params.state     provider metadata state ({ fields, notice, supported })
 * @param {object} [params.values]  overrides applied on top of the state's values
 * @param {boolean} [params.disabled]  render read-only (open mode default)
 * @param {Function} [params.onChange]
 */
export function createMetadataForm({ state, values = {}, disabled = false, onChange } = {}) {
  const root = el('div', 'dfb-metadata-form');
  const rows = [];
  let readOnly = disabled;

  if (state?.notice) root.append(el('p', 'dfb-notice', state.notice));

  for (const entry of state?.fields || []) {
    const field = entry.field;
    const row = el('div', 'dfb-field');
    row.dataset.key = field.key;
    if (!entry.available) row.classList.add('dfb-field-unavailable');

    const head = el('div', 'dfb-field-head');
    head.append(el('span', 'dfb-field-label', field.label + (field.required ? ' *' : '')));
    const badge = el('span', 'dfb-field-state', entry.available ? field.type : 'unavailable');
    badge.title = entry.available
      ? `Writes to ${entry.internalName || field.name}`
      : entry.reason;
    head.append(badge);
    row.append(head);

    const initial = Object.hasOwn(values, field.key)
      ? coerceValue(field, values[field.key])
      : (entry.value ?? emptyValue(field));

    const error = el('p', 'dfb-field-error');
    error.hidden = true;

    const control = createControl(field, initial, () => {
      error.hidden = true;
      row.classList.remove('dfb-field-invalid');
      onChange?.();
    });
    control.setDisabled(readOnly || !entry.available);
    row.append(control.el);

    if (field.hint && field.type !== 'boolean') row.append(el('p', 'dfb-field-hint', field.hint));
    if (!entry.available && entry.reason) row.append(el('p', 'dfb-field-hint', entry.reason));
    row.append(error);
    root.append(row);

    rows.push({ entry, field, control, row, error, initial });
  }

  if (!rows.length) {
    root.append(el('p', 'dfb-notice', 'This location does not expose metadata columns.'));
  }

  function getValues() {
    const out = {};
    for (const row of rows) {
      if (!row.entry.available) continue;
      out[row.field.key] = row.control.read();
    }
    return out;
  }

  return {
    el: root,
    state,

    getValues,

    // Only the fields the person actually touched, so an untouched column is
    // never rewritten with an identical value (and never clears a value the
    // form could not read).
    getDirtyValues() {
      const out = {};
      for (const row of rows) {
        if (!row.entry.available) continue;
        const current = row.control.read();
        if (JSON.stringify(current) !== JSON.stringify(row.initial)) out[row.field.key] = current;
      }
      return out;
    },

    isDirty() {
      return rows.some((row) => row.entry.available
        && JSON.stringify(row.control.read()) !== JSON.stringify(row.initial));
    },

    validate() {
      const errors = {};
      for (const row of rows) {
        if (!row.entry.available) continue;
        const message = validateValue(row.field, row.control.read());
        if (message) errors[row.field.key] = message;
      }
      this.setErrors(errors);
      return errors;
    },

    setErrors(errors = {}) {
      for (const row of rows) {
        const message = errors[row.field.key] || '';
        row.error.textContent = message;
        row.error.hidden = !message;
        row.row.classList.toggle('dfb-field-invalid', Boolean(message));
      }
    },

    setDisabled(value) {
      readOnly = value;
      for (const row of rows) row.control.setDisabled(value || !row.entry.available);
    },

    // Fields that are available AND non-empty — what the footer summarises.
    filledCount() {
      return rows.filter((row) => row.entry.available
        && !isEmptyValue(row.field, row.control.read())).length;
    },

    availableCount() {
      return rows.filter((row) => row.entry.available).length;
    },
  };
}
