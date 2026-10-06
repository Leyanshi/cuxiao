'use strict';

const $ = id => document.getElementById(id);
const WIDTH = 1050, HEIGHT = 1485;
const STORAGE_KEY = 'poster-workshop-v2';
const STYLES = [
  { id: 'promo', name: '经典促销', accent: '#e52939', bg: '#e52939', surface: '#ffffff', ink: '#232323', muted: '#888888', row: 'blocks' },
  { id: 'minimal', name: '极简留白', accent: '#262626', bg: '#ffffff', surface: '#ffffff', ink: '#242424', muted: '#999999', row: 'lines' },
  { id: 'dark', name: '黑金精选', accent: '#dcbb60', bg: '#202120', surface: '#292b28', ink: '#f5f5ee', muted: '#a3a49c', row: 'lines' },
  { id: 'fresh', name: '清新薄荷', accent: '#267d67', bg: '#eaf2ed', surface: '#ffffff', ink: '#253c32', muted: '#8c9f93', row: 'pills' },
  { id: 'tech', name: '科技蓝调', accent: '#286acc', bg: '#edf2fb', surface: '#ffffff', ink: '#222f47', muted: '#8793a7', row: 'blocks' },
  { id: 'sale', name: '醒目特惠', accent: '#e23448', bg: '#fff4dd', surface: '#fffdf6', ink: '#25231d', muted: '#a39476', row: 'lines' }
];
const PRESETS = {
  desktop: {
    store: '华硕豆豆电脑', title: '商品名称', badge: '促销', subtitle: '', price: '', description: '', footer: '',
    details: [
      { label: '处理器', value: 'AMD 锐龙 7 7800X 处理器（8 核心 16 线程）' },
      { label: '内存', value: '32GB DDR5 6000MT/s 双通道高速内存' },
      { label: '硬盘', value: '1TB PCIe4.0 高速固态硬盘（最高支持 4T+4T）' },
      { label: '显卡', value: 'RTX 4070 SUPER 12G 独立显卡' },
      { label: '主板', value: '华硕 TUF B650-PLUS 重炮手主板' },
      { label: '电源', value: '750W 金牌全模组电源' },
      { label: '散热', value: '240mm 一体式水冷散热器' },
      { label: '机箱', value: '华硕 TUF 电竞机箱（风扇加持，散热优秀）' }
    ]
  },
  laptop: {
    store: '华硕沂南豆豆店', title: '商品名称', badge: '促销', subtitle: '', price: '', description: '', footer: '',
    details: [
      { label: '处理器', value: 'AMD 锐龙 7H 255 处理器（8 核心 16 线程）' },
      { label: '内存', value: '32GB LPDDR5x 7500MT/s 双通道高速内存' },
      { label: '硬盘', value: '1TB PCIe4.0 高速固态硬盘（最高支持 4T+4T）' },
      { label: '屏幕', value: '3.2K 165Hz 16 英寸微边双认证全面屏' },
      { label: '显卡', value: 'RDNA3 架构 Radeon 780M 核显（接近独显）' },
      { label: '电池', value: '99.9Wh 大电池，140W 氮化镓速充' },
      { label: '键盘', value: '1.5mm 键程 · 十长效续航' }
    ]
  }
};
const clone = value => JSON.parse(JSON.stringify(value));
const defaults = () => ({ ...clone(PRESETS.desktop), style: 'promo', accent: '#e52939', currency: '¥', priceLabel: '价格', numbered: true, rowStyle: 'auto', textScale: 100, quality: 300, printLayout: 'four', image: '', imageCrop: 0 });
let data = defaults();
let loadedImage = null;
let imageGeneration = 0;
let imagePending = Promise.resolve();
let history = [], historyIndex = 0, historyTimer, saveTimer, renderFrame;
let storageAvailable = true;
let fontLoaded = false;
let fontPromise;

function sanitize(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('方案格式不正确');
  const result = defaults();
  const limits = { store: 40, title: 60, badge: 12, subtitle: 80, price: 16, description: 240, footer: 80, priceLabel: 12 };
  for (const [key, limit] of Object.entries(limits)) if (typeof input[key] === 'string') result[key] = input[key].slice(0, limit);
  if (STYLES.some(style => style.id === input.style)) result.style = input.style;
  result.accent = /^#[a-f\d]{6}$/i.test(input.accent) ? input.accent : STYLES.find(style => style.id === result.style).accent;
  if (['¥', '$', '€', ''].includes(input.currency)) result.currency = input.currency;
  if (typeof input.numbered === 'boolean') result.numbered = input.numbered;
  if (['auto', 'pills', 'lines', 'blocks'].includes(input.rowStyle)) result.rowStyle = input.rowStyle;
  result.textScale = Math.max(85, Math.min(115, Number(input.textScale) || 100));
  result.quality = Number(input.quality) === 150 ? 150 : 300;
  result.printLayout = input.printLayout === 'one' ? 'one' : 'four';
  result.imageCrop = Math.max(0, Math.min(25, Number(input.imageCrop) || 0));
  if (Array.isArray(input.details)) result.details = input.details.slice(0, 10).map(row => typeof row === 'string' ? { label: '', value: row.slice(0, 100) } : { label: String(row?.label ?? '').slice(0, 14), value: String(row?.value ?? '').slice(0, 100) });
  if (typeof input.image === 'string' && input.image.length < 6500000 && /^data:image\/(jpeg|png|webp);base64,/.test(input.image)) result.image = input.image;
  return result;
}

function toast(message) {
  $('toast').textContent = message;
  $('toast').hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { $('toast').hidden = true; }, 2700);
}
function status(message) { $('saveState').querySelector('span').textContent = message; }
function persist() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); storageAvailable = true; status('已自动保存'); }
  catch { storageAvailable = false; status('请保存方案'); }
}
function snapshot() {
  clearTimeout(historyTimer);
  const next = JSON.stringify(data);
  if (history[historyIndex] === next) return;
  history.splice(historyIndex + 1);
  history.push(next);
  if (history.length > 40) history.shift();
  historyIndex = history.length - 1;
  updateHistoryButtons();
}
function updateHistoryButtons() { $('undoBtn').disabled = historyIndex === 0; $('redoBtn').disabled = historyIndex === history.length - 1; }
function changed(immediate = false) {
  scheduleRender();
  clearTimeout(saveTimer);
  if (storageAvailable) status('正在保存…');
  saveTimer = setTimeout(persist, 350);
  clearTimeout(historyTimer);
  if (immediate) snapshot(); else historyTimer = setTimeout(snapshot, 450);
  updateHistoryButtons();
  $('undoBtn').disabled = false;
}
function restoreHistory(direction) {
  snapshot();
  const next = historyIndex + direction;
  if (next < 0 || next >= history.length) return;
  historyIndex = next;
  data = sanitize(JSON.parse(history[historyIndex]));
  syncUI();
  loadImage();
  persist();
  scheduleRender();
  updateHistoryButtons();
}

const fields = { storeInput: 'store', titleInput: 'title', badgeInput: 'badge', priceInput: 'price', subtitleInput: 'subtitle', descriptionInput: 'description', footerInput: 'footer', currencyInput: 'currency', priceLabelInput: 'priceLabel', rowStyleInput: 'rowStyle', qualityInput: 'quality', printLayoutInput: 'printLayout', accentInput: 'accent', textScale: 'textScale', imageCrop: 'imageCrop' };
for (const [id, key] of Object.entries(fields)) {
  $(id).addEventListener('input', event => {
    data[key] = ['quality', 'textScale', 'imageCrop'].includes(key) ? Number(event.target.value) : event.target.value;
    updateIndicators();
    changed();
  });
}
$('numberedInput').addEventListener('change', event => { data.numbered = event.target.checked; changed(); });
document.querySelectorAll('[data-tab]').forEach(button => button.addEventListener('click', () => {
  document.querySelectorAll('[data-tab]').forEach(tab => { const active = tab === button; tab.classList.toggle('active', active); tab.setAttribute('aria-selected', active); });
  $('contentPanel').hidden = button.dataset.tab !== 'content';
  $('appearancePanel').hidden = button.dataset.tab !== 'appearance';
}));
document.querySelectorAll('[data-preset]').forEach(button => button.addEventListener('click', () => {
  snapshot();
  Object.assign(data, clone(PRESETS[button.dataset.preset]));
  data.image = ''; data.imageCrop = 0;
  syncUI(); loadImage(); changed(true); toast('已载入参考内容');
}));

function setupDetails() {
  const wrap = $('detailsFields');
  wrap.replaceChildren();
  data.details.forEach((detail, index) => {
    const row = document.createElement('div'); row.className = 'detail-row';
    const number = document.createElement('span'); number.className = 'detail-number'; number.textContent = String(index + 1).padStart(2, '0');
    const inputs = document.createElement('div'); inputs.className = 'detail-inputs';
    for (const key of ['label', 'value']) {
      const input = document.createElement('input'); input.value = detail[key]; input.maxLength = key === 'label' ? 14 : 100;
      input.placeholder = key === 'label' ? '名称' : '参数内容'; input.setAttribute('aria-label', `第${index + 1}条${key === 'label' ? '参数名称' : '参数内容'}`);
      input.addEventListener('input', event => { data.details[index][key] = event.target.value; changed(); });
      inputs.append(input);
    }
    const remove = document.createElement('button'); remove.className = 'icon-button small'; remove.title = '删除参数'; remove.setAttribute('aria-label', `删除第${index + 1}条参数`);
    const icon = document.createElement('img'); icon.src = 'assets/icons/x.svg'; icon.alt = ''; remove.append(icon);
    remove.addEventListener('click', () => { snapshot(); data.details.splice(index, 1); setupDetails(); changed(true); });
    row.append(number, inputs, remove); wrap.append(row);
  });
  $('detailCount').textContent = `${data.details.length} / 10`;
  $('addDetail').disabled = data.details.length >= 10;
}
$('addDetail').addEventListener('click', () => {
  if (data.details.length >= 10) return;
  snapshot(); data.details.push({ label: '', value: '' }); setupDetails(); changed(true);
  $('detailsFields').lastElementChild.querySelector('input').focus();
});
function syncUI() {
  for (const [id, key] of Object.entries(fields)) $(id).value = data[key];
  $('numberedInput').checked = data.numbered;
  setupDetails(); updateIndicators();
  $('imageInput').value = '';
}
function updateIndicators() {
  const style = STYLES.find(item => item.id === data.style);
  $('currentStyleName').textContent = style.name;
  document.querySelectorAll('[data-style]').forEach(button => { const active = button.dataset.style === data.style; button.classList.toggle('active', active); button.setAttribute('aria-pressed', active); });
  document.querySelectorAll('.swatch').forEach(button => button.classList.toggle('active', button.dataset.color === data.accent));
  $('textScaleValue').textContent = `${data.textScale}%`;
  $('cropValue').textContent = `${data.imageCrop}%`;
  $('pixelDimensions').textContent = `${Math.round(105 / 25.4 * data.quality)} × ${Math.round(148.5 / 25.4 * data.quality)} 像素`;
  $('imageControls').hidden = !data.image;
  $('imageLabel').textContent = data.image ? '更换商品图片' : '选择商品图片';
}

function loadImage() {
  const generation = ++imageGeneration;
  loadedImage = null;
  if (!data.image) { scheduleRender(); imagePending = Promise.resolve(); return imagePending; }
  imagePending = new Promise(resolve => {
    const image = new Image();
    image.onload = () => { if (generation === imageGeneration) { loadedImage = image; scheduleRender(); } resolve(); };
    image.onerror = () => { if (generation === imageGeneration) { data.image = ''; updateIndicators(); toast('图片无法读取，请重新选择'); } resolve(); };
    image.src = data.image;
  });
  return imagePending;
}
$('uploadImage').addEventListener('click', () => $('imageInput').click());
$('clearImage').addEventListener('click', () => { snapshot(); data.image = ''; data.imageCrop = 0; loadImage(); updateIndicators(); changed(true); });
$('imageInput').addEventListener('change', async event => {
  const file = event.target.files[0]; if (!file) return;
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 25 * 1024 * 1024) { toast('请选择 25 MB 以内的 JPG、PNG 或 WebP 图片'); return; }
  try {
    const bitmap = await createImageBitmap(file);
    const factor = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const target = document.createElement('canvas'); target.width = Math.round(bitmap.width * factor); target.height = Math.round(bitmap.height * factor);
    target.getContext('2d').drawImage(bitmap, 0, 0, target.width, target.height); bitmap.close();
    snapshot(); data.image = target.toDataURL('image/png'); data.imageCrop = 0;
    if (data.image.length > 4000000) data.image = target.toDataURL('image/jpeg', .88);
    await loadImage(); syncUI(); changed(true); toast('已添加商品图片');
  } catch { toast('图片无法读取，请换一张图片'); }
});

function buildStylePicker() {
  for (const style of STYLES) {
    const button = document.createElement('button'); button.className = 'style-card'; button.dataset.style = style.id;
    button.title = style.name; button.setAttribute('aria-label', style.name);
    const thumb = document.createElement('canvas'); thumb.className = 'style-thumb'; thumb.width = 105; thumb.height = 149;
    const name = document.createElement('span'); name.className = 'style-name'; name.textContent = style.name;
    const check = document.createElement('img'); check.className = 'style-check'; check.src = 'assets/icons/check.svg'; check.alt = '';
    button.append(thumb, name, check);
    button.addEventListener('click', () => { snapshot(); data.style = style.id; data.accent = style.accent; $('accentInput').value = data.accent; updateIndicators(); changed(true); });
    $('stylePicker').append(button);
  }
  const colors = [['#e52939', '促销红'], ['#286acc', '科技蓝'], ['#267d67', '森林绿'], ['#dcbb60', '香槟金'], ['#8a4a85', '梅紫'], ['#262626', '石墨黑']];
  for (const [color, name] of colors) {
    const button = document.createElement('button'); button.className = 'swatch'; button.dataset.color = color; button.style.setProperty('--swatch', color); button.title = name; button.setAttribute('aria-label', name);
    button.addEventListener('click', () => { snapshot(); data.accent = color; $('accentInput').value = color; updateIndicators(); changed(true); });
    $('swatches').append(button);
  }
  renderThumbnails();
}
function renderThumbnails() {
  document.querySelectorAll('.style-thumb').forEach((canvas, index) => {
    const style = STYLES[index];
    const sample = { ...defaults(), style: style.id, accent: style.accent, title: '商品名称', price: '4999', store: '豆豆电脑', details: PRESETS.desktop.details.slice(0, 7), numbered: false };
    paint(canvas, sample, null);
  });
}

function scheduleRender() {
  if (renderFrame) return;
  renderFrame = requestAnimationFrame(() => { renderFrame = null; paint($('posterCanvas'), data, loadedImage); });
}
function font(ctx, size, weight = 500) { ctx.font = `${weight} ${size}px SourceHan, "Microsoft YaHei", sans-serif`; }
function rect(ctx, x, y, w, h, radius, fill, stroke, lineWidth = 1) {
  ctx.beginPath(); ctx.roundRect(x, y, w, h, radius);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lineWidth; ctx.stroke(); }
}
function wrapText(ctx, text, width) {
  const lines = [];
  for (const paragraph of String(text).split('\n')) {
    if (!paragraph) { lines.push(''); continue; }
    let line = '';
    for (const character of Array.from(paragraph)) {
      if (line && ctx.measureText(line + character).width > width) { lines.push(line.trimEnd()); line = character; }
      else line += character;
    }
    lines.push(line.trimEnd());
  }
  return lines;
}
function textBox(ctx, text, x, y, w, h, size, weight, color, align = 'left', vertical = 'middle') {
  if (!text) return;
  let lines, lineHeight;
  do { font(ctx, size, weight); lines = wrapText(ctx, text, w); lineHeight = size * 1.36; if (lines.length * lineHeight <= h) break; size -= 1; } while (size > 7);
  ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = 'top';
  const left = align === 'center' ? x + w / 2 : align === 'right' ? x + w : x;
  const top = y + (vertical === 'middle' ? Math.max(0, (h - lines.length * lineHeight) / 2) : 0);
  lines.forEach((line, index) => ctx.fillText(line, left, top + index * lineHeight, w));
}
function rgba(hex, alpha) { return `rgba(${parseInt(hex.slice(1, 3), 16)},${parseInt(hex.slice(3, 5), 16)},${parseInt(hex.slice(5, 7), 16)},${alpha})`; }
function contrast(hex) { return (parseInt(hex.slice(1, 3), 16) * .299 + parseInt(hex.slice(3, 5), 16) * .587 + parseInt(hex.slice(5, 7), 16) * .114) > 155 ? '#232522' : '#ffffff'; }
function drawPhoto(ctx, image, x, y, w, h, crop, surface) {
  rect(ctx, x, y, w, h, 8, surface);
  const sourceHeight = image.height * (1 - crop / 100);
  const scale = Math.min(w / image.width, h / sourceHeight);
  const iw = image.width * scale, ih = sourceHeight * scale;
  ctx.save(); ctx.beginPath(); ctx.roundRect(x, y, w, h, 8); ctx.clip();
  ctx.drawImage(image, 0, 0, image.width, sourceHeight, x + (w - iw) / 2, y + (h - ih) / 2, iw, ih); ctx.restore();
}

function paint(canvas, state, image) {
  const ctx = canvas.getContext('2d');
  ctx.save(); ctx.setTransform(canvas.width / WIDTH, 0, 0, canvas.height / HEIGHT, 0, 0);
  const style = STYLES.find(item => item.id === state.style) || STYLES[0];
  const accent = state.accent, ink = style.ink, muted = style.muted, dark = style.id === 'dark';
  const scale = state.textScale / 100;
  let x = 75, w = 900;
  ctx.fillStyle = style.id === 'promo' ? accent : style.bg; ctx.fillRect(0, 0, WIDTH, HEIGHT);
  if (style.id === 'promo') {
    rect(ctx, 26, 145, 998, 1314, 18, '#ffffff');
    textBox(ctx, state.badge, 50, 23, 240, 90, 57, 800, '#fff3ba');
    textBox(ctx, state.store, 320, 32, 660, 70, 34, 700, contrast(accent), 'right');
  } else if (style.id === 'minimal') {
    ctx.fillStyle = accent; ctx.fillRect(55, 60, 8, 70);
    textBox(ctx, state.store, 85, 55, 660, 45, 28, 650, ink);
    textBox(ctx, state.badge, 760, 57, 205, 43, 25, 700, accent, 'right');
    ctx.fillStyle = rgba(accent, .13); ctx.fillRect(75, 140, 900, 2);
  } else if (dark) {
    ctx.fillStyle = accent; ctx.fillRect(0, 0, WIDTH, 12);
    textBox(ctx, state.badge, 70, 45, 255, 60, 38, 750, accent);
    textBox(ctx, state.store, 345, 45, 630, 60, 29, 550, '#d4d4c8', 'right');
    rect(ctx, 35, 145, 980, 1305, 6, style.surface);
  } else if (style.id === 'fresh') {
    ctx.fillStyle = accent; ctx.fillRect(0, 0, WIDTH, 16);
    textBox(ctx, state.badge, 70, 44, 235, 55, 37, 750, accent);
    textBox(ctx, state.store, 330, 44, 645, 55, 29, 600, ink, 'right');
    rect(ctx, 30, 145, 990, 1310, 12, '#ffffff');
  } else if (style.id === 'tech') {
    ctx.fillStyle = accent; ctx.fillRect(0, 0, WIDTH, 135);
    textBox(ctx, state.badge, 70, 38, 235, 60, 42, 750, contrast(accent));
    textBox(ctx, state.store, 335, 38, 640, 60, 31, 650, contrast(accent), 'right');
    rect(ctx, 32, 162, 986, 1290, 8, '#ffffff');
    ctx.fillStyle = rgba(accent, .12); ctx.fillRect(75, 352, 900, 3);
  } else {
    rect(ctx, 58, 42, 212, 64, 0, accent);
    textBox(ctx, state.badge, 70, 42, 188, 64, 34, 800, contrast(accent), 'center');
    textBox(ctx, state.store, 300, 42, 675, 64, 30, 650, ink, 'right');
    ctx.fillStyle = accent; ctx.fillRect(60, 145, 930, 4);
  }
  const titleY = 200, titleWidth = image ? 625 : w;
  textBox(ctx, state.title, x, titleY, titleWidth, 134, 78 * scale, 850, ink, image || ['minimal', 'dark', 'sale'].includes(style.id) ? 'left' : 'center');
  const bodyStart = image ? 445 : state.subtitle ? 415 : 370;
  if (state.subtitle) textBox(ctx, state.subtitle, x, 336, titleWidth, 66, 29 * scale, 450, muted, image || ['minimal', 'dark', 'sale'].includes(style.id) ? 'left' : 'center');
  if (image) drawPhoto(ctx, image, 725, 194, 245, 210, state.imageCrop, style.surface);
  const hasDescription = !!state.description.trim();
  const descriptionHeight = hasDescription ? Math.min(210, 60 + Math.ceil(state.description.length / 39) * 27) : 0;
  const bodyEnd = 1170 - descriptionHeight;
  const rows = state.details.filter(row => row.label.trim() || row.value.trim());
  const rowMode = state.rowStyle === 'auto' ? style.row : state.rowStyle;
  const gap = rows.length >= 9 ? 12 : 18;
  const available = Math.max(100, bodyEnd - bodyStart);
  let rowFont = 32 * scale;
  let rowLayouts, totalHeight;
  const labelW = rows.some(row => row.label) ? 180 : 0;
  const numberW = state.numbered && !labelW ? 45 : 0;
  const valueW = w - labelW - numberW - (rowMode === 'blocks' ? 58 : 45);
  do {
    font(ctx, rowFont, 500);
    rowLayouts = rows.map(row => ({ row, lines: wrapText(ctx, row.value, valueW), height: Math.max(62, wrapText(ctx, row.value, valueW).length * rowFont * 1.3 + 25) }));
    totalHeight = rowLayouts.reduce((sum, row) => sum + row.height, 0) + Math.max(0, rows.length - 1) * gap;
    if (totalHeight <= available) break;
    rowFont -= 1;
  } while (rowFont > 12);
  const extra = rows.length ? Math.min(12, Math.max(0, available - totalHeight) / rows.length) : 0;
  let y = bodyStart;
  rowLayouts.forEach(({ row, height }, index) => {
    height += extra;
    const label = (state.numbered ? `${index + 1}. ` : '') + row.label;
    if (rowMode === 'pills') {
      rect(ctx, x, y, w, height, Math.min(height / 2, 28), dark ? null : '#ffffff', rgba(accent, .62), 1.8);
      if (labelW) textBox(ctx, label, x + 22, y + 8, labelW - 28, height - 16, rowFont * .87, 650, accent);
      else if (state.numbered) textBox(ctx, `${index + 1}.`, x + 20, y, 32, height, rowFont * .8, 650, accent);
    } else if (rowMode === 'blocks') {
      rect(ctx, x, y, w, height, 7, dark ? '#33372f' : rgba(accent, .055), rgba(accent, .16), 1);
      if (labelW) { rect(ctx, x, y, labelW, height, 7, accent); textBox(ctx, label, x + 12, y + 8, labelW - 24, height - 16, rowFont * .88, 700, contrast(accent), 'center'); }
      else if (state.numbered) textBox(ctx, `${index + 1}.`, x + 19, y, 35, height, rowFont * .85, 700, accent);
    } else {
      ctx.fillStyle = dark ? '#44473e' : rgba(accent, .16); ctx.fillRect(x, y + height, w, 1.5);
      if (labelW) textBox(ctx, label, x, y + 5, labelW - 20, height - 10, rowFont * .9, 650, accent);
      else if (state.numbered) textBox(ctx, `${index + 1}.`, x, y, 32, height, rowFont * .85, 650, accent);
    }
    textBox(ctx, row.value, x + labelW + numberW + (rowMode === 'lines' ? 0 : 20), y + 8, valueW, height - 16, rowFont, 500, ink);
    y += height + gap;
  });
  if (hasDescription) textBox(ctx, state.description, x + 8, 1180 - descriptionHeight, w - 16, descriptionHeight - 18, 25 * scale, 450, muted, 'left', 'middle');
  ctx.fillStyle = rgba(accent, dark ? .28 : .18); ctx.fillRect(x, 1204, w, 2);
  if (style.id === 'sale') { ctx.fillStyle = accent; ctx.fillRect(0, 1230, WIDTH, 162); }
  const priceColor = style.id === 'sale' ? contrast(accent) : accent;
  textBox(ctx, state.priceLabel, x + 5, 1238, 210, 132, 34 * scale, 650, style.id === 'sale' ? priceColor : ink);
  textBox(ctx, state.price ? state.currency + state.price : '到店询价', x + 220, 1222, w - 230, 152, (state.price ? 92 : 65) * scale, 850, priceColor, 'right');
  if (state.footer) textBox(ctx, state.footer, x, 1392, w, 51, 22, 450, muted, 'center');
  ctx.restore();
}

async function readyToExport() {
  await fontPromise;
  await imagePending;
  if (!fontLoaded) { toast('思源黑体尚未加载，请稍后重试'); return false; }
  return true;
}
function exportCanvas() {
  const output = document.createElement('canvas');
  output.width = Math.round(105 / 25.4 * data.quality);
  output.height = Math.round(148.5 / 25.4 * data.quality);
  paint(output, data, loadedImage); return output;
}
function download(blob, filename) {
  const url = URL.createObjectURL(blob), link = document.createElement('a');
  link.href = url; link.download = filename; link.click(); setTimeout(() => URL.revokeObjectURL(url), 3000);
}
function filename(extension) { return `${(data.title || '商品海报').replace(/[\\/:*?"<>|]/g, '_')}-竖版四分之一A4.${extension}`; }

// Add physical pixel density so print software can recover the intended paper size.
async function pngWithDpi(canvas, dpi) {
  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('图片导出失败');
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const chunk = new Uint8Array(21), view = new DataView(chunk.buffer);
  view.setUint32(0, 9); chunk.set([112, 72, 89, 115], 4);
  const ppm = Math.round(dpi / .0254); view.setUint32(8, ppm); view.setUint32(12, ppm); chunk[16] = 1;
  let crc = 0xffffffff;
  for (let i = 4; i < 17; i++) { crc ^= chunk[i]; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); }
  view.setUint32(17, (crc ^ 0xffffffff) >>> 0);
  return new Blob([bytes.slice(0, 33), chunk, bytes.slice(33)], { type: 'image/png' });
}
$('exportBtn').addEventListener('click', async () => {
  $('exportBtn').disabled = true;
  try { if (!await readyToExport()) return; snapshot(); persist(); const output = exportCanvas(); download(await pngWithDpi(output, data.quality), filename('png')); toast('图片已导出'); }
  catch { toast('导出失败，请重试'); }
  finally { $('exportBtn').disabled = false; }
});
$('printBtn').addEventListener('click', async () => {
  if (!await readyToExport()) return;
  const sheet = $('printSheet'); sheet.replaceChildren(); sheet.classList.toggle('single', data.printLayout === 'one');
  const url = exportCanvas().toDataURL('image/png');
  const images = [];
  for (let i = 0; i < (data.printLayout === 'four' ? 4 : 1); i++) { const image = new Image(); image.alt = ''; image.src = url; sheet.append(image); images.push(image.decode()); }
  await Promise.all(images); window.print();
});
$('saveProject').addEventListener('click', () => { download(new Blob([JSON.stringify({ version: 2, ...data }, null, 2)], { type: 'application/json' }), filename('json')); toast('方案已保存'); });
$('loadProject').addEventListener('click', () => $('projectInput').click());
$('projectInput').addEventListener('change', async event => {
  const file = event.target.files[0]; if (!file) return;
  if (file.size > 7 * 1024 * 1024) { toast('方案文件过大'); return; }
  try {
    const raw = JSON.parse(await file.text());
    if (!Array.isArray(raw.details) || typeof raw.title !== 'string') throw new Error('invalid');
    const next = sanitize(raw); snapshot(); data = next; await loadImage(); syncUI(); changed(true); toast('方案已打开');
  } catch { toast('无法打开，请选择海报方案文件'); }
  event.target.value = '';
});
$('undoBtn').addEventListener('click', () => restoreHistory(-1));
$('redoBtn').addEventListener('click', () => restoreHistory(1));
$('resetBtn').addEventListener('click', () => $('resetDialog').showModal());
$('cancelReset').addEventListener('click', () => $('resetDialog').close());
$('confirmReset').addEventListener('click', () => { snapshot(); data = defaults(); syncUI(); loadImage(); changed(true); $('resetDialog').close(); toast('已重置'); });
$('fullscreenBtn').addEventListener('click', async () => { if (!await readyToExport()) return; $('largePreview').src = exportCanvas().toDataURL('image/png'); $('previewDialog').showModal(); });
$('closePreview').addEventListener('click', () => $('previewDialog').close());
document.addEventListener('keydown', event => {
  if (!(event.ctrlKey || event.metaKey) || /^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName)) return;
  if (event.key.toLowerCase() === 'z') { event.preventDefault(); restoreHistory(event.shiftKey ? 1 : -1); }
});
try { const saved = localStorage.getItem(STORAGE_KEY); if (saved) data = sanitize(JSON.parse(saved)); }
catch { storageAvailable = false; }
buildStylePicker(); syncUI(); loadImage(); scheduleRender();
history = [JSON.stringify(data)]; updateHistoryButtons(); status(storageAvailable ? '已自动保存' : '请保存方案');
fontPromise = Promise.all([document.fonts.load('500 28px SourceHan'), document.fonts.load('850 78px SourceHan')]).then(() => {
  fontLoaded = document.fonts.check('500 28px SourceHan');
  $('fontState').textContent = fontLoaded ? '思源黑体 · 本地字体' : '字体加载失败';
  renderThumbnails(); scheduleRender();
}).catch(() => { $('fontState').textContent = '字体加载失败'; });
