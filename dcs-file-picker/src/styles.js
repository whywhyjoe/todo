// Styles ship as JS strings, not .css files, on purpose: the hosting story for
// these apps is a single bundled ES module inside a SharePoint page, where a
// second asset means a second cache-busting problem (SPO serves library files
// with max-age=86400). One import, no asset wiring.
//
// Two themes:
//
//   'dcs'   DEFAULT. The DCS Workbench design system — the same tokens,
//           geometry, and motion DCSPad and the SP Workbench already use.
//           It never *declares* a token, it only reads them with fallbacks
//           (`var(--bg-2, #20242c)`), so inside a DCS app the dialog inherits
//           that app's live values, and outside one it still looks right.
//           That is the design system's own drift contract: keep the token
//           names, even when the values travel inline.
//
//   'basic' A self-contained neutral dark/light sheet with no relationship to
//           any design system, for embedding somewhere that is not a DCS tool.
//
//   'none'  Inject nothing; you ship the CSS.
//
// Every rule is scoped under `.dfb-theme-<name>` on the dialog root, so a host
// that already loads `dcs-workbench.css` is never restyled by us, and our rules
// always win inside the dialog.

// ---------------------------------------------------------------------------
// DCS Workbench theme
// ---------------------------------------------------------------------------
// Token fallbacks below are transcribed from
// dcs-workbench-design-system/tokens/*.css. Surfaces bg-0…bg-3, seven text
// steps, one accent, one shadow, three radii, four motion beats. Sans for
// prose, mono for anything a machine produced — paths, sizes, timestamps.

const DCS = `
.dfb-theme-dcs {
  width: min(680px, calc(100vw - 32px));
  max-height: min(760px, calc(100vh - 48px));
  margin: auto;
  padding: 0;
  color: var(--fg, #e6e9ef);
  background: var(--bg-2, #20242c);
  border: 1px solid var(--border-strong, #3a4150);
  border-radius: var(--radius-l, 6px);
  box-shadow: var(--shadow-pop, 0 10px 28px -10px #000d);
  font-family: var(--sans, "Segoe UI", sans-serif);
  color-scheme: dark;
}
.dfb-theme-dcs::backdrop { background: #0a0c10cc; }
/* [open] matters: a bare "display: flex" here would defeat the UA's
   "dialog:not([open]) { display: none }" and paint a closed dialog. */
.dfb-theme-dcs[open] { display: flex; flex-direction: column; }

/* Every section sets a display, which silently beats the hidden attribute —
   the same guard DCSPad's app.css carries, for the same bug. */
.dfb-theme-dcs [hidden] { display: none !important; }

.dfb-theme-dcs .dfb-panel {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 16px;
  flex: 1 1 auto;
  min-height: 0;
  overflow: hidden;
}
/* In a column flex container every child shrinks by default, which quietly
   crushes a fixed-height row (the 26px segmented control collapsed to 2px).
   Only the list and the metadata panel may give. */
.dfb-theme-dcs .dfb-head,
.dfb-theme-dcs .dfb-description,
.dfb-theme-dcs .dfb-providers,
.dfb-theme-dcs .dfb-locator,
.dfb-theme-dcs .dfb-places,
.dfb-theme-dcs .dfb-crumbbar,
.dfb-theme-dcs .dfb-namerow,
.dfb-theme-dcs .dfb-notice-box,
.dfb-theme-dcs .dfb-error,
.dfb-theme-dcs .dfb-footer { flex: none; }

.dfb-theme-dcs .dfb-head {
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
}
/* The design system's dialog title is sentence case, 600/15px — the uppercase,
   letter-spaced treatment belongs to panel titles only. text-transform and
   letter-spacing are reset explicitly because the "font:" shorthand does not
   carry them, and a host page's own h2 rule otherwise leaks straight in. */
.dfb-theme-dcs .dfb-title {
  margin: 0; font: 600 15px/1.3 var(--sans, "Segoe UI", sans-serif);
  color: var(--fg, #e6e9ef);
  text-transform: none; letter-spacing: normal;
}
.dfb-theme-dcs .dfb-description {
  margin: 0; color: var(--fg-dim, #a2a9b8); font: 12px/1.5 var(--sans, "Segoe UI", sans-serif);
}

/* --- buttons: .dcs-btn geometry, 26px / radius-m / border-strong --------- */
.dfb-theme-dcs .dfb-btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 7px;
  height: 26px; padding: 0 12px;
  background: transparent; color: var(--fg-dim, #a2a9b8);
  border: 1px solid var(--border-strong, #3a4150); border-radius: var(--radius-m, 4px);
  font: 500 12px/1 var(--sans, "Segoe UI", sans-serif);
  cursor: pointer;
  transition: background var(--dur-tint, .12s), border-color var(--dur-tint, .12s), color var(--dur-tint, .12s);
}
.dfb-theme-dcs .dfb-btn:hover:not(:disabled) { background: var(--bg-3, #2a2f3a); color: var(--fg, #e6e9ef); }
.dfb-theme-dcs .dfb-btn:focus-visible { outline: 2px solid var(--accent-soft-line, #35695c); outline-offset: 1px; }
.dfb-theme-dcs .dfb-btn:disabled {
  color: var(--fg-ghost, #4a5060); border-color: var(--border, #2a2e38);
  background: transparent; cursor: default;
}
.dfb-theme-dcs .dfb-btn-primary {
  background: var(--accent, #3fd8b4); border-color: var(--accent, #3fd8b4);
  color: var(--accent-ink, #04241e); font-weight: 600;
}
.dfb-theme-dcs .dfb-btn-primary:hover:not(:disabled) {
  background: var(--accent-hi, #5ee3c4); border-color: var(--accent-hi, #5ee3c4);
  color: var(--accent-ink, #04241e);
}
.dfb-theme-dcs .dfb-btn-primary:disabled {
  background: var(--bg-3, #2a2f3a); border-color: var(--border-strong, #3a4150);
  color: var(--fg-ghost, #4a5060);
}
.dfb-theme-dcs .dfb-icon-btn {
  display: inline-flex; align-items: center; justify-content: center;
  width: 22px; height: 22px; padding: 0;
  background: transparent; border: 1px solid transparent; border-radius: var(--radius-m, 4px);
  color: var(--fg-dim, #a2a9b8); cursor: pointer;
  font: 500 11px/1 var(--sans, "Segoe UI", sans-serif);
  transition: background var(--dur-tint, .12s), color var(--dur-tint, .12s);
}
.dfb-theme-dcs .dfb-icon-btn:hover:not(:disabled) { background: var(--bg-3, #2a2f3a); color: var(--fg, #e6e9ef); }
.dfb-theme-dcs .dfb-icon-btn:disabled { color: var(--fg-ghost, #4a5060); cursor: default; }
.dfb-theme-dcs .dfb-icon-btn svg { width: 13px; height: 13px; fill: none; stroke: currentColor; stroke-width: 1.5; }

/* --- provider switcher: the segmented control --------------------------- */
.dfb-theme-dcs .dfb-providers {
  display: inline-flex; align-self: flex-start; height: 26px; overflow: hidden;
  border: 1px solid var(--border-strong, #3a4150); border-radius: var(--radius-m, 4px);
}
.dfb-theme-dcs .dfb-chip {
  display: inline-flex; align-items: center; justify-content: center; gap: 6px;
  min-width: 30px; height: 100%; padding: 0 12px;
  background: transparent; border: 0; color: var(--fg-dim, #a2a9b8); cursor: pointer;
  font: 500 11.5px/1 var(--sans, "Segoe UI", sans-serif);
  transition: background var(--dur-tint, .12s), color var(--dur-tint, .12s);
}
.dfb-theme-dcs .dfb-chip + .dfb-chip { border-left: 1px solid var(--border-strong, #3a4150); }
.dfb-theme-dcs .dfb-chip:hover:not(:disabled) { background: var(--border-mid, #333947); }
.dfb-theme-dcs .dfb-chip-active { background: var(--bg-3, #2a2f3a); color: var(--accent, #3fd8b4); }

/* --- site chooser: standard sites + paste-an-address --------------------- */
.dfb-theme-dcs .dfb-locator {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center; gap: 8px;
  padding: 9px 10px;
  background: var(--bg-1, #1a1d23);
  border: 1px solid var(--border, #2a2e38); border-radius: var(--radius-m, 4px);
}
.dfb-theme-dcs .dfb-locator-label {
  font: 500 11.5px/1.2 var(--sans, "Segoe UI", sans-serif);
  color: var(--fg-dim, #a2a9b8); white-space: nowrap;
}
.dfb-theme-dcs .dfb-locator-select { grid-column: 2 / span 2; }
.dfb-theme-dcs .dfb-locator-input { grid-column: 2; font-family: var(--mono, "Cascadia Code", Consolas, monospace); }
.dfb-theme-dcs .dfb-locator-sub {
  grid-column: 2 / span 2;
  margin: 0; color: var(--fg-faint, #6d7484);
  font: 10.5px/1.35 var(--sans, "Segoe UI", sans-serif);
}

/* --- inputs: mono wells on bg-0, accent focus ring ---------------------- */
.dfb-theme-dcs input[type="text"],
.dfb-theme-dcs input[type="number"],
.dfb-theme-dcs input[type="datetime-local"],
.dfb-theme-dcs textarea,
.dfb-theme-dcs select {
  width: 100%; min-width: 0; height: 28px; padding: 0 9px;
  color: var(--fg, #e6e9ef); background: var(--bg-0, #14161b);
  border: 1px solid var(--border-strong, #3a4150); border-radius: var(--radius-m, 4px);
  font: 12px/1 var(--sans, "Segoe UI", sans-serif);
  outline: none; box-sizing: border-box;
}
.dfb-theme-dcs textarea {
  height: auto; min-height: 58px; padding: 7px 9px; line-height: 1.5; resize: vertical;
}
.dfb-theme-dcs select {
  appearance: none; padding-right: 26px; cursor: pointer;
  background-image: linear-gradient(45deg, transparent 50%, currentColor 50%),
                    linear-gradient(135deg, currentColor 50%, transparent 50%);
  background-position: calc(100% - 14px) 12px, calc(100% - 9px) 12px;
  background-size: 5px 5px, 5px 5px;
  background-repeat: no-repeat;
}
.dfb-theme-dcs input:focus, .dfb-theme-dcs textarea:focus, .dfb-theme-dcs select:focus {
  border-color: var(--accent, #3fd8b4);
  box-shadow: 0 0 0 2px var(--accent-ring, #182b28);
}
.dfb-theme-dcs input::placeholder, .dfb-theme-dcs textarea::placeholder { color: var(--fg-faint, #6d7484); }
.dfb-theme-dcs input:disabled, .dfb-theme-dcs textarea:disabled, .dfb-theme-dcs select:disabled {
  color: var(--fg-ghost, #4a5060); background: var(--bg-1, #1a1d23);
  border-color: var(--border, #2a2e38); cursor: not-allowed; opacity: .72;
}

/* --- places: library shortcuts ----------------------------------------- */
.dfb-theme-dcs .dfb-places { display: flex; flex-wrap: wrap; gap: 6px; }
.dfb-theme-dcs .dfb-place {
  display: inline-flex; align-items: center; gap: 6px;
  height: 24px; padding: 0 10px; border-radius: 12px; cursor: pointer;
  background: var(--bg-1, #1a1d23); border: 1px solid var(--border-strong, #3a4150);
  color: var(--fg-dim, #a2a9b8);
  font: 500 11px/1 var(--mono, "Cascadia Code", Consolas, monospace); letter-spacing: .04em;
  transition: background var(--dur-tint, .12s), border-color var(--dur-tint, .12s), color var(--dur-tint, .12s);
}
.dfb-theme-dcs .dfb-place:hover { color: var(--fg-strong, #f2f5fa); border-color: var(--fg-ghost, #4a5060); }
.dfb-theme-dcs .dfb-place-active {
  color: var(--accent-soft-fg, #79e0c6); background: var(--accent-soft, #1e3b35);
  border-color: var(--accent-soft-line, #35695c);
}

/* --- breadcrumb bar ----------------------------------------------------- */
.dfb-theme-dcs .dfb-crumbbar {
  display: flex; align-items: center; gap: 6px; min-width: 0;
  height: 30px; padding: 3px 5px;
  background: var(--bg-0, #14161b); border: 1px solid var(--border-strong, #3a4150);
  border-radius: var(--radius-m, 4px);
}
.dfb-theme-dcs .dfb-crumbs {
  flex: 1; min-width: 0; display: flex; align-items: center; gap: 2px;
  overflow-x: auto; white-space: nowrap;
}
.dfb-theme-dcs .dfb-crumbs::-webkit-scrollbar { height: 0; }
.dfb-theme-dcs .dfb-crumb {
  padding: 3px 6px; cursor: pointer; flex: none;
  background: transparent; border: 0; border-radius: var(--radius-s, 3px);
  color: var(--fg-dim, #a2a9b8); font: 11px/1 var(--mono, "Cascadia Code", Consolas, monospace);
}
.dfb-theme-dcs .dfb-crumb:hover { background: var(--bg-3, #2a2f3a); color: var(--fg-strong, #f2f5fa); }
.dfb-theme-dcs .dfb-crumb-sep { color: var(--fg-ghost, #4a5060); font: 11px/1 var(--mono, "Cascadia Code", Consolas, monospace); }

/* --- the list ----------------------------------------------------------- */
.dfb-theme-dcs .dfb-list {
  flex: 1 1 auto; min-height: 132px; max-height: min(340px, 40vh); overflow: auto;
  padding: 3px; background: var(--bg-1, #1a1d23);
  border: 1px solid var(--border, #2a2e38); border-radius: var(--radius-m, 4px);
}
.dfb-theme-dcs .dfb-row {
  display: grid; grid-template-columns: 22px minmax(0, 1fr) auto;
  align-items: center; gap: 8px; width: 100%; min-height: 32px;
  padding: 4px 8px; text-align: left; cursor: pointer;
  color: var(--fg-row, #d4d9e2); background: transparent;
  border: 1px solid transparent; border-radius: var(--radius-m, 4px);
  font: 12px/1.25 var(--sans, "Segoe UI", sans-serif);
  transition: background var(--dur-tint, .12s), color var(--dur-tint, .12s);
}
.dfb-theme-dcs .dfb-row:hover { color: var(--fg-strong, #f2f5fa); background: var(--bg-3, #2a2f3a); }
.dfb-theme-dcs .dfb-row-selected {
  color: var(--fg-strong, #f2f5fa); background: var(--accent-soft, #1e3b35);
  border-color: var(--accent-soft-line, #35695c);
}
.dfb-theme-dcs .dfb-row-icon { display: inline-flex; align-items: center; justify-content: center; }
/* Node icons: stroke + fill ride one outline, resting tier by default. */
.dfb-theme-dcs .dfb-node { flex: none; color: var(--node-file, #7a8190); fill: var(--node-file-fill, transparent); }
.dfb-theme-dcs .dfb-node path + path { fill: none; }
.dfb-theme-dcs .dfb-node-folder { color: var(--node-user, #5b9184); fill: var(--node-user-fill, #1b2926); }
.dfb-theme-dcs .dfb-node-js   { color: var(--node-js, #9a9068);   fill: var(--node-js-fill, #24221a); }
.dfb-theme-dcs .dfb-node-html { color: var(--node-html, #9d7d64); fill: var(--node-html-fill, #251f1a); }
.dfb-theme-dcs .dfb-node-css  { color: var(--node-css, #6f8ba6);  fill: var(--node-css-fill, #1b232b); }
.dfb-theme-dcs .dfb-node-json { color: var(--node-json, #7f9070); fill: var(--node-json-fill, #1e2119); }
.dfb-theme-dcs .dfb-node-doc  { color: var(--node-doc, #86809e);  fill: var(--node-doc-fill, #211f29); }
/* Rest is what the whole list does; brightness is opted into, one row at a time. */
.dfb-theme-dcs .dfb-row-selected .dfb-node-folder { color: var(--node-open, #5ee3c4); fill: var(--node-open-fill, #24463e); }
.dfb-theme-dcs .dfb-row-selected .dfb-node-js   { color: var(--node-js-active, #e3ce7a);   fill: var(--node-js-active-fill, #332e18); }
.dfb-theme-dcs .dfb-row-selected .dfb-node-html { color: var(--node-html-active, #e5a06a); fill: var(--node-html-active-fill, #33251b); }
.dfb-theme-dcs .dfb-row-selected .dfb-node-css  { color: var(--node-css-active, #7eb6e8);  fill: var(--node-css-active-fill, #1c2a38); }
.dfb-theme-dcs .dfb-row-selected .dfb-node-json { color: var(--node-json-active, #a9c98a); fill: var(--node-json-active-fill, #21281a); }
.dfb-theme-dcs .dfb-row-selected .dfb-node-doc  { color: var(--node-doc-active, #b6a8de);  fill: var(--node-doc-active-fill, #241f33); }
.dfb-theme-dcs .dfb-row-selected .dfb-node { color: var(--fg-dim, #a2a9b8); }
.dfb-theme-dcs .dfb-row-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dfb-theme-dcs .dfb-row-meta {
  display: inline-flex; align-items: center; gap: 7px;
  color: var(--fg-faint, #6d7484);
  font: 10.5px/1 var(--mono, "Cascadia Code", Consolas, monospace); white-space: nowrap;
}
/* File-type badge — DCSPad's five buckets, verbatim tokens. */
.dfb-theme-dcs .dfb-badge {
  display: inline-flex; align-items: center; padding: 2px 5px;
  border-radius: var(--radius-s, 3px);
  font: 600 9px/1.3 var(--mono, "Cascadia Code", Consolas, monospace);
  letter-spacing: .06em; text-transform: uppercase;
  color: var(--accent-soft-fg, #79e0c6); background: var(--accent-soft, #1e3b35);
  border: 1px solid var(--accent-soft-line, #35695c);
}
.dfb-theme-dcs .dfb-badge[data-type="js"]   { color: var(--ft-js-fg, #e3ce7a);   background: var(--ft-js-bg, #332e18);   border-color: var(--ft-js-line, #514a28); }
.dfb-theme-dcs .dfb-badge[data-type="html"] { color: var(--ft-html-fg, #e5a06a); background: var(--ft-html-bg, #33251b); border-color: var(--ft-html-line, #543c2b); }
.dfb-theme-dcs .dfb-badge[data-type="css"]  { color: var(--ft-css-fg, #7eb6e8);  background: var(--ft-css-bg, #1c2a38);  border-color: var(--ft-css-line, #2d4761); }
.dfb-theme-dcs .dfb-badge[data-type="json"] { color: var(--ft-json-fg, #a9c98a); background: var(--ft-json-bg, #21281a); border-color: var(--ft-json-line, #3b4a2f); }
.dfb-theme-dcs .dfb-badge[data-type="doc"]  { color: var(--ft-doc-fg, #b6a8de);  background: var(--ft-doc-bg, #241f33);  border-color: var(--ft-doc-line, #3d3557); }

/* --- states: one mono line, centred, no illustration -------------------- */
.dfb-theme-dcs .dfb-empty {
  display: grid; place-items: center; align-content: center; gap: 10px;
  margin: 0; padding: 24px; text-align: center;
  color: var(--fg-faint, #6d7484);
  font: 12px/1.55 var(--mono, "Cascadia Code", Consolas, monospace);
}
.dfb-theme-dcs .dfb-empty-loading::before {
  content: ""; width: 17px; height: 17px;
  border: 2px solid var(--border-strong, #3a4150); border-top-color: var(--accent, #3fd8b4);
  border-radius: 50%; animation: dfb-spin .75s linear infinite;
}
@keyframes dfb-spin { to { transform: rotate(360deg); } }

.dfb-theme-dcs .dfb-device { display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 26px 14px; }
.dfb-theme-dcs .dfb-device-hint {
  margin: 0; color: var(--fg-faint, #6d7484);
  font: 12px/1.55 var(--mono, "Cascadia Code", Consolas, monospace);
}
.dfb-theme-dcs .dfb-picked { margin-top: 6px; border-top: 1px solid var(--border, #2a2e38); padding-top: 4px; }

/* --- name row ----------------------------------------------------------- */
.dfb-theme-dcs .dfb-namerow { display: flex; align-items: center; gap: 10px; }
.dfb-theme-dcs .dfb-name-label {
  font: 500 11.5px/1.2 var(--sans, "Segoe UI", sans-serif);
  color: var(--fg-dim, #a2a9b8); white-space: nowrap;
}
.dfb-theme-dcs .dfb-name-input { flex: 1 1 auto; font-family: var(--mono, "Cascadia Code", Consolas, monospace); }

/* --- notices and errors ------------------------------------------------- */
.dfb-theme-dcs .dfb-notice-box, .dfb-theme-dcs .dfb-error {
  display: flex; align-items: center; gap: 10px;
  padding: 8px 11px; border-radius: var(--radius-m, 4px);
  font: 12px/1.45 var(--sans, "Segoe UI", sans-serif);
  color: var(--fg-row, #d4d9e2); background: var(--bg-1, #1a1d23);
  border: 1px solid var(--border, #2a2e38);
}
.dfb-theme-dcs .dfb-notice-box[data-tone="warn"] {
  color: var(--warn, #e8b660); background: var(--warn-soft, #2a2112);
  border-color: var(--warn-soft-line, #554323);
}
.dfb-theme-dcs .dfb-notice-box[data-tone="info"] {
  color: var(--info, #67a7f7); background: var(--info-soft, #1c2a38);
  border-color: var(--info-soft-line, #2d4761);
}
.dfb-theme-dcs .dfb-error {
  color: var(--error-fg, #ff8b82); background: var(--error-bg, #2a1512);
  border-color: var(--error-soft-line, #3a1c1a);
}

/* --- metadata ----------------------------------------------------------- */
.dfb-theme-dcs .dfb-metadata {
  flex: 0 1 auto; min-height: 0; display: flex; flex-direction: column;
  border: 1px solid var(--border, #2a2e38); border-radius: var(--radius-m, 4px);
  background: var(--bg-1, #1a1d23);
}
.dfb-theme-dcs .dfb-metadata-head {
  flex: none;
  display: flex; align-items: center; justify-content: space-between; gap: 10px;
  height: 30px; padding: 0 10px;
  border-bottom: 1px solid var(--border, #2a2e38);
}
.dfb-theme-dcs .dfb-metadata-toggle {
  padding: 0; border: 0; background: none; cursor: pointer;
  color: var(--fg-dim, #a2a9b8);
  font: 700 10px/1 var(--sans, "Segoe UI", sans-serif);
  letter-spacing: .14em; text-transform: uppercase;
}
.dfb-theme-dcs .dfb-metadata-toggle:hover { color: var(--fg, #e6e9ef); }
.dfb-theme-dcs .dfb-metadata-toggle::before { content: "▾ "; color: var(--fg-faint, #6d7484); letter-spacing: 0; }
.dfb-theme-dcs .dfb-metadata-toggle[aria-expanded="false"]::before { content: "▸ "; }
.dfb-theme-dcs .dfb-metadata-status {
  color: var(--fg-faint, #6d7484);
  font: 500 11px/1 var(--mono, "Cascadia Code", Consolas, monospace); letter-spacing: .04em;
}
.dfb-theme-dcs .dfb-metadata-body { flex: 1 1 auto; min-height: 0; max-height: 220px; overflow: auto; padding: 10px; }
.dfb-theme-dcs .dfb-metadata-form { display: flex; flex-direction: column; gap: 11px; }

.dfb-theme-dcs .dfb-field { display: grid; gap: 5px; min-width: 0; }
.dfb-theme-dcs .dfb-field-head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
.dfb-theme-dcs .dfb-field-label {
  font: 500 11.5px/1.2 var(--sans, "Segoe UI", sans-serif); color: var(--fg, #e6e9ef);
}
.dfb-theme-dcs .dfb-field-state {
  color: var(--accent, #3fd8b4); font: 9.5px/1 var(--sans, "Segoe UI", sans-serif);
  letter-spacing: .08em; text-transform: uppercase;
}
.dfb-theme-dcs .dfb-field-unavailable .dfb-field-label { color: var(--fg-dim, #a2a9b8); }
.dfb-theme-dcs .dfb-field-unavailable .dfb-field-state { color: var(--fg-faint, #6d7484); }
.dfb-theme-dcs .dfb-field-hint, .dfb-theme-dcs .dfb-field-note {
  margin: 0; color: var(--fg-faint, #6d7484); font: 10.5px/1.35 var(--sans, "Segoe UI", sans-serif);
}
.dfb-theme-dcs .dfb-field-error {
  margin: 0; color: var(--error-fg, #ff8b82); font: 10.5px/1.35 var(--sans, "Segoe UI", sans-serif);
}
.dfb-theme-dcs .dfb-field-invalid input,
.dfb-theme-dcs .dfb-field-invalid textarea,
.dfb-theme-dcs .dfb-field-invalid select { border-color: var(--error, #ff6b62); }
.dfb-theme-dcs .dfb-choices { display: flex; flex-wrap: wrap; gap: 5px 14px; }
.dfb-theme-dcs .dfb-choice {
  display: inline-flex; align-items: center; gap: 7px;
  color: var(--fg-row, #d4d9e2); font: 12px/1 var(--sans, "Segoe UI", sans-serif); cursor: pointer;
}
.dfb-theme-dcs .dfb-choice input {
  width: auto; height: auto; accent-color: var(--accent, #3fd8b4); color-scheme: dark; margin: 0;
}
.dfb-theme-dcs .dfb-notice { margin: 0; color: var(--fg-dim, #a2a9b8); font: 12px/1.5 var(--sans, "Segoe UI", sans-serif); }

/* --- footer ------------------------------------------------------------- */
.dfb-theme-dcs .dfb-footer { display: flex; align-items: center; gap: 8px; }
.dfb-theme-dcs .dfb-status {
  flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  color: var(--fg-faint, #6d7484);
  font: 500 11px/1 var(--mono, "Cascadia Code", Consolas, monospace); letter-spacing: .04em;
}

.dfb-theme-dcs ::-webkit-scrollbar { width: 10px; height: 10px; }
.dfb-theme-dcs ::-webkit-scrollbar-track { background: transparent; }
.dfb-theme-dcs ::-webkit-scrollbar-thumb {
  background: var(--border-strong, #3a4150); border-radius: 5px;
  border: 2px solid var(--bg-1, #1a1d23);
}
.dfb-theme-dcs ::-webkit-scrollbar-thumb:hover { background: var(--fg-ghost, #4a5060); }

@media (prefers-reduced-motion: reduce) {
  .dfb-theme-dcs *, .dfb-theme-dcs *::before, .dfb-theme-dcs *::after {
    animation: none !important; transition: none !important;
  }
}
@media (max-width: 560px) {
  .dfb-theme-dcs .dfb-list { height: 40vh; }
  .dfb-theme-dcs .dfb-locator { grid-template-columns: minmax(0, 1fr) auto; }
  .dfb-theme-dcs .dfb-locator-label { grid-column: 1 / -1; }
  .dfb-theme-dcs .dfb-locator-select,
  .dfb-theme-dcs .dfb-locator-input,
  .dfb-theme-dcs .dfb-locator-sub { grid-column: 1 / -1; }
}
`;

// ---------------------------------------------------------------------------
// Basic theme — no design system, follows the host's light/dark scheme.
// ---------------------------------------------------------------------------

const BASIC = `
.dfb-theme-basic {
  --dfb-bg: Canvas;
  --dfb-fg: CanvasText;
  --dfb-muted: color-mix(in srgb, CanvasText 60%, Canvas);
  --dfb-line: color-mix(in srgb, CanvasText 20%, Canvas);
  --dfb-soft: color-mix(in srgb, CanvasText 6%, Canvas);
  --dfb-accent: #0b5cab;
  --dfb-accent-fg: #fff;
  --dfb-danger: #b3261e;
  --dfb-warn-bg: color-mix(in srgb, #e8a33d 22%, Canvas);
  --dfb-radius: 8px;
  --dfb-font: system-ui, -apple-system, "Segoe UI", sans-serif;
  --dfb-mono: ui-monospace, "Cascadia Mono", Consolas, monospace;

  color-scheme: light dark;
  width: min(620px, calc(100vw - 32px));
  max-height: min(760px, calc(100vh - 48px));
  padding: 0;
  border: 1px solid var(--dfb-line);
  border-radius: var(--dfb-radius);
  background: var(--dfb-bg);
  color: var(--dfb-fg);
  font: 13px/1.45 var(--dfb-font);
  box-shadow: 0 18px 48px rgb(0 0 0 / 28%);
}
.dfb-theme-basic::backdrop { background: rgb(0 0 0 / 45%); }
.dfb-theme-basic[open] { display: flex; flex-direction: column; }
.dfb-theme-basic [hidden] { display: none !important; }

.dfb-theme-basic .dfb-panel { display: flex; flex-direction: column; gap: 10px; padding: 14px 16px 12px; flex: 1 1 auto; min-height: 0; overflow: hidden; }
.dfb-theme-basic .dfb-head,
.dfb-theme-basic .dfb-description,
.dfb-theme-basic .dfb-providers,
.dfb-theme-basic .dfb-locator,
.dfb-theme-basic .dfb-places,
.dfb-theme-basic .dfb-crumbbar,
.dfb-theme-basic .dfb-namerow,
.dfb-theme-basic .dfb-notice-box,
.dfb-theme-basic .dfb-error,
.dfb-theme-basic .dfb-footer { flex: none; }
.dfb-theme-basic .dfb-metadata { flex: 0 1 auto; min-height: 0; display: flex; flex-direction: column; }
.dfb-theme-basic .dfb-metadata-head { flex: none; }
.dfb-theme-basic .dfb-metadata-body { flex: 1 1 auto; min-height: 0; }
.dfb-theme-basic .dfb-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.dfb-theme-basic .dfb-title {
  margin: 0; font-size: 15px; font-weight: 600;
  text-transform: none; letter-spacing: normal;
}
.dfb-theme-basic .dfb-description { margin: 0; color: var(--dfb-muted); }

.dfb-theme-basic .dfb-btn {
  font: inherit; padding: 5px 12px; border: 1px solid var(--dfb-line); border-radius: 6px;
  background: var(--dfb-soft); color: inherit; cursor: pointer;
}
.dfb-theme-basic .dfb-btn:hover:not(:disabled) { border-color: var(--dfb-accent); }
.dfb-theme-basic .dfb-btn:disabled { opacity: .5; cursor: default; }
.dfb-theme-basic .dfb-btn-primary { background: var(--dfb-accent); border-color: var(--dfb-accent); color: var(--dfb-accent-fg); }
.dfb-theme-basic .dfb-icon-btn {
  font: inherit; line-height: 1; padding: 4px 7px; border: 1px solid transparent;
  border-radius: 6px; background: none; color: var(--dfb-muted); cursor: pointer;
}
.dfb-theme-basic .dfb-icon-btn:hover:not(:disabled) { background: var(--dfb-soft); color: var(--dfb-fg); }
.dfb-theme-basic .dfb-icon-btn:disabled { opacity: .35; cursor: default; }
.dfb-theme-basic .dfb-icon-btn svg { width: 13px; height: 13px; fill: none; stroke: currentColor; stroke-width: 1.5; }

.dfb-theme-basic .dfb-providers { display: flex; flex-wrap: wrap; gap: 6px; }
.dfb-theme-basic .dfb-chip, .dfb-theme-basic .dfb-place {
  font: inherit; padding: 4px 10px; border: 1px solid var(--dfb-line); border-radius: 999px;
  background: none; color: inherit; cursor: pointer;
}
.dfb-theme-basic .dfb-chip-active { background: var(--dfb-accent); border-color: var(--dfb-accent); color: var(--dfb-accent-fg); }
.dfb-theme-basic .dfb-places { display: flex; flex-wrap: wrap; gap: 6px; }
.dfb-theme-basic .dfb-place { font-size: 12px; color: var(--dfb-muted); }
.dfb-theme-basic .dfb-place-active { color: var(--dfb-fg); border-color: var(--dfb-accent); }

.dfb-theme-basic .dfb-locator { display: grid; grid-template-columns: auto minmax(0,1fr) auto; align-items: center; gap: 8px; }
.dfb-theme-basic .dfb-locator-label { color: var(--dfb-muted); white-space: nowrap; }
.dfb-theme-basic .dfb-locator-select { grid-column: 2 / span 2; }
.dfb-theme-basic .dfb-locator-input { grid-column: 2; }
.dfb-theme-basic .dfb-locator-sub { grid-column: 2 / span 2; margin: 0; font-size: 11px; color: var(--dfb-muted); }

.dfb-theme-basic input[type="text"],
.dfb-theme-basic input[type="number"],
.dfb-theme-basic input[type="datetime-local"],
.dfb-theme-basic textarea,
.dfb-theme-basic select {
  font: inherit; padding: 5px 8px; border: 1px solid var(--dfb-line); border-radius: 6px;
  background: var(--dfb-bg); color: inherit; width: 100%; box-sizing: border-box;
}
.dfb-theme-basic textarea { resize: vertical; min-height: 54px; }
.dfb-theme-basic input:disabled, .dfb-theme-basic textarea:disabled, .dfb-theme-basic select:disabled {
  background: var(--dfb-soft); color: var(--dfb-muted);
}

.dfb-theme-basic .dfb-crumbbar { display: flex; align-items: center; gap: 4px; }
.dfb-theme-basic .dfb-crumbs {
  flex: 1 1 auto; min-width: 0; display: flex; align-items: center; gap: 2px;
  overflow-x: auto; white-space: nowrap; font-family: var(--dfb-mono); font-size: 12px;
}
.dfb-theme-basic .dfb-crumb { font: inherit; padding: 2px 5px; border: 0; border-radius: 4px; background: none; color: var(--dfb-muted); cursor: pointer; }
.dfb-theme-basic .dfb-crumb:hover { background: var(--dfb-soft); color: var(--dfb-fg); }
.dfb-theme-basic .dfb-crumb-sep { color: var(--dfb-muted); opacity: .6; }

.dfb-theme-basic .dfb-list {
  flex: 1 1 auto; min-height: 120px; max-height: 260px; overflow: auto;
  border: 1px solid var(--dfb-line); border-radius: var(--dfb-radius); background: var(--dfb-soft);
}
.dfb-theme-basic .dfb-row {
  display: grid; grid-template-columns: 20px 1fr auto; align-items: center; gap: 8px;
  width: 100%; padding: 6px 10px; border: 0;
  border-bottom: 1px solid color-mix(in srgb, CanvasText 8%, transparent);
  background: none; color: inherit; font: inherit; text-align: left; cursor: pointer;
}
.dfb-theme-basic .dfb-row:hover { background: color-mix(in srgb, CanvasText 7%, transparent); }
.dfb-theme-basic .dfb-row-selected { background: color-mix(in srgb, var(--dfb-accent) 20%, transparent); }
.dfb-theme-basic .dfb-node { width: 15px; height: 15px; fill: none; stroke: currentColor; stroke-width: 1.6; }
.dfb-theme-basic .dfb-node-folder { color: var(--dfb-accent); }
.dfb-theme-basic .dfb-row-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dfb-theme-basic .dfb-row-meta { display: inline-flex; align-items: center; gap: 6px; color: var(--dfb-muted); font-size: 11px; white-space: nowrap; }
.dfb-theme-basic .dfb-badge {
  font: 600 9px/1.3 var(--dfb-mono); text-transform: uppercase; letter-spacing: .06em;
  padding: 2px 5px; border: 1px solid var(--dfb-line); border-radius: 3px; color: var(--dfb-muted);
}
.dfb-theme-basic .dfb-empty { margin: 0; padding: 14px; color: var(--dfb-muted); text-align: center; }
.dfb-theme-basic .dfb-device { display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 22px 14px; }
.dfb-theme-basic .dfb-device-hint { margin: 0; color: var(--dfb-muted); }
.dfb-theme-basic .dfb-picked { border-top: 1px solid var(--dfb-line); }

.dfb-theme-basic .dfb-namerow { display: flex; align-items: center; gap: 8px; }
.dfb-theme-basic .dfb-name-label { color: var(--dfb-muted); white-space: nowrap; }
.dfb-theme-basic .dfb-name-input { flex: 1 1 auto; }

.dfb-theme-basic .dfb-notice-box { padding: 6px 10px; border-radius: 6px; background: var(--dfb-soft); color: var(--dfb-muted); }
.dfb-theme-basic .dfb-notice-box[data-tone="warn"] { background: var(--dfb-warn-bg); color: var(--dfb-fg); }
.dfb-theme-basic .dfb-error {
  padding: 6px 10px; border-radius: 6px;
  border: 1px solid color-mix(in srgb, var(--dfb-danger) 45%, transparent);
  background: color-mix(in srgb, var(--dfb-danger) 12%, Canvas); color: var(--dfb-fg);
}

.dfb-theme-basic .dfb-metadata { border: 1px solid var(--dfb-line); border-radius: var(--dfb-radius); }
.dfb-theme-basic .dfb-metadata-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 6px 10px; }
.dfb-theme-basic .dfb-metadata-toggle { font: inherit; font-weight: 600; border: 0; background: none; color: inherit; cursor: pointer; padding: 0; }
.dfb-theme-basic .dfb-metadata-toggle::before { content: "▾ "; color: var(--dfb-muted); }
.dfb-theme-basic .dfb-metadata-toggle[aria-expanded="false"]::before { content: "▸ "; }
.dfb-theme-basic .dfb-metadata-status { color: var(--dfb-muted); font-size: 11px; }
.dfb-theme-basic .dfb-metadata-body { max-height: 210px; overflow: auto; padding: 0 10px 10px; }
.dfb-theme-basic .dfb-metadata-form { display: flex; flex-direction: column; gap: 10px; }
.dfb-theme-basic .dfb-field { display: flex; flex-direction: column; gap: 3px; }
.dfb-theme-basic .dfb-field-head { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
.dfb-theme-basic .dfb-field-label { font-weight: 600; }
.dfb-theme-basic .dfb-field-state {
  font-size: 10px; text-transform: uppercase; letter-spacing: .04em; color: var(--dfb-muted);
  border: 1px solid var(--dfb-line); border-radius: 999px; padding: 0 6px;
}
.dfb-theme-basic .dfb-field-unavailable .dfb-field-label { color: var(--dfb-muted); }
.dfb-theme-basic .dfb-field-hint, .dfb-theme-basic .dfb-field-note { margin: 0; color: var(--dfb-muted); font-size: 11px; }
.dfb-theme-basic .dfb-field-error { margin: 0; color: var(--dfb-danger); font-size: 11px; }
.dfb-theme-basic .dfb-field-invalid input,
.dfb-theme-basic .dfb-field-invalid textarea,
.dfb-theme-basic .dfb-field-invalid select { border-color: var(--dfb-danger); }
.dfb-theme-basic .dfb-choices { display: flex; flex-wrap: wrap; gap: 4px 12px; }
.dfb-theme-basic .dfb-choice { display: inline-flex; align-items: center; gap: 5px; }
.dfb-theme-basic .dfb-choice input { width: auto; }
.dfb-theme-basic .dfb-notice { margin: 0; color: var(--dfb-muted); }

.dfb-theme-basic .dfb-footer { display: flex; align-items: center; gap: 8px; }
.dfb-theme-basic .dfb-status { flex: 1 1 auto; color: var(--dfb-muted); font-size: 12px; }
`;

export const FILE_BROKER_THEMES = Object.freeze({ dcs: DCS, basic: BASIC });

/** @deprecated kept so an early integration importing the string still builds. */
export const FILE_BROKER_CSS = DCS;

/** Inject one theme's stylesheet, once per document. Safe to call every open. */
export function ensureStyles(theme = 'dcs', doc = globalThis.document) {
  if (!doc || theme === 'none') return;
  const css = FILE_BROKER_THEMES[theme];
  if (!css) return;
  const id = `dcs-file-broker-styles-${theme}`;
  if (doc.getElementById(id)) return;
  const style = doc.createElement('style');
  style.id = id;
  style.textContent = css;
  doc.head.append(style);
}
