// The provider contract — the extension seam that matters most.
//
// A provider is a plain object that knows how to browse, read, and write one
// kind of store. The dialog never learns anything store-specific: it asks the
// provider what it can do (capabilities), what places it offers (roots), what
// is in a place (list), and then moves bytes (read / write) and columns
// (getMetadata / setMetadata). Add a store — OneDrive, Graph, an S3 bucket,
// an in-app document table — by writing one of these; nothing else changes.
//
// ---------------------------------------------------------------------------
// Contract
// ---------------------------------------------------------------------------
//
//   id            string, unique, used as the key for per-provider metadata
//                 targets ({ target: { sharepoint: 'Title' } })
//   label         what the provider switcher shows
//   hint          one line under the label
//   capabilities  see CAPABILITY_DEFAULTS below; anything omitted is false
//
//   isAvailable()                       -> boolean | Promise<boolean>
//   roots(location?)                    -> Promise<Location[]>
//                 Places to start. Called with no argument for the provider's
//                 own default, and with the current location after the address
//                 changes, so a provider that spans several sites can answer
//                 per site.
//   list(location, { accept })          -> Promise<Listing>
//   read(entry, { as })                 -> Promise<ReadResult>
//   write(location, name, data, opts)   -> Promise<WriteResult>
//   pick({ accept, multiple })          -> Promise<ReadResult[]>   (browse:false only)
//   getMetadata(target, { schema, mode })  -> Promise<MetadataState>
//   setMetadata(target, state, values)  -> Promise<{ updated: string[] }>
//   locator                             -> { label, placeholder, hint,
//                                            current(), resolve(text),
//                                            options?() -> Promise<Option[]> }
//                 An address bar. `options()` supplies a curated dropdown
//                 (Option = { value, label, hint?, isDefault? }); the text box
//                 is always the paste-anything escape hatch beside it.
//   downloadUrl(entry)                  -> string
//
// Shapes:
//   Location  { path, label?, rootPath?, providerId? }
//   Entry     { kind: 'folder'|'file', name, path, size?, modified?, mimeType?,
//               category?, url?, extra? }
//   Listing   { path, rootPath, parentPath, entries: Entry[], partial?: boolean }
//   ReadResult { name, path, size?, mimeType?, text?, data?, blob?, file? }
//   WriteResult { name, path, url?, overwritten?: boolean }
//
// Every path a provider returns must be POSIX-absolute and inside the
// `rootPath` it declared for that location — see util/paths.js isWithin().

export const CAPABILITY_DEFAULTS = Object.freeze({
  browse: false,          // can list folders; false means "pick() only"
  read: false,
  write: false,
  metadata: false,        // supports getMetadata / setMetadata
  discoverMetadata: false,// can enumerate columns it was not told about
  overwriteCheck: false,  // list() is reliable enough to warn before replacing
  createFolder: false,
  multiple: false,        // can return more than one file from one pick
  locator: false,         // has a "type an address" affordance
});

export function defineProvider(definition) {
  const id = String(definition?.id || '').trim();
  if (!id) throw new Error('A provider needs an id.');

  const capabilities = { ...CAPABILITY_DEFAULTS, ...(definition.capabilities || {}) };
  const provider = {
    hint: '',
    isAvailable: () => true,
    roots: async () => [],
    ...definition,
    id,
    label: definition.label || id,
    capabilities,
  };

  if (capabilities.browse && typeof provider.list !== 'function') {
    throw new Error(`Provider "${id}" claims browse but has no list().`);
  }
  if (!capabilities.browse && typeof provider.pick !== 'function') {
    throw new Error(`Provider "${id}" cannot browse and has no pick().`);
  }
  if (capabilities.metadata
      && (typeof provider.getMetadata !== 'function' || typeof provider.setMetadata !== 'function')) {
    throw new Error(`Provider "${id}" claims metadata but is missing getMetadata/setMetadata.`);
  }
  return provider;
}

// Small helper for providers that build listings: sorts folders first, then
// files, both case-insensitively, and drops files the accept filter rejects.
export function finalizeListing({ path, rootPath, parentPath, folders = [], files = [], accept, partial = false }) {
  const byName = (a, b) =>
    String(a.name).localeCompare(String(b.name), undefined, { sensitivity: 'base' });
  const visibleFiles = accept ? files.filter((file) => accept.matches(file)) : files;
  return {
    path,
    rootPath,
    parentPath,
    partial,
    entries: [
      ...folders.map((f) => ({ ...f, kind: 'folder' })).sort(byName),
      ...visibleFiles.map((f) => ({ ...f, kind: 'file' })).sort(byName),
      ],
    hiddenCount: files.length - visibleFiles.length,
  };
}
