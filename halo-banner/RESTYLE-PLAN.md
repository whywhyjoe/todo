# Halo → DCS Workbench re-skin: inventory and plan

Sources read:

- `dcs-workbench.css` (v1.0) — pulled from Claude Design project `c053d346…`, **law**
- `Compact Tool Pattern.dc.html` — reference render, **illustrative of assembly only**
- `SliderField.dc.html` — the reference's slider composition
- `halo-banner-maker.html`, `halo-banner-maker.js` — Halo as it stands

No Halo file has been modified.

---

## 0. The line I am not crossing

`halo-banner-maker.html` lines 62–200 (`<style id="halo-banner-css">`) is the **banner
component**, not the tool. `emit()` bundles that exact block into every generated
snippet via `scopedComponentCss()`. Nothing in this pass touches it. That means these
survive untouched and are *not* violations of the "no hex literals" rule:

| Where | Values | Why exempt |
|---|---|---|
| `#halo-banner-css` | `#0075BE`, `#fff` | shipped inside generated banners |
| `BRAND` in the JS | `#0079c1`, `#005789`, `#646c76`, `#FFFFFF` | the four banner colours |
| `DEFAULTS` colours | same four | banner defaults |
| `placeholderImage` data-URI | `#d7dbe0`, `#9aa4b0` | banner photo placeholder |
| component transitions | `.35s`, `cubic-bezier(.2,.7,.3,1)` | banner motion, not tool motion |

Every other colour and duration in the file is tool chrome and gets tokenised.

---

## 1. Shell

| # | Halo now | System replacement | Class | Note |
|---|---|---|---|---|
| 1.1 | `.wrapper-body` — `grid 400px 1fr`, `#141517`, `100vh`, `font 14px/1.5 Segoe UI` | `.dcs-tool` (outer) + `.dcs-tool-body.has-canvas` (inner grid) | **A** | needs one new wrapper div; `data-halo-generator` moves to `.dcs-tool` so `initGenerator` still finds its root |
| 1.2 | `@media (max-width:760px)` single column | `.dcs-tool-body.has-canvas` already collapses at 720px | **A** | delete Halo's query, adopt the system breakpoint |
| 1.3 | `.panel` — `#26282c`, `border-right #34373c`, `padding 14px 16px`, `max-height 100vh` | `.dcs-controls` | **A** | see C-4 on the column width |
| 1.4 | `.panel-title` + `<h1>Halo Banner Generator</h1>` | `.dcs-tool-head` (new) | **A** | header explicitly in scope; the `<h1>` and `.panel-title` are deleted, not left alongside |
| 1.5 | — (Halo has no mark) | `.dcs-mark` 2×2, four 6px squares, 2px gap, `--accent` @ 1 / .62 / .38 / .2 | **A** | pure chrome, carries no function |
| 1.6 | — (Halo has no version) | `.dcs-tool-version` chip | **omitted** | Halo does not know its version number anywhere in source. Per the brief: omit rather than hardcode. The reference's `v1.4` is invented for the render. |
| 1.7 | `.stage` — `justify-items:end; align-items:start; padding 10px 10px 10px 34px` | `.dcs-canvas` + `.dcs-canvas-stage` | **A** for paint (24px lattice, `--bg-0`, 16px pad) / **B** for alignment | the end/start alignment is what puts the banner edge against the rail so it can be lined up against a column — that is the resize feature's affordance, so it stays as an override |
| 1.8 | `.stage-inner` `box-shadow 0 8px 40px rgba(0,0,0,.5)` | `var(--shadow-pop)` | **A** | one shadow in the system |
| 1.9 | `.stage-inner` `width:min(100%,900px); min-width:160px; max-width:100%` | keep verbatim | **B** | these are the resize range |
| 1.10 | no status bar, no canvas toolbar | **not added** | **B** | settled in the brief |

---

## 2. Tool header contents

```html
<div class="dcs-tool-head">
  <span class="dcs-mark" aria-hidden="true"><i></i><i></i><i></i><i></i></span>
  <span class="dcs-tool-title">Halo <b>Banner Generator</b></span>   <!-- see C-1 -->
  <span class="dcs-tool-actions">…copy + show code…</span>
</div>
```

`.dcs-tool-actions` ships with `margin-left:auto`. The brief wants the buttons
**left**, sitting where the version chip would be. That needs one override line
(`margin-left:0`) — listed in §7.

### Buttons

| Halo now | System | Class | Note |
|---|---|---|---|
| `#copy` `.panel-button` — 12px, `#4a4e55` border, transparent | `.dcs-btn .dcs-btn-primary` | **A** | Copy is the verb that runs this tool — the one solid accent fill on the screen |
| `#toggle-code` `.panel-button` | `.dcs-btn .dcs-btn-lg` | **A** | `-lg` = 28px so it matches `-primary`'s 28px; the tier rule forbids mixing 26 and 28 in one row |
| icons: 24-grid Lucide, stroke 2, 12×12 | 16-grid, stroke 1.4/1.5, 13×13 (the reference's own copy + chevron glyphs) | **A** | icon weight is named as skin; same two glyphs, same meaning |
| `title=` attributes | keep verbatim | **B** | copy diff must be empty |
| label text `Copy` / `Show code` / `Hide code` / `Copied` | keep verbatim | **B** | JS swaps `<span>` text — the `<span>` must survive the restyle |

Both `id`s survive, so `$('copy')` / `$('toggle-code')` bind unchanged.

---

## 3. Controls

| # | Halo now | System | Class | Note |
|---|---|---|---|---|
| 3.1 | `.panel section` / `section + section` divider | `.dcs-group` / `.dcs-group + .dcs-group` | **A** | grouping and order unchanged |
| 3.2 | `.panel h2` — 11px, `#4aa3e0`, uppercase | `.dcs-group-title` — 9.5px/700, `--fg-dim`, `.14em` | **A** | both uppercase, so no rendered-text diff. Section names stay verbatim: `Design: halo`, `Photo: inner fill`, `Text`, `Link`, `Banner` (not the reference's `Design · Halo`) |
| 3.3 | `.field` | `.dcs-field` | **A** | |
| 3.4 | `.field label` | `.dcs-label` | **A** | |
| 3.5 | `.value-input` — editable numeric readout inside the label | paint as `.dcs-value` | **A** paint / **B** control | it is an `<input>`, not a span: the user types a number and commits on Enter/blur. Keep the input and both handlers; give it `.dcs-value` + a small override for `border:0; background:transparent; text-align:right; width:58px` |
| 3.6 | `label[data-custom-for]` click-to-edit → swaps the `<select>` for a free-text field | keep entirely | **B** | a Halo feature the reference has no equivalent for |
| 3.7 | `.custom-value` input | `.dcs-input` | **A** | |
| 3.8 | `input[type=range]` + `accent-color:#4aa3e0` | `.dcs-slider` | **A** | **requires JS**: `.dcs-slider` paints its filled portion from a `--fill` custom property. Adding `el.style.setProperty('--fill', pct+'%')` on init and on `input` is skin work, not behaviour — range, step, min, max, and value all unchanged |
| 3.9 | `input[type=text]` | `.dcs-input`; URL fields also `.dcs-input-mono` | **A** | the reference sets Photo URL in mono and alt text in sans; Halo's URL fields (`purl`, `bgurl`, `lurl`) follow |
| 3.10 | `textarea#ttext` — `ui-monospace`, `min-height:34px` | `.dcs-textarea .dcs-textarea-mono` | **A** | system min-height is 64px vs Halo's 34px; the reference uses 58px. Override to keep Halo's compact panel — flagged in §7 |
| 3.11 | `select` + the hand-rolled data-URI chevron | `.dcs-select` | **A** | **delete** the whole bespoke `select {}` rule including the `%239aa0a6` chevron. See the width consequence below |
| 3.12 | `.check-field` + `label > input[type=checkbox]` | `.dcs-check` | **A** | the `padding-top:15px` hack that bottom-aligns a checkbox against a slider in the same row becomes an alignment override, not a magic number |
| 3.13 | `.row2` | `.dcs-row` | **A** | |
| 3.14 | `.row3` | `.dcs-row.dcs-row-3` | **A** | |
| 3.15 | `.row-2-1` (2fr / 1fr — Link URL + New tab) | no system equivalent | **A** | override, grid-template only |
| 3.16 | `.row-colors` (`minmax(110px,1fr) minmax(110px,1fr) 60px max-content`) | no system equivalent | **A** | override, grid-template only — but see the squeeze below |
| 3.17 | `.code-view pre` — `#1a1b1e` ground, `#b6d7ee` text | no system code-block class | **A** | override `.halo-code` built from `--bg-editor` / `--border` / `--mono` / `--fg-row` |

### The dropdown squeeze — a real consequence, stated up front

Two earlier rounds of work went into making the colours row fit: a custom 20px chevron
replaced the native ~24px arrow, and `.row-colors` was hand-tuned so `Navy #005789`
shows in full inside a 400px column. Adopting the system undoes both inputs to that
calculation:

- `.dcs-select` reserves **26px** on the right, 6px more than Halo's chevron.
- `.dcs-tool-body.has-canvas` caps the control column at **360px**, 40px narrower.

Net: roughly 46px less room on that one row. I will re-tune the `.row-colors`
grid template in the overrides file (grid geometry only, no colours, no new controls)
and measure the rendered widths to confirm the values still show. If 360px genuinely
cannot hold it, that is C-4 below.

---

## 4. Resize rail — settled in the brief, restated for the diff

Delete every bespoke rule: `.stage-resizer`, `::before`, `::after`, all three
hover/focus/`.is-resizing` blocks, `#565b63`, `#3d4650`, `#4aa3e0`,
`rgba(255,255,255,.2)`. Replace with the prescribed markup:

```html
<div class="dcs-resize-rail dcs-tip-host" role="separator"
     aria-orientation="vertical" tabindex="0" aria-label="Resize preview">
  <span class="dcs-resize-grip"></span>
  <span class="dcs-tip">Drag to resize preview</span>
</div>
```

Structural consequence, and the only DOM change beyond a class swap:
`.dcs-resize-rail` is `flex:none; align-self:stretch` — a flex **sibling**, where
Halo's was `position:absolute; left:-24px` inside `.stage-inner`. So the rail and the
preview become a flex row inside `.dcs-canvas-stage`. Everything else holds:

- drag maths, `Math.min(maxWidth, Math.max(160, …))`, and `maxStageWidth()` unchanged
- keyboard ArrowLeft/ArrowRight ±10px unchanged
- `.is-resizing` → `.is-dragging` (the class the system's rail listens for)
- `<button>` → `<div tabindex="0">`: no loss. Halo binds only `pointerdown` and
  `keydown`; there is no click handler for the button element to have been firing.
- tooltip wording identical; `title=` is dropped because `.dcs-tip` now carries it,
  and `aria-label="Resize preview"` is already what Halo has.

---

## 5. Messages and states

Halo has **none**. No empty state, no error state, no loading state, no toast, no
notice, no chip, no badge. `.dcs-notice`, `.dcs-state`, `.dcs-chip`, `.dcs-badge`
therefore go **unused**, and the reference's info notice ("Paste the generated
markup…") and `last generated 14:22:06` line are **not** brought over — both are
net-new UI.

The one candidate is the edit-mode `.webpart-marker` div — see C-3.

---

## 6. Motion audit

| Halo transition | Verdict |
|---|---|
| `.panel-button` `.15s ease` ×3 props | → `--dur-tint`, inherited from `.dcs-btn` |
| `.field label[data-custom-for]` `.15s ease` | → `--dur-tint` in the override |
| `.value-input:focus` (no transition) | unchanged |
| `.stage-resizer` `.15s` ×2 blocks | deleted with the rail |
| `.halo` `.35s cubic-bezier` | **banner output — untouched** |
| `.halo__text-bg` `.35s ease` | **banner output — untouched** |
| component `prefers-reduced-motion` block | **banner output — untouched** |

Nothing in Halo maps to `--dur-beat` or the `.82s` scan, and nothing is genuinely
pending, so neither is introduced.

---

## 7. `halo-overrides.css` — the planned list

> **As built, this list grew by three.** Recorded here rather than quietly
> extended, as promised:
> - `.dcs-mark` — the 2×2 compact-tool mark is specified in the brief and drawn
>   inline in the reference render, but `dcs-workbench.css` has no class for it.
>   Built here from `--accent` alone.
> - `.dcs-select { padding-right: 18px }` — see §3.
> - `.dcs-slider { margin: 0 }` — a defect in the system file, see §11.
>
> One planned item was dropped: no separate `.dcs-tool` height rule was needed
> beyond the one already listed at 10.



`dcs-workbench.css` is vendored verbatim and never edited. Everything the system
does not cover goes in one small file, tokens only:

1. `.dcs-tool-head .dcs-tool-actions { margin-left: 0 }` — buttons left, per the brief
2. `.halo-row-2-1` — 2fr/1fr grid for Link URL + New tab
3. `.halo-row-colors` — re-tuned colour-row grid template
4. `.dcs-value` as an `<input>` — `border:0; background:transparent; text-align:right; width:58px`
5. `label[data-custom-for]` hover/focus-within affordance — `--bg-3` / `--fg`, `--dur-tint`
6. `.dcs-textarea` height for Halo's compact panel (system 64px → Halo's ~34px)
7. check-field bottom alignment inside a `.dcs-row` (replaces `padding-top:15px`)
8. `.dcs-canvas-stage` alignment override — `justify-items:end; align-items:start`
9. `.halo-code` — the generated-code block
10. `.dcs-tool` full-height behaviour, if C-4 lands on keeping 100vh

If the list grows during implementation I will say so rather than quietly extend it.

---

## 8. Deliberately left alone

- All 15 sliders, 8 selects, 5 checkboxes, 5 text inputs, 1 textarea — same controls,
  same ranges, same options, same order, same grouping.
- Every label, hint, section name, placeholder, `title`, and `aria-label`, verbatim.
  Including `Corner radius`, `Width (0 = auto)`, `Content (HTML ok: spans for overrides)`,
  `Design: halo`, `Photo: inner fill`.
- Colour selection stays `<select>`. No swatches.
- No Generate button, no artboard toolbar, no zoom, no Fit/100%, no export, no
  dimension readout, no "last generated" line, no status bar, no splitter.
- `emit()`, `render()`, `scopedComponentCss()`, `bindSlider/bindSelect/bindInput`,
  `HOVER_COLORS`, `SCOPE_ID` — untouched except the two skin-only edits named in
  3.8 (`--fill`) and §4 (`is-dragging`).
- The SharePoint web-part plumbing block (lines 17–58) — `sp-webpart-options`
  behaviour, not tool chrome.

---

## 9. Class C — answered 2026-08-01, all four resolved

| | Question | Decision |
|---|---|---|
| C-1 | Header title casing | **Keep Halo's caps** — renders `Halo Banner Generator`, verified identical |
| C-2 | CSS delivery + global bleed | **Inline verbatim, accept the bleed** — vendored copy is the source of truth, spliced by `inline-css.py` |
| C-3 | Edit-mode `.webpart-marker` | **Leave it alone** — untouched |
| C-4 | Control column width | **Override back to 400px** — the kit's 360px cap is not used |

The original questions are kept below for the record.



**C-1 · Header title casing.** The brief prescribes `Halo <b>banner generator</b>`.
Halo's own `<h1>` reads **Halo Banner Generator**. Adopting the prescribed string
lowercases two words, which is a user-visible text diff — and "a diff of Halo's
user-visible text is empty" is one of the done criteria. Which wins: the literal
markup, or Halo's existing capitalisation?
*My read:* keep Halo's caps (`Halo <b>Banner Generator</b>`) — the header spec was
describing structure, and the text rule is explicit.

**C-2 · How does `dcs-workbench.css` reach SharePoint, and do I contain its globals?**
Two separate halves.

*Delivery.* `halo-banner-maker.html` **is** the web-part payload — it is pasted into a
custom script web part. A relative `<link href="dcs-workbench.css">` resolves against
the SharePoint page URL, not the asset library, so it would not load in production.
Halo already works around this for its JS: relative `halo-banner-maker.js` for local
dev, absolute `https://bmo.sharepoint.com/…/halo-banner-generator.js` for production.
Options: (a) inline the system CSS as a `<style>` block in the HTML — matches how the
file already carries its other three stylesheets, and the system's own header sanctions
inlining; (b) mirror the JS pattern with a vendored sibling plus an absolute SharePoint
URL, which needs the file uploaded to `SiteAssets/CodeAssets/Utilities/` first.
*My read:* (a) inline, with a verbatim vendored copy kept in the repo as the source of
truth so the block can be regenerated. But (b) is cleaner if you are already uploading
assets.

*Globals.* `dcs-workbench.css` is written for a page it owns. Dropped into a
SharePoint page it will restyle things outside the web part:

| Rule | Page-wide effect |
|---|---|
| `:root { color-scheme: dark }` | flips native form controls and scrollbars across the page |
| `* { box-sizing: border-box }` | applies to every SharePoint element |
| `a { color: var(--accent) }` + `a:hover` | recolours every link on the page teal |
| `::-webkit-scrollbar*` | restyles the page scrollbar |
| `@media (prefers-reduced-motion) { *, ::before, ::after { … !important } }` | kills every SharePoint animation for reduced-motion users |

I cannot scope these without editing `dcs-workbench.css`, which the brief forbids.
Choices: accept the bleed (fine if the generator lives on its own dedicated tool page),
or let me neutralise the five rules for non-Halo elements from `halo-overrides.css`
(possible but ugly, and it cannot undo the `!important` reduced-motion block).
*My read:* accept it if this is a dedicated tool page — tell me if it is not.

**C-3 · The edit-mode `.webpart-marker`.** Lines 323–325 render a message in edit mode
("Halo webpart generator. Ensure web part is placed above the fold…"). It has **no CSS
in this file** — it is painted by the remote SharePoint utilities script. Restyling it
as `.dcs-notice-info` (text verbatim) is a natural fit, but it means fighting or
duplicating remote CSS I cannot see from here. Restyle it, or leave it?
*My read:* leave it — out of this file's control, and only visible to page editors.

**C-4 · Control column width.** The system says `minmax(280px, 360px)`. Halo is at
400px, and the colours row was hand-tuned across two rounds specifically to fit that
400. Adopting 360 plus the system's wider select arrow costs ~46px on that row. Take
the system's 360 and re-tune the row, or override back to 400 and keep the tuning
intact? Related: Halo's panel is `max-height:100vh` (fills the page); the reference
caps its column at 620px. Halo's viewport-height behaviour reads as a Halo decision to
me, so I plan to keep it either way — say if you disagree.
*My read:* 360 + re-tune, and I will measure rather than eyeball it. But this is your
tuning I would be redoing, so I am asking.

---

## 10. Implementation order, once C is answered

1. **shell** — vendor `dcs-workbench.css`, `.dcs-tool` / `.dcs-tool-body.has-canvas` /
   `.dcs-controls` / `.dcs-canvas`, build `.dcs-tool-head`, delete `.wrapper-body`,
   `.panel`, `.panel-title`, `.stage`
2. **controls** — groups, fields, labels, sliders (+ `--fill` in JS), inputs, selects,
   textarea, checkboxes, rows
3. **buttons** — `.dcs-btn` tiers, primary discipline, reference icons
4. **rail** — `.dcs-resize-rail` / `.dcs-resize-grip` / `.dcs-tip`, `is-dragging`
5. **cleanup** — delete every dead rule and hex literal, finalise `halo-overrides.css`

Verified after each step over `python -m http.server` (a `file://` load serves stale
JS in this environment): generation still fires on every change, the rail still
resizes, every select still has its options, every label reads identically, no console
errors, and a generated snippet still pastes and renders standalone.

---

## 11. Found while implementing

**`dcs-workbench.css` defect — `.dcs-slider` does not clear the UA margin.**
A `<input type="range">` carries a 2px UA margin. `.dcs-slider` sets `width: 100%`
but never resets it, so every slider overhangs its field by 2px and every row
overhangs its panel by 2px. Invisible in a wide dialog; Halo runs fifteen sliders
in three-across columns inside a 400px panel, so it showed on every row.
Worked around with `.dcs-slider { margin: 0 }` in the overrides. Worth fixing in
the system file — the workaround should then be deleted.

**The generated snippet is unaffected by any of this**, confirmed by rendering a
freshly emitted block in an isolated iframe with hostile host CSS: container
queries live, `cqw` sizing resolved, aspect ratio correct, text colour and weight
still beat the host's, no `--accent`/`--bg-*`/`dcs-` string anywhere in the output.
