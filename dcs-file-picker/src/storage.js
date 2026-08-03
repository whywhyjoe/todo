// Remembering where you were.
//
// This is the ONLY module that touches localStorage — the same rule DCSPad's
// state.js follows, and for the same reason: when these apps move their
// settings into a SharePoint JSON document, one seam changes and nothing else
// does. Swap it wholesale with `createFileBroker({ storage: myStore })`.
//
// A store is two methods:  read() -> object          write(object) -> void
//
// What gets remembered, per provider: the folder you were last in, the address
// you last resolved (the SharePoint site URL), and a short list of the
// addresses before that so the site box can offer them back. Plus which
// location you used last, so the dialog opens where you left off.

const DEFAULT_KEY = 'dcs-file-broker.v1';
const MAX_RECENT = 6;

export function createMemoryStore(initial = {}) {
  let doc = structuredClone(initial);
  return {
    read: () => structuredClone(doc),
    write(next) { doc = structuredClone(next); },
  };
}

/**
 * localStorage-backed store. Every access is guarded: a browser in private
 * mode, a blocked third-party context, or a corrupt value must degrade to
 * "nothing remembered", never to a thrown error in the middle of a file dialog.
 */
export function createLocalStore({ key = DEFAULT_KEY, storage } = {}) {
  const backing = () => {
    if (storage) return storage;
    try { return globalThis.localStorage || null; } catch { return null; }
  };
  return {
    read() {
      try {
        const raw = backing()?.getItem(key);
        const doc = raw ? JSON.parse(raw) : null;
        return doc && typeof doc === 'object' ? doc : {};
      } catch { return {}; }
    },
    write(doc) {
      try { backing()?.setItem(key, JSON.stringify(doc)); }
      catch { /* quota, private mode, disabled storage — remembering is optional */ }
    },
  };
}

/** A store that forgets everything — `storage: false`. */
export function createNullStore() {
  return { read: () => ({}), write() {} };
}

/**
 * The typed view the dialog uses. Nothing else should read the raw document.
 */
export function createRecall(store) {
  const read = () => {
    const doc = store.read() || {};
    doc.providers = doc.providers && typeof doc.providers === 'object' ? doc.providers : {};
    return doc;
  };
  const update = (mutate) => {
    const doc = read();
    mutate(doc);
    store.write(doc);
    return doc;
  };
  const slot = (doc, providerId) => {
    doc.providers[providerId] = doc.providers[providerId] || {};
    return doc.providers[providerId];
  };

  return {
    /** The provider used last, if it is still on offer. */
    lastProvider() {
      const id = read().lastProvider;
      return typeof id === 'string' ? id : '';
    },

    rememberProvider(providerId) {
      update((doc) => { doc.lastProvider = providerId; });
    },

    /** { path, webUrl } for a provider, or null. */
    location(providerId) {
      const entry = read().providers[providerId];
      if (!entry?.path) return null;
      return {
        path: String(entry.path),
        webUrl: entry.webUrl ? String(entry.webUrl) : undefined,
        label: entry.label ? String(entry.label) : undefined,
      };
    },

    rememberLocation(providerId, { path, webUrl = '', label = '' } = {}) {
      if (!path) return;
      update((doc) => {
        const entry = slot(doc, providerId);
        entry.path = String(path);
        if (webUrl) entry.webUrl = String(webUrl);
        if (label) entry.label = String(label);
      });
    },

    // A remembered folder can rot: the library was renamed, permission was
    // revoked, the site is gone. The dialog forgets it and falls back rather
    // than showing the same error every time it opens.
    forgetLocation(providerId) {
      update((doc) => {
        const entry = doc.providers[providerId];
        if (entry) { delete entry.path; delete entry.label; }
      });
    },

    /** Addresses resolved before, newest first — offered under the site box. */
    recentLocators(providerId) {
      const list = read().providers[providerId]?.recent;
      return Array.isArray(list) ? list.filter((item) => typeof item === 'string') : [];
    },

    rememberLocator(providerId, value) {
      const text = String(value || '').trim();
      if (!text) return;
      update((doc) => {
        const entry = slot(doc, providerId);
        const previous = Array.isArray(entry.recent) ? entry.recent : [];
        entry.recent = [
          text,
          ...previous.filter((item) => item.toLowerCase() !== text.toLowerCase()),
        ].slice(0, MAX_RECENT);
        entry.webUrl = text;
      });
    },

    forgetAll() { store.write({}); },
  };
}

/** `storage` config → a store. true/undefined = localStorage, false = none. */
export function resolveStore(storage, { key } = {}) {
  if (storage === false) return createNullStore();
  if (storage && typeof storage.read === 'function' && typeof storage.write === 'function') {
    return storage;
  }
  return createLocalStore({ key });
}
