// Sharing and export. Web Share with files where the browser supports it, download
// everywhere else — iOS Safari and Android Chrome both support files, desktop often does not.

import { build, filename, displayName } from './vcard.js';
import { getBlob } from './qr.js';
import { downloadBlob, toast } from './ui.js';

function vcfFile(card) {
  const name = filename(card);
  // text/vcard is what iOS and Android both recognise as an importable contact.
  const blob = new Blob([build(card)], { type: 'text/vcard;charset=utf-8' });
  return { blob, name, file: new File([blob], name, { type: 'text/vcard' }) };
}

function canShareFiles(files) {
  return Boolean(navigator.canShare && navigator.share && navigator.canShare({ files }));
}

export async function shareContact(card) {
  const { blob, name, file } = vcfFile(card);
  const title = displayName(card) || card.title || 'Contact';
  if (canShareFiles([file])) {
    try {
      await navigator.share({ files: [file], title });
      return;
    } catch (err) {
      if (err && err.name === 'AbortError') return;   // user dismissed the sheet
      console.warn('Share failed, falling back to download.', err);
    }
  }
  downloadBlob(blob, name);
  toast('Contact file saved.');
}

export async function shareQrImage(card) {
  const blob = await getBlob(card, 'png', 1024);
  const name = filename(card).replace(/\.vcf$/, '.png');
  const file = new File([blob], name, { type: 'image/png' });
  const title = displayName(card) || card.title || 'QR code';
  if (canShareFiles([file])) {
    try {
      await navigator.share({ files: [file], title });
      return;
    } catch (err) {
      if (err && err.name === 'AbortError') return;
      console.warn('Share failed, falling back to download.', err);
    }
  }
  downloadBlob(blob, name);
  toast('QR image saved.');
}

export async function downloadQr(card, format) {
  const blob = await getBlob(card, format, 1024);
  const name = filename(card).replace(/\.vcf$/, `.${format}`);
  downloadBlob(blob, name);
  toast(`Saved ${name}`);
}

export function downloadVcf(card) {
  const { blob, name } = vcfFile(card);
  downloadBlob(blob, name);
  toast(`Saved ${name}`);
}
