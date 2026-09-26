import { PRESETS, ML_PER_FL_OZ, rankItems, totalOunces, pricePerOunce, toNumber, round } from './calc.js';
import { lookupBarcode } from './lookup.js';
import { startScanner, cameraSupported, explainCameraError, preloadDetector } from './scanner.js';

const MIN_ITEMS = 2;
const MAX_ITEMS = 5;
const START_ITEMS = 3;
const LETTERS = 'ABCDE';
const STORAGE_KEY = 'colacompare:v1';
const PRICE_MEMORY_KEY = 'colacompare:prices:v1';

const DISPLAY = {
  oz: { value: (ppo) => `${(ppo * 100).toFixed(2)}¢`, per: 'per fl oz', short: '/oz' },
  can: { value: (ppo) => money(ppo * 12), per: 'per 12 fl oz', short: '/12 oz' },
  liter: { value: (ppo) => money((ppo * 1000) / ML_PER_FL_OZ), per: 'per liter', short: '/L' },
};

// ---------- State ----------

let nextId = 1;
const blankItem = () => ({ id: nextId++, name: '', count: '', size: '', unit: 'floz', price: '', deal: '', code: '', note: '' });

const state = load() || { display: 'oz', items: Array.from({ length: START_ITEMS }, blankItem) };

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!saved || !Array.isArray(saved.items) || saved.items.length < MIN_ITEMS) return null;
    const items = saved.items.slice(0, MAX_ITEMS).map((it) => ({ ...blankItem(), ...it, id: nextId++ }));
    return { display: DISPLAY[saved.display] ? saved.display : 'oz', items };
  } catch {
    return null;
  }
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // storage unavailable (private mode etc.) — app still works
  }
}

function rememberPrice(code, price) {
  if (!code || !(toNumber(price) >= 0)) return;
  try {
    const memory = JSON.parse(localStorage.getItem(PRICE_MEMORY_KEY)) || {};
    memory[code] = price;
    localStorage.setItem(PRICE_MEMORY_KEY, JSON.stringify(memory));
  } catch {
    // ignore
  }
}

function recallPrice(code) {
  try {
    return (JSON.parse(localStorage.getItem(PRICE_MEMORY_KEY)) || {})[code] || '';
  } catch {
    return '';
  }
}

// ---------- Helpers ----------

const $ = (sel, root = document) => root.querySelector(sel);
const money = (n) => `$${n.toFixed(2)}`;
const fmtPpo = (ppo) => {
  const d = DISPLAY[state.display];
  return `${d.value(ppo)}${d.short}`;
};
const letterOf = (item) => LETTERS[state.items.indexOf(item)];
const labelOf = (item) => item.name.trim() || `Product ${letterOf(item)}`;

function fmtVolume(oz) {
  const liters = (oz * ML_PER_FL_OZ) / 1000;
  return `${round(oz, 1)} fl oz · ${liters >= 1 ? `${round(liters, 2)} L` : `${Math.round(liters * 1000)} mL`}`;
}

let toastTimer;
function toast(message) {
  const el = $('#toast');
  el.textContent = message;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 3500);
}

// ---------- Rendering ----------

const itemsEl = $('#items');
const template = $('#item-template');

function presetOptions(select) {
  for (const p of PRESETS) {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = p.label;
    select.append(opt);
  }
}

function renderItems() {
  itemsEl.replaceChildren(
    ...state.items.map((item, i) => {
      const li = template.content.firstElementChild.cloneNode(true);
      li.dataset.id = item.id;
      li.style.setProperty('--slot', `var(--slot-${i + 1})`);
      $('.cap', li).textContent = LETTERS[i];

      li.querySelectorAll('[data-field]').forEach((input) => {
        const field = input.dataset.field;
        input.id = `${field}-${item.id}`;
        if (field !== 'preset') input.value = item[field] ?? '';
      });
      li.querySelectorAll('label[data-for]').forEach((label) => {
        label.htmlFor = `${label.dataset.for}-${item.id}`;
      });
      $('.name', li).setAttribute('aria-label', `Product ${LETTERS[i]} name`);
      presetOptions($('.preset', li));

      const note = $('.scan-note', li);
      note.hidden = !item.note;
      note.textContent = item.note;

      const remove = $('.remove', li);
      remove.disabled = state.items.length <= MIN_ITEMS;
      remove.setAttribute('aria-label', `Remove product ${LETTERS[i]}`);
      return li;
    }),
  );

  const full = state.items.length >= MAX_ITEMS;
  $('#add-item').disabled = full;
  $('#add-label').textContent = full
    ? `Comparing ${MAX_ITEMS} of ${MAX_ITEMS}`
    : `Add a product · ${state.items.length} of ${MAX_ITEMS}`;

  updateResults();
}

let lastWinnerKey = '';

function updateResults() {
  const { ranked, incomplete, best } = rankItems(state.items);
  const hasVerdict = ranked.length >= 2;
  const winnerKey = hasVerdict ? ranked.filter((r) => r.isWinner).map((r) => r.item.id).join(',') : '';
  const winnerChanged = winnerKey !== lastWinnerKey;
  lastWinnerKey = winnerKey;

  // Per-tag unit price strip and sale-tag highlight.
  for (const item of state.items) {
    const li = itemsEl.querySelector(`[data-id="${item.id}"]`);
    if (!li) continue;
    const oz = totalOunces(item);
    const ppo = pricePerOunce(item);
    const entry = ranked.find((r) => r.item === item);

    $('.item-total', li).textContent = Number.isFinite(oz) ? fmtVolume(oz) : 'Qty × size needed';
    const ppoEl = $('.item-ppo', li);
    ppoEl.classList.toggle('is-pending', !Number.isFinite(ppo));
    if (Number.isFinite(ppo)) {
      const d = DISPLAY[state.display];
      ppoEl.innerHTML = `<span class="num">${d.value(ppo)}</span><span class="per">${d.per}</span>`;
    } else {
      ppoEl.textContent = Number.isFinite(oz) ? 'Needs price' : '';
    }

    const isWinner = !!(entry && entry.isWinner && hasVerdict);
    li.classList.toggle('is-winner', isWinner);
    if (winnerChanged) {
      li.classList.remove('stamp');
      if (isWinner) {
        void li.offsetWidth; // restart the stamp animation
        li.classList.add('stamp');
      }
    }
  }

  renderResults(ranked, incomplete, best);
  save();
}

function receiptHeader() {
  const now = new Date();
  const date = now.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  const time = now.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return `
    <div class="r-center">
      <div class="r-store">ColaCompare</div>
      <div class="r-meta">Price check · ${esc(date)} · ${esc(time)}</div>
    </div>
    <hr class="r-rule">`;
}

function renderResults(ranked, incomplete, best) {
  const body = $('#results-body');
  const bar = $('#winner-bar');

  if (ranked.length < 2) {
    const need = ranked.length === 0 ? 'at least two products' : 'one more product';
    body.innerHTML = `${receiptHeader()}
      <div class="r-empty"><strong>Waiting for prices</strong>Enter a size and shelf price for ${need} to print the verdict.</div>
      <hr class="r-rule">
      <div class="r-barcode" aria-hidden="true"></div>`;
    bar.hidden = true;
    return;
  }

  const winners = ranked.filter((r) => r.isWinner);
  const worst = ranked[ranked.length - 1];
  const allTied = winners.length === ranked.length;

  const rows = ranked.map((r) => {
    const slot = state.items.indexOf(r.item) + 1;
    const pct = Math.max(3, (r.ppo / worst.ppo) * 100);
    const verdict = r.isWinner
      ? '<span class="r-flag">★ Best buy</span>'
      : `+${Math.round(r.premiumPct)}% per oz · ties at <strong>${money(r.priceToMatch)}</strong>`;
    return `
      <li class="r-row${r.isWinner ? ' is-winner' : ''}" style="--slot: var(--slot-${slot})">
        <div class="r-line">
          <span class="r-name"><span class="cap small" aria-hidden="true">${LETTERS[slot - 1]}</span><span class="label">${esc(labelOf(r.item))}</span></span>
          <span class="r-dots" aria-hidden="true"></span>
          <span class="r-ppo">${fmtPpo(r.ppo)}</span>
        </div>
        <div class="r-sub">${money(r.packPrice)} · ${round(r.oz, 1)} fl oz</div>
        <div class="r-sub">${verdict}</div>
        <div class="r-bar" aria-hidden="true"><span style="width:${pct}%"></span></div>
      </li>`;
  }).join('');

  let savings;
  if (allTied) {
    savings = '<div class="r-save"><span class="r-save-label">All tied</span></div><div class="r-note">Every option costs the same per ounce. Buy whichever you like.</div>';
  } else {
    const worstCost = worst.ppo * best.oz;
    const saved = worstCost - best.packPrice;
    const pctLess = Math.round((1 - best.ppo / worst.ppo) * 100);
    savings = `
      <div class="r-save"><span class="r-save-label">You save</span><span class="r-save-amt">${money(saved)}</span></div>
      <div class="r-note">${round(best.oz, 1)} fl oz at the ${esc(labelOf(worst.item))} price would cost ${money(worstCost)}. That’s ${pctLess}% less per ounce.</div>`;
  }

  const missing = incomplete.length
    ? `<hr class="r-rule"><div class="r-missing">Not rung up: ${incomplete.map((m) => {
      const need = Number.isFinite(totalOunces(m.item)) ? 'needs price' : 'needs size';
      return `${esc(labelOf(m.item))} (${need})`;
    }).join(', ')}</div>`
    : '';

  body.innerHTML = `${receiptHeader()}
    <ol class="r-list">${rows}</ol>
    <hr class="r-rule double">
    ${savings}
    ${missing}
    <hr class="r-rule">
    <div class="r-center r-meta">Thank you for comparing</div>
    <div class="r-barcode" aria-hidden="true"></div>`;

  const barName = winners.length > 1
    ? `Tie: ${winners.map((w) => LETTERS[state.items.indexOf(w.item)]).join(' & ')}`
    : labelOf(best.item);
  bar.hidden = false;
  bar.innerHTML = `<span class="sb-flag">Best<br>buy</span><span class="sb-name">${esc(barName)}</span><span class="sb-ppo">${fmtPpo(best.ppo)}</span><span class="sb-go" aria-hidden="true">↓</span>`;
  bar.setAttribute('aria-label', `Best buy: ${barName}, ${fmtPpo(best.ppo)}. Jump to the verdict.`);
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function renderDisplayToggle() {
  document.querySelectorAll('#display-toggle [data-display]').forEach((btn) => {
    const on = btn.dataset.display === state.display;
    btn.setAttribute('aria-checked', String(on));
    btn.tabIndex = on ? 0 : -1;
  });
}

// ---------- Events ----------

const itemFor = (el) => state.items.find((it) => String(it.id) === el.closest('.item')?.dataset.id);

itemsEl.addEventListener('input', (e) => {
  const field = e.target.dataset.field;
  const item = itemFor(e.target);
  if (!item || !field || field === 'preset') return;
  item[field] = e.target.value;
  if (field === 'price') rememberPrice(item.code, item.price);
  updateResults();
});

itemsEl.addEventListener('change', (e) => {
  const item = itemFor(e.target);
  if (!item) return;
  if (e.target.dataset.field === 'unit') {
    item.unit = e.target.value;
    updateResults();
  }
  if (e.target.dataset.field === 'preset') {
    const preset = PRESETS.find((p) => p.id === e.target.value);
    if (!preset) return;
    const li = e.target.closest('.item');
    Object.assign(item, { count: String(preset.count), size: String(preset.size), unit: preset.unit });
    li.querySelector('[data-field="count"]').value = item.count;
    li.querySelector('[data-field="size"]').value = item.size;
    li.querySelector('[data-field="unit"]').value = item.unit;
    e.target.value = '';
    updateResults();
    const price = li.querySelector('[data-field="price"]');
    if (!price.value) price.focus();
  }
});

itemsEl.addEventListener('click', (e) => {
  const item = itemFor(e.target);
  if (!item) return;
  if (e.target.closest('.remove')) {
    if (state.items.length <= MIN_ITEMS) return;
    state.items.splice(state.items.indexOf(item), 1);
    renderItems();
  } else if (e.target.closest('.scan')) {
    openScanner(item);
  }
});

$('#add-item').addEventListener('click', () => {
  if (state.items.length >= MAX_ITEMS) return;
  const item = blankItem();
  state.items.push(item);
  renderItems();
  itemsEl.lastElementChild.scrollIntoView({ behavior: 'smooth', block: 'center' });
  itemsEl.lastElementChild.querySelector('.name').focus({ preventScroll: true });
});

$('#reset').addEventListener('click', () => {
  if (!confirm('Clear all products?')) return;
  state.items = Array.from({ length: START_ITEMS }, blankItem);
  renderItems();
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

const toggle = $('#display-toggle');
toggle.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-display]');
  if (!btn) return;
  state.display = btn.dataset.display;
  renderDisplayToggle();
  updateResults();
});
toggle.addEventListener('keydown', (e) => {
  if (!['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
  const keys = Object.keys(DISPLAY);
  const i = keys.indexOf(state.display);
  state.display = keys[(i + (e.key === 'ArrowRight' ? 1 : keys.length - 1)) % keys.length];
  renderDisplayToggle();
  toggle.querySelector(`[data-display="${state.display}"]`).focus();
  updateResults();
});

// ---------- Scanner ----------

const dialog = $('#scanner');
const video = $('#scanner-video');
const statusEl = $('#scanner-status');
const torchBtn = $('#scanner-torch');
let scanTarget = null;
let scanner = null;

function setStatus(text, isError = false) {
  statusEl.textContent = text;
  statusEl.classList.toggle('is-error', isError);
}

async function openScanner(item) {
  scanTarget = item;
  $('#manual-code').value = '';
  dialog.classList.remove('no-camera');
  dialog.showModal();

  if (!cameraSupported()) {
    dialog.classList.add('no-camera');
    setStatus(explainCameraError(null), true);
    return;
  }

  setStatus('Starting camera…');
  try {
    scanner = await startScanner(video, { onDetect: handleCode });
    if (!dialog.open) { scanner.stop(); return; }
    torchBtn.hidden = !scanner.torchAvailable;
    torchBtn.setAttribute('aria-pressed', 'false');
    setStatus('Point the camera at the barcode on the package.');
  } catch (err) {
    dialog.classList.add('no-camera');
    setStatus(err instanceof Error && err.name === 'Error' ? err.message : explainCameraError(err), true);
  }
}

function closeScanner() {
  if (scanner) scanner.stop();
  scanner = null;
  torchBtn.hidden = true;
  if (dialog.open) dialog.close();
}

dialog.addEventListener('close', () => {
  if (scanner) scanner.stop();
  scanner = null;
});
$('#scanner-close').addEventListener('click', closeScanner);

torchBtn.addEventListener('click', async () => {
  if (!scanner) return;
  const on = torchBtn.getAttribute('aria-pressed') !== 'true';
  if (await scanner.setTorch(on)) torchBtn.setAttribute('aria-pressed', String(on));
});

$('#manual-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const code = $('#manual-code').value.replace(/\D/g, '');
  if (code.length < 6) {
    setStatus('Enter the full number printed under the barcode.', true);
    return;
  }
  handleCode(code);
});

async function handleCode(code) {
  if (navigator.vibrate) navigator.vibrate(60);
  const item = scanTarget;
  if (scanner) scanner.stop();
  scanner = null;
  setStatus(`Found ${code}. Looking it up…`);

  let product = null;
  let failed = false;
  try {
    product = await lookupBarcode(code);
  } catch {
    failed = true;
  }
  closeScanner();
  if (!item || !state.items.includes(item)) return;

  item.code = code;
  if (product) {
    item.name = product.name;
    const p = product.parsed;
    if (p && Number.isFinite(p.size)) {
      item.count = String(p.count);
      item.size = String(p.size);
      item.unit = p.unit;
      item.note = p.guessed
        ? `Barcode says “${product.quantityText}”. Check the pack count and size.`
        : `Barcode says “${product.quantityText}”.`;
    } else if (p) {
      item.count = String(p.count);
      item.note = 'Found the product but not its size. Pick a size below.';
    } else {
      item.note = 'Found the product but not its size. Pick a size below.';
    }
  } else {
    item.note = failed
      ? `Scanned ${code} but couldn’t look it up (no connection?). Enter the details below.`
      : `No product info for ${code}. Enter the details below.`;
  }
  const remembered = recallPrice(code);
  if (remembered && !item.price) item.price = remembered;

  renderItems();
  const li = itemsEl.querySelector(`[data-id="${item.id}"]`);
  li.scrollIntoView({ behavior: 'smooth', block: 'center' });
  const priceInput = li.querySelector('[data-field="price"]');
  if (!priceInput.value) priceInput.focus({ preventScroll: true });
  toast(product ? `Added ${product.name}` : `Scanned ${code}`);
}

// ---------- Start ----------

renderDisplayToggle();
renderItems();

if (cameraSupported() && !('BarcodeDetector' in window)) {
  // Fetch the WASM reader in the background so the first scan is quick.
  if (window.requestIdleCallback) requestIdleCallback(preloadDetector, { timeout: 4000 });
  else setTimeout(preloadDetector, 1500);
}

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

// Hide the floating winner bar while the full results are on screen.
if ('IntersectionObserver' in window) {
  new IntersectionObserver(([entry]) => {
    document.body.classList.toggle('results-visible', entry.isIntersecting);
  }, { threshold: 0.15 }).observe($('#results'));
}
