// Full-screen scanning mode: the screen you hold up for someone to scan.

import { renderInto, update } from '../qr.js';
import { displayName } from '../vcard.js';

let instance = null;
let card = null;
let mono = false;
let wakeLock = null;

function size() {
  const side = Math.min(window.innerWidth, window.innerHeight);
  return Math.max(220, Math.round(side - 120));
}

// Keeps the screen awake while the QR is up. Chrome on Android supports this; Safari
// does not, and there is no polyfill worth shipping — the QR is still perfectly usable.
async function acquireWakeLock() {
  if (!('wakeLock' in navigator)) return;
  try {
    wakeLock = await navigator.wakeLock.request('screen');
  } catch {
    wakeLock = null;
  }
}

function releaseWakeLock() {
  if (wakeLock) {
    wakeLock.release().catch(() => {});
    wakeLock = null;
  }
}

// The browser drops the wake lock whenever the tab is hidden, so re-take it on return.
document.addEventListener('visibilitychange', () => {
  const overlay = document.getElementById('present');
  if (!overlay || overlay.hidden) return;
  if (document.visibilityState === 'visible' && !wakeLock) acquireWakeLock();
});

export function openPresent(target) {
  card = target;
  mono = false;
  const overlay = document.getElementById('present');
  const host = document.getElementById('present-qr');
  const name = document.getElementById('present-name');
  const contrastBtn = document.getElementById('present-contrast');

  name.textContent = displayName(card) || card.title || '';
  overlay.hidden = false;
  instance = renderInto(host, card, { size: size(), mono });
  contrastBtn.textContent = 'Use plain black';

  acquireWakeLock();

  // Android and desktop support this; iOS Safari refuses for non-video elements, where
  // the fixed overlay already gives an edge-to-edge white background.
  if (document.documentElement.requestFullscreen) {
    document.documentElement.requestFullscreen().catch(() => {});
  }
}

export function closePresent() {
  const overlay = document.getElementById('present');
  if (!overlay || overlay.hidden) return;
  overlay.hidden = true;
  document.getElementById('present-qr').replaceChildren();
  instance = null;
  releaseWakeLock();
  if (document.fullscreenElement && document.exitFullscreen) {
    document.exitFullscreen().catch(() => {});
  }
}

export function initPresent() {
  const overlay = document.getElementById('present');
  const contrastBtn = document.getElementById('present-contrast');

  document.getElementById('present-close').addEventListener('click', closePresent);

  // A coloured or styled QR can be the difference between a scan and a shrug. This is the
  // one-tap escape hatch: plain black on white, which every scanner reads.
  contrastBtn.addEventListener('click', () => {
    if (!instance || !card) return;
    mono = !mono;
    update(instance, card, { size: size(), mono });
    contrastBtn.textContent = mono ? 'Use card colours' : 'Use plain black';
  });

  // Tapping the backdrop closes, but not taps on the QR or the buttons.
  overlay.addEventListener('click', (ev) => {
    if (ev.target === overlay) closePresent();
  });

  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') closePresent();
  });

  window.addEventListener('resize', () => {
    if (instance && card && !overlay.hidden) update(instance, card, { size: size(), mono });
  });
}
