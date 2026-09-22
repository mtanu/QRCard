// Backup, restore, theme, and the export buttons for the active card.

import {
  exportJson, importJson, getTheme, setTheme, storageUsage, getCard, getActiveId, reload,
} from '../store.js';
import { el, setAppBar, toast, downloadBlob, select } from '../ui.js';
import { downloadQr, downloadVcf, shareQrImage } from '../share.js';
import { applyTheme } from '../theme.js';
import '../version.js';

function exportSection() {
  const card = getCard(getActiveId());
  const guard = (fn) => () => {
    if (!card) { toast('No card selected.'); return; }
    Promise.resolve(fn(card)).catch((err) => toast(err.message));
  };

  return el('div', { class: 'section' }, [
    el('h3', { text: `Export "${card ? card.title || 'current card' : 'current card'}"` }),
    el('div', { class: 'stack', style: 'padding:0;gap:10px' }, [
      el('button', { class: 'btn', type: 'button', text: 'QR as PNG', onclick: guard((c) => downloadQr(c, 'png')) }),
      el('button', { class: 'btn', type: 'button', text: 'QR as SVG', onclick: guard((c) => downloadQr(c, 'svg')) }),
      el('button', { class: 'btn', type: 'button', text: 'Share QR image', onclick: guard(shareQrImage) }),
      el('button', { class: 'btn', type: 'button', text: 'Contact file (.vcf)', onclick: guard(downloadVcf) }),
    ]),
  ]);
}

function backupSection(rerender) {
  // Same reasoning as the logo picker: no accept filter, because a .json file in
  // Downloads or Drive can be unreachable behind one on mobile. The contents are
  // validated in importJson either way.
  const fileInput = el('input', { type: 'file', id: 'import-json', class: 'sr-only' });

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files && fileInput.files[0];
    fileInput.value = '';
    if (!file) return;
    const mode = confirm(
      'Add these cards to the ones already here?\n\nOK = add them\nCancel = replace everything',
    ) ? 'merge' : 'replace';
    try {
      const text = await file.text();
      const res = importJson(text, mode);
      if (!res.ok) { toast(res.message); return; }
      toast(`Imported ${res.count} card${res.count === 1 ? '' : 's'}.`);
      rerender();
    } catch (err) {
      toast(err.message || 'Could not read that file.');
    }
  });

  const usage = storageUsage();

  return el('div', { class: 'section' }, [
    el('h3', { text: 'Backup' }),
    el('div', { class: 'stack', style: 'padding:0;gap:10px' }, [
      el('button', {
        class: 'btn', type: 'button', text: 'Export all cards (.json)',
        onclick: () => {
          const stamp = new Date().toISOString().slice(0, 10);
          downloadBlob(new Blob([exportJson()], { type: 'application/json' }), `qrcard-backup-${stamp}.json`);
          toast('Backup saved.');
        },
      }),
      el('label', { class: 'btn', for: 'import-json', text: 'Import cards (.json)' }),
    ]),
    el('p', {
      class: 'hint',
      text: `Cards are stored only on this device (${usage.kb} KB used). Export a backup before clearing your browser data or moving to a new phone.`,
    }),
    fileInput,
  ]);
}

export function render(root, { navigate }) {
  const draw = () => {
    const themeRow = el('div', { class: 'field' }, [
      el('label', { text: 'Theme' }),
      select('theme', [['system', 'Match device'], ['light', 'Light'], ['dark', 'Dark']], getTheme(), (value) => {
        setTheme(value);
        applyTheme();
      }),
    ]);

    root.replaceChildren(el('div', { class: 'stack' }, [
      exportSection(),
      backupSection(() => { reload(); draw(); }),
      el('div', { class: 'section' }, [el('h3', { text: 'Appearance' }), themeRow]),
      el('div', { class: 'section' }, [
        el('h3', { text: 'About' }),
        el('p', { class: 'hint', text: 'QR Card encodes your details as a vCard. Anyone who scans it gets an Add Contact prompt — no app, no account, no network needed.' }),
        el('p', { class: 'hint', text: 'Everything runs in your browser and nothing leaves this device.' }),
        el('p', { class: 'hint', text: `Version ${self.APP_VERSION}` }),
      ]),
    ]));
  };

  draw();

  setAppBar({
    title: 'Settings',
    left: { label: 'Back', onClick: () => navigate('#/cards') },
  });
}
