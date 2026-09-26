import { test } from 'node:test';
import assert from 'node:assert/strict';
import { totalOunces, pricePerOunce, rankItems, parseQuantity, barcodeVariants, PRESETS } from '../js/calc.js';

const close = (a, b, eps = 1e-3) => assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`);

test('total ounces converts units', () => {
  close(totalOunces({ count: 12, size: 12, unit: 'floz' }), 144);
  close(totalOunces({ count: 1, size: 2, unit: 'l' }), 67.628);
  close(totalOunces({ count: 6, size: 500, unit: 'ml' }), 101.442);
  assert.ok(Number.isNaN(totalOunces({ count: '', size: 12, unit: 'floz' })));
  assert.ok(Number.isNaN(totalOunces({ count: 1, size: 12, unit: 'gallons' })));
});

test('price per ounce handles "$" and multi-buy deals', () => {
  close(pricePerOunce({ count: 12, size: 12, unit: 'floz', price: '$7.20' }), 0.05);
  // 2 for $7 twelve-packs => $3.50 each
  close(pricePerOunce({ count: 12, size: 12, unit: 'floz', price: '7', deal: '2' }), 3.5 / 144);
  assert.ok(Number.isNaN(pricePerOunce({ count: 12, size: 12, unit: 'floz', price: '' })));
  assert.ok(Number.isNaN(pricePerOunce({ count: 12, size: 12, unit: 'floz', price: '5', deal: '0' })));
});

test('ranking picks the cheapest per ounce and computes price to tie', () => {
  const items = [
    { name: '6-pack', count: 6, size: 12, unit: 'floz', price: '4.99' },   // 6.93¢/oz
    { name: '2 liter', count: 1, size: 2, unit: 'l', price: '2.49' },       // 3.68¢/oz
    { name: '12-pack', count: 12, size: 12, unit: 'floz', price: '7.99' },  // 5.55¢/oz
    { name: 'blank', count: '', size: '', unit: 'floz', price: '' },
  ];
  const { ranked, best, incomplete, spreadPct } = rankItems(items);
  assert.equal(best.item.name, '2 liter');
  assert.deepEqual(ranked.map((r) => r.item.name), ['2 liter', '12-pack', '6-pack']);
  assert.equal(incomplete.length, 1);
  assert.equal(ranked.filter((r) => r.isWinner).length, 1);
  close(ranked[1].priceToMatch, best.ppo * 144);
  assert.ok(spreadPct > 40 && spreadPct < 50);
});

test('equal prices per ounce tie', () => {
  const { ranked } = rankItems([
    { count: 12, size: 12, unit: 'floz', price: '6' },
    { count: 24, size: 12, unit: 'floz', price: '12' },
  ]);
  assert.ok(ranked.every((r) => r.isWinner));
});

test('parseQuantity reads common Open Food Facts formats', () => {
  assert.deepEqual(parseQuantity('12 x 12 fl oz (355 ml)'), { count: 12, size: 12, unit: 'floz', guessed: false });
  assert.deepEqual(parseQuantity('6 x 33 cl'), { count: 6, size: 330, unit: 'ml', guessed: false });
  assert.deepEqual(parseQuantity('2 L'), { count: 1, size: 2, unit: 'l', guessed: false });
  assert.deepEqual(parseQuantity('2 liters'), { count: 1, size: 2, unit: 'l', guessed: false });
  assert.deepEqual(parseQuantity('20 fl oz'), { count: 1, size: 20, unit: 'floz', guessed: false });
  assert.deepEqual(parseQuantity('1,25 l'), { count: 1, size: 1.25, unit: 'l', guessed: false });
  // total volume only: infer a 12-pack of 12 oz cans
  assert.deepEqual(parseQuantity('144 fl oz'), { count: 12, size: 12, unit: 'floz', guessed: true });
  // pack count in the product name plus total volume
  assert.deepEqual(parseQuantity('101.4 fl oz', 'Sprite 6 pack'), { count: 6, size: 16.9, unit: 'floz', guessed: true });
  // pack count in the name plus per-container volume
  assert.deepEqual(parseQuantity('12 fl oz', 'Pepsi 12 pack'), { count: 12, size: 12, unit: 'floz', guessed: true });
  assert.equal(parseQuantity(''), null);
  assert.equal(parseQuantity('12 large'), null);
});

test('barcode variants cover UPC-A/EAN-13 padding', () => {
  assert.deepEqual(barcodeVariants('049000028911'), ['049000028911', '0049000028911']);
  assert.deepEqual(barcodeVariants('0049000028911'), ['0049000028911', '049000028911']);
});

test('presets are all valid', () => {
  for (const p of PRESETS) assert.ok(totalOunces(p) > 0, p.id);
});

test('bottle volumes are not mistaken for multipacks', () => {
  assert.deepEqual(parseQuantity('67.6 fl oz'), { count: 1, size: 67.6, unit: 'floz', guessed: false });
  assert.deepEqual(parseQuantity('2 l'), { count: 1, size: 2, unit: 'l', guessed: false });
  assert.deepEqual(parseQuantity('3 L'), { count: 1, size: 3, unit: 'l', guessed: false });
  assert.deepEqual(parseQuantity('101.4 fl oz'), { count: 6, size: 16.9, unit: 'floz', guessed: true });
});
