/*
 * Optional Alpine.js bridge for I18N.
 *
 * Load order: i18n.js, then this file, then Alpine — a plain <script>
 * tag above the Alpine tag works (it only needs to be listening before
 * alpine:init fires).
 *
 * Rule: one writer per text node. Anywhere Alpine owns the text
 * (x-text / x-html / templates), use $t instead of data-i18n so the two
 * systems never fight over the same node:
 *
 *   <span x-text="$t('results.greeting', { name })"></span>
 *   <button x-text="$t('Save', 'Enregistrer')"></button>   <!-- inline pair -->
 *
 * $t reads a reactive store, so every expression using it re-evaluates
 * automatically when the language flips — including content Alpine
 * stamps out later from x-if / x-for templates, which I18N.apply()
 * never sees.
 */
(function (global) {
  'use strict';

  global.document.addEventListener('alpine:init', function () {
    var Alpine = global.Alpine;

    Alpine.store('i18n', { lang: global.I18N.getLang() });

    global.I18N.onChange(function (lang) {
      Alpine.store('i18n').lang = lang;
    });

    Alpine.magic('t', function () {
      return function (key, a, b) {
        void Alpine.store('i18n').lang; // reactive dependency on the language
        return global.I18N.t(key, a, b);
      };
    });
  });
})(window);
