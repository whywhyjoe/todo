# Where this came from, and how DCSPad maps onto it

This component is a generalisation of code that already runs in two places in
the `sp-dcspad` repo. Nothing here has been deleted from there — this is the
standard the next app builds on, and the shape DCSPad can migrate to when
someone chooses to.

## The two existing implementations

| Concern | DCSPad (`src/`) | SP Workbench (`src/workbench/`) |
| --- | --- | --- |
| Picker UI | `#sp-files-dialog` in `index.html` + ~500 lines in `main.js` | `views/browser.js` grid, inline in the view |
| Local files | `io.js` (`downloadText`, `wirePaneImport`, `wireJsonImport`) | hidden `<input type=file>` in the grid toolbar |
| SharePoint transfer | `sp-files.js` (text only, HTML/CSS/JS) | `sp-write.js` (any binary, up to 50 MB) |
| OData plumbing | `sp-odata.js` (shared by both) | same |
| Metadata | `#sp-metadata-dialog`, three hard-coded fields | `field-editor.js`, every writable column |
| Overwrite consent | second dialog with an explicit warning | inline consent bar |
| Metadata-after-upload failure | *Retry metadata* / *Keep file without metadata* | same idea, different wording |

Two pickers, two metadata editors, two overwrite flows, one shared REST layer.
The duplication is the reason this package exists.

## What moved, and to where

| From | To |
| --- | --- |
| `sp-odata.js` (ACCEPT_JSON, `requireOk`, `odataPathLiteral`, `unwrapJson`, `resultArray`) | inlined at the top of `src/providers/sharepoint.js` — the package has no cross-repo imports |
| `sp-files.js` digest cache, origin guard, root boundary, `AddUsingPath` | `src/providers/sharepoint.js` |
| `sp-files.js` `inspectFileMetadata` / `writeFileMetadata` | `getMetadata` / `setMetadata`, with the field list now a parameter instead of a constant |
| `field-editor.js` `toFormValue` / `fromItemValue` | `src/providers/sharepoint.js`, keyed on neutral types instead of `TypeAsString` |
| `field-editor.js` DOM editors | `src/metadata-form.js` |
| `io.js` download + file-input helpers | `src/providers/local.js` |
| `main.js` `paneForFileName`, browser-type filtering | `src/categories.js` — categories instead of a fixed three-way switch |
| `main.js` dialog flow (browse, name, overwrite, metadata, retry) | `src/dialog.js` |

## The behaviours that were kept deliberately

These are the parts that look like details and are not. Each one exists because
it was got wrong first.

- **A failed metadata write never re-uploads.** `runSave()` keeps the `uploaded`
  result and skips step 1 on retry (`main.js` learned this the hard way — a
  retry that re-uploads adds a version to the library every time).
- **Unavailable columns are shown with a reason**, not hidden. "Description
  isn't in this library" is information the person saving wants.
- **The digest is per web**, and the page digest is only a candidate for the web
  that served the page. Any other site gets its own `/contextinfo`.
- **Library root folders have no list item.** `ListItemAllFields.ParentList`
  comes back empty for them, so the provider falls back to `GetList(@listUrl)`.
- **403 once, then force a fresh digest, then give up.**
- **Every returned path is re-checked against the web's root** — in the provider
  *and* again in `broker.list()`.
- **`[hidden]` needs a `!important` guard** when the element also has a
  `display` rule. `styles.js` carries one; DCSPad's `app.css` carries the same
  guard for the same reason (an invisible overlay that still ate clicks).

## The look

The default theme is the DCS Workbench design system, transcribed from
`dcs-workbench-design-system/tokens/*.css` — the same surfaces, the same single
teal accent, the same three radii, the same four motion beats, mono for
anything a machine produced. Two specifics worth knowing:

- The dialog geometry follows DCSPad's own `#sp-files-dialog`: 680px wide, the
  list on `--bg-1` with 3px padding and `--radius-m` rows, selection painted
  `--accent-soft` on an `--accent-soft-line` hairline.
- File rows carry the system's **node icons** (Lucide geometry, stroke and fill
  on one closed path, resting tier by default and the brighter `-active` pair
  only on the selected row) and its **file-type badges** in the five documented
  buckets, with the near-relative rules — `ts`/`mjs` → js, `scss` → css,
  `svg` → html, `csv`/`xlsx` → the data bucket.

Because the theme only *reads* tokens, dropping this into DCSPad means the
dialog inherits DCSPad's live `--accent`, `--bg-*`, and `--fg-*` values with no
configuration at all.

## What is deliberately *not* carried over

- **Chunked upload above 50 MB.** Same v1 boundary as `sp-write.js`.
- **User / Lookup / Taxonomy column editing.** Formats are documented at the top
  of `src/providers/sharepoint.js`; they need pickers, not plumbing.
- **The pad's pane semantics** (`html` / `css` / `js` editor targets). That is
  DCSPad's model, not a general one. An app reproduces it with
  `accept: ['web', 'code']` plus its own mapping from `result.file.category`.
- **`_spPageContextInfo` mocking.** DCSPad's `bridge/sp-context.js` fabricates a
  labelled mock context for its preview frame; here, no context simply means the
  SharePoint location is unavailable and the dialog does not offer it.

## If DCSPad adopts this

A sketch, not a plan — the pad works today and nobody has asked for this.

```js
// src/files.js (new)
export const broker = createFileBroker({
  providers: [sharePointProvider(), localProvider()],
  metadata: DCSPAD_METADATA_FIELDS,
  strings: { openTitle: 'Import from SharePoint', saveTitle: 'Export to SharePoint' },
});

// import a pane
const picked = await broker.open({ accept: ['web', 'code'], read: 'text' });
if (picked) confirmPaneReplacement({
  fileName: picked.file.name,
  pane: paneForFileName(picked.file.name),
  text: picked.text,
});

// export a pane
await broker.save({
  data: editorsApi.getDocs()[pane],
  suggestedName: `${filenameBase()}.${pane}`,
  accept: ['web', 'code'],
  metadata: { title: projectName() },
});
```

That would retire `#sp-files-dialog`, `#sp-metadata-dialog`, and roughly 500
lines of `main.js`, and would let the Browser view (`docs.js`) reuse the same
picker with `accept: ['web', 'text', 'data']`. The workbench's Files view keeps
its grid — it is a *browser*, not a picker — but could drop `field-editor.js` in
favour of `createMetadataForm()` with `mode: 'discover'`.

Anyone doing that should read `sp-dcspad/CLAUDE.md` first: the hosted build
bundles `src/` into `dcspad.app.js`, so a new dependency has to survive esbuild
and the SharePoint caching rules. This package is bundle-safe by construction —
pure ES modules, CSS as a string, no asset fetches, no `import.meta.url`.
