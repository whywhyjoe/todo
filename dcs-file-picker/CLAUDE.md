# DCS File Broker — agent guide

Read `README.md` for the API and `docs/EXTENDING.md` before adding anything.
`docs/DCSPAD-MIGRATION.md` records where each piece came from in `sp-dcspad`
and which behaviours are load-bearing.

**What this is:** a standalone, dependency-free component that handles
open/import and save/export across the local file system and SharePoint
document libraries, including library metadata. The folder is named
`dcs-file-picker` for historical reasons; the component is the **File Broker**
(`src/file-broker.js`, CSS prefix `dfb-`).

## Invariants — do not break these

1. **Zero dependencies, no build step.** Vanilla ES modules, plain DOM. It must
   survive being bundled into a single file by esbuild and served from a
   SharePoint library, so: no `import.meta.url`, no runtime asset fetches, no
   CDN. That is why the CSS lives in `src/styles.js` as a string.
1b. **`src/storage.js` is the only module that touches localStorage** — the
   same rule DCSPad's `state.js` follows, so the future SharePoint JSON store
   is a one-file swap.
1c. **The `dcs` theme reads design-system tokens, never declares them.** Inside
   a DCS app the host's live values must win; the `var(--x, fallback)` second
   argument only covers standalone use. Keep the token *names* even when values
   travel inline — that is the design system's drift contract.
2. **The provider contract is the only extension point for storage.** Nothing
   outside `src/providers/` may know what SharePoint is. `dialog.js`,
   `metadata-form.js`, `categories.js`, and `metadata.js` stay store-agnostic.
3. **Field types are provider-neutral.** `text · multiline · choice ·
   multichoice · boolean · number · date · url · tags`. A provider maps its
   native types onto these; `TypeAsString` never leaves `providers/sharepoint.js`.
4. **Paths are POSIX-absolute and boundary-checked twice** — in the provider and
   again in `broker.list()`. A provider that returns a path outside its declared
   `rootPath` is a bug, and the broker throws `outside-root`.
5. **Bytes and columns are two steps.** A metadata failure after a successful
   write must never re-upload; the dialog offers retry/keep and the file stays.
6. **Cancelling resolves `null`.** It is never an exception.
7. **Unavailable metadata columns are shown and explained**, never hidden, and
   never block the transfer.

## File map

```
src/file-broker.js        createFileBroker: open(), save(), and the headless
                          list/read/write/getMetadata/setMetadata plumbing
src/provider.js           the contract + defineProvider() + finalizeListing()
src/dialog.js             the default (and only) UI; injectable via config.dialog
src/metadata-form.js      one control per neutral field type
src/metadata.js           schema normalize/coerce/validate/resolve (pure)
src/categories.js         eight built-in categories + the accept grammar (pure)
src/site-catalog.js       standard-sites JSON → sites + libraries (pure)
src/storage.js            recall: last provider/folder/site + recent sites
src/styles.js             both theme strings + ensureStyles() (bundle-safe by design)
src/util/paths.js         normalize/parent/join/isWithin/fileNameProblem (pure)
src/util/errors.js        FileBrokerError + the code vocabulary
src/providers/local.js    OS picker in; File System Access API or download out
src/providers/sharepoint.js  /_api client: digest cache, listing, transfer,
                          ValidateUpdateListItem, site locator
src/providers/memory.js   in-memory library for the demo and the tests
demo/index.html + demo.js ten working examples + a theme switch, no network
test/broker.test.mjs      32 headless tests
```

Design system: `C:\dev\repos\dcs-workbench-design-system` (tokens, the
`.dcs-*` component sheet, and the embedding rules). The `dcs` theme in
`styles.js` transcribes its values; if a token changes there, change the
fallback here.

## Working on it

```bash
node --test test/broker.test.mjs        # from this folder
python -m http.server 8655              # then open demo/index.html
```

The tests cover everything reachable without a DOM. Dialog behaviour is checked
by walking the eight demo buttons — do that after any change to `dialog.js`.
Live SharePoint behaviour can only be verified in a tenant.

## Gotchas already paid for

- **`[hidden]` loses to a `display` rule.** Every section in the dialog sets a
  display, so `styles.js` carries `.dfb-dialog [hidden] { display: none
  !important }`. Without it an "invisible" row still takes space and still takes
  clicks. (Cost one round of "why is there an empty address bar".)
- **Chrome caches module scripts separately from `fetch()`.** While iterating on
  the demo, a hard reload may still run stale modules — switching between
  `localhost` and `127.0.0.1` gives a clean module graph.
- **A library's root folder has no list item**, so `ListItemAllFields.ParentList`
  is empty there; the provider falls back to `GetList(@listUrl)`.
- **The page digest belongs to the page's web only.** Other sites always get
  their own `/contextinfo` call.
- **Categories overlap on purpose** (`csv` → data *and* office). `categoryOf()`
  resolves the display label through a fixed priority order; `compileAccept()`
  unions rules, so overlap never hides a file.
- **Fixed-height rows need `flex: none`.** In the panel's column flex layout
  every child shrinks by default, which crushed the 26px segmented control to
  2px. Only the list and the metadata body may give.
- **The dialog itself is the flex container** (`.dfb-theme-*[open] { display:
  flex }`), because `max-height: inherit` on the panel did not clamp it. The
  `[open]` qualifier is load-bearing: a bare `display: flex` defeats the UA's
  `dialog:not([open]) { display: none }` and paints a closed dialog.
- **The themes are template literals.** A backtick inside a CSS comment ends the
  string and the module dies with a syntax error that names a CSS keyword
  ("Unexpected identifier 'display'"). Use quotes in comments there, and run
  the tests after editing `styles.js` — they import it, so they catch it.
