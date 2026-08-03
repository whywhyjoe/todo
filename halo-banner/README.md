# Halo Banner Generator

A single-page browser tool that builds "halo banners" for BMO SharePoint pages: a large
ringed circular photo overlapping a coloured artboard, with a text block beside it. You
drive it with sliders and dropdowns, watch a live preview, and take one of two outputs
away.

The tool itself is pasted into a SharePoint **custom script web part**. It is not built,
bundled or installed — there is no toolchain, no package manager and no tests. Open the
HTML file in a browser and it runs.

## The two outputs

Both come out of the same live preview, and picking the wrong one is the most common
mistake with this tool.

| Button | Output | Use it when |
|---|---|---|
| **Copy** | HTML + a scoped `<style>` block | You are pasting into a page (custom script web part) |
| **SVG** | One `.svg` file, images inlined as base64 | You need a *file* — Image web part, Hero web part, a deck, email, Teams |

**Paste the HTML when the banner lives on a page.** It keeps hover (halo scale-up, text
background colour swap) and the `<a>` wrapper with target/rel, it weighs about 4 KB
because photos stay as URLs, and every setting stays visible and editable as a custom
property in the `style` attribute. The SVG has none of that.

**Upload the SVG when a web part demands an image.** Hero and Image web parts want a file,
and that is what the exporter is for.

### The SVG export inlines its images, and has to

When a browser loads an SVG *as an image* — `<img src>`, `background-image`, which is what
Image and Hero web parts do — it renders in a restricted mode where **external references
are never fetched**. This is not CORS: an image sitting in the same folder on the same
server is still not loaded. Verified directly; the same file in an `<iframe>` loads it
fine, in an `<img>` it does not.

So every raster the banner needs is fetched and base64'd into the file at export time. If
a fetch fails, the exporter falls back to a plain URL and the button reads
**"1 image linked"** instead of "Saved". **Treat that as an error** — the file will upload
happily and render with a hole where the photo should be.

The same restriction applies to fonts: a linked `@font-face` would be blocked too.

### File size

The SVG costs you the photo bytes plus about 33% (base64), plus roughly 2 KB of vector.
That is the entire overhead of the format.

- Source images around 1020×1020 → **200–350 KB** per banner. Fine.
- A full-resolution stock original (~5000px) → **3–6 MB**. Not fine.

Size the source image before you point the tool at it. Unsplash honours `?w=1600&q=80` on
its URLs, which is handy while testing.

Watch resolution in the other direction too: the halo photo is clipped to a circle roughly
**1154 units across — wider than the 1024-unit artboard**, because the halo deliberately
overflows the banner. A 1020px source is about 1:1 only when the banner renders near
1024 CSS px. A full-bleed Hero tile can be 1600px+, a 2× display doubles it again, and
photo zoom crops into the source on top of that. Only the photograph can go soft; the
ring, text and shapes are vector and stay sharp.

## Fonts

The banner asks for **Dax Pro**, which is not a system font and is **not shipped here**.
The `@font-face` block at the top of `<style id="halo-banner-css">` is commented out. Fill
in real paths and uncomment it, or the stack falls back to Segoe UI.

For the SVG export this matters more than it looks: line breaks are measured off the live
preview and baked into the file as absolute positions. If the viewing machine substitutes
a different font, the glyphs move but the baked line breaks do not. If you get the woff2
files, embed them base64 inside the SVG rather than linking them (see above).

## Files

| File | What it is |
|---|---|
| `halo-banner-maker.html` | The whole tool. This is the paste target. Contains three `<style>` blocks — two generated, one hand-written |
| `halo-banner-maker.js` | All behaviour: state, live preview, both exporters |
| `dcs-workbench.css` | Vendored DCS Workbench design kit. Treat as read-only |
| `halo-overrides.css` | Halo's deltas from the kit — tool chrome only, never banner styles |
| `inline-css.py` | Splices the two stylesheets into the HTML. Idempotent |
| `halo-banner-test.html` | Two pasted banner blocks plus hostile host-page CSS, to prove scoping works |
| `RESTYLE-PLAN.md` | The inventory and plan for the DCS Workbench re-skin. History, not instructions |

## Running it locally

Open `halo-banner-maker.html` in a browser. That is the whole workflow.

A static server avoids browser caching headaches when you are iterating on the JS:

```bash
python -m http.server 8653 --bind 127.0.0.1
```

Then load `http://127.0.0.1:8653/halo-banner/halo-banner-maker.html`. Add a changing query
string (`?v=2`) when the JS does not seem to update — browsers cache it aggressively and
some preview panes never reload it at all.

The second `<script>` tag points at the deployed copy on SharePoint. It does not resolve
outside the tenant and is inert locally; only the relative `halo-banner-maker.js` runs.

## Editing styles

Never hand-edit the `<style id="dcs-workbench">` or `<style id="halo-overrides">` blocks in
the HTML — they carry a generated-block banner and get overwritten. Edit the sibling `.css`
file, then:

```bash
python inline-css.py
```

`<style id="halo-banner-css">` is the exception: it is hand-written and lives only in the
HTML. It is also the **banner component itself** — that block is bundled into every copied
snippet, so changing it changes what everyone pastes.

## Deploying

1. Update the JS at the SharePoint path in `halo-banner-maker.html` line 10. Note the
   deployed file is named `halo-banner-generator.js`, **not** `halo-banner-maker.js`.
2. Bump the `?c=` cache-buster on that URL, or nobody will see the change.
3. Paste the contents of `halo-banner-maker.html` into the custom script web part.

## The unit system

Everything is authored on a **1024-unit-wide artboard**, `--ab-h` units tall. Every length
in the component is either a percentage of that box or a `cqw`, and `1cqw = 10.24 units`,
so `n / 10.24 = n cqw`. Font sizes, padding and radii in the control panel are all plain
artboard units.

This is why the SVG export is straightforward: `viewBox="0 0 1024 H"` needs no scale
factor. It is also why the banner never reflows — it scales as one piece at any width.
