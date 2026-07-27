/*
 * I18N — bilingual EN/FR string swapper for SharePoint pages.
 *
 * One dictionary holds both languages side by side (see strings.js).
 * HTML is marked up with data-i18n attributes; script code calls I18N.t().
 * No dependencies, no build step — safe to paste into a Script Editor /
 * Content Editor web part. Exposes a single global: window.I18N.
 *
 * Markup contract:
 *   data-i18n="key"                          -> element textContent
 *   data-i18n-html="key"                     -> element innerHTML (trusted strings only)
 *   data-i18n-attr="placeholder:key;title:key2" -> named attributes
 */
(function (global) {
  'use strict';

  var DEFAULT_LANG = 'en';
  var SUPPORTED = ['en', 'fr'];

  /*
   * PLACEHOLDER detection: ?lang=fr URL param only.
   * Swap this function's body for the real multi-layer SP detection
   * (URL infix, language switcher state, etc.) — nothing else in the
   * file cares how the language was decided.
   */
  function detectLang() {
    var m = /[?&]lang=([A-Za-z-]+)/.exec(global.location.search);
    var lang = m ? m[1].toLowerCase().slice(0, 2) : DEFAULT_LANG;
    return SUPPORTED.indexOf(lang) !== -1 ? lang : DEFAULT_LANG;
  }

  var current = detectLang();
  var messages = {};   // key -> { en: '...', fr: '...' }
  var missing = {};    // 'key|lang' -> { key, lang } — pending-translation log
  var listeners = [];

  function addMessages(dict) {
    for (var key in dict) {
      if (Object.prototype.hasOwnProperty.call(dict, key)) {
        messages[key] = dict[key];
      }
    }
  }

  function noteMissing(key, lang) {
    missing[key + '|' + lang] = { key: key, lang: lang };
  }

  function lookup(key, lang) {
    var entry = messages[key];
    if (!entry) {
      noteMissing(key, lang);
      return null;
    }
    if (entry[lang] == null || entry[lang] === '') {
      noteMissing(key, lang);
      // English-first workflow: an untranslated key falls back to EN
      // instead of rendering blank.
      return entry[DEFAULT_LANG] != null ? entry[DEFAULT_LANG] : null;
    }
    return entry[lang];
  }

  function format(str, params) {
    return str.replace(/\{(\w+)\}/g, function (token, name) {
      return params[name] != null ? params[name] : token;
    });
  }

  function t(key, params) {
    var str = lookup(key, current);
    if (str == null) {
      return key; // last resort: show the key, never an empty string
    }
    return params ? format(str, params) : str;
  }

  function each(nodeList, fn) {
    for (var i = 0; i < nodeList.length; i++) fn(nodeList[i]);
  }

  function apply(root) {
    var doc = global.document;
    var scope = root || doc;

    each(scope.querySelectorAll('[data-i18n]'), function (el) {
      el.textContent = t(el.getAttribute('data-i18n'));
    });

    each(scope.querySelectorAll('[data-i18n-html]'), function (el) {
      el.innerHTML = t(el.getAttribute('data-i18n-html'));
    });

    each(scope.querySelectorAll('[data-i18n-attr]'), function (el) {
      var pairs = el.getAttribute('data-i18n-attr').split(';');
      for (var i = 0; i < pairs.length; i++) {
        var pair = pairs[i].split(':');
        if (pair.length === 2) {
          el.setAttribute(pair[0].trim(), t(pair[1].trim()));
        }
      }
    });

    if (!root) {
      // Screen readers key pronunciation off this; keep it truthful.
      doc.documentElement.lang = current;
    }
  }

  function setLang(lang) {
    if (SUPPORTED.indexOf(lang) === -1 || lang === current) return;
    current = lang;
    apply();
    try {
      // Keep the (placeholder) detection source in sync so a reload
      // stays in the chosen language.
      var url = new global.URL(global.location.href);
      url.searchParams.set('lang', lang);
      global.history.replaceState(null, '', url.toString());
    } catch (e) { /* URL API unavailable — reload would fall back to detection */ }
    for (var i = 0; i < listeners.length; i++) listeners[i](current);
  }

  function getLang() {
    return current;
  }

  function onChange(cb) {
    listeners.push(cb);
  }

  /* Pending-translation report for the circle-back-with-French step. */
  function report() {
    var rows = [];
    for (var k in missing) {
      if (Object.prototype.hasOwnProperty.call(missing, k)) rows.push(missing[k]);
    }
    if (global.console) {
      if (rows.length === 0) {
        global.console.log('I18N: no missing translations encountered.');
      } else if (global.console.table) {
        global.console.table(rows);
      } else {
        global.console.log('I18N missing translations:', rows);
      }
    }
    return rows;
  }

  global.I18N = {
    t: t,
    apply: apply,
    setLang: setLang,
    getLang: getLang,
    addMessages: addMessages,
    onChange: onChange,
    report: report
  };
})(window);
