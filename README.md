# ColaCompare

A mobile-friendly website for figuring out which soda purchase is the best deal. Enter (or scan) 2–5 products, such as a 6-pack of cans, a 12-pack, a 2 liter or a case of bottles, and ColaCompare ranks them by **cost per fluid ounce** and names a winner.

## Features

- **Compare up to 5 products.** Pick a common size (6/12/24/35-packs, 7.5 oz minis, 16.9 oz and 20 oz bottles, 1 L, 2 L…) or enter any container count and size in fl oz, mL or L.
- **Multi-buy deals.** "2 for $7" is entered as price `7`, packs `2`.
- **Winner and ranking.** Shows how much cheaper the winner is, how much more each other option costs per ounce, and the price each option would need to be to tie.
- **Three views.** Cost per oz, per 12 oz can, or per liter.
- **Barcode scanning.** Tap *Scan barcode* to use the phone camera. The product name and size are looked up from [Open Food Facts](https://world.openfoodfacts.org). Totals like "144 fl oz" are split into a likely pack (12 × 12 oz), and the app asks you to double-check it. You can also type the barcode number.
- **Remembers your data.** Your comparison and the prices you entered for scanned barcodes are saved in your browser only.
- **Installable.** Works as a home-screen app, and the page still opens with a weak signal after the first visit.

## Run it locally

It's a static site with no build step. Serve the folder with any web server:

```bash
python -m http.server 5173
```

Then open http://localhost:5173.

The camera works on `localhost`. On a phone the site must be served over **HTTPS**, because browsers only allow camera access on secure pages.

## Deploy (GitHub Pages)

1. Push to GitHub.
2. Go to **Settings → Pages**, set *Source* to "Deploy from a branch", and pick `main` / `(root)`.
3. Open `https://<your-user>.github.io/ColaCompare/` on your phone.

Any static host with HTTPS (Netlify, Cloudflare Pages, Vercel) works the same way.

## How barcode scanning works

- On Chrome for Android, the browser's built-in `BarcodeDetector` is used.
- On iPhone Safari, Firefox and desktop browsers, a WebAssembly build of ZXing ([barcode-detector](https://github.com/Sec-ant/barcode-detector)) is loaded from jsDelivr the first time it's needed.
- Supported formats: UPC-A, UPC-E, EAN-13 and EAN-8, which covers retail soda packaging.

Open Food Facts is community-maintained, so some US products are missing or have incomplete size data. When that happens the app keeps the barcode and asks you to pick the size.

## Tests

The price math and quantity parsing live in `js/calc.js` and have unit tests (Node 18+):

```bash
npm test
```

## Project layout

```
index.html            page markup and templates
css/styles.css        mobile-first styles (light and dark)
js/calc.js            pure math: units, cost per ounce, ranking, quantity parsing
js/lookup.js          Open Food Facts barcode lookup
js/scanner.js         camera + barcode detection
js/app.js             UI state, rendering, events
sw.js                 offline support (network-first)
manifest.webmanifest  home-screen install
tests/                unit tests for js/calc.js
```
