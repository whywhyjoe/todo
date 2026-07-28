# bilingual — EN/FR string system for SharePoint pages

A keyed-dictionary i18n pattern: both languages live side by side in one
strings file, HTML is marked with `data-i18n` attributes, and script code
calls `I18N.t()`. No dependencies, no build step.

Open `demo.html` (add `?lang=fr` for French, or use the toggle) to see it
working, including attribute translation, `{token}` interpolation,
locale-aware number/date formatting, and English fallback for
not-yet-translated keys.

## Why this over CSS class show/hide

The `lang-en` / `lang-fr` class approach (both languages in the DOM, CSS
hides one) works, but has structural costs:

| | Dual DOM + CSS classes | Keyed dictionary (this) |
|---|---|---|
| Attributes (`placeholder`, `title`, `aria-label`, `alt`) | CSS can't reach them; needs JS anyway | Handled (`data-i18n-attr`) |
| JS-generated strings | Separate mechanism required | Same dictionary, `I18N.t()` |
| Translator workflow | Strings scattered through markup, duplicated in place | One file, EN/FR side by side |
| EN-first / FR-later | Hidden gaps — forgotten FR block just never shows | Automatic EN fallback + `I18N.report()` lists pending keys |
| DOM weight / duplicate `id`s / Ctrl+F hits | Every string exists twice | One node per string |
| `document.documentElement.lang` | Usually forgotten | Set on every `apply()` |

The keyed-dictionary shape is also what every mainstream i18n library
(i18next, gettext, SharePoint's own resx) uses, so it reads as familiar
in review.

**If you do keep dual-DOM anywhere** (e.g. large rich-text blocks where a
key would be awkward), use real `lang` attributes instead of classes —
that's the semantic version, and screen readers get pronunciation for free:

```css
html[lang="fr"] [lang="en"],
html[lang="en"] [lang="fr"] { display: none; }
```

`display: none` specifically — screen readers skip it; `visibility` /
off-screen tricks leave the other language readable.

## Quick tier — for little widgets

Keys and a strings file are the right shape for a real app, but overkill
for a one-off slider. The same `i18n.js` supports a zero-ceremony tier —
pick per element / per string, and mix tiers freely on one page:

```html
<!-- FR rides inline beside the authored EN; no dictionary at all -->
<label data-fr="Vitesse">Speed</label>
<input type="range" data-fr-title="Glisser pour régler" title="Drag to adjust">
```

```js
// Inline EN/FR pair in script — no dictionary
I18N.t('Save', 'Enregistrer');
I18N.t('{n}% of maximum', '{n} % du maximum', { n: v });
```

```html
<!-- Middle ground (gettext style): valueless data-i18n means the English
     text IS the key; a flat entry supplies the French -->
<h2 data-i18n>Quick widget</h2>
```
```js
I18N.addMessages({ 'Quick widget': 'Petit widget' });
```

Attribute variants for the inline form: `data-fr-placeholder`,
`data-fr-title`, `data-fr-alt`, `data-fr-value`, `data-fr-aria-label`.
The swapper stashes the original English (as `data-en` / `data-en-*`) on
first apply, so live toggling works both ways. Inline forms are plain
text only — strings containing markup need the keyed `data-i18n-html`.

Rule of thumb: inline `data-fr` for throwaway widgets, gettext flat
entries once a widget has a dozen strings, dotted keys once translators
or multiple pages are involved.

## Usage — keyed tier

```html
<h1 data-i18n="app.title">Client Onboarding</h1>
<p  data-i18n-html="app.intro">…may contain <strong>markup</strong>…</p>
<input data-i18n-attr="placeholder:search.placeholder;title:search.tooltip">
```

The inline English is authored fallback — the source stays readable and the
page degrades to EN if scripts fail. `I18N.apply()` overwrites it from the
dictionary. `<title data-i18n>` works too (updates the tab title).

```js
I18N.t('results.count', { count: 3 });  // '{count} request(s) found'
I18N.setLang('fr');                     // re-applies DOM, fires onChange
I18N.onChange(render);                  // re-render script-built UI
I18N.report();                          // keys still awaiting translation
```

Load order: `i18n.js`, then `strings.js`, then `I18N.apply()` — at the end
of `<body>` so the swap happens before first paint (no flash of English).

Numbers and dates are formatting, not translation — use
`Intl.NumberFormat` / `Intl.DateTimeFormat` with `fr-CA` / `en-CA`
(see `render()` in the demo) rather than dictionary entries.

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

`detectLang()` in `i18n.js` is a deliberate placeholder (`?lang=fr` URL
param). Replace its body with the multi-layer SP detection (URL infix,
switcher state, etc.); nothing else in the file depends on how the
language was decided. `setLang()` currently writes the choice back to the
URL param so reloads stick — adjust that to match whatever the real
detection reads.

Caveat: `setLang()`'s URL sync uses the `URL` API (no IE11); everything
else is ES5-safe.
