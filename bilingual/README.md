# bilingual — EN/FR string system for SharePoint pages

A keyed-dictionary translation pattern: both languages live side by side in one
strings file, HTML is marked with `data-intl` attributes, and script code
calls `intl.t()`. No dependencies, no build step.

Open `demo.html` (add `?lang=fr` for French, or use the toggle) to see it
working, including attribute translation, `{token}` interpolation,
locale-aware number/date formatting, and English fallback for
not-yet-translated keys.

## Why this over CSS class show/hide

The `lang-en` / `lang-fr` class approach (both languages in the DOM, CSS
hides one) works, but has structural costs:

| | Dual DOM + CSS classes | Keyed dictionary (this) |
|---|---|---|
| Attributes (`placeholder`, `title`, `aria-label`, `alt`) | CSS can't reach them; needs JS anyway | Handled (`data-intl-attr`) |
| JS-generated strings | Separate mechanism required | Same dictionary, `intl.t()` |
| Translator workflow | Strings scattered through markup, duplicated in place | One file, EN/FR side by side |
| EN-first / FR-later | Hidden gaps — forgotten FR block just never shows | Automatic EN fallback + `intl.report()` lists pending keys |
| DOM weight / duplicate `id`s / Ctrl+F hits | Every string exists twice | One node per string |
| `document.documentElement.lang` | Usually forgotten | Set on every `apply()` |

The keyed-dictionary shape is also what every mainstream i18n library
(i18next, gettext, SharePoint's own resx) uses, so it reads as familiar
in review.

**If you do keep dual-DOM anywhere**, that's supported too — see the
dual-DOM tier below (`lang-blocks.css`).

## Quick tier — for little widgets

Keys and a strings file are the right shape for a real app, but overkill
for a one-off slider. The same `intl.js` supports a zero-ceremony tier —
pick per element / per string, and mix tiers freely on one page:

```html
<!-- FR rides inline beside the authored EN; no dictionary at all -->
<label data-fr="Vitesse">Speed</label>
<input type="range" data-fr-title="Glisser pour régler" title="Drag to adjust">
```

```js
// Inline EN/FR pair in script — no dictionary
intl.t('Save', 'Enregistrer');
intl.t('{n}% of maximum', '{n} % du maximum', { n: v });
```

```html
<!-- Middle ground (gettext style): valueless data-intl means the English
     text IS the key; a flat entry supplies the French -->
<h2 data-intl>Quick widget</h2>
```
```js
intl.addMessages({ 'Quick widget': 'Petit widget' });
```

Attribute variants for the inline form: `data-fr-placeholder`,
`data-fr-title`, `data-fr-alt`, `data-fr-value`, `data-fr-aria-label`.
The swapper stashes the original English (as `data-en` / `data-en-*`) on
first apply, so live toggling works both ways. Inline forms are plain
text only — strings containing markup need the keyed `data-intl-html`.

Rule of thumb: inline `data-fr` for throwaway widgets, gettext flat
entries once a widget has a dozen strings, dotted keys once translators
or multiple pages are involved.

## Dual-DOM tier — whole blocks per language (if you must)

For laziness-approved wholesale blocks, do it semantically: sibling
elements with real `lang` attributes, hidden purely by CSS keyed off
`<html lang>` — no classes, no per-block JS.

```html
<link rel="stylesheet" href="lang-blocks.css">   <!-- in <head> -->

<section lang="en"> <h2>Scheduled maintenance</h2> … </section>
<section lang="fr"> <h2>Entretien planifié</h2> … </section>
```

`lang-blocks.css` is two selectors: whichever block doesn't match
`<html lang>` gets `display: none` (screen readers and find-in-page skip
it; the visible block is pronounced correctly because the `lang`
attribute is real). `intl.setLang()` already keeps `<html lang>`
truthful, so the blocks flip with the rest of the page for free.

House rules that keep it honest:

- **Early-lang snippet in `<head>`** (see demo.html) so `<html lang>` is
  right before first paint — no flash of the wrong language. With JS off,
  the authored `<html lang="en">` shows English.
- **`class="lang-keep"`** on anything legitimately in the other language —
  the language toggle, a quoted French phrase in English copy — or the
  CSS will hide it.
- **Never duplicate `id`s across blocks.** Suffix them (`-en`/`-fr`) or
  keep interactive bits outside the blocks.
- **Forms:** a hidden duplicate `<input name="…">` still submits and still
  catches tab focus. `intl.apply()` disables form controls inside the
  inactive block (and re-enables only what it disabled), but the better
  layout is one form outside the blocks with translated labels.
- The structural costs don't go away: double payload, every copy edit
  made twice, translator changes scattered through markup. That's why
  this is the last-resort tier, not the default.

## Alpine.js / design systems

The swapper only touches nodes you explicitly mark (`data-intl*`,
`data-fr*`, `[lang]` blocks) and ships no CSS beyond the `[lang]` hiding
rule — it never scans, restyles, or re-renders anything else, so it
coexists with any design system's markup, classes, and components.

Two rules when a JS framework or component owns the DOM:

- **One writer per text node.** Don't put `data-intl` / `data-fr` on a
  node that Alpine (`x-text`, `x-html`) or a design-system widget also
  writes — the two will clobber each other. For component-rendered text,
  pass translated strings in as data (`intl.t(...)`).
- **Alpine support is built in** (and inert when Alpine is absent):
  `intl.js` auto-registers an `intl` store and a `$t` magic when it sees
  Alpine — `x-text="$t('Save', 'Enregistrer')"`, same signatures as
  `intl.t()`. `$t` reads the reactive store, so expressions re-evaluate
  on language flip, and it covers `x-if` / `x-for` template content that
  `intl.apply()` never sees. Put the `intl.js` script tag above the
  Alpine tag (either order is guarded, but Alpine mustn't evaluate a
  `$t` expression before wiring). For Alpine-inserted static markup you
  can also call `intl.apply(insertedEl)` on just that subtree.

One design-system caveat: if a component library itself puts `lang`
attributes on elements, `lang-blocks.css` would hide them — add
`lang-keep` or scope the two selectors to a container you control.

## Usage — keyed tier

```html
<h1 data-intl="app.title">Client Onboarding</h1>
<p  data-intl-html="app.intro">…may contain <strong>markup</strong>…</p>
<input data-intl-attr="placeholder:search.placeholder;title:search.tooltip">
```

The inline English is authored fallback — the source stays readable and the
page degrades to EN if scripts fail. `intl.apply()` overwrites it from the
dictionary. `<title data-intl>` works too (updates the tab title).

```js
intl.t('results.count', { count: 3 });  // '{count} request(s) found'
intl.setLang('fr');                     // re-applies DOM, fires onChange
intl.onChange(render);                  // re-render script-built UI
intl.report();                          // keys still awaiting translation
```

Load order: `intl.js`, then `strings.js`, then `intl.apply()` — at the end
of `<body>` so the swap happens before first paint (no flash of English).

Numbers and dates are formatting, not translation — use
`Intl.NumberFormat` / `Intl.DateTimeFormat` with `fr-CA` / `en-CA`
(see `render()` in the demo) rather than dictionary entries.

Case matters: `intl` (lowercase) is this library; `Intl` (capital) is
the browser's built-in formatting API used above. They're separate
globals that work together — just don't typo one for the other.

## SharePoint notes — why not resx

`.resx` resources are server-side artifacts: they work via `$Resources:`
tokens in master pages / page layouts / feature XML, or
`SPUtility.GetLocalizedString`, and reaching them from JavaScript
(ScriptResx.ashx) requires deploying the .resx into the hive — i.e. a
farm solution on-prem. Script-embedded customizations (Script Editor /
Content Editor / JSLink) have no path to author or read custom resx, and
SharePoint Online removed the deployment vector entirely. SPFx web parts
get an official localization system (`loc/en-us.js` / `fr-fr.js` string
bundles picked by UI culture) — the same keyed-dictionary idea, but it
needs the SPFx build/deploy pipeline. MUI and variations translate
SharePoint's own chrome and publishing content, never embedded script.

So for script-embed workflows the client-side dictionary IS the
established pattern. SharePoint does contribute one useful freebie:
`_spPageContextInfo.currentUICultureName` (e.g. `"fr-CA"`) on classic
pages, and the legacy page context on modern pages — a strong extra
signal for the language-detection stack.

## Plugging in real language detection

`detectLang()` in `intl.js` is a deliberate placeholder (`?lang=fr` URL
param). Replace its body with the multi-layer SP detection (URL infix,
switcher state, etc.); nothing else in the file depends on how the
language was decided. `setLang()` currently writes the choice back to the
URL param so reloads stick — adjust that to match whatever the real
detection reads.

Caveat: `setLang()`'s URL sync uses the `URL` API (no IE11); everything
else is ES5-safe.
