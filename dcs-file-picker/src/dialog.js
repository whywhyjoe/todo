// The default UI: one modest <dialog> that covers open and save across every
// provider. It is intentionally the *only* UI in the package — an app that
// needs something else passes its own factory as `dialog` to createFileBroker()
// and keeps all of the plumbing (see docs/EXTENDING.md).
//
// Layout, top to bottom:
//   header        title + close
//   locations     provider chips (only when more than one is available)
//   locator       the site chooser: a dropdown of the app's standard sites
//                 (when it configured any) plus a box for pasting any other
//                 address. Both remember what you used last.
//   places        root shortcuts (libraries) — browse providers only
//   crumbs        breadcrumb path + up + refresh
//   list          folders and matching files, or the device pick zone
//   name          save mode: file name + overwrite warning
//   metadata      collapsible; loads once a destination is known
//   footer        status line + Cancel + primary action
//
// Rules the shape enforces, each of them a bug someone already hit:
//   · cancelling resolves null; it is never an error
//   · a metadata failure after the bytes landed does NOT re-upload — the user
//     gets Retry metadata / Keep without metadata, and the file stays put
//   · the primary button says what will happen (Save / Replace / Open)
//   · an unavailable column is shown and explained, not hidden

import { createMetadataForm } from './metadata-form.js';
import { ensureStyles } from './styles.js';
import { availableCount } from './metadata.js';
import {
  formatBytes, formatDate, fileNameProblem, joinPath, baseName, parentPath, extensionOf,
} from './util/paths.js';
import { FileBrokerError } from './util/errors.js';
import { categoryOf, getCategory } from './categories.js';

const DEFAULT_STRINGS = {
  openTitle: 'Open a file',
  saveTitle: 'Save a file',
  cancel: 'Cancel',
  open: 'Open',
  save: 'Save',
  replace: 'Replace',
  chooseDevice: 'Choose from this device…',
  nameLabel: 'File name',
  metadataLegend: 'Metadata',
  emptyFolder: 'Nothing here matches the file types you can pick.',
  keepWithoutMetadata: 'Keep file without metadata',
  retryMetadata: 'Retry metadata',
  otherSite: 'Another site…',
  siteHint: 'Pick a standard site, or paste any site URL on this tenant.',
};

// Node icons, Lucide geometry on the 24 grid — one closed path per shape so
// `fill` and `stroke` ride the same outline (the design system's rule; the
// file's fold is a second, never-filled path).
const nodeSvg = (paths, className) =>
  `<svg class="dfb-node ${className}" width="15" height="15" viewBox="0 0 24 24"`
  + ' stroke="currentColor" stroke-width="2" stroke-linecap="round"'
  + ` stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;

const FOLDER_ICON = nodeSvg(
  '<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>',
  'dfb-node-folder',
);
const fileIcon = (kind) => nodeSvg(
  '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/>'
  + '<path d="M14 2v4a2 2 0 0 0 2 2h4"/>',
  kind ? `dfb-node-${kind}` : '',
);

// The design system's five file-type buckets. Near relatives inherit:
// ts/mjs → js, scss → css, svg → html, csv/xlsx → json (the data bucket).
const BADGE_BUCKET = {
  js: 'js', mjs: 'js', cjs: 'js', jsx: 'js', ts: 'js', tsx: 'js',
  html: 'html', htm: 'html', svg: 'html',
  css: 'css', scss: 'css', less: 'css',
  json: 'json', json5: 'json', csv: 'json', tsv: 'json', xml: 'json',
  xlsx: 'json', xls: 'json',
  md: 'doc', markdown: 'doc', txt: 'doc', rtf: 'doc', pdf: 'doc',
  doc: 'doc', docx: 'doc', ppt: 'doc', pptx: 'doc', one: 'doc',
};

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

const button = (className, text, onClick) => {
  const node = el('button', className, text);
  node.type = 'button';
  if (onClick) node.addEventListener('click', onClick);
  return node;
};

export function createFileDialog({
  broker, strings = {}, mount = null, theme = 'dcs',
  injectStyles = true, className = '', recall = null,
} = {}) {
  const text = { ...DEFAULT_STRINGS, ...strings };

  return {
    open(request) {
      return new Promise((resolve, reject) => {
        try {
          runDialog({
            broker, text, mount, theme, injectStyles, className,
            recall: recall || broker.recall, request, resolve, reject,
          });
        } catch (error) { reject(error); }
      });
    },
  };
}

function runDialog({
  broker, text, mount, theme, injectStyles, className, recall, request, resolve, reject,
}) {
  if (injectStyles) ensureStyles(theme);

  const isSave = request.mode === 'save';

  // ---- DOM ---------------------------------------------------------------
  const dialog = el('dialog', `dfb-dialog dfb-theme-${theme} ${className}`.trim());
  const panel = el('div', 'dfb-panel');
  dialog.append(panel);

  const head = el('div', 'dfb-head');
  const title = el('h2', 'dfb-title',
    request.title || (isSave ? text.saveTitle : text.openTitle));
  const closeBtn = button('dfb-icon-btn', '✕', () => finish(null));
  closeBtn.setAttribute('aria-label', 'Close');
  head.append(title, closeBtn);
  panel.append(head);

  if (request.description) panel.append(el('p', 'dfb-description', request.description));

  const providerBar = el('div', 'dfb-providers');
  providerBar.setAttribute('role', 'tablist');
  panel.append(providerBar);

  // The site chooser. Row one is the app's standard sites (hidden when it
  // configured none); row two is the paste box, which is always available —
  // a curated list must never become a cage.
  const locatorRow = el('form', 'dfb-locator');
  const locatorLabel = el('label', 'dfb-locator-label');
  const locatorSelect = el('select', 'dfb-locator-select');
  locatorSelect.hidden = true;
  const locatorInput = el('input', 'dfb-locator-input');
  locatorInput.type = 'text';
  locatorInput.spellcheck = false;
  locatorInput.autocomplete = 'off';
  const locatorList = el('datalist');
  locatorList.id = `dfb-recent-${Math.random().toString(36).slice(2, 8)}`;
  locatorInput.setAttribute('list', locatorList.id);
  const locatorBtn = el('button', 'dfb-btn', 'Go');
  locatorBtn.type = 'submit';
  const locatorSub = el('p', 'dfb-locator-sub');
  locatorSub.hidden = true;
  locatorRow.append(locatorLabel, locatorSelect, locatorInput, locatorBtn, locatorList, locatorSub);
  locatorRow.hidden = true;
  panel.append(locatorRow);

  const placesRow = el('div', 'dfb-places');
  placesRow.hidden = true;
  panel.append(placesRow);

  const crumbBar = el('div', 'dfb-crumbbar');
  const upBtn = button('dfb-icon-btn', '↑', () => {
    if (listing) goTo({ ...location, path: listing.parentPath });
  });
  upBtn.title = 'Parent folder';
  const crumbs = el('div', 'dfb-crumbs');
  const refreshBtn = button('dfb-icon-btn', '⟳', () => goTo(location, { force: true }));
  refreshBtn.title = 'Refresh';
  crumbBar.append(upBtn, crumbs, refreshBtn);
  crumbBar.hidden = true;
  panel.append(crumbBar);

  const listBox = el('div', 'dfb-list');
  listBox.setAttribute('role', 'listbox');
  listBox.setAttribute('aria-label', 'Files and folders');
  panel.append(listBox);

  const nameRow = el('div', 'dfb-namerow');
  const nameLabel = el('label', 'dfb-name-label', text.nameLabel);
  const nameInput = el('input', 'dfb-name-input');
  nameInput.type = 'text';
  nameInput.spellcheck = false;
  nameInput.maxLength = 200;
  nameLabel.htmlFor = nameInput.id = `dfb-name-${Math.random().toString(36).slice(2, 8)}`;
  nameRow.append(nameLabel, nameInput);
  nameRow.hidden = !isSave;
  panel.append(nameRow);

  const noticeBox = el('div', 'dfb-notice-box');
  noticeBox.hidden = true;
  panel.append(noticeBox);

  const metaSection = el('section', 'dfb-metadata');
  const metaHead = el('div', 'dfb-metadata-head');
  const metaToggle = button('dfb-metadata-toggle', text.metadataLegend, () => {
    metaBody.hidden = !metaBody.hidden;
    metaToggle.setAttribute('aria-expanded', String(!metaBody.hidden));
  });
  metaToggle.setAttribute('aria-expanded', 'true');
  const metaStatus = el('span', 'dfb-metadata-status');
  metaHead.append(metaToggle, metaStatus);
  const metaBody = el('div', 'dfb-metadata-body');
  metaSection.append(metaHead, metaBody);
  metaSection.hidden = true;
  panel.append(metaSection);

  const errorBox = el('div', 'dfb-error');
  errorBox.setAttribute('role', 'alert');
  errorBox.hidden = true;
  panel.append(errorBox);

  const footer = el('div', 'dfb-footer');
  const status = el('span', 'dfb-status');
  status.setAttribute('role', 'status');
  const secondary = button('dfb-btn', '', () => secondaryAction?.());
  secondary.hidden = true;
  const cancelBtn = button('dfb-btn', text.cancel, () => finish(null));
  const primaryBtn = button('dfb-btn dfb-btn-primary', isSave ? text.save : text.open,
    () => { primaryAction(); });
  primaryBtn.disabled = true;
  footer.append(status, secondary, cancelBtn, primaryBtn);
  panel.append(footer);

  (mount || document.body).append(dialog);

  // ---- state -------------------------------------------------------------
  let provider = null;
  let location = null;              // { path, rootPath, webUrl, label }
  let listing = null;
  let selected = null;              // Entry (browse) or picked local entry
  let pickedEntries = [];           // local provider results
  let metadataForm = null;
  let metadataState = null;
  let metadataToken = 0;
  let busy = false;
  let uploaded = null;              // set once bytes have landed, for retry
  let secondaryAction = null;
  let settled = false;

  const accept = request.accept;

  // ---- helpers -----------------------------------------------------------
  function setError(message = '') {
    errorBox.textContent = message;
    errorBox.hidden = !message;
  }

  function setNotice(message = '', tone = 'info') {
    noticeBox.textContent = message;
    noticeBox.hidden = !message;
    noticeBox.dataset.tone = tone;
  }

  function setStatus(message = '') {
    status.textContent = message;
  }

  function setBusy(value, label = '') {
    busy = value;
    primaryBtn.disabled = value || !canSubmit();
    cancelBtn.disabled = value;
    closeBtn.disabled = value;
    for (const chip of providerBar.querySelectorAll('button')) chip.disabled = value;
    locatorInput.disabled = value;
    locatorSelect.disabled = value;
    locatorBtn.disabled = value;
    nameInput.disabled = value;
    metadataForm?.setDisabled(value || (!isSave && !request.options.editMetadata));
    // Going idle clears the last progress line — a stale "Loading…" under an
    // interactive dialog reads as a hang.
    setStatus(label || (value ? status.textContent : ''));
  }

  function finish(result) {
    if (settled) return;
    settled = true;
    try { if (dialog.open) dialog.close(); } catch { /* already closed */ }
    dialog.remove();
    resolve(result);
  }

  function fail(error) {
    if (settled) return;
    settled = true;
    try { if (dialog.open) dialog.close(); } catch { /* already closed */ }
    dialog.remove();
    reject(error);
  }

  function canSubmit() {
    if (busy) return false;
    if (isSave) {
      if (!nameInput.value.trim() || fileNameProblem(nameInput.value)) return false;
      return provider?.capabilities.browse ? Boolean(location) : Boolean(provider);
    }
    return Boolean(selected) || pickedEntries.length > 0;
  }

  function syncPrimary() {
    if (isSave) {
      primaryBtn.textContent = existingMatch() ? text.replace : text.save;
    }
    primaryBtn.disabled = !canSubmit();
  }

  function existingMatch(name = nameInput.value.trim()) {
    if (!name || !listing || !provider?.capabilities.overwriteCheck) return null;
    return listing.entries.find((entry) => entry.kind === 'file'
      && entry.name.localeCompare(name, undefined, { sensitivity: 'base' }) === 0) || null;
  }

  // ---- providers ---------------------------------------------------------
  function renderProviders() {
    providerBar.textContent = '';
    const usable = request.providers.filter((entry) => entry.available);
    if (usable.length < 2) {
      providerBar.hidden = true;
      return;
    }
    providerBar.hidden = false;
    for (const { provider: candidate } of usable) {
      const chip = button('dfb-chip', candidate.label, () => selectProvider(candidate));
      chip.title = candidate.hint || '';
      chip.setAttribute('role', 'tab');
      chip.dataset.provider = candidate.id;
      chip.classList.toggle('dfb-chip-active', candidate === provider);
      chip.setAttribute('aria-selected', String(candidate === provider));
      providerBar.append(chip);
    }
  }

  async function selectProvider(candidate, startLocation = null) {
    provider = candidate;
    recall?.rememberProvider(candidate.id);
    selected = null;
    pickedEntries = [];
    listing = null;
    location = null;
    metadataState = null;
    setError('');
    setNotice('');
    renderProviders();
    renderMetadata(null);

    const browse = candidate.capabilities.browse;
    crumbBar.hidden = !browse;
    placesRow.hidden = !browse;
    listBox.dataset.mode = browse ? 'browse' : 'device';

    if (candidate.locator) {
      locatorRow.hidden = false;
      locatorLabel.textContent = candidate.locator.label || 'Address';
      locatorInput.placeholder = candidate.locator.placeholder || '';
      const remembered = recall?.recentLocators(candidate.id) || [];
      renderRecent(remembered);
      let current = remembered[0] || '';
      if (!current) {
        try { current = candidate.locator.current?.() || ''; } catch { current = ''; }
      }
      locatorInput.value = current;
      await renderSiteOptions(candidate, current);
    } else {
      locatorRow.hidden = true;
    }

    if (!browse) {
      renderDeviceZone();
      syncPrimary();
      // A save to a non-browsable target still needs metadata handling to be
      // asked for — it will simply report "not supported".
      if (isSave) loadMetadata({ folderPath: '', path: '' });
      return;
    }

    setBusy(true, 'Loading locations…');
    try {
      // Where to start, in order: what the caller asked for, then where this
      // person was last time, then the provider's own first place.
      const asked = startLocation
        || (request.start?.provider === candidate.id ? { ...request.start } : null);
      const remembered = asked ? null : recall?.location(candidate.id);
      const roots = await candidate.roots(asked || remembered || null);
      renderPlaces(roots);
      setBusy(false);

      const start = asked || remembered || roots[0] || null;
      if (!start) { setError('This location offered no starting folder.'); return; }
      const restored = await goTo(start, { tolerant: Boolean(remembered && !asked) });
      // A remembered folder can rot — renamed library, revoked permission,
      // deleted site. Forget it and fall back rather than failing every open.
      if (!restored && remembered && roots[0]) {
        recall?.forgetLocation(candidate.id);
        setError('');
        await goTo(roots[0]);
      }
    } catch (error) {
      setBusy(false);
      setError(error?.message || String(error));
    }
  }

  function renderRecent(values) {
    locatorList.textContent = '';
    for (const value of values) {
      const option = el('option');
      option.value = value;
      locatorList.append(option);
    }
  }

  // The standard-sites dropdown. `options()` is the provider's; an empty list
  // (or no method at all) leaves only the paste box, which is the behaviour
  // for an app that configured no catalog.
  async function renderSiteOptions(candidate, current) {
    locatorSelect.textContent = '';
    let options = [];
    try { options = (await candidate.locator.options?.()) || []; }
    catch { options = []; }
    if (!options.length) {
      locatorSelect.hidden = true;
      locatorSub.hidden = true;
      return;
    }
    for (const option of options) {
      const node = el('option', '', option.label + (option.hint ? ` — ${option.hint}` : ''));
      node.value = option.value;
      locatorSelect.append(node);
    }
    const other = el('option', '', text.otherSite);
    other.value = '';
    locatorSelect.append(other);
    const match = options.find((option) =>
      String(option.value).replace(/\/+$/, '').toLowerCase()
      === String(current || '').replace(/\/+$/, '').toLowerCase());
    locatorSelect.value = match ? match.value : '';
    locatorSelect.hidden = false;
    locatorSub.hidden = false;
    locatorSub.textContent = text.siteHint;
  }

  function renderPlaces(roots) {
    placesRow.textContent = '';
    if (!roots?.length) { placesRow.hidden = true; return; }
    placesRow.hidden = false;
    for (const place of roots) {
      const chip = button('dfb-place', place.label || baseName(place.path), () => goTo(place));
      chip.title = place.path;
      chip.dataset.path = place.path;
      placesRow.append(chip);
    }
  }

  // ---- browsing ----------------------------------------------------------
  // Resolves true when the folder loaded. `tolerant` suppresses the error
  // banner so the caller can fall back quietly.
  async function goTo(target, { force = false, tolerant = false } = {}) {
    void force;
    if (busy) return false;
    location = { ...target };
    selected = null;
    setError('');
    listBox.textContent = '';
    const loading = el('p', 'dfb-empty dfb-empty-loading', 'Loading…');
    listBox.append(loading);
    setBusy(true);
    let ok = false;
    try {
      listing = await broker.list(provider.id, location, { accept });
      location = { ...location, path: listing.path, rootPath: listing.rootPath };
      renderCrumbs();
      renderListing();
      setBusy(false);
      recall?.rememberLocation(provider.id, {
        path: listing.path,
        webUrl: location.webUrl || '',
      });
      ok = true;
      if (isSave) {
        await loadMetadata(metadataTargetForSave());
        syncPrimary();
      }
    } catch (error) {
      listBox.textContent = '';
      setBusy(false);
      if (!tolerant) setError(error?.message || String(error));
    }
    for (const chip of placesRow.querySelectorAll('.dfb-place')) {
      chip.classList.toggle('dfb-place-active', chip.dataset.path === listing?.path);
    }
    syncPrimary();
    return ok;
  }

  function renderCrumbs() {
    crumbs.textContent = '';
    const root = listing.rootPath || '/';
    const rest = listing.path.startsWith(root) ? listing.path.slice(root.length) : listing.path;
    const segments = rest.split('/').filter(Boolean);
    const rootBtn = button('dfb-crumb', baseName(root) || root, () => goTo({ ...location, path: root }));
    crumbs.append(rootBtn);
    let acc = root;
    for (const segment of segments) {
      acc = joinPath(acc, segment);
      const target = acc;
      crumbs.append(el('span', 'dfb-crumb-sep', '/'));
      crumbs.append(button('dfb-crumb', segment, () => goTo({ ...location, path: target })));
    }
    upBtn.disabled = listing.path === root;
    crumbs.scrollLeft = crumbs.scrollWidth;
  }

  function entryRow(entry, { selectable = true } = {}) {
    const row = button('dfb-row', '');
    row.dataset.kind = entry.kind;
    row.setAttribute('role', 'option');
    row.setAttribute('aria-selected', 'false');

    const extension = extensionOf(entry.name);
    const bucket = BADGE_BUCKET[extension] || '';
    const icon = el('span', 'dfb-row-icon');
    icon.innerHTML = entry.kind === 'folder' ? FOLDER_ICON : fileIcon(bucket);
    const name = el('span', 'dfb-row-name', entry.name);
    const category = entry.category || categoryOf(entry.name);
    const meta = el('span', 'dfb-row-meta');
    if (entry.kind === 'folder') {
      meta.append(el('span', '', 'folder'));
    } else {
      if (extension) {
        const badge = el('span', 'dfb-badge', extension);
        if (bucket) badge.dataset.type = bucket;
        badge.title = getCategory(category)?.label || category || '';
        meta.append(badge);
      }
      const facts = [formatBytes(entry.size), formatDate(entry.modified)]
        .filter(Boolean).join(' · ');
      if (facts) meta.append(el('span', '', facts));
    }
    row.append(icon, name, meta);

    if (entry.kind === 'folder') {
      row.addEventListener('click', () => goTo({ ...location, path: entry.path }));
      row.addEventListener('dblclick', () => goTo({ ...location, path: entry.path }));
      return row;
    }
    if (!selectable) return row;

    // A multi-select survives folder changes, so re-mark what is already in it.
    if (request.multiple && pickedEntries.some((picked) => picked.path === entry.path)) {
      row.classList.add('dfb-row-selected');
      row.setAttribute('aria-selected', 'true');
    }
    row.addEventListener('click', () => selectFile(entry, row));
    row.addEventListener('dblclick', () => { selectFile(entry, row); primaryAction(); });
    return row;
  }

  function selectFile(entry, row) {
    // In multi-select, clicking toggles membership; otherwise it replaces the
    // selection. Both keep `selected` pointing at the most recent file, which
    // is what the metadata panel and the name box follow.
    if (request.multiple && !isSave) {
      const index = pickedEntries.findIndex((picked) => picked.path === entry.path);
      if (index >= 0) pickedEntries.splice(index, 1);
      else pickedEntries.push(entry);
      selected = pickedEntries[pickedEntries.length - 1] || null;
      row.classList.toggle('dfb-row-selected', index < 0);
      row.setAttribute('aria-selected', String(index < 0));
      setStatus(pickedEntries.length
        ? `${pickedEntries.length} file${pickedEntries.length === 1 ? '' : 's'} selected`
        : '');
      syncPrimary();
      return;
    }

    selected = entry;
    for (const other of listBox.querySelectorAll('.dfb-row')) {
      const active = other === row;
      other.classList.toggle('dfb-row-selected', active);
      other.setAttribute('aria-selected', String(active));
    }
    if (isSave) {
      nameInput.value = entry.name;
      onNameChanged();
    } else if (request.metadata.enabled && provider.capabilities.metadata) {
      loadMetadata({ path: entry.path, folderPath: parentPath(entry.path, listing.rootPath), webUrl: location.webUrl });
    }
    syncPrimary();
  }

  function renderListing() {
    listBox.textContent = '';
    const entries = listing.entries;
    if (!entries.length) {
      const message = listing.hiddenCount
        ? `${text.emptyFolder} (${listing.hiddenCount} other file${listing.hiddenCount === 1 ? '' : 's'} hidden by the filter)`
        : 'This folder is empty.';
      listBox.append(el('p', 'dfb-empty', message));
      return;
    }
    for (const entry of entries) listBox.append(entryRow(entry));
    if (listing.hiddenCount) {
      listBox.append(el('p', 'dfb-empty',
        `${listing.hiddenCount} file${listing.hiddenCount === 1 ? '' : 's'} hidden by the ${accept.describe()} filter.`));
    }
    if (listing.partial) {
      listBox.append(el('p', 'dfb-empty', 'This folder has more items than were loaded.'));
    }
  }

  // ---- device (non-browsable) provider -----------------------------------
  function renderDeviceZone() {
    listBox.textContent = '';
    if (isSave) {
      listBox.append(el('p', 'dfb-empty',
        'The file will be written to this device when you choose Save.'));
      return;
    }
    const zone = el('div', 'dfb-device');
    zone.append(el('p', 'dfb-device-hint',
      accept.isAny ? 'Pick any file from this device.' : `Accepted: ${accept.describe()}.`));
    zone.append(button('dfb-btn dfb-btn-primary', text.chooseDevice, pickFromDevice));
    listBox.append(zone);

    if (pickedEntries.length) {
      const picked = el('div', 'dfb-picked');
      for (const entry of pickedEntries) picked.append(entryRow(entry, { selectable: false }));
      listBox.append(picked);
    }
  }

  async function pickFromDevice() {
    setError('');
    const results = await provider.pick({ accept, multiple: request.multiple });
    if (!results.length) return;
    const rejected = results.filter((entry) => !accept.matches(entry));
    pickedEntries = results.filter((entry) => accept.matches(entry));
    if (rejected.length) {
      setError(`${rejected.map((r) => `"${r.name}"`).join(', ')} — only ${accept.describe()} can be opened here.`);
    }
    selected = pickedEntries[0] || null;
    renderDeviceZone();
    syncPrimary();
    if (!request.multiple && pickedEntries.length === 1 && request.options.autoConfirm !== false) {
      // One file, one filter, nothing else to decide — don't make the user
      // click Open a second time.
      primaryAction();
    }
  }

  // ---- metadata ----------------------------------------------------------
  function metadataTargetForSave() {
    const name = nameInput.value.trim();
    const existing = existingMatch(name);
    return {
      folderPath: listing?.path || location?.path || '',
      path: existing?.path || '',
      webUrl: location?.webUrl,
    };
  }

  function renderMetadata(form, statusText = '') {
    metaBody.textContent = '';
    metadataForm = form;
    // Without a form the message IS the content — showing it in the header too
    // just says the same thing twice.
    metaStatus.textContent = form ? statusText : '';
    if (!form) {
      metaSection.hidden = !statusText;
      if (statusText) metaBody.append(el('p', 'dfb-notice', statusText));
      return;
    }
    metaSection.hidden = false;
    metaBody.append(form.el);
  }

  async function loadMetadata(target) {
    if (!request.metadata.enabled) { metaSection.hidden = true; return; }
    if (!provider?.capabilities.metadata) {
      renderMetadata(null, 'This location does not store metadata.');
      return;
    }
    const token = ++metadataToken;
    renderMetadata(null, 'Checking columns…');
    metaSection.hidden = false;
    try {
      const state = await broker.getMetadata(provider.id, target, {
        schema: request.metadata.schema,
        mode: request.metadata.mode,
      });
      if (token !== metadataToken) return;
      metadataState = state;
      const editable = isSave || request.options.editMetadata === true;
      const form = createMetadataForm({
        state,
        values: isSave ? request.metadataPrefill : {},
        disabled: !editable,
        onChange: () => { setError(''); },
      });
      const count = availableCount(state);
      renderMetadata(form, count
        ? `${count} column${count === 1 ? '' : 's'} ${editable ? 'writable' : 'shown'} here`
        : 'No writable columns here');
    } catch (error) {
      if (token !== metadataToken) return;
      metadataState = null;
      // A metadata read failure must never block the transfer.
      renderMetadata(null,
        `${error?.message || error} The file can still be ${isSave ? 'saved' : 'opened'}.`);
    }
  }

  // ---- actions -----------------------------------------------------------
  function onNameChanged() {
    setError('');
    const problem = nameInput.value.trim() ? fileNameProblem(nameInput.value) : '';
    if (problem) setNotice(problem, 'warn');
    else {
      const existing = existingMatch();
      setNotice(existing
        ? `"${existing.name}" already exists here — saving will replace it.`
        : '', 'warn');
    }
    syncPrimary();
  }

  async function primaryAction() {
    if (!canSubmit()) return;
    setError('');
    try {
      if (isSave) await runSave();
      else await runOpen();
    } catch (error) {
      setBusy(false);
      setError(error?.message || String(error));
    }
  }

  async function runOpen() {
    const entries = request.multiple && pickedEntries.length ? pickedEntries : [selected];
    setBusy(true, 'Reading…');
    const results = [];
    for (const entry of entries) {
      const read = request.read === 'none'
        ? { name: entry.name, path: entry.path, size: entry.size, mimeType: entry.mimeType }
        : await broker.read(provider.id, entry, {
          as: request.read,
          maxBytes: request.maxReadBytes,
        });
      results.push({
        provider: provider.id,
        file: {
          name: entry.name,
          path: entry.path,
          url: entry.url || '',
          size: read.size ?? entry.size ?? 0,
          modified: entry.modified || '',
          mimeType: read.mimeType || entry.mimeType || '',
          category: entry.category || categoryOf(entry.name),
        },
        text: read.text,
        data: read.data,
        blob: read.blob,
        nativeFile: read.file,
        metadata: metadataState && entries.length === 1
          ? (metadataForm?.getValues() || null)
          : null,
        metadataState: entries.length === 1 ? metadataState : null,
      });
    }

    // Opening with edits enabled writes them back before resolving, so the
    // caller never has to run a second round-trip of its own.
    if (request.options.editMetadata && metadataState && metadataForm?.isDirty()) {
      const errors = metadataForm.validate();
      if (Object.keys(errors).length) {
        setBusy(false);
        setError('Fix the highlighted metadata fields.');
        return;
      }
      setStatus('Saving metadata…');
      await broker.setMetadata(provider.id, {
        path: selected.path, webUrl: location?.webUrl,
      }, metadataState, metadataForm.getDirtyValues());
    }

    finish(request.multiple ? results : results[0]);
  }

  async function runSave() {
    const name = nameInput.value.trim();
    const problem = fileNameProblem(name);
    if (problem) { setError(problem); return; }

    if (metadataForm) {
      const errors = metadataForm.validate();
      if (Object.keys(errors).length) {
        setError('Fix the highlighted metadata fields.');
        return;
      }
    }

    const existing = existingMatch(name);
    setBusy(true, uploaded ? 'Saving metadata…' : 'Saving…');

    // Step 1 — bytes. Skipped on a retry: the file already landed, and
    // uploading it twice is how you get duplicate versions in a library.
    if (!uploaded) {
      const data = typeof request.data === 'function' ? await request.data() : request.data;
      try {
        uploaded = await broker.write(provider.id, location || { path: '' }, name, data, {
          overwrite: Boolean(existing),
          accept,
          maxBytes: request.maxWriteBytes,
        });
      } catch (error) {
        setBusy(false);
        if (error?.code === 'cancelled') { setStatus(''); return; }
        if (error?.code === 'conflict' && !existing) {
          // Race: the file appeared between the listing and the write.
          setNotice(`"${name}" already exists here — saving will replace it.`, 'warn');
          syncPrimary();
        }
        setError(error?.message || String(error));
        return;
      }
    }

    // Step 2 — columns. Failure here is recoverable and must say so.
    const values = metadataForm?.getValues() || {};
    const writable = metadataState && availableCount(metadataState) > 0;
    if (writable && Object.keys(values).length) {
      try {
        await broker.setMetadata(provider.id, {
          path: uploaded.path, webUrl: location?.webUrl,
        }, metadataState, values);
      } catch (error) {
        setBusy(false);
        metadataForm?.setErrors(error?.fieldErrors || {});
        setError(`The file was saved, but its metadata was not. ${error?.message || error}`);
        primaryBtn.textContent = text.retryMetadata;
        secondary.textContent = text.keepWithoutMetadata;
        secondary.hidden = false;
        secondaryAction = () => finish(saveResult({ metadataSaved: false, metadataError: error }));
        cancelBtn.disabled = true;
        return;
      }
    }
    finish(saveResult({ metadataSaved: Boolean(writable), metadataError: null }));
  }

  function saveResult({ metadataSaved, metadataError }) {
    return {
      provider: provider.id,
      file: {
        name: uploaded.name,
        path: uploaded.path,
        url: uploaded.url || '',
        downloaded: Boolean(uploaded.downloaded),
      },
      overwritten: Boolean(uploaded.overwritten),
      metadata: metadataSaved ? (metadataForm?.getValues() || null) : null,
      metadataSaved,
      metadataError: metadataError ? (metadataError.message || String(metadataError)) : '',
      metadataState,
    };
  }

  // ---- wiring ------------------------------------------------------------
  nameInput.addEventListener('input', onNameChanged);
  nameInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') { event.preventDefault(); primaryAction(); }
  });
  async function goToAddress(address) {
    if (!provider?.locator || busy) return;
    setBusy(true, 'Connecting…');
    setError('');
    try {
      const place = await provider.locator.resolve(address);
      setBusy(false);
      locatorInput.value = place.webUrl || address;
      recall?.rememberLocator(provider.id, place.webUrl || address);
      renderRecent(recall?.recentLocators(provider.id) || []);
      // Keep the dropdown honest: a pasted address that happens to be a
      // standard site selects it, and anything else falls to "Another site…".
      await renderSiteOptions(provider, place.webUrl || address);
      const roots = await provider.roots(place).catch(() => []);
      renderPlaces(roots.length ? roots : [place]);
      await goTo(roots[0] || place);
    } catch (error) {
      setBusy(false);
      setError(error?.message || String(error));
    }
  }

  locatorRow.addEventListener('submit', (event) => {
    event.preventDefault();
    goToAddress(locatorInput.value);
  });
  locatorSelect.addEventListener('change', () => {
    // "Another site…" clears the box and hands the keyboard over.
    if (!locatorSelect.value) { locatorInput.value = ''; locatorInput.focus(); return; }
    locatorInput.value = locatorSelect.value;
    goToAddress(locatorSelect.value);
  });
  dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    if (!busy) finish(null);
  });

  // ---- start -------------------------------------------------------------
  dialog.showModal();
  if (isSave) {
    nameInput.value = request.suggestedName || '';
    onNameChanged();
  }

  // Which location to open on: the caller's, then the one used last time,
  // then the app's configured default, then whatever is available.
  const startProvider = request.providers.find((entry) => entry.available
    && entry.provider.id === request.start?.provider)
    || request.providers.find((entry) => entry.available
      && entry.provider.id === recall?.lastProvider())
    || request.providers.find((entry) => entry.available
      && entry.provider.id === broker.config.defaultProvider)
    || request.providers.find((entry) => entry.available);

  selectProvider(startProvider.provider, request.start?.path
    ? { path: request.start.path, webUrl: request.start.webUrl, label: request.start.label }
    : null)
    .catch((error) => fail(new FileBrokerError(error?.message || String(error), {
      code: 'not-available', cause: error,
    })));

  setTimeout(() => {
    if (isSave) nameInput.focus();
    else listBox.querySelector('.dfb-row, button')?.focus();
  }, 0);
}
