// Barcode -> product info via the free Open Food Facts API.
import { barcodeVariants, parseQuantity } from './calc.js';

const API = 'https://world.openfoodfacts.org/api/v2/product/';
const FIELDS = 'code,product_name,brands,quantity,product_quantity,product_quantity_unit,image_front_small_url';

async function fetchProduct(code, signal) {
  const res = await fetch(`${API}${encodeURIComponent(code)}.json?fields=${FIELDS}`, { signal });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Lookup failed (${res.status})`);
  const data = await res.json();
  return data.status === 1 && data.product ? data.product : null;
}

/**
 * Look up a barcode. Resolves to
 * { code, name, image, quantityText, parsed } or null when not found.
 */
export async function lookupBarcode(code, { timeoutMs = 8000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    for (const variant of barcodeVariants(code)) {
      const product = await fetchProduct(variant, controller.signal);
      if (!product) continue;

      const brand = (product.brands || '').split(',')[0].trim();
      let name = (product.product_name || '').trim();
      if (brand && !name.toLowerCase().includes(brand.toLowerCase())) name = `${brand} ${name}`.trim();

      let quantityText = product.quantity || '';
      if (!quantityText && product.product_quantity && product.product_quantity_unit) {
        quantityText = `${product.product_quantity} ${product.product_quantity_unit}`;
      }

      return {
        code: variant,
        name: name || `Item ${variant}`,
        image: product.image_front_small_url || '',
        quantityText,
        parsed: parseQuantity(quantityText, name),
      };
    }
    return null;
  } finally {
    clearTimeout(timer);
  }
}
