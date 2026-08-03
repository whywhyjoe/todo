# DCS File Broker

**One component for every "get a file in" and "put a file out" moment in a DCS
app** — the local disk and SharePoint document libraries behind a single
dialog, with the library's metadata columns handled in the same breath.

> **About the name.** "File picker" only covers half of it: this also writes,
> uploads, downloads, and reads/writes metadata, across more than one store. It
> *brokers* between an app and whatever holds its files — hence **File Broker**.
> The folder is still `dcs-file-picker/` because that is where it was asked to
> live; the component, the module (`src/file-broker.js`), and the CSS prefix
> (`dfb-`) all use the real name.

Zero dependencies. Vanilla ES modules, plain DOM, no build step, no framework.
Drop `src/` into a page and import it. It is drawn in the **DCS Workbench
design system** by default, so it looks like part of DCSPad and the SP
Workbench the moment it opens.

---

## Quick start

```js
import { createFileBroker, DCSPAD_METADATA_FIELDS } from './src/file-broker.js';
import { localProvider } from './src/providers/local.js';
import { sharePointProvider } from './src/providers/sharepoint.js';

const broker = createFileBroker({
  providers: [
    sharePointProvider({
      // The standard places files belong. Pasting any other site still works.
      sites: {
        sites: [
          {
            label: 'Team site',
            url: '/sites/Team',
            default: true,
            libraries: [
              { label: 'Documents', path: 'Shared Documents' },
              { label: 'Pad exports', path: 'Shared Documents/pad' },
            ],
          },
          { label: 'Brand assets', url: '/sites/Brand', libraries: ['Site Assets'] },
        ],
      },
    }),
    localProvider(),
  ],
  metadata: DCSPAD_METADATA_FIELDS,      // Title · _ExtendedDescription · DocVersion
});

// Import — a picker filtered to web + code files, read as text
const picked = await broker.open({
  accept: ['web', 'code'],
  read: 'text',
  start: { provider: 'sharepoint', path: '/sites/Team/Shared Documents' },
});
if (picked) editor.setValue(picked.text);   // null means the user cancelled

// Export — choose a destination, write the bytes, then fill in the columns
const saved = await broker.save({
  data: editor.getValue(),
  suggestedName: 'app.js',
  accept: ['code'],
  metadata: { title: 'Pad export', docVersion: '1.2.0' },   // prefill
});
```

Try it without a tenant: serve the repo and open
[`demo/index.html`](demo/index.html) — eight working examples against an
in-memory library. Run the headless tests with:

```bash
node --test test/broker.test.mjs
```

---

## What you get

| Concern | Answer |
| --- | --- |
| Choose an existing file | `broker.open()` — one dialog, every location |
| Write a file out | `broker.save()` — same dialog, name + destination + metadata |
| Local disk | `localProvider()` — OS picker in, File System Access API or download out |
| SharePoint | `sharePointProvider()` — same-tenant libraries, digest handled, site switching |
| Standard sites | a JSON catalog of sites and their libraries, plus a paste-any-URL box |
| Metadata | app declares the columns it wants; the provider reports which exist |
| File types | eight built-in categories, plus extensions, MIME types and predicates |
| Starting location | `start: { provider, path }`, else where the user was last time |
| Remembering | last location, last site, and recent sites, in one swappable seam |
| Look | the DCS Workbench design system by default; `theme: 'basic'` for elsewhere |
| No UI at all | `broker.list/read/write/getMetadata/setMetadata` drive providers headlessly |

---

## `open(options)`

Resolves the selection, or `null` if the user cancelled. Cancelling is never an
error.

| Option | Default | Meaning |
| --- | --- | --- |
| `accept` | broker default, else any | see [File types](#file-types) |
| `start` | `{ provider, path }` | where the dialog opens |
| `read` | `'text'` | `'text'` · `'arrayBuffer'` · `'blob'` · `'none'` |
| `multiple` | `false` | resolves an **array** when true |
| `metadata` | broker default | `false` to skip, or a schema override |
| `editMetadata` | `false` | let the person edit and save columns while opening |
| `providers` | all | subset of provider ids to offer |
| `maxReadBytes` | 25 MB | ceiling enforced before and after the read |
| `title`, `description` | — | dialog copy |

```js
{
  provider: 'sharepoint',
  file: { name, path, url, size, modified, mimeType, category },
  text,            // or data / blob / nativeFile, per `read`
  metadata: { title: 'Pad export', … } | null,
  metadataState,   // the raw provider state, if you need availability details
}
```

## `save(options)`

| Option | Default | Meaning |
| --- | --- | --- |
| `data` | **required** | string, `Blob`, `ArrayBuffer`, typed array, or `() => any of those` |
| `suggestedName` | `''` | prefills the name box |
| `accept` | broker default | filters the listing and the OS Save dialog |
| `start` | — | `{ provider, path }` |
| `metadata` | broker default | **values** to prefill (`{ title: 'x' }`) or a schema override (`{ fields: [...] }`) |
| `maxWriteBytes` | 50 MB | SharePoint's single-request ceiling |

```js
{
  provider: 'sharepoint',
  file: { name, path, url },
  overwritten: false,
  metadata: { title: 'Pad export', … } | null,
  metadataSaved: true,
  metadataError: '',
}
```

**The bytes and the columns are two steps, and the dialog says so.** If the
upload succeeds but the metadata write fails, the file stays where it landed and
the person is offered *Retry metadata* or *Keep file without metadata* — a retry
never re-uploads. That behaviour is not incidental; it is the shape DCSPad
arrived at after doing it the other way.

---

## File types

`accept` takes a mixed array of:

| Form | Example |
| --- | --- |
| category id | `'data'` |
| extension | `'.csv'`, `'csv'` |
| MIME type | `'text/csv'` |
| MIME wildcard | `'image/*'` |
| predicate | `(entry) => entry.name.startsWith('draft-')` |
| everything | `'*'` or omit |

Built-in categories:

| id | Covers |
| --- | --- |
| `web` | html, htm, css, scss, less, svg |
| `code` | js, mjs, ts, tsx, py, ps1, cs, java, sql, sh, yml… |
| `text` | txt, md, markdown, rst, log, rtf |
| `data` | csv, tsv, json, xml, ndjson, parquet |
| `office` | doc(x), xls(x), ppt(x), vsd(x), one, pdf |
| `image` | jpg, jpeg, png, gif, webp, avif, bmp, tif, ico, svg, heic |
| `video` | mp4, m4v, mov, webm, avi, mkv, wmv, mpg |
| `audio` | mp3, m4a, aac, wav, flac, ogg, wma |
| `archive` | zip, 7z, rar, tar, gz |

Categories overlap on purpose (`csv` is both `data` and `office`; `svg` is both
`web` and `image`). Add your own once at startup:

```js
import { registerCategory } from './src/file-broker.js';
registerCategory({ id: 'cad', label: 'CAD', extensions: ['dwg', 'dxf'] });
```

---

## Standard sites

Most apps do not want people hunting for a library. Hand the SharePoint
provider a catalog and the dialog shows a **site dropdown** over the browser,
with the site's libraries as one-click shortcuts — and a box for pasting any
other site on the tenant, because a curated list must never become a cage.

```json
{
  "sites": [
    {
      "label": "Team site",
      "url": "https://contoso.sharepoint.com/sites/Team",
      "default": true,
      "libraries": [
        { "label": "Documents", "path": "Shared Documents" },
        { "label": "Pad exports", "path": "Shared Documents/pad", "hint": "Generated files" }
      ]
    },
    { "label": "Brand assets", "url": "/sites/Brand", "libraries": ["Site Assets"] }
  ]
}
```

Every shorthand is accepted, because a hand-written config should not need to
be exact: the top level may be the bare array; a site may be a bare URL string;
`url` may be absolute or server-relative; a library may be a bare string, either
absolute (`/sites/Team/Shared Documents`) or relative to its site
(`Shared Documents/pad`). Malformed entries are dropped, not thrown.

```js
sharePointProvider({ sites: CATALOG })                       // inline
sharePointProvider({ sites: loadSiteCatalog('/sites/App/file-config.json') })  // fetched once
sharePointProvider({ sites: CATALOG, discoverLibraries: false })  // only what you listed
```

The catalog's `default: true` site is where the dialog opens the first time.
`discoverLibraries: false` hides the site's other libraries, leaving exactly the
configured set (plus the site root). With no catalog at all, behaviour is
unchanged: the page's own site, its libraries, and the paste box.

## Remembering where you were

The dialog reopens where it was left: same location, same site, same folder,
with recently used sites offered under the address box. That state lives behind
one seam — `src/storage.js`, the only module that touches `localStorage`, which
is what makes moving it into SharePoint JSON later a one-file change.

```js
createFileBroker({ storage: false })                  // remember nothing
createFileBroker({ storageKey: 'my-app.files' })      // a private key
createFileBroker({ storage: myStore })                // any { read(), write() }

broker.recall.location('sharepoint')      // { path, webUrl }
broker.recall.recentLocators('sharepoint')
broker.recall.forgetAll()
```

Precedence when the dialog opens: `start` from the call, then what was
remembered, then `defaultProvider` / the catalog's default site, then the first
thing available. A remembered folder that has since been renamed, deleted, or
locked down is forgotten silently and replaced by the fallback — never an error
banner on every open.

## Theming

```js
createFileBroker({ theme: 'dcs' })     // default — the DCS Workbench design system
createFileBroker({ theme: 'basic' })   // neutral, follows the host's light/dark scheme
createFileBroker({ theme: 'none' })    // inject nothing; you ship the CSS
```

The `dcs` theme **reads** design-system tokens and never declares them
(`var(--accent, #3fd8b4)`). Inside DCSPad or the SP Workbench the dialog picks
up that app's live values automatically; standalone, the fallbacks are the
system's own. Every rule is scoped under `.dfb-theme-dcs` on the dialog root, so
a host that already loads `dcs-workbench.css` is never restyled by us. Overrides
go in your own sheet after ours, or set the tokens on a container.

---

## Metadata

The app declares **which columns it cares about**; the provider decides whether
the chosen location actually has them. A missing column is shown, disabled, and
explained — never a blocked save.

```js
metadata: [
  { key: 'title',       label: 'Title',       type: 'text',      name: 'Title', required: true },
  { key: 'description', label: 'Description', type: 'multiline', target: { sharepoint: '_ExtendedDescription' } },
  { key: 'audience',    label: 'Audience',    type: 'choice',    name: 'Audience' },   // choices come from the library
  { key: 'reviewed',    label: 'Reviewed on', type: 'date',      name: 'ReviewedOn' },
]
```

Field types are provider-neutral: `text` · `multiline` · `choice` ·
`multichoice` · `boolean` · `number` · `date` · `url` · `tags`. The SharePoint
provider maps `TypeAsString` onto them and converts values to the `FieldValue`
strings `ValidateUpdateListItem` expects (`;#A;#B;#` for multi-choice, `1`/`0`
for booleans, and so on — all documented in `src/providers/sharepoint.js`).

Three ways to supply it, in increasing order of dynamism:

```js
metadata: DCSPAD_METADATA_FIELDS                       // a fixed schema
metadata: { fields: [...], mode: 'discover' }          // schema + every other writable column
metadata: async ({ mode, accept }) => [...]            // computed per operation
```

`mode: 'discover'` is the seam a future "let the user pick which columns to
fill" UI plugs into: it returns the declared fields first, then everything else
the library will accept, already typed and ready to render.

---

## Files

```
src/file-broker.js        public API: createFileBroker, open(), save(), headless plumbing
src/dialog.js             the default UI — the only UI; swap it wholesale via `dialog`
src/metadata-form.js      one control per neutral field type
src/metadata.js           schema normalization, coercion, validation (pure)
src/categories.js         categories + the accept grammar (pure)
src/site-catalog.js       the standard-sites JSON shape + loader (pure)
src/storage.js            what the dialog remembers — the only localStorage toucher
src/provider.js           the provider contract, enforced at definition time
src/styles.js             both themes as strings (bundle-safe) + ensureStyles()
src/providers/local.js    the browser's own file system
src/providers/sharepoint.js  same-tenant document libraries over /_api
src/providers/memory.js   an in-memory library for demos and tests
src/util/{paths,errors}.js
demo/                     ten working examples, no network needed
test/broker.test.mjs      32 headless tests (node --test)
docs/EXTENDING.md         add a provider, a category, a field type, or your own UI
docs/DCSPAD-MIGRATION.md  how DCSPad and the SP Workbench map onto this
```

## Errors

Everything throws `FileBrokerError` with a `code` you can switch on:
`not-available`, `invalid-location`, `outside-root`, `not-found`, `permission`,
`conflict`, `too-large`, `unsupported-type`, `invalid-name`, `network`, `read`,
`write`, `metadata-read`, `metadata-write`, `cancelled`. Metadata rejections
also carry `err.fieldErrors` (`{ fieldKey: message }`), which the form routes
back onto the control that caused them.
