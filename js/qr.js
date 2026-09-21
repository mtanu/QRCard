// Thin wrapper around the vendored qr-code-styling library. Nothing else in the app talks
// to that library directly, so swapping it out would only touch this file.

import { build } from './vcard.js';

export const DOT_STYLES = [
  ['square', 'Square'],
  ['dots', 'Dots'],
  ['rounded', 'Rounded'],
  ['extra-rounded', 'Extra'],
  ['classy', 'Classy'],
  ['classy-rounded', 'Classy+'],
];

export const EYE_FRAME_STYLES = [
  ['square', 'Square'],
  ['extra-rounded', 'Rounded'],
  ['dot', 'Circle'],
];

export const EYE_DOT_STYLES = [
  ['square', 'Square'],
  ['dot', 'Circle'],
];

export function normalizeHex(value, fallback = '#000000') {
  const v = String(value || '').trim();
  const m = /^#?([0-9a-f]{6})$/i.exec(v);
  if (m) return `#${m[1].toUpperCase()}`;
  const short = /^#?([0-9a-f]{3})$/i.exec(v);
  if (short) {
    const [r, g, b] = short[1].split('');
    return `#${(r + r + g + g + b + b).toUpperCase()}`;
  }
  return fallback;
}

export function isHex(value) {
  return /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.test(String(value || '').trim());
}

function channel(c) {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

function luminance(hex) {
  const h = normalizeHex(hex).slice(1);
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

// A camera needs real contrast between module and background to threshold the image.
// Below ~3:1 a QR starts failing at arm's length even though it looks fine on screen.
export function contrastRatio(a, b) {
  const l1 = luminance(a);
  const l2 = luminance(b);
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

export const MIN_CONTRAST = 3;

export function contrastWarning(card) {
  const ratio = contrastRatio(card.qrColor, card.qrBackground);
  if (ratio >= MIN_CONTRAST) return null;
  return `These colours are only ${ratio.toFixed(1)}:1 apart. Phones will struggle to scan this — darken the QR colour or lighten the background.`;
}

export const MAX_LOGO_SCALE = 0.22;

/**
 * Map a stored card onto qr-code-styling options. Every render path — the card deck, the
 * editor preview, present mode, PNG export, SVG export — goes through this one function,
 * so they cannot drift apart.
 *
 * @param {object} card
 * @param {{size?: number, mono?: boolean, type?: 'canvas'|'svg', data?: string}} opts
 */
export function optionsFor(card, opts = {}) {
  const size = opts.size || 280;
  const color = opts.mono ? '#000000' : normalizeHex(card.qrColor, '#000000');
  const background = opts.mono ? '#FFFFFF' : normalizeHex(card.qrBackground, '#FFFFFF');
  const logoScale = Math.min(Math.max(Number(card.logoScale) || 0.2, 0.08), MAX_LOGO_SCALE);

  return {
    width: size,
    height: size,
    type: opts.type || 'canvas',
    data: opts.data != null ? opts.data : build(card),
    image: card.logoDataUrl || undefined,
    // Roughly the 4-module quiet zone the spec asks for, at typical vCard QR versions.
    margin: Math.round(size * 0.05),
    qrOptions: {
      typeNumber: 0,          // auto-pick the smallest version that fits
      mode: 'Byte',
      // Always H. A vCard payload plus a centre logo plus a non-square module style all
      // eat into readability, and 30% recovery is what keeps the result scannable.
      errorCorrectionLevel: 'H',
    },
    imageOptions: {
      hideBackgroundDots: true,
      imageSize: logoScale,
      margin: Math.round(size * 0.012),
      crossOrigin: 'anonymous',
    },
    dotsOptions: { color, type: card.dotStyle || 'square' },
    backgroundOptions: { color: background },
    cornersSquareOptions: { color, type: card.eyeFrameStyle || 'square' },
    cornersDotOptions: { color, type: card.eyeDotStyle || 'square' },
  };
}

// The library floors the module size to a whole number of pixels, so a QR asked for at
// the exact display width can waste a quarter of it as slack. Render at a multiple and
// let CSS scale the result down: the rounding loss shrinks and the code stays crisp on
// high-density screens.
const RENDER_SCALE = 3;

function fitTo(element, logicalSize) {
  const drawn = element.querySelector('canvas, svg');
  if (!drawn) return;
  drawn.style.width = `${logicalSize}px`;
  drawn.style.height = `${logicalSize}px`;
}

function Lib() {
  if (typeof window === 'undefined' || !window.QRCodeStyling) {
    throw new Error('qr-code-styling failed to load. Check vendor/qr-code-styling.js is present.');
  }
  return window.QRCodeStyling;
}

/** Create an instance and attach it to a container element. */
export function renderInto(element, card, opts = {}) {
  const QRCodeStyling = Lib();
  const logical = opts.size || 280;
  const instance = new QRCodeStyling(optionsFor(card, { ...opts, size: logical * RENDER_SCALE }));
  element.replaceChildren();
  instance.append(element);
  fitTo(element, logical);
  instance.__host = element;   // our own handle, so update() never depends on library internals
  return instance;
}

/** Update an existing instance in place — cheaper and smoother than recreating it. */
export function update(instance, card, opts = {}) {
  const logical = opts.size || 280;
  instance.update(optionsFor(card, { ...opts, size: logical * RENDER_SCALE }));
  if (instance.__host) fitTo(instance.__host, logical);
  return instance;
}

/**
 * Render a card to a Blob. getRawData is async, and SVG needs its own instance type,
 * which is why this is a standalone helper rather than a method on a shared instance.
 */
export async function getBlob(card, format = 'png', size = 1024) {
  const QRCodeStyling = Lib();
  const instance = new QRCodeStyling(optionsFor(card, {
    size,
    type: format === 'svg' ? 'svg' : 'canvas',
  }));
  const blob = await instance.getRawData(format);
  if (!blob) throw new Error('Could not render the QR code.');
  return blob;
}
