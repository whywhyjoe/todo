/**
 * Utility: waitForElement
 * Waits for a standard (non-jQuery) selector to match one or more elements in the DOM.
 * Polls at a specified interval until the element(s) appear or a timeout is reached.
 *
 * @param {string} selector - Selector string to watch for.
 * @param {function} callback - Function to execute when the element(s) are found. Receives the jQuery object as an argument.
 * @param {number} [timeout=10000] - Maximum time to wait in milliseconds before giving up.
 * @param {number} [interval=100] - Polling interval in milliseconds.
 */
function waitForElement(selector, callback, timeout = 10000, interval = 100) {
	console.log(`[waitForElement] Waiting for selector: ${selector}`);
	const start = Date.now();
	const check = () => {
		const element = document.querySelector(selector);
		if (element) {
			console.log(`[waitForElement] Found element: ${selector}`);
			callback(element);
		}
		else if (Date.now() - start < timeout) {
			setTimeout(check, interval);
		}
		else {
			console.warn(`[waitForElement] Timeout: Element "${selector}" not found.`);
		}
	};
	check();
}

function initGenerator(root) {
/* ############################################################
  DEFAULTS — edit these, reload, experiment. Everything the
  panel controls starts from here.
  ############################################################ */
const BRAND = {
 Blue:  '#0079c1',
 Navy:  '#005789',
 Green:  '#646c76',
 White: '#FFFFFF',
};
/* Hover color for the text block background, keyed by the resting
  text bg color (keys lowercase). On hover the bg swaps to `hover`,
  unless the banner bg is already that color - then `backup` is used.
  Custom text bg colors with no entry here get no hover change. */
const HOVER_COLORS = {
 [BRAND.Navy.toLowerCase()]:  { hover: BRAND.Blue, backup: BRAND.Green },
 [BRAND.Blue.toLowerCase()]:  { hover: BRAND.Navy, backup: BRAND.Green },
 [BRAND.Green.toLowerCase()]: { hover: BRAND.Blue, backup: BRAND.Navy },
 [BRAND.White.toLowerCase()]: { hover: BRAND.Blue, backup: BRAND.Navy },
};
const DEFAULTS = {
 scale: .96,
 x: 35,
 y: 50,
 ringWeight: 9,
 abHeight: 680,
 ringColor: '#FFFFFF',
 bg: '#0079c1',
 bgRounded: true,
 bgRadius: 10,
 bgImage: '',
 bgOpacity: '100%',
 bgBlend: 'normal',
 photoZoom: 1, photoX: 50, photoY: 50,
 photoImage: 'https://images.unsplash.com/photo-1480714378408-67cf0d13bc1b',
 photoAlt: 'City skyline',
 text: 'Meet the <span class="b">Insights</span> team',
 font: '"Dax Pro"',
 weight: '400',
 size: 50,
 textX: 40,
 textY: 80,
 textW: 705,
 textH: 85,
 padX: 30,
 padY: 25,
 rounded: true,
 radius: 10,
 textColor: '#FFFFFF',
 textBg: '#005789',
 textBgOpacity: '100%',
 blend: 'normal',
 href: '',
 target: '_self',
 hoverScale: 1.05
};
/* ############################################################ */
const $ = id => root.querySelector(`#${id}`);
const scene = $('scene'), link = $('link'), img = $('img'), textEl = $('text'), textBgEl = $('text-bg'), out = $('out');
const placeholderImage = 'data:image/svg+xml;utf8,' + encodeURIComponent(
 `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600">
<rect width="600" height="600" fill="#d7dbe0"/>
<circle cx="300" cy="235" r="95" fill="#9aa4b0"/>
<path d="M110 600c0-105 85-190 190-190s190 85 190 190z" fill="#9aa4b0"/>
</svg>`);
const state = { ...DEFAULTS };
function fillColorSelect(sel, includeNone) {
 if (includeNone) sel.add(new Option('None', 'transparent'));
 Object.entries(BRAND).forEach(([name, value]) => sel.add(new Option(`${name} ${value}`, value)));
}
fillColorSelect($('tcolor'), false);
fillColorSelect($('tbg'), true);
fillColorSelect($('bg'), false);
fillColorSelect($('rc'), false);
for (let opacity = 0; opacity <= 100; opacity += 10) {
 const value = opacity + '%';
 $('tbgo').add(new Option(value, value));
 $('bgopacity').add(new Option(value, value));
}
function textBackground(color) {
 return color === 'transparent' ? 'transparent' : `color-mix(in srgb, ${color} ${state.textBgOpacity}, transparent)`;
}
function hoverBackground(color) {
 if (color === 'transparent') return 'transparent';
 const rule = HOVER_COLORS[color.toLowerCase()];
 if (!rule) return textBackground(color);
 const hover = rule.hover.toLowerCase() === String(state.bg).toLowerCase() ? rule.backup : rule.hover;
 return `color-mix(in srgb, ${hover} ${state.textBgOpacity}, transparent)`;
}
/* An empty text box means no text plate at all - without this an empty block
  still paints its background, padding and corner radius over the banner.
  Markup that draws something counts as content even with no characters in it. */
function hasTextPlate() {
 const html = String(state.text);
 if (!html.trim()) return false;
 const probe = document.createElement('div');
 probe.innerHTML = html;
 return probe.textContent.trim() !== '' || !!probe.querySelector('img, svg, picture, video, canvas');
}
function escapeAttribute(value) {
 return String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
/* "--" would close the HTML comment early */
function commentSafe(value) {
 return String(value).replace(/[<>]/g, '').replace(/-{2,}/g, '-').trim();
}
/* One scope per generator load. Every block copied in a session shares it,
  which is safe because they also share identical component CSS - what it
  isolates is this banner from OTHER page CSS and from blocks generated by a
  different version of this tool. A class, not an id: pasting the same block
  twice must stay valid HTML. */
const SCOPE_ID = String(Math.floor(100000 + Math.random() * 900000));
const SCOPE_CLASS = `halo-${SCOPE_ID}`;
/* Rewrites the component stylesheet so every selector only matches inside
  this block's wrapper. Going through the CSSOM (rather than string surgery)
  keeps @media intact and drops all comments for free. */
function scopedComponentCss(scope) {
 const sheet = document.getElementById('halo-banner-css').sheet;
 const scoped = selectorText => selectorText.split(',')
  .map(part => `.${scope} ${part.trim()}`).join(', ');
 const render = (rule, indent = '') => {
  if (rule instanceof CSSStyleRule) return `${indent}${scoped(rule.selectorText)} { ${rule.style.cssText} }`;
  if (rule instanceof CSSMediaRule) {
   const inner = [...rule.cssRules].map(child => render(child, indent + ' ')).join('\n');
   return `${indent}@media ${rule.conditionText} {\n${inner}\n${indent}}`;
  }
  return `${indent}${rule.cssText}`;   // @font-face and friends stay global
 };
 return [...sheet.cssRules].map(rule => render(rule)).join('\n');
}
function render() {
 const s = scene.style;
 s.setProperty('--scale', state.scale);
 s.setProperty('--x', state.x);
 s.setProperty('--y', state.y);
 s.setProperty('--ring-weight', state.ringWeight);
 s.setProperty('--ab-h', state.abHeight);
 s.setProperty('--ring-color', state.ringColor);
 s.setProperty('--banner-bg', state.bg);
 s.setProperty('--banner-image', state.bgImage ? `url("${state.bgImage.replace(/"/g, '\\"')}")` : 'none');
 s.setProperty('--banner-opacity', state.bgOpacity);
 s.setProperty('--banner-blend', state.bgBlend);
 s.setProperty('--banner-radius', ((state.bgRounded ? state.bgRadius : 0) / 10.24) + 'cqw');
 s.setProperty('--photo-zoom', state.photoZoom);
 s.setProperty('--photo-x', state.photoX + '%');
 s.setProperty('--photo-y', state.photoY + '%');
 img.src = state.photoImage.trim() || placeholderImage;
 img.alt = state.photoAlt;
 s.setProperty('--hover-scale', state.hoverScale);
 // text
 const showText = hasTextPlate();
 textEl.innerHTML = state.text;
 textBgEl.innerHTML = state.text;
 textBgEl.querySelectorAll('[id]').forEach(element => element.removeAttribute('id'));
 /* inline, because .halo__text sets `display: block` and would beat [hidden] */
 textEl.style.display = showText ? '' : 'none';
 textBgEl.style.display = showText ? '' : 'none';
 s.setProperty('--text-font', state.font);
 s.setProperty('--text-weight', state.weight);
 s.setProperty('--text-size', state.size);
 s.setProperty('--text-x', state.textX);
 s.setProperty('--text-y', state.textY);
 s.setProperty('--text-w', state.textW > 0 ? (state.textW / 10.24) + 'cqw' : 'auto');
 s.setProperty('--text-h', state.textH > 0 ? (state.textH / 10.24) + 'cqw' : 'auto');
 s.setProperty('--text-pad-x', (state.padX / 10.24) + 'cqw');
 s.setProperty('--text-pad-y', (state.padY / 10.24) + 'cqw');
 s.setProperty('--text-radius', ((state.rounded ? state.radius : 0) / 10.24) + 'cqw');
 s.setProperty('--text-color', state.textColor);
 s.setProperty('--text-blend', state.blend);
 s.setProperty('--text-bg', textBackground(state.textBg));
 s.setProperty('--text-bg-hover', hoverBackground(state.textBg));
 const hasLink = state.href.trim() !== '';
 link.classList.toggle('has-link', hasLink);
 if (hasLink) link.href = state.href; else link.removeAttribute('href');
 if (hasLink) link.target = state.target; else link.removeAttribute('target');
 if (hasLink && state.target === '_blank') link.rel = 'noopener'; else link.removeAttribute('rel');
 const lbl = (id, value) => {
	 const element = $(id);
	 if (element) element.value = value;
 };
 lbl('v-scale', state.scale); lbl('v-x', state.x); lbl('v-y', state.y);
 lbl('v-rw', state.ringWeight); lbl('v-abh', state.abHeight);
 lbl('v-pz', state.photoZoom); lbl('v-ppx', state.photoX); lbl('v-ppy', state.photoY);
 lbl('v-tsize', state.size); lbl('v-tx', state.textX); lbl('v-ty', state.textY);
 lbl('v-tw', state.textW || 'auto'); lbl('v-th', state.textH || 'auto');
 lbl('v-tpadx', state.padX); lbl('v-tpady', state.padY);
 emit();
}
function emit() {
 const hasLink = state.href.trim() !== '';
 const wrapperTag = hasLink ? 'a' : 'div';
 const showText = hasTextPlate();
 const textPlate = showText
  ? `\n<div class="halo__text halo__text-bg" aria-hidden="true" inert>${state.text}</div>`
   + `\n<div class="halo__text">${state.text}</div>`
  : '';
 /* no plate, no variables driving one */
 const textVars = showText ?
`
 --text-font: ${state.font};  --text-weight: ${state.weight};  --text-size: ${state.size};
 --text-x: ${state.textX};  --text-y: ${state.textY};
 --text-w: ${state.textW > 0 ? (state.textW/10.24).toFixed(3)+'cqw' : 'auto'};
 --text-h: ${state.textH > 0 ? (state.textH/10.24).toFixed(3)+'cqw' : 'auto'};
 --text-pad-x: ${(state.padX/10.24).toFixed(3)}cqw;  --text-pad-y: ${(state.padY/10.24).toFixed(3)}cqw;
 --text-radius: ${((state.rounded ? state.radius : 0)/10.24).toFixed(3)}cqw;
 --text-color: ${state.textColor};  --text-blend: ${state.blend};
 --text-bg: ${textBackground(state.textBg)};
 --text-bg-hover: ${hoverBackground(state.textBg)};` : '';
 out.textContent =
`<!-- HALO BANNER '${commentSafe(state.photoAlt)}' ${SCOPE_ID} -->
<div class="${SCOPE_CLASS}">
<style>
${scopedComponentCss(SCOPE_CLASS)}
</style>
<${wrapperTag} class="halo-banner-link${hasLink ? ' has-link' : ''}"${hasLink ? ` href="${state.href}"${state.target === '_blank' ? ' target="_blank" rel="noopener"' : ''}` : ''}>
<div class="halo-banner" style="
 --ab-h: ${state.abHeight};
 --banner-bg: ${state.bg};  --banner-image: ${state.bgImage ? `url(&quot;${state.bgImage}&quot;)` : 'none'};
 --banner-opacity: ${state.bgOpacity};  --banner-blend: ${state.bgBlend};
 --banner-radius: ${((state.bgRounded ? state.bgRadius : 0)/10.24).toFixed(3)}cqw;
 --scale: ${state.scale};  --x: ${state.x};  --y: ${state.y};
 --ring-weight: ${state.ringWeight};  --ring-color: ${state.ringColor};
 --photo-zoom: ${state.photoZoom};  --photo-x: ${state.photoX}%;  --photo-y: ${state.photoY}%;
 --hover-scale: ${state.hoverScale};${textVars}">
<figure class="halo">
<div class="halo__clip"><img class="halo__img" src="${escapeAttribute(state.photoImage)}" alt="${escapeAttribute(state.photoAlt)}"></div>
</figure>${textPlate}
</div>
</${wrapperTag}>
</div>
<!-- END HALO BANNER -->`;
}
/* ############################################################
  STANDALONE SVG EXPORT
  A second output format: one .svg file that carries its own
  geometry, colours and (where CORS allows) its own pixels, with
  no stylesheet and no external request.

  It works because the banner is already authored in artboard
  units - 1024 wide by --ab-h tall - and every CSS length in the
  component is either a percentage of that box or a cqw, which is
  1/100th of it. So `n cqw` is `n * 10.24` user units and the
  whole layout transfers without a scale factor.

  Three things do NOT transfer, by nature of the format:
   - hover (scale-up, text-bg swap) and the link wrapper. A file
     opened as an image has no interaction model.
   - Dax Pro. The glyphs stay live text with a font-family stack,
     so a machine without the font falls back to Segoe UI and the
     line breaks bake in below will no longer match its metrics.
   - images the browser is not allowed to read cross-origin. Those
     stay as <image href="https://..."> and the file is no longer
     self-contained; the caller is told which ones.
  ############################################################ */
function xmlText(value) {
 return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
async function toDataUri(url, missed) {
 const source = String(url).trim();
 if (!source || source.startsWith('data:')) return source;
 try {
  const response = await fetch(source, { mode: 'cors' });
  if (!response.ok) throw new Error(response.status);
  const blob = await response.blob();
  return await new Promise((resolve, reject) => {
   const reader = new FileReader();
   reader.onload = () => resolve(reader.result);
   reader.onerror = () => reject(reader.error);
   reader.readAsDataURL(blob);
  });
 }
 catch (error) {
  console.warn(`[halo] could not embed ${source} - left as a link`, error);
  missed.push(source);
  return source;
 }
}
/* SVG does not wrap text, so the wrap points have to be read off the DOM that
  already wrapped it. Walks the live preview character by character and cuts a
  new run wherever the baseline moves - which is every line break, and every
  <span> that changes the font. Each run then places itself absolutely, so
  runs sharing a line stay adjacent without any inline layout. */
function textRuns(unit, origin) {
 const metrics = document.createElement('canvas').getContext('2d');
 const walker = document.createTreeWalker(textEl, NodeFilter.SHOW_TEXT);
 const runs = [];
 for (let node; (node = walker.nextNode());) {
  const text = node.nodeValue;
  if (!text.trim()) continue;
  const style = getComputedStyle(node.parentElement);
  const fontSize = parseFloat(style.fontSize);
  metrics.font = `${style.fontStyle} ${style.fontWeight} ${fontSize}px ${style.fontFamily}`;
  const box = metrics.measureText('Hg');
  const ascent = box.fontBoundingBoxAscent || box.actualBoundingBoxAscent || fontSize * 0.8;
  const range = document.createRange();
  let run = null;
  for (let i = 0; i < text.length; i++) {
   const character = text[i];
   range.setStart(node, i);
   range.setEnd(node, i + 1);
   const rect = range.getBoundingClientRect();
   const blank = !rect.width && !rect.height;   /* collapsed at a wrap point */
   if (run && (blank || Math.abs(rect.top - run.top) < 0.5)) { run.text += character; continue; }
   /* Whitespace at the head of a line was collapsed to nothing by the browser.
      SVG collapses nothing, so a run that opened on one would indent its line
      by a space the preview never drew. Skip it and let the next glyph set
      both the run's text and its x. */
   if (/\s/.test(character)) { run = null; continue; }
   run = { top: rect.top, left: rect.left, text: character, fontSize, ascent, style };
   runs.push(run);
  }
 }
 return runs.map(run => ({
  x: (run.left - origin.left) * unit,
  y: (run.top - origin.top + run.ascent) * unit,
  size: run.fontSize * unit,
  weight: run.style.fontWeight,
  family: run.style.fontFamily,
  fill: run.style.color,
  text: run.text.replace(/\s+$/, '')
 }));
}
async function buildStandaloneSvg() {
 const missed = [];
 const round = value => Number(value.toFixed(3));
 const height = state.abHeight;
 const origin = scene.getBoundingClientRect();
 const unit = 1024 / origin.width;           /* preview px -> artboard units */
 /* --- halo. Same constants the component CSS carries: the outer edge is
    118.1759cqw = 1210.1213 units at scale 1, the clip is .95373 of it, and
    the border scales with the ring so `stroke` is just weight x scale. */
 const size = 1210.1213 * state.scale;
 const cx = 10.24 * state.x;
 const cy = height * state.y / 100;
 const stroke = state.ringWeight * state.scale;
 const clip = size * 0.95373;
 /* object-fit: cover, by hand. Scale the photo until it covers the circle's
    bounding square, park it per object-position, then apply the zoom about
    that same point the way transform-origin does. */
 const naturalW = img.naturalWidth || 1;
 const naturalH = img.naturalHeight || 1;
 const cover = Math.max(clip / naturalW, clip / naturalH);
 const photoW = naturalW * cover;
 const photoH = naturalH * cover;
 const anchorX = state.photoX / 100;
 const anchorY = state.photoY / 100;
 const boxX = cx - clip / 2;
 const boxY = cy - clip / 2;
 const zoomX = boxX + clip * anchorX;
 const zoomY = boxY + clip * anchorY;
 /* --- text. Measured, not computed: `auto` width and height only exist
    once the browser has laid the block out. An empty text box draws no
    plate here either - the preview has already hidden it. */
 const showText = hasTextPlate();
 const textBox = textEl.getBoundingClientRect();
 const runs = showText ? textRuns(unit, origin) : [];
 const [photoHref, bannerHref] = await Promise.all([
  toDataUri(state.photoImage.trim() || placeholderImage, missed),
  toDataUri(state.bgImage, missed)
 ]);
 const parts = [];
 if (bannerHref) parts.push(
  `<image x="0" y="0" width="1024" height="${round(height)}" preserveAspectRatio="xMidYMid slice" href="${escapeAttribute(bannerHref)}"/>`);
 parts.push(
  `<rect x="0" y="0" width="1024" height="${round(height)}" fill="${escapeAttribute(state.bg)}"`
  + ` fill-opacity="${parseFloat(state.bgOpacity) / 100}"`
  + (state.bgBlend === 'multiply' ? ' style="mix-blend-mode:multiply"' : '') + '/>');
 parts.push(
  `<g clip-path="url(#halo-photo-${SCOPE_ID})">`
  + `<g transform="translate(${round(zoomX)} ${round(zoomY)}) scale(${state.photoZoom}) translate(${round(-zoomX)} ${round(-zoomY)})">`
  + `<image x="${round(boxX + (clip - photoW) * anchorX)}" y="${round(boxY + (clip - photoH) * anchorY)}"`
  + ` width="${round(photoW)}" height="${round(photoH)}" preserveAspectRatio="none" href="${escapeAttribute(photoHref)}"/>`
  + '</g></g>');
 if (stroke > 0) parts.push(
  `<circle cx="${round(cx)}" cy="${round(cy)}" r="${round((size - stroke) / 2)}"`
  + ` fill="none" stroke="${escapeAttribute(state.ringColor)}" stroke-width="${round(stroke)}"/>`);
 if (showText && state.textBg !== 'transparent') parts.push(
  `<rect x="${round((textBox.left - origin.left) * unit)}" y="${round((textBox.top - origin.top) * unit)}"`
  + ` width="${round(textBox.width * unit)}" height="${round(textBox.height * unit)}"`
  + ` rx="${round(state.rounded ? state.radius : 0)}"`
  + ` fill="${escapeAttribute(state.textBg)}" fill-opacity="${parseFloat(state.textBgOpacity) / 100}"`
  + (state.blend === 'multiply' ? ' style="mix-blend-mode:multiply"' : '') + '/>');
 runs.forEach(run => parts.push(
  `<text x="${round(run.x)}" y="${round(run.y)}" xml:space="preserve"`
  + ` font-family="${escapeAttribute(run.family)}" font-size="${round(run.size)}" font-weight="${escapeAttribute(run.weight)}"`
  + ` fill="${escapeAttribute(run.fill)}">${xmlText(run.text)}</text>`));
 const radius = state.bgRounded ? state.bgRadius : 0;
 const svg =
`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 ${round(height)}" width="1024" height="${round(height)}" role="img">
<title>${xmlText(state.photoAlt || 'Halo banner')}</title>
<defs>
<clipPath id="halo-banner-${SCOPE_ID}"><rect x="0" y="0" width="1024" height="${round(height)}" rx="${round(radius)}"/></clipPath>
<clipPath id="halo-photo-${SCOPE_ID}"><circle cx="${round(cx)}" cy="${round(cy)}" r="${round(clip / 2)}"/></clipPath>
</defs>
<g clip-path="url(#halo-banner-${SCOPE_ID})" style="isolation:isolate">
${parts.join('\n')}
</g>
</svg>
`;
 return { svg, missed };
}
function bindInput(id, key, cast = Number, evt = 'input') {
 const el = $(id);
 el.addEventListener(evt, e => { state[key] = cast(e.target.value); render(); });
 el.value = state[key];
}
function bindSlider(id, key, valueId) {
 const slider = $(id);
 const value = $(valueId);
 /* .dcs-slider paints its filled portion from --fill rather than accent-color,
   so the track has to be told where the thumb is. Cosmetic only. */
 const paintFill = () => {
	 const min = Number(slider.min), max = Number(slider.max);
	 slider.style.setProperty('--fill', ((slider.value - min) / (max - min) * 100) + '%');
 };
 slider.value = state[key];
 paintFill();
 slider.addEventListener('input', () => { state[key] = Number(slider.value); paintFill(); render(); });
 const commit = () => {
	 if (value.value.trim() === '' || value.value === 'auto') return render();
	 state[key] = Number(value.value);
	 slider.value = state[key];
	 paintFill();
	 render();
 };
 value.addEventListener('keydown', event => {
	 if (event.key === 'Enter') { commit(); value.blur(); }
 });
 value.addEventListener('blur', commit);
}
function bindSelect(id, key) {
 const select = $(id);
 select.value = state[key];
 select.addEventListener('change', () => { state[key] = select.value; render(); });
 const label = root.querySelector(`label[data-custom-for="${id}"]`);
 const custom = document.createElement('input');
 custom.className = 'dcs-input';
 custom.hidden = true;
 custom.setAttribute('aria-label', `${label.textContent} custom value`);
 select.after(custom);
 label.addEventListener('click', () => {
	 const editing = custom.hidden;
	 custom.hidden = !editing;
	 select.hidden = editing;
	 if (editing) { custom.value = state[key]; custom.focus(); custom.select(); }
 });
 custom.addEventListener('keydown', event => {
	 if (event.key === 'Enter') { state[key] = custom.value; render(); custom.blur(); }
	 if (event.key === 'Escape') { custom.hidden = true; select.hidden = false; }
 });
}
[
 ['scale','scale','v-scale'], ['x','x','v-x'], ['y','y','v-y'],
 ['rw','ringWeight','v-rw'], ['abh','abHeight','v-abh'],
 ['pz','photoZoom','v-pz'], ['ppx','photoX','v-ppx'], ['ppy','photoY','v-ppy'],
 ['tsize','size','v-tsize'], ['tx','textX','v-tx'], ['ty','textY','v-ty'],
 ['tw','textW','v-tw'], ['th','textH','v-th'],
 ['tpadx','padX','v-tpadx'], ['tpady','padY','v-tpady']
].forEach(args => bindSlider(...args));
bindInput('ttext','text',String);
bindInput('lurl','href',String);
bindInput('bgurl','bgImage',String);
bindInput('purl','photoImage',String);
bindInput('palt','photoAlt',String);
[
 ['tfont','font'], ['tweight','weight'], ['tcolor','textColor'], ['tbg','textBg'],
 ['tbgo','textBgOpacity'], ['bg','bg'], ['rc','ringColor'], ['bgopacity','bgOpacity']
].forEach(args => bindSelect(...args));
$('tblend').checked = state.blend === 'multiply';
$('tblend').addEventListener('change', event => { state.blend = event.target.checked ? 'multiply' : 'normal'; render(); });
$('ltarget').checked = state.target === '_blank';
$('ltarget').addEventListener('change', event => { state.target = event.target.checked ? '_blank' : '_self'; render(); });
$('bgblend').checked = state.bgBlend === 'multiply';
$('bgblend').addEventListener('change', event => { state.bgBlend = event.target.checked ? 'multiply' : 'normal'; render(); });
$('bgrounded').checked = state.bgRounded;
$('bgrounded').addEventListener('change', event => { state.bgRounded = event.target.checked; render(); });
$('trad').checked = state.rounded;
$('trad').addEventListener('change', event => { state.rounded = event.target.checked; render(); });
$('copy').addEventListener('click', async event => {
 const label = event.currentTarget.querySelector('span');
 await navigator.clipboard.writeText(out.textContent);
 label.textContent = 'Copied';
 setTimeout(() => { label.textContent = 'Copy'; }, 1200);
});
$('svg').addEventListener('click', async event => {
 const button = event.currentTarget;
 const label = button.querySelector('span');
 const rest = label.textContent;
 button.disabled = true;
 label.textContent = 'Building';
 try {
  const { svg, missed } = await buildStandaloneSvg();
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `halo-banner-${SCOPE_ID}.svg`;
  anchor.click();
  URL.revokeObjectURL(url);
  label.textContent = missed.length ? `${missed.length} image linked` : 'Saved';
 }
 catch (error) {
  console.error('[halo] SVG export failed', error);
  label.textContent = 'Failed';
 }
 button.disabled = false;
 setTimeout(() => { label.textContent = rest; }, 2000);
});
$('toggle-code').addEventListener('click', event => {
 const showing = !$('code-view').hidden;
 $('code-view').hidden = showing;
 $('panel-controls').hidden = !showing;
 event.currentTarget.querySelector('span').textContent = showing ? 'Show code' : 'Hide code';
 event.currentTarget.setAttribute('aria-expanded', String(!showing));
});
const stageInner = root.querySelector('.halo-stage-inner');
const stageResizer = $('stage-resizer');
/* The rail and the gap beside it are outside the preview's own width, so the
  row measures wider than the preview is allowed to get. Subtract them or the
  preview can be dragged past the column it lives in. */
function maxStageWidth() {
 const row = stageInner.parentElement;
 const gap = parseFloat(getComputedStyle(row).columnGap) || 0;
 return row.clientWidth - stageResizer.getBoundingClientRect().width - gap;
}
stageResizer.addEventListener('pointerdown', event => {
 const startX = event.clientX;
 const startWidth = stageInner.getBoundingClientRect().width;
 const maxWidth = maxStageWidth();
 stageResizer.setPointerCapture(event.pointerId);
 stageResizer.classList.add('is-dragging');
 const resize = moveEvent => {
  const width = Math.min(maxWidth, Math.max(160, startWidth - (moveEvent.clientX - startX)));
  stageInner.style.width = width + 'px';
 };
 const stop = () => {
  stageResizer.classList.remove('is-dragging');
  stageResizer.removeEventListener('pointermove', resize);
  stageResizer.removeEventListener('pointerup', stop);
  stageResizer.removeEventListener('pointercancel', stop);
 };
 stageResizer.addEventListener('pointermove', resize);
 stageResizer.addEventListener('pointerup', stop);
 stageResizer.addEventListener('pointercancel', stop);
});
stageResizer.addEventListener('keydown', event => {
 if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
 event.preventDefault();
 const direction = event.key === 'ArrowLeft' ? 1 : -1;
 const maxWidth = maxStageWidth();
 const width = Math.min(maxWidth, Math.max(160, stageInner.getBoundingClientRect().width + direction * 10));
 stageInner.style.width = width + 'px';
});
link.addEventListener('click', e => e.preventDefault());
render();
}

waitForElement('[data-halo-generator] img.halo__img', image => {
	initGenerator(image.closest('[data-halo-generator]'));
});