// Pure math and parsing helpers. No DOM access, so it can be unit-tested in Node.

export const ML_PER_FL_OZ = 29.5735295625;

export const UNITS = {
  floz: { label: 'fl oz', toOz: 1 },
  ml: { label: 'mL', toOz: 1 / ML_PER_FL_OZ },
  l: { label: 'L', toOz: 1000 / ML_PER_FL_OZ },
};

// Common US soda formats. `size` is per container.
export const PRESETS = [
  { id: 'can12-6', label: '6-pack 12 oz cans', count: 6, size: 12, unit: 'floz' },
  { id: 'can12-12', label: '12-pack 12 oz cans', count: 12, size: 12, unit: 'floz' },
  { id: 'can12-24', label: '24-pack 12 oz cans', count: 24, size: 12, unit: 'floz' },
  { id: 'can12-35', label: '35-pack 12 oz cans', count: 35, size: 12, unit: 'floz' },
  { id: 'mini-10', label: '10-pack 7.5 oz mini cans', count: 10, size: 7.5, unit: 'floz' },
  { id: 'btl169-6', label: '6-pack 16.9 oz bottles', count: 6, size: 16.9, unit: 'floz' },
  { id: 'btl169-24', label: '24-pack 16.9 oz bottles', count: 24, size: 16.9, unit: 'floz' },
  { id: 'btl12-8', label: '8-pack 12 oz bottles', count: 8, size: 12, unit: 'floz' },
  { id: 'btl20-1', label: '20 oz bottle', count: 1, size: 20, unit: 'floz' },
  { id: 'btl20-6', label: '6-pack 20 oz bottles', count: 6, size: 20, unit: 'floz' },
  { id: 'l1', label: '1 liter bottle', count: 1, size: 1, unit: 'l' },
  { id: 'l125', label: '1.25 liter bottle', count: 1, size: 1.25, unit: 'l' },
  { id: 'l2', label: '2 liter bottle', count: 1, size: 2, unit: 'l' },
  { id: 'l2-3', label: '3-pack 2 liter bottles', count: 3, size: 2, unit: 'l' },
  { id: 'l3', label: '3 liter bottle', count: 1, size: 3, unit: 'l' },
];

export function toNumber(value) {
  if (typeof value === 'number') return value;
  if (value == null) return NaN;
  const cleaned = String(value).replace(/[$,\s]/g, '');
  return cleaned === '' ? NaN : Number(cleaned);
}

/** Total fluid ounces in an item, or NaN if incomplete. */
export function totalOunces({ count, size, unit }) {
  const c = toNumber(count);
  const s = toNumber(size);
  const u = UNITS[unit];
  if (!u || !(c > 0) || !(s > 0)) return NaN;
  return c * s * u.toOz;
}

/**
 * Price per fluid ounce for one item.
 * `deal` is how many packs the price buys (e.g. "2 for $7" => price 7, deal 2).
 */
export function pricePerOunce(item) {
  const price = toNumber(item.price);
  const deal = item.deal == null || item.deal === '' ? 1 : toNumber(item.deal);
  const oz = totalOunces(item);
  if (!(price >= 0) || !(deal > 0) || !(oz > 0)) return NaN;
  return price / deal / oz;
}

/**
 * Rank items by price per ounce (cheapest first). Incomplete items are
 * returned separately so the UI can tell the shopper what is missing.
 */
export function rankItems(items) {
  const complete = [];
  const incomplete = [];
  items.forEach((item, index) => {
    const ppo = pricePerOunce(item);
    if (Number.isFinite(ppo)) {
      complete.push({ item, index, ppo, oz: totalOunces(item) });
    } else {
      incomplete.push({ item, index });
    }
  });
  complete.sort((a, b) => a.ppo - b.ppo || a.index - b.index);

  const best = complete[0];
  const worst = complete[complete.length - 1];
  const ranked = complete.map((entry, rank) => {
    const deal = entry.item.deal == null || entry.item.deal === '' ? 1 : toNumber(entry.item.deal);
    return {
      ...entry,
      rank: rank + 1,
      // Tie with the winner (within a hundredth of a cent per oz) counts as a win.
      isWinner: Math.abs(entry.ppo - best.ppo) < 1e-4,
      // % more expensive per ounce than the winner.
      premiumPct: best.ppo > 0 ? (entry.ppo / best.ppo - 1) * 100 : 0,
      // What one pack would need to cost to tie the winner.
      priceToMatch: best.ppo * entry.oz,
      // Extra money spent per pack compared with buying the same volume of the winner.
      extraPerPack: (entry.ppo - best.ppo) * entry.oz,
      packPrice: toNumber(entry.item.price) / deal,
    };
  });

  return {
    ranked,
    incomplete,
    best: ranked[0] || null,
    // How much cheaper per ounce the best is than the worst.
    spreadPct: best && worst && worst.ppo > 0 ? (1 - best.ppo / worst.ppo) * 100 : 0,
  };
}

// ---------- Parsing product data from barcode lookups ----------

const UNIT_PATTERN = '(fl\\.?\\s*oz|fluid\\s*ounces?|oz|ounces?|ml|millilit(?:er|re)s?|cl|l|lit(?:er|re)s?|ltr)';
const NUM = '(\\d+(?:[.,]\\d+)?)';

function normalizeUnit(raw) {
  const u = raw.toLowerCase().replace(/[\s.]/g, '');
  if (u.startsWith('fl') || u.startsWith('fluid') || u.startsWith('oz') || u.startsWith('ounce')) return 'floz';
  if (u === 'ml' || u.startsWith('millilit')) return 'ml';
  if (u === 'cl') return 'cl';
  return 'l';
}

function num(raw) {
  return Number(String(raw).replace(',', '.'));
}

function sizeFrom(value, rawUnit) {
  const unit = normalizeUnit(rawUnit);
  if (unit === 'cl') return { size: value * 10, unit: 'ml' };
  return { size: value, unit };
}

// Sizes (in fl oz) that single soda containers commonly come in.
const COMMON_CONTAINER_OZ = [12, 16.9, 7.5, 8, 10, 16, 20, 24];

// Multipacks that are actually sold, used to split a total volume like
// "144 fl oz" into 12 x 12 oz. Kept narrow so a "2 L" (67.6 fl oz) bottle
// isn't mistaken for 9 mini cans.
const MULTIPACKS = [
  { oz: 12, counts: [6, 8, 10, 12, 15, 18, 20, 24, 30, 35, 36] },
  { oz: 16.9, counts: [6, 8, 12, 24, 32, 35] },
  { oz: 7.5, counts: [6, 8, 10, 12] },
  { oz: 8, counts: [6, 8, 12, 24] },
  { oz: 20, counts: [6, 8, 12, 24] },
];

/**
 * Parse a product description like "12 x 12 fl oz (355 ml)", "2 L",
 * "144 fl oz" plus an optional product name ("Coke 12 pack") into
 * { count, size, unit, guessed }. Returns null if nothing usable is found.
 */
export function parseQuantity(quantity, name = '') {
  const text = String(quantity || '');
  const multi = new RegExp(`(\\d+)\\s*[x×*]\\s*${NUM}\\s*${UNIT_PATTERN}\\b`, 'i').exec(text);
  if (multi) {
    return { count: Number(multi[1]), ...sizeFrom(num(multi[2]), multi[3]), guessed: false };
  }

  const single = new RegExp(`${NUM}\\s*${UNIT_PATTERN}\\b`, 'i').exec(text);
  const packMatch = /(\d+)\s*[- ]?\s*(?:pack|pk|ct|count|cans|bottles)\b/i.exec(`${name} ${text}`);
  const packCount = packMatch ? Number(packMatch[1]) : null;

  if (!single) {
    return packCount ? { count: packCount, size: NaN, unit: 'floz', guessed: true } : null;
  }

  const parsed = sizeFrom(num(single[1]), single[2]);
  const totalOz = parsed.size * UNITS[parsed.unit].toOz;

  // "12 pack" in the name alongside a volume: decide whether the volume is per
  // container or the whole pack.
  if (packCount && packCount > 1) {
    const perContainer = totalOz / packCount;
    const matchesCommon = COMMON_CONTAINER_OZ.some((oz) => Math.abs(oz - perContainer) < 0.3);
    if (matchesCommon) {
      return { count: packCount, size: round(perContainer, 1), unit: 'floz', guessed: true };
    }
    return { count: packCount, ...parsed, guessed: true };
  }

  // Only a total volume in fl oz (how US multipacks are labeled): if it
  // matches a real multipack size, guess that's what it is.
  if (parsed.unit === 'floz') {
    for (const { oz, counts } of MULTIPACKS) {
      const count = counts.find((c) => Math.abs(c * oz - totalOz) < 0.5);
      if (count) return { count, size: oz, unit: 'floz', guessed: true };
    }
  }
  return { count: 1, ...parsed, guessed: false };
}

/** Build the list of barcode variants to try (UPC-A vs EAN-13 padding). */
export function barcodeVariants(code) {
  const digits = String(code).replace(/\D/g, '');
  const variants = [digits];
  if (digits.length === 12) variants.push(`0${digits}`);
  if (digits.length === 13 && digits.startsWith('0')) variants.push(digits.slice(1));
  if (digits.length === 8) variants.push(digits.padStart(13, '0'));
  return [...new Set(variants)].filter(Boolean);
}

export function round(value, places = 2) {
  const f = 10 ** places;
  return Math.round(value * f) / f;
}
