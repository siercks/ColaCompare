// The masthead wordmark, printed on a flat soda can or bottle lying on its
// side. Each page load picks a different color scheme inspired by familiar
// soda styles (no real names, logos or trademark shapes).

const STORAGE_KEY = 'colacompare:brand';

// body: can/label color · cola/compare: the two wordmark colors
// deco: one flat accent · accent: its color
// liquid: what shows through a bottle · cap: bottle cap color
export const PALETTES = [
  { id: 'classic', body: '#e11d2e', cola: '#ffffff', compare: '#1c1a16', deco: 'wave', accent: '#ffffff', liquid: '#3a1a0c', cap: '#e11d2e' },
  { id: 'diet', body: '#d9dcdf', cola: '#c8102e', compare: '#1c1a16', deco: 'pinstripe', accent: '#c8102e', liquid: '#3a1a0c', cap: '#c8102e' },
  { id: 'zero', body: '#151515', cola: '#ff3b3b', compare: '#ffffff', deco: 'band', accent: '#ff3b3b', liquid: '#2e1409', cap: '#151515' },
  { id: 'blue', body: '#0a2f86', cola: '#ffffff', compare: '#ff5b66', deco: 'wave', accent: '#ff5b66', liquid: '#2f170b', cap: '#0a2f86' },
  { id: 'lemon-lime', body: '#00853f', cola: '#fff34f', compare: '#ffffff', deco: 'wave', accent: '#fff34f', liquid: '#cde8b3', cap: '#00853f' },
  { id: 'citrus', body: '#0c4a20', cola: '#a8e63a', compare: '#ffffff', deco: 'slash', accent: '#e5242b', liquid: '#c4ee3f', cap: '#a8e63a' },
  { id: 'orange', body: '#e85d04', cola: '#ffffff', compare: '#0b2f7a', deco: 'dot', accent: '#f7872e', liquid: '#ffb24a', cap: '#0b2f7a' },
  { id: 'grape', body: '#56247f', cola: '#ffffff', compare: '#ffc928', deco: 'pinstripe', accent: '#ffc928', liquid: '#3f0f5c', cap: '#56247f' },
  { id: 'root-beer', body: '#4a2211', cola: '#f7e2b0', compare: '#ff8c1f', deco: 'pinstripe', accent: '#f7e2b0', liquid: '#231006', cap: '#ff8c1f' },
  { id: 'cherry-pepper', body: '#6b0d1d', cola: '#ffffff', compare: '#dcb46a', deco: 'band', accent: '#dcb46a', liquid: '#2a0a0b', cap: '#6b0d1d' },
  { id: 'ginger-ale', body: '#f2ead2', cola: '#0b5c39', compare: '#8a6212', deco: 'band', accent: '#0b5c39', liquid: '#e8c05a', cap: '#0b5c39' },
];

export const SHAPES = ['can', 'bottle'];

const METAL = '#c9ced4';
const METAL_DARK = '#a9b0b8';

// ---------- Geometry (viewBox 0 0 400 120) ----------

const CAN_BODY = 'M30 14H348C360 14 364 22 372 22V98C364 98 360 106 348 106H30Q18 106 18 94V26Q18 14 30 14Z';
const BOTTLE = 'M34 10H262C296 10 306 42 330 42H346V78H330C306 78 296 110 262 110H34Q14 110 14 90V30Q14 10 34 10Z';

// One flat accent in the free space around the wordmark.
// `area`: x0/x1 horizontal extent and top/bottom of the printable surface;
// textRight is where the wordmark ends.
function decoration(p, area) {
  const { x0, x1, top, bottom, textRight } = area;
  const w = x1 - x0;
  const a = p.accent;
  switch (p.deco) {
    case 'wave':
      return `<path d="M${x0 - 10} ${bottom - 9} Q${x0 + w * 0.25} ${bottom - 17} ${x0 + w * 0.5} ${bottom - 9} T${x1 + 10} ${bottom - 9} V${bottom + 10} H${x0 - 10}Z" fill="${a}"/>`;
    case 'band':
      return `<rect x="${x0 - 10}" y="${bottom - 9}" width="${w + 20}" height="20" fill="${a}"/>`;
    case 'pinstripe':
      return `<rect x="${x0 - 10}" y="${top + 5}" width="${w + 20}" height="2" fill="${a}"/>
        <rect x="${x0 - 10}" y="${bottom - 7}" width="${w + 20}" height="2" fill="${a}"/>`;
    case 'slash': {
      const s = Math.max(textRight + 8, x1 - 40);
      return `<path d="M${s + 8} ${top - 10}h11l-8 ${bottom - top + 20}h-11Z" fill="${a}"/>
        <path d="M${s + 24} ${top - 10}h5l-8 ${bottom - top + 20}h-5Z" fill="${p.cola}"/>`;
    }
    case 'dot':
      return `<circle cx="${x1 + 4}" cy="${(top + bottom) / 2}" r="${Math.min(40, x1 - textRight - 4)}" fill="${a}"/>`;
    default:
      return '';
  }
}

// Text is never squeezed: data-size/data-max let fitText() shrink the whole
// font evenly if a line is wider than the space available.
const word = ({ x, y, size, max, ls, cls, fill, content }) =>
  `<text class="${cls}" x="${x + ls / 2}" y="${y}" text-anchor="middle" font-size="${size}" letter-spacing="${ls}" data-size="${size}" data-max="${max}"${fill ? ` fill="${fill}"` : ''}>${content}</text>`;

function canSVG(p) {
  return `<svg viewBox="0 0 400 120" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false" style="stroke:none">
    <defs><clipPath id="bcid-clip"><path d="${CAN_BODY}"/></clipPath></defs>
    <rect x="12" y="20" width="12" height="80" rx="3" fill="${METAL}"/>
    <rect x="366" y="21" width="16" height="78" rx="3" fill="${METAL}"/>
    <rect x="375" y="21" width="2" height="78" fill="${METAL_DARK}"/>
    <g clip-path="url(#bcid-clip)">
      <rect width="400" height="120" fill="${p.body}"/>
      ${decoration(p, { x0: 18, x1: 372, top: 14, bottom: 106, textRight: 340 })}
      ${word({ x: 190, y: 77, size: 50, max: 300, ls: 1, cls: 'bc-cond', content: `<tspan fill="${p.cola}">COLA</tspan><tspan fill="${p.compare}">COMPARE</tspan>` })}
    </g>
  </svg>`;
}

function bottleSVG(p) {
  const ridges = [356, 365, 374].map((x) => `<rect x="${x}" y="37" width="2" height="46" fill="#000" opacity=".18"/>`).join('');
  return `<svg viewBox="0 0 400 120" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false" style="stroke:none">
    <defs>
      <clipPath id="bcid-clip"><path d="${BOTTLE}"/></clipPath>
      <clipPath id="bcid-label"><rect x="44" y="0" width="218" height="120"/></clipPath>
    </defs>
    <rect x="339" y="38" width="8" height="44" rx="2" fill="${p.liquid}"/>
    <rect x="346" y="35" width="38" height="50" rx="4" fill="${p.cap}"/>
    ${ridges}
    <g clip-path="url(#bcid-clip)">
      <rect width="400" height="120" fill="${p.liquid}"/>
      <rect x="296" y="0" width="60" height="120" fill="#fff" opacity=".2"/>
      <rect x="22" y="18" width="300" height="5" rx="2.5" fill="#fff" opacity=".22"/>
      <rect x="44" y="0" width="218" height="120" fill="${p.body}"/>
      <g clip-path="url(#bcid-label)">${decoration(p, { x0: 44, x1: 262, top: 10, bottom: 110, textRight: 222 })}</g>
    </g>
    ${word({ x: 153, y: 65, size: 62, max: 180, ls: 1, cls: 'bc-cond', fill: p.cola, content: 'COLA' })}
    ${word({ x: 153, y: 90, size: 20, max: 180, ls: 4.5, cls: 'bc-wide', fill: p.compare, content: 'COMPARE' })}
  </svg>`;
}

/** Shrink any wordmark line that is wider than its space (e.g. with a fallback font). */
function fitText(root) {
  root.querySelectorAll('text[data-max]').forEach((t) => {
    const size = Number(t.dataset.size);
    const max = Number(t.dataset.max);
    t.setAttribute('font-size', size);
    const width = t.getComputedTextLength();
    if (width > max) t.setAttribute('font-size', ((size * max) / width).toFixed(2));
  });
}

// ---------- Picking a style ----------

function readLast() {
  try { return localStorage.getItem(STORAGE_KEY) || ''; } catch { return ''; }
}

function writeLast(key) {
  try { localStorage.setItem(STORAGE_KEY, key); } catch { /* ignore */ }
}

function randomPick(lastKey) {
  const lastPalette = lastKey.split(':')[1];
  const choices = PALETTES.filter((p) => p.id !== lastPalette);
  const palette = choices[Math.floor(Math.random() * choices.length)];
  const shape = SHAPES[Math.floor(Math.random() * SHAPES.length)];
  return { palette, shape };
}

let uid = 0;

/** SVG markup for one style, with ids made unique so several can share a page. */
export function brandSVG(palette, shape) {
  const svg = shape === 'can' ? canSVG(palette) : bottleSVG(palette);
  uid += 1;
  return svg.replaceAll('bcid-', `bc${uid}-`);
}

function draw(el, { palette, shape }) {
  el.innerHTML = brandSVG(palette, shape);
  el.dataset.shape = shape;
  el.dataset.style = palette.id;
  fitText(el);
  writeLast(`${shape}:${palette.id}`);
}

/** Render a random style into `el`; tapping it shakes it and swaps to the next style. */
export function mountBrand(el) {
  let current = randomPick(readLast());
  draw(el, current);
  // Re-fit once the web fonts arrive, since their widths differ from the fallback.
  if (document.fonts) document.fonts.ready.then(() => fitText(el));

  el.addEventListener('click', () => {
    const i = PALETTES.indexOf(current.palette);
    current = {
      palette: PALETTES[(i + 1) % PALETTES.length],
      shape: current.shape === 'can' ? 'bottle' : 'can',
    };
    el.classList.remove('shake');
    void el.offsetWidth; // restart the animation
    el.classList.add('shake');
    setTimeout(() => draw(el, current), 180);
  });
}
