# Working agreement — halo-banner

Read `README.md` first for what this thing is and how to run it. This file is the set of
rules and traps that are not obvious from the source.

This folder is one of several unrelated projects in the repo. Stay inside it and do not
create dependencies on sibling folders.

No build, no bundler, no package manager, no test runner. Do not add any. The tool has to
survive being pasted whole into a SharePoint custom script web part, so it must stay a
single self-contained HTML file plus one script.

## Layout of the code

`halo-banner-maker.js` is one closure, `initGenerator(root)`, started by a `waitForElement`
poll. Inside it:

| Lines | What |
|---|---|
| 35–86 | `BRAND`, `HOVER_COLORS`, `DEFAULTS` — the knobs, meant to be edited |
| 132–150 | `SCOPE_ID` / `SCOPE_CLASS` and `scopedComponentCss()` |
| 151–204 | `render()` — pushes state into CSS custom properties on the preview |
| 205–242 | `emit()` — builds the HTML snippet output |
| 243–409 | The standalone SVG exporter |
| 410–522 | Control binding |

`render()` is the single path from state to screen; every control calls it and it calls
`emit()` at the end. Add new controls by binding them to `state` and letting `render()` do
the rest — do not touch the DOM from an event handler.

## Hard invariants

**1. `<style id="halo-banner-css">` is the shipped product, not tool chrome.**
`emit()` bundles that entire block into every copied snippet via `scopedComponentCss()`.
Anything you add there ships to every page anyone has ever pasted a banner onto. Tool
chrome goes in `halo-overrides.css`. Nothing else may go in `halo-banner-css`.

**2. The two `@inline` style blocks are generated.** `<style id="dcs-workbench">` and
`<style id="halo-overrides">` are overwritten by `inline-css.py`. Edit the sibling `.css`
and re-run it. `dcs-workbench.css` is a vendored kit — treat it as read-only and put every
deviation in `halo-overrides.css` with a comment saying why.

**3. The halo geometry constants come from the source `.ai` file and are load-bearing.**

- outer diameter `1210.1213` units at scale 1, expressed as `118.1759cqw`
- inner clip ratio `0.95373`
- ring border `size × ring-weight / 1210.1213`, which reduces to `ring-weight × scale`
- artboard width `1024`, so `1cqw = 10.24 units`

These appear in **two places** — the component CSS and `buildStandaloneSvg()`. See
invariant 4.

**4. The SVG exporter duplicates the component's geometry. Keep them in sync.**
This is the main structural hazard in the codebase. `buildStandaloneSvg()` re-derives in
SVG what the CSS does in the browser: `object-fit: cover` plus `object-position` plus the
zoom transform become an explicit `<image>` placement; the border-box ring becomes a
stroked circle at `r = (size - stroke) / 2`; `overflow: hidden` plus `border-radius`
becomes a `clipPath`. **If you change the component's geometry, change the exporter in the
same commit, and re-run the difference test below.**

**5. The SVG export must inline every raster.** Non-negotiable — see README. Do not
"optimise" the base64 embedding into URL references.

**6. Text position in the SVG is measured, never computed.** SVG does not wrap text, so
`textRuns()` walks the live DOM character by character and cuts a run wherever the baseline
moves. Two things it handles that are easy to break:

- whitespace at the head of a wrapped line was collapsed by the browser; SVG collapses
  nothing, so a run must never *start* on whitespace or the line indents by a phantom space
- runs on one line may have different fonts (a `<span class="b">`); each positions itself
  absolutely from its own measured left, so they stay adjacent without inline layout

**7. Tool chrome uses design tokens, not hex literals.** Colours and durations in
`halo-overrides.css` come from the kit's custom properties. The exemptions — the four
`BRAND` colours, `DEFAULTS`, the placeholder data-URI, the component's own transitions —
are listed in `RESTYLE-PLAN.md` §0 and exist because they ship inside generated banners.

**8. Scoping must survive two banners from different tool versions on one page.**
`SCOPE_CLASS` is a class, not an id, and is regenerated per page load.
`halo-banner-test.html` is the proof: two blocks with different scope numbers and
deliberately drifted rules, under host-page CSS that reuses the same class names. If you
touch `scopedComponentCss()`, open that file and confirm block 1 still renders bold text
and a white ring.

## Verifying an export change

The exporter is verified by overlaying its output on the live preview with
`mix-blend-mode: difference`. Perfect black means pixel-identical. This found a real bug
(the phantom leading space) that reading the code did not.

Serve the folder, open the tool, then in the page console:

```js
const out = document.getElementById('out');
const scene = document.getElementById('scene');
document.getElementById('svg').click();          // wait for it to finish
const holder = document.createElement('div');
holder.style.cssText = 'position:absolute;inset:0;z-index:99;mix-blend-mode:difference';
holder.innerHTML = out.textContent;              // only while instrumented, see below
const s = holder.querySelector('svg');
s.setAttribute('width', '100%');
s.setAttribute('height', '100%');
scene.appendChild(holder);
```

`out` holds the HTML snippet, not the SVG, so temporarily add `out.textContent = svg;`
inside the SVG button handler to capture it — and remove it before committing.

Then screenshot `#scene`. What you should see:

- **black** everywhere except faint edges — correct
- **faint dark fringing on photo detail** — image resampling, expected
- **a hairline on the ring** — antialiasing of a curved high-contrast edge, expected
- **one or two ghosted glyph stems** — hinting differences between hinted HTML text and
  transformed SVG text, unavoidable and cosmetic
- **bright orange anywhere** — a real bug. Orange is white-on-brand-blue, meaning one layer
  has a shape the other does not

Cover these cases, because they exercise different branches: wrapped multi-line text, mixed
weights via `<span class="b">`, photo zoom and pan, a background image with opacity and
multiply, transparent text background, zero ring weight, square corners, and a non-default
artboard height.

Confirm the final file separately by loading it as `<img src="...">` — that is the strict
mode real web parts use, and it is the only way to catch a linked resource that renders
fine inline and vanishes on upload.

## Traps

**The JS is cached hard.** Browsers and preview panes both hold onto
`halo-banner-maker.js` across reloads, including forced ones. Append a changing query
string to the *page* URL and serve over HTTP. If behaviour does not match the source you
just edited, assume stale JS before you assume a bug.

**Some preview panes render local files as sandboxed static snapshots** with scripts
disabled, silently. If nothing responds to clicks, that is why. Use a real browser against
a real HTTP server.

**The deployed JS has a different filename** — `halo-banner-generator.js` on SharePoint
versus `halo-banner-maker.js` here — and its own `?c=` cache-buster that must be bumped.

**`initGenerator` is not idempotent.** It binds listeners unconditionally, so running it
twice double-binds everything. The page references both a local and a SharePoint copy of
the script; only one resolves in any given environment today, but do not add a third entry
point.

**Blend modes need an isolation context.** The component sets `isolation: isolate` on
`.halo-banner`; the SVG mirrors it with `style="isolation:isolate"` on the root group.
Removing either makes `mix-blend-mode` blend against the whole page.

## Things deliberately not done

Do not add these back without a reason; they were considered and rejected.

- **Downscaling images at export.** Only worth it against full-resolution stock originals.
  At the real ~1020px input sizes it buys nothing and costs a lossy re-encode.
- **An SVG variant with linked images.** It would be broken in exactly the delivery path
  the SVG exists for.
- **Hover and links in the SVG.** A file opened as an image has no interaction model.
- **Converting text to paths.** Would make the SVG font-independent, but needs the Dax Pro
  files and a font parser, and would cost selectable text and screen-reader access.
