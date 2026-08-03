# Extending the File Broker

The package ships one dialog and three providers on purpose. Everything else it
offers is a **seam** — a place where the next thing plugs in without editing
what is already there. This document is the map of those seams, in the order
you are most likely to need them.

---

## 1. A new file-type category

One call, once, before any dialog opens:

```js
import { registerCategory } from '../src/file-broker.js';

registerCategory({
  id: 'cad',
  label: 'CAD drawings',
  description: 'AutoCAD and DXF exchange files',
  extensions: ['dwg', 'dxf'],
  mime: ['image/vnd.dwg'],          // optional; helps MIME-shaped accept rules
});
```

It is now usable everywhere a category is: `accept: ['cad']`, the file-input
`accept` attribute, `categoryOf('plan.dwg')`, and the row label in the listing.

Replacing a built-in works the same way — same `id`, new definition.

---

## 2. A different metadata schema

This is a config value, not code:

```js
createFileBroker({
  metadata: [
    { key: 'title',   label: 'Title',   type: 'text', name: 'Title', required: true },
    { key: 'owner',   label: 'Owner',   type: 'text', target: { sharepoint: 'DocOwner' } },
    { key: 'expires', label: 'Expires', type: 'date', name: 'ExpiryDate' },
  ],
});
```

Per operation, `open({ metadata: … })` / `save({ metadata: … })` override it.
Passing plain values (`{ title: 'x' }`) prefills the broker-level schema rather
than replacing it — the shape is distinguished by whether it has `fields`.

### Computing the schema

```js
metadata: async ({ mode, accept, options }) => {
  const preferences = await loadUserColumnPreferences();
  return preferences.columns.map(toFieldDescriptor);
}
```

The resolver runs once per `open()`/`save()`, before the dialog appears. This is
where a future "let the user choose which columns to fill" UI belongs: build the
picker somewhere else, store the result, and return it from here. Nothing in the
dialog or the providers needs to change.

### Discover mode

```js
metadata: { fields: DCSPAD_METADATA_FIELDS, mode: 'discover' }
```

Declared fields first (in your order), then every other writable column the
destination exposes, already typed. That is the workbench-style "edit the whole
item" experience with no extra code.

---

## 3. A new field type

Two edits, both small, both in files that only do this:

1. `src/metadata.js` — add the id to `FIELD_TYPES`, then a case in
   `emptyValue`, `isEmptyValue`, `coerceValue`, and `validateValue`.
2. `src/metadata-form.js` — add a `case` to `createControl` that appends
   controls and returns a `read()`.

Then teach each provider that supports it how to translate: for SharePoint that
is `NEUTRAL_TYPE`, `toFormValue`, and `fromItemValue` in
`src/providers/sharepoint.js`. A provider that does not know a type simply
reports the column unavailable with a reason — nothing breaks.

**Already-mapped-out work:** `User`, `Lookup`, and `TaxonomyFieldType` columns.
Their `FieldValue` string formats are written down at the top of
`src/providers/sharepoint.js`; they are unimplemented because they need a people
picker, a lookup list, and a term-store browser respectively — UI, not plumbing.

---

## 4. A new provider (OneDrive, Graph, a database, a zip)

A provider is a plain object. `defineProvider()` fills in the capability
defaults and fails loudly at definition time if the object contradicts itself.

```js
import { defineProvider, finalizeListing } from '../src/provider.js';
import { FileBrokerError } from '../src/util/errors.js';

export function graphProvider({ token } = {}) {
  return defineProvider({
    id: 'graph',
    label: 'OneDrive',
    hint: 'Your Microsoft 365 files',
    capabilities: { browse: true, read: true, write: true, overwriteCheck: true },

    isAvailable: () => Boolean(token),

    async roots() {
      return [{ path: '/drive/root', label: 'My files', rootPath: '/drive' }];
    },

    async list(location, { accept }) {
      const data = await call(`${location.path}/children`);
      return finalizeListing({
        path: location.path,
        rootPath: '/drive',
        parentPath: parentOf(location.path),
        accept,                                   // filters files, never folders
        folders: data.value.filter(isFolder).map(toEntry),
        files: data.value.filter(isFile).map(toEntry),
      });
    },

    async read(entry, { as }) { /* → { name, path, text | data | blob, size } */ },

    async write(location, name, data, { overwrite }) {
      /* → { name, path, url, overwritten } */
    },
  });
}
```

Rules the rest of the system relies on:

- **Paths are POSIX-absolute and inside the `rootPath` you declared.** The
  broker re-checks every entry and throws `outside-root` if one escapes — a
  malformed upstream response can never walk the dialog out of its own site.
- **Capabilities are honest.** `browse: false` means the dialog renders a
  "choose from this device"-style button and calls `pick()` instead of `list()`.
  `metadata: true` obliges you to implement both `getMetadata` and
  `setMetadata`. `overwriteCheck: true` promises `list()` is complete enough to
  warn before replacing.
- **Throw `FileBrokerError` with a `code`** from the vocabulary in
  `src/util/errors.js`. `conflict` in particular drives the dialog's
  replace-consent path.
- **Cancelling a native picker is not an error** — resolve `[]` from `pick()`,
  or throw `code: 'cancelled'` from `write()`.

Optional extras: `locator` (an address bar — SharePoint uses it for site
switching), `downloadUrl(entry)`, `pick()` for non-browsable stores.

### Metadata in a new provider

```js
async getMetadata(target, { schema, mode }) {
  return {
    supported: true,
    notice: '',                         // shown above the form when set
    fields: schema.map((field) => ({
      field,
      internalName: fieldTarget(field, 'graph'),
      available: Boolean(columnExists),
      reason: columnExists ? '' : `${name} is not a column here.`,
      value: currentValueInNeutralShape,
    })),
  };
}
```

`setMetadata(target, state, values)` writes and returns `{ updated: [names] }`.
Throw with `fieldErrors` keyed by **app-side field key** and the form will put
each message under the right control.

---

## 5. An address bar for a new provider

`locator` is what puts the site chooser on screen. A provider that spans
several places implements it; one that does not simply omits it.

```js
locator: {
  label: 'Workspace',
  placeholder: 'https://…',
  current: () => currentWorkspaceUrl,          // prefill when nothing is remembered
  options: async () => catalog.map((entry) => ({   // the curated dropdown
    value: entry.url, label: entry.name, hint: entry.note, isDefault: entry.primary,
  })),
  resolve: async (text) => ({ path, rootPath, webUrl, label }),   // → a Location
}
```

`options()` may return `[]` (or be omitted) — then only the paste box shows,
which is the no-catalog behaviour. `resolve()` should throw a `FileBrokerError`
with `code: 'invalid-location'` for anything it will not accept; the dialog
shows the message and stays where it was. After a successful resolve the dialog
calls `roots(location)` again, so return places for *that* address.

## 6. Somewhere else to remember things

`src/storage.js` is the only module that touches `localStorage`, and a store is
two methods:

```js
createFileBroker({
  storage: {
    read: () => JSON.parse(sessionStorage.getItem('files') || '{}'),
    write: (doc) => sessionStorage.setItem('files', JSON.stringify(doc)),
  },
});
```

When these apps move their settings into a SharePoint JSON document, this is
the seam that changes — an async store is the one shape it does not support
today, and adding it means awaiting `read()` in `createRecall`. Everything the
dialog persists goes through `createRecall`: last provider, per-provider folder,
per-provider recent addresses. Nothing else may write.

## 7. Restyling, and a third theme

Order of effort, cheapest first:

1. **Tokens.** The `dcs` theme reads `--bg-0…3`, `--fg*`, `--accent*`,
   `--border*`, `--radius-*`, `--dur-*`, `--sans`, `--mono`, the `--ft-*` badge
   triples, and the `--node-*` icon pairs. Set them on a container and the
   dialog follows. Inside a DCS app they are already set — that is the point.
2. **Your own sheet after ours.** Every element carries a `dfb-*` class, scoped
   by `.dfb-theme-<name>` on the dialog root.
3. **`theme: 'none'` + `injectStyles: false`.** Ship the CSS yourself.
4. **A new theme.** Add a string to `FILE_BROKER_THEMES` in `src/styles.js`,
   scoped under `.dfb-theme-<yourname>`, and pass `theme: 'yourname'`. Copy the
   `basic` sheet as the skeleton — it covers every class the dialog emits.

Whichever you pick, keep the `[hidden] { display: none !important; }` guard:
every row in the dialog sets a `display`, which silently beats the attribute.

---

## 8. Your own dialog

The UI is one injectable factory. Keep every bit of plumbing, replace the pixels:

```js
createFileBroker({
  providers: [...],
  dialog: ({ broker, strings, mount, theme, recall }) => ({
    async open(request) {
      // request: { mode, accept, metadata, metadataPrefill, providers,
      //            start, multiple, read, data, suggestedName, … }
      // resolve the result shape documented in README, or null to cancel
    },
  }),
});
```

Inside, use `broker.list/read/write/getMetadata/setMetadata` exactly as
`src/dialog.js` does, `createMetadataForm()` from `src/metadata-form.js` if you
want the field controls without the dialog around them, and `recall` to keep
"open where I left off" working.

For smaller changes, do not fork — `strings: { openTitle: 'Choose a template',
save: 'Publish' }` covers the copy, and § 7 covers the paint.

---

## 9. No dialog at all

Every capability is reachable headlessly, which is how you build a bespoke
picker (a sidebar tree, a drag-and-drop zone, an automated export) without
reimplementing digests, paging, path safety, or `FieldValue` conventions:

```js
const listing = await broker.list('sharepoint', { path: '/sites/Team/Docs' },
  { accept: broker.compileAccept(['data']) });
const file    = await broker.read('sharepoint', listing.entries[1], { as: 'text' });
const written = await broker.write('sharepoint', { path: '/sites/Team/Docs' },
  'export.json', JSON.stringify(payload), { overwrite: true });
const state   = await broker.getMetadata('sharepoint',
  { path: written.path, folderPath: '/sites/Team/Docs' }, { schema });
await broker.setMetadata('sharepoint', { path: written.path }, state,
  { title: 'Nightly export' });
```

---

## Testing what you add

`test/broker.test.mjs` runs with `node --test` and needs no DOM: the memory
provider stands in for a library, and the pure modules (categories, metadata,
paths, the site catalog, the storage seam, the SharePoint value conventions) are
tested directly. Add cases there for any seam you extend — especially a new
field type's round trip, which is exactly the kind of thing that rots silently.

The dialog itself is verified by hand against `demo/index.html`, which covers
open/save, filters, multi-select, a starting location, prefilled metadata, a
custom schema with unavailable columns, and discover mode. If you change dialog
behaviour, walk those eight buttons.
