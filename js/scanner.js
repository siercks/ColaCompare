// Camera barcode scanning. Uses the browser's native BarcodeDetector when it
// supports retail barcodes (Chrome on Android), otherwise lazy-loads a
// WebAssembly ZXing ponyfill (needed for iPhone Safari, Firefox, desktop).

const FORMATS = ['upc_a', 'upc_e', 'ean_13', 'ean_8'];
const PONYFILL_URL = 'https://cdn.jsdelivr.net/npm/barcode-detector@3.2.2/ponyfill/+esm';

let detectorPromise = null;

async function getDetector() {
  if (!detectorPromise) {
    detectorPromise = (async () => {
      if ('BarcodeDetector' in window) {
        try {
          const supported = await window.BarcodeDetector.getSupportedFormats();
          const formats = FORMATS.filter((f) => supported.includes(f));
          if (formats.length) return new window.BarcodeDetector({ formats });
        } catch {
          // fall through to the ponyfill
        }
      }
      const { BarcodeDetector } = await import(PONYFILL_URL);
      return new BarcodeDetector({ formats: FORMATS });
    })().catch((err) => {
      detectorPromise = null;
      throw err;
    });
  }
  return detectorPromise;
}

export function cameraSupported() {
  return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia) && window.isSecureContext;
}

export function explainCameraError(err) {
  if (!window.isSecureContext) return 'The camera only works over HTTPS. Open the site with an https:// address.';
  switch (err && err.name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'Camera permission was blocked. Allow camera access for this site in your browser settings, then try again.';
    case 'NotFoundError':
    case 'OverconstrainedError':
      return 'No camera was found on this device.';
    case 'NotReadableError':
      return 'The camera is busy in another app. Close it and try again.';
    default:
      return (err && err.message) || 'Could not start the camera.';
  }
}

/**
 * Start scanning into `video`. Calls onDetect(code) once, then stops.
 * Returns a controller with stop() and setTorch(on) / torchAvailable.
 */
export async function startScanner(video, { onDetect, onError }) {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      facingMode: { ideal: 'environment' },
      width: { ideal: 1280 },
      height: { ideal: 720 },
    },
  });

  let stopped = false;
  let timer = null;
  const track = stream.getVideoTracks()[0];

  const controller = {
    torchAvailable: false,
    stop() {
      stopped = true;
      clearTimeout(timer);
      stream.getTracks().forEach((t) => t.stop());
      video.srcObject = null;
    },
    async setTorch(on) {
      try {
        await track.applyConstraints({ advanced: [{ torch: on }] });
        return true;
      } catch {
        return false;
      }
    },
  };

  try {
    const caps = track.getCapabilities ? track.getCapabilities() : {};
    controller.torchAvailable = !!caps.torch;
    // Continuous focus helps a lot with close-up barcodes where supported.
    if (caps.focusMode && caps.focusMode.includes('continuous')) {
      track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] }).catch(() => {});
    }
  } catch {
    // capabilities are optional
  }

  video.srcObject = stream;
  video.setAttribute('playsinline', '');
  video.muted = true;
  await video.play();

  let detector;
  try {
    detector = await getDetector();
  } catch (err) {
    controller.stop();
    throw new Error('Could not load the barcode reader. Check your connection and try again.');
  }

  // Require the same code twice in a row to avoid misreads.
  let lastCode = null;
  const tick = async () => {
    if (stopped) return;
    try {
      if (video.readyState >= 2) {
        const results = await detector.detect(video);
        const code = results.find((r) => r.rawValue)?.rawValue;
        if (code && code === lastCode && !stopped) {
          controller.stop();
          onDetect(code);
          return;
        }
        lastCode = code || lastCode;
      }
    } catch (err) {
      if (onError) onError(err);
    }
    if (!stopped) timer = setTimeout(tick, 120);
  };
  tick();

  return controller;
}

// Warm up the detector (downloads the WASM on browsers that need it) so the
// first scan starts faster.
export function preloadDetector() {
  getDetector().catch(() => {});
}
