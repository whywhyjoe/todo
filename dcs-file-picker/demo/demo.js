// Demo wiring. Read this first if you are integrating the broker — every
// pattern an app needs is one of these handlers.

import { createFileBroker, DCSPAD_METADATA_FIELDS } from '../src/file-broker.js';
import { localProvider } from '../src/providers/local.js';
import { memoryProvider } from '../src/providers/memory.js';
import { sharePointProvider } from '../src/providers/sharepoint.js';

// The standard-sites catalog an app ships. On a real page this is what the
// site dropdown lists; here it is only reachable when the page is served from
// SharePoint, so the SharePoint location stays hidden off-tenant.
const SITE_CATALOG = {
  sites: [
    {
      label: 'Team site',
      url: '/sites/Team',
      default: true,
      libraries: [
        { label: 'Documents', path: 'Shared Documents' },
        { label: 'Pad exports', path: 'Shared Documents/pad', hint: 'Generated files' },
      ],
    },
    { label: 'Brand assets', url: '/sites/Brand', libraries: ['Site Assets'] },
  ],
};

const library = memoryProvider({
  latency: 120,
  places: [
    { label: 'Documents', path: '/sites/Demo/Shared Documents' },
    { label: 'Branding', path: '/sites/Demo/Shared Documents/branding' },
    { label: 'Site Assets', path: '/sites/Demo/Site Assets' },
  ],
});

let broker = null;
let theme = 'dcs';

function build() {
  broker = createFileBroker({
    providers: [
      library,
      localProvider(),
      sharePointProvider({ sites: SITE_CATALOG }),
    ],
    defaultProvider: 'memory',
    metadata: DCSPAD_METADATA_FIELDS,
    theme,
    // Persistence is on by default (localStorage). `storage: false` turns it
    // off; a custom { read, write } store puts it wherever the app keeps state.
    storageKey: 'dcs-file-broker.demo',
  });
}
build();

const out = document.getElementById('out');
const tree = document.getElementById('tree');
const memoryOut = document.getElementById('memory');

function show(label, result) {
  const printable = result && typeof result === 'object'
    ? JSON.parse(JSON.stringify(result, (key, value) => {
      if (key === 'nativeFile' || key === 'blob' || key === 'data') return '[binary]';
      if (key === 'text' && typeof value === 'string' && value.length > 300) {
        return `${value.slice(0, 300)}…`;
      }
      return value;
    }))
    : result;
  out.textContent = `${label}\n\n${JSON.stringify(printable, null, 2)}`;
  render();
}

function render() {
  const { files } = library.inspect();
  tree.textContent = files
    .map((file) => {
      const meta = Object.entries(file.metadata)
        .filter(([, value]) => value !== '' && value !== undefined)
        .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
        .join(' ');
      return `${file.path}${meta ? `\n    ${meta}` : ''}`;
    })
    .join('\n');
  memoryOut.textContent = JSON.stringify({
    lastProvider: broker.recall.lastProvider(),
    memory: broker.recall.location('memory'),
    sharepoint: broker.recall.location('sharepoint'),
    recentSites: broker.recall.recentLocators('sharepoint'),
  }, null, 2);
}
render();

const demos = {
  'open-any': () => broker.open({ read: 'none', metadata: false }),

  'open-data': () => broker.open({
    accept: ['data'],
    read: 'text',
    metadata: false,
  }),

  // Metadata on open is read-only by default; editMetadata: true saves edits
  // back when the person confirms.
  'open-code': () => broker.open({
    accept: ['web', 'code'],
    read: 'text',
    editMetadata: true,
  }),

  'open-media': () => broker.open({
    accept: ['image', 'video', 'audio'],
    read: 'none',
    metadata: false,
  }),

  'open-multi': () => broker.open({
    accept: ['text', 'data'],
    multiple: true,
    read: 'text',
    metadata: false,
  }),

  'open-start': () => broker.open({
    start: { provider: 'memory', path: '/sites/Demo/Shared Documents/branding' },
    read: 'text',
    metadata: false,
  }),

  'save-plain': () => broker.save({
    data: `Saved from the demo at ${new Date().toISOString()}\n`,
    suggestedName: 'demo-note.txt',
    accept: ['text'],
    metadata: false,
  }),

  'save-metadata': () => broker.save({
    data: 'console.log("hello");\n',
    suggestedName: 'hello.js',
    accept: ['code'],
    // Values, not a schema: these prefill the broker-level schema.
    metadata: { title: 'Hello sample', docVersion: '1.0.0' },
  }),

  'save-custom': () => broker.save({
    data: '# Release notes\n',
    suggestedName: 'release-notes.md',
    accept: ['text'],
    metadata: {
      fields: [
        { key: 'title', label: 'Title', type: 'text', name: 'Title', required: true },
        {
          key: 'audience',
          label: 'Audience',
          type: 'choice',
          name: 'Audience',
          hint: 'Who may read this document.',
        },
        { key: 'reviewed', label: 'Reviewed on', type: 'date', name: 'ReviewedOn' },
        { key: 'keywords', label: 'Keywords', type: 'tags', name: 'Keywords' },
      ],
    },
  }),

  'save-discover': () => broker.save({
    data: '{"generated": true}\n',
    suggestedName: 'payload.json',
    accept: ['data'],
    metadata: { fields: DCSPAD_METADATA_FIELDS, mode: 'discover' },
  }),
};

for (const [name, run] of Object.entries(demos)) {
  document.querySelector(`[data-demo="${name}"]`).addEventListener('click', async (event) => {
    out.textContent = 'Working…';
    try {
      const result = await run();
      show(result ? `${event.target.textContent} →` : 'Cancelled.', result);
    } catch (error) {
      out.textContent = `${error.name || 'Error'} (${error.code || 'unknown'}): ${error.message}`;
    }
  });
}

document.getElementById('theme').addEventListener('change', (event) => {
  theme = event.target.value;
  build();
});

document.getElementById('forget').addEventListener('click', () => {
  broker.recall.forgetAll();
  render();
});
