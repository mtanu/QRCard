// Card editor: one scrolling form with a live QR preview pinned at the top.

import {
  getCard, saveCard, deleteCard, uid,
  PHONE_TYPES, EMAIL_TYPES, URL_TYPES, ADDRESS_TYPES,
} from '../store.js';
import {
  renderInto, update, normalizeHex, isHex, contrastWarning, payloadWarning, qrErrorMessage,
  DOT_STYLES, EYE_FRAME_STYLES, EYE_DOT_STYLES, MAX_LOGO_SCALE,
} from '../qr.js';
import { expandLink, handleOf } from '../links.js';
import { el, select, setAppBar, toast, debounce } from '../ui.js';

const MAX_LOGO_EDGE = 512;

// Fictional examples, in the shape each service's identifier actually takes.
const LINK_HINTS = {
  website: 'example.com', linkedin: 'ada-lovelace', x: 'adalovelace',
  instagram: 'ada.lovelace', facebook: 'ada.lovelace', youtube: 'adalovelace',
  tiktok: 'adalovelace', github: 'adalovelace', whatsapp: 'adalovelace',
};

/**
 * Shrink an uploaded logo before it is stored. Card data lives in localStorage, which is
 * a ~5MB budget for everything — a straight camera photo would blow it on its own.
 */
function processLogo(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read that file.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('That does not look like an image.'));
      img.onload = () => {
        const scale = Math.min(1, MAX_LOGO_EDGE / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);

        // Keep PNG only when the image actually uses transparency; otherwise JPEG is
        // several times smaller for the same visual result.
        let hasAlpha = false;
        try {
          const data = ctx.getImageData(0, 0, w, h).data;
          for (let i = 3; i < data.length; i += 4) {
            if (data[i] < 250) { hasAlpha = true; break; }
          }
        } catch {
          hasAlpha = true;
        }
        resolve(hasAlpha ? canvas.toDataURL('image/png') : canvas.toDataURL('image/jpeg', 0.85));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function textField(label, value, onInput, opts = {}) {
  const input = el('input', {
    type: opts.type || 'text',
    value: value || '',
    placeholder: opts.placeholder || '',
    autocomplete: opts.autocomplete || 'off',
    autocapitalize: opts.autocapitalize || 'sentences',
  });
  input.addEventListener('input', () => onInput(input.value));
  return el('div', { class: 'field' }, [el('label', { text: label }), input]);
}

/**
 * A repeatable section (phones, emails, links): a type dropdown, a value, a remove button,
 * and an add button underneath.
 *
 * `placeholder` may be a string or a function of the row, so the hint can follow the
 * selected type. `normalize` rewrites the row's value when the field loses focus — links
 * use it to expand a bare handle into a full URL where the user can see the result.
 */
function repeatSection({
  title, rows, types, placeholder, inputType, addLabel, onChange,
  normalize, onTypeChange, hint,
}) {
  const list = el('div', { class: 'repeat' });

  const drawRow = (row) => {
    const input = el('input', {
      type: inputType || 'text',
      value: row.value || '',
      autocapitalize: 'none',
      autocomplete: 'off',
    });
    input.addEventListener('input', () => { row.value = input.value; onChange(); });

    const syncRow = () => {
      input.value = row.value || '';
      input.placeholder = typeof placeholder === 'function' ? placeholder(row) : (placeholder || '');
    };

    // 'change' rather than 'blur': it only fires when the value actually changed, so
    // tabbing through a field they never touched leaves it exactly as they left it.
    if (normalize) {
      input.addEventListener('change', () => { normalize(row); syncRow(); onChange(); });
    }

    const node = el('div', { class: 'repeat__row' }, [
      select('type', types, row.type, (value) => {
        const previous = row.type;
        row.type = value;
        if (onTypeChange) onTypeChange(row, previous);
        syncRow();
        onChange();
      }),
      input,
      el('button', {
        class: 'iconbtn', type: 'button', 'aria-label': `Remove ${title}`, text: '×',
        onclick: () => {
          const i = rows.indexOf(row);
          if (i > -1) rows.splice(i, 1);
          node.remove();
          onChange();
        },
      }),
    ]);
    syncRow();
    return node;
  };

  rows.forEach((row) => list.append(drawRow(row)));

  const add = el('button', {
    class: 'btn btn--sm', type: 'button', text: addLabel,
    onclick: () => {
      const row = { id: uid('r'), type: types[0][0], value: '' };
      rows.push(row);
      list.append(drawRow(row));
      onChange();
    },
  });

  return el('div', { class: 'section' }, [
    el('h3', { text: title }),
    list,
    el('div', { style: 'margin-top:10px' }, [add]),
    ...(hint ? [el('p', { class: 'hint', text: hint })] : []),
  ]);
}

function addressSection(card, onChange) {
  const list = el('div', { class: 'repeat' });

  const drawRow = (row) => {
    const part = (key, label) => {
      const input = el('input', { type: 'text', value: row[key] || '', placeholder: label });
      input.addEventListener('input', () => { row[key] = input.value; onChange(); });
      return input;
    };
    const node = el('div', { class: 'adr' }, [
      el('div', { class: 'adr__head' }, [
        select('type', ADDRESS_TYPES, row.type, (value) => { row.type = value; onChange(); }),
        el('button', {
          class: 'iconbtn', type: 'button', 'aria-label': 'Remove address', text: '×',
          onclick: () => {
            const i = card.addresses.indexOf(row);
            if (i > -1) card.addresses.splice(i, 1);
            node.remove();
            onChange();
          },
        }),
      ]),
      part('street', 'Street'),
      el('div', { class: 'grid2' }, [part('city', 'City'), part('region', 'State / region')]),
      el('div', { class: 'grid2' }, [part('postalCode', 'Postal code'), part('country', 'Country')]),
    ]);
    return node;
  };

  card.addresses.forEach((row) => list.append(drawRow(row)));

  const add = el('button', {
    class: 'btn btn--sm', type: 'button', text: '+ Add address',
    onclick: () => {
      const row = { id: uid('a'), type: 'work', street: '', city: '', region: '', postalCode: '', country: '' };
      card.addresses.push(row);
      list.append(drawRow(row));
      onChange();
    },
  });

  return el('div', { class: 'section' }, [
    el('h3', { text: 'Address' }), list, el('div', { style: 'margin-top:10px' }, [add]),
  ]);
}

/** A colour swatch paired with a hex box; either one updates the other. */
function colorField(label, value, onChange) {
  const swatch = el('input', { type: 'color', value: normalizeHex(value), 'aria-label': label });
  const hex = el('input', { type: 'text', class: 'hexinput', value: normalizeHex(value), maxlength: '7', spellcheck: 'false' });

  swatch.addEventListener('input', () => {
    hex.value = normalizeHex(swatch.value);
    onChange(hex.value);
  });
  hex.addEventListener('input', () => {
    if (!isHex(hex.value)) return;      // let them finish typing before reacting
    const next = normalizeHex(hex.value);
    swatch.value = next;
    onChange(next);
  });
  hex.addEventListener('blur', () => { hex.value = normalizeHex(hex.value, swatch.value); });

  return el('div', { class: 'field' }, [
    el('label', { text: label }),
    el('div', { class: 'swatches' }, [swatch, hex]),
  ]);
}

/**
 * Style pickers are a row of little rendered QRs rather than a dropdown — the choice is
 * visual, so it should be made visually.
 */
function stylePicker({ title, options, current, card, key, onChange, note }) {
  const grid = el('div', { class: 'stylegrid' });
  const buttons = [];

  options.forEach(([value, label]) => {
    const thumbHost = el('div');
    const button = el('button', {
      class: 'styleopt',
      type: 'button',
      'aria-pressed': String(value === current),
      onclick: () => {
        card[key] = value;
        buttons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.value === value)));
        onChange();
      },
    }, [thumbHost, el('span', { text: label })]);
    button.dataset.value = value;

    // Sample payload, not the real vCard: the thumbnail only has to show the shape.
    try {
      renderInto(thumbHost, { ...card, [key]: value, logoDataUrl: null, qrColor: '#000000', qrBackground: '#FFFFFF' }, { size: 96, data: 'QR CARD' });
    } catch { /* library missing — the label alone still works */ }

    buttons.push(button);
    grid.append(button);
  });

  return el('div', { class: 'section' }, [
    el('h3', { text: title }),
    grid,
    note ? el('p', { class: 'hint', text: note }) : null,
  ]);
}

function logoSection(card, onChange) {
  const preview = el('div', { class: 'logo-preview' });
  const warn = el('p', { class: 'hint' });

  const draw = () => {
    preview.replaceChildren();
    if (card.logoDataUrl) {
      preview.append(
        el('img', { src: card.logoDataUrl, alt: 'Logo preview' }),
        el('button', {
          class: 'btn btn--sm btn--danger', type: 'button', text: 'Remove logo',
          onclick: () => { card.logoDataUrl = null; draw(); onChange(); },
        }),
      );
      warn.textContent = `Covering ${Math.round(card.logoScale * 100)}% of the code. Scan it before you rely on it.`;
    } else {
      preview.append(el('p', { class: 'hint', text: 'No logo. The QR is easiest to scan without one.' }));
      warn.textContent = '';
    }
  };

  // accept="image/*" limits the picker to images. On Android that means the system photo
  // picker; files outside the gallery are reached from its menu. The filter is only a
  // hint, so anything that is not a decodable image is still rejected below.
  const inputId = `logo-${card.id}`;
  const input = el('input', { type: 'file', accept: 'image/*', id: inputId, class: 'sr-only' });
  input.addEventListener('change', async () => {
    const file = input.files && input.files[0];
    input.value = '';
    if (!file) return;
    try {
      card.logoDataUrl = await processLogo(file);
      draw();
      onChange();
    } catch (err) {
      toast(err.message);
    }
  });

  const sizeInput = el('input', {
    type: 'range', min: '8', max: String(Math.round(MAX_LOGO_SCALE * 100)), step: '1',
    value: String(Math.round(card.logoScale * 100)), 'aria-label': 'Logo size',
  });
  sizeInput.addEventListener('input', () => {
    card.logoScale = Number(sizeInput.value) / 100;
    draw();
    onChange();
  });

  draw();

  return el('div', { class: 'section' }, [
    el('h3', { text: 'Logo' }),
    preview,
    el('div', { style: 'margin-top:12px' }, [
      // A label rather than a scripted input.click(): no JS, works everywhere.
      el('label', { class: 'btn btn--sm', for: inputId, text: 'Choose image' }),
    ]),
    el('p', { class: 'hint', text: 'PNG, JPG, WebP or SVG. It is shrunk to 512px before being stored.' }),
    el('div', { class: 'field', style: 'margin-top:12px' }, [el('label', { text: 'Logo size' }), sizeInput]),
    warn,
    input,
  ]);
}

export function render(root, { navigate, params }) {
  const source = getCard(params.id);
  if (!source) {
    root.replaceChildren(el('p', { class: 'empty', text: 'That card no longer exists.' }));
    setAppBar({ title: 'Edit', left: { label: 'Back', onClick: () => navigate('#/') } });
    return;
  }

  // Work on a copy so Cancel really cancels.
  const card = structuredClone(source);

  const previewHost = el('div');
  const warnNode = el('div');
  let preview = null;

  const refresh = debounce(() => {
    try {
      if (preview) update(preview, card, { size: 220 });
      else preview = renderInto(previewHost, card, { size: 220 });
    } catch (err) {
      previewHost.replaceChildren(el('p', { class: 'empty', text: qrErrorMessage(err, card) }));
    }
    const messages = [contrastWarning(card), payloadWarning(card)].filter(Boolean);
    warnNode.replaceChildren(...messages.map((m) => el('p', { class: 'warn', text: m })));
  }, 150);

  const onChange = () => refresh();

  const body = el('div', { class: 'stack' }, [
    el('div', { class: 'previewwrap' }, [previewHost]),
    warnNode,

    el('div', { class: 'section' }, [
      el('h3', { text: 'Card' }),
      textField('Card title', card.title, (v) => { card.title = v; onChange(); }, { placeholder: 'Ada @ Example Co' }),
      el('p', { class: 'hint', text: 'Shown above the details on the card screen. Not part of the contact.' }),
    ]),

    el('div', { class: 'section' }, [
      el('h3', { text: 'Name' }),
      el('div', { class: 'grid2' }, [
        textField('First name', card.firstName, (v) => { card.firstName = v; onChange(); }, { autocapitalize: 'words' }),
        textField('Last name', card.lastName, (v) => { card.lastName = v; onChange(); }, { autocapitalize: 'words' }),
      ]),
      textField('Middle name', card.middleName, (v) => { card.middleName = v; onChange(); }, { autocapitalize: 'words', placeholder: 'Or just an initial' }),
      el('div', { class: 'grid2' }, [
        textField('Prefix', card.prefix, (v) => { card.prefix = v; onChange(); }, { placeholder: 'Dr' }),
        textField('Suffix', card.suffix, (v) => { card.suffix = v; onChange(); }, { placeholder: 'PhD' }),
      ]),
    ]),

    el('div', { class: 'section' }, [
      el('h3', { text: 'Work' }),
      textField('Job title', card.jobTitle, (v) => { card.jobTitle = v; onChange(); }, { placeholder: 'CTO' }),
      textField('Company', card.company, (v) => { card.company = v; onChange(); }, { placeholder: 'Example Co' }),
      textField('Department', card.department, (v) => { card.department = v; onChange(); }),
    ]),

    repeatSection({
      title: 'Phone', rows: card.phones, types: PHONE_TYPES, inputType: 'tel',
      placeholder: '+1 555 010 0100', addLabel: '+ Add phone', onChange,
    }),

    repeatSection({
      title: 'Email', rows: card.emails, types: EMAIL_TYPES, inputType: 'email',
      placeholder: 'you@company.com', addLabel: '+ Add email', onChange,
    }),

    repeatSection({
      title: 'Links', rows: card.urls, types: URL_TYPES, inputType: 'url',
      placeholder: (row) => LINK_HINTS[row.type] || 'example.com',
      addLabel: '+ Add link',
      hint: 'Paste a full link, or just your username and we’ll fill in the rest when you move on. A WhatsApp phone number needs its country code.',
      normalize: (row) => { row.value = expandLink(row.type, row.value) || row.value; },
      onTypeChange: (row, previousType) => {
        // Only re-template a value this app generated itself; a pasted URL stays put.
        const handle = handleOf(previousType, row.value);
        if (handle) row.value = expandLink(row.type, handle) || row.value;
      },
      onChange,
    }),

    addressSection(card, onChange),

    el('div', { class: 'section' }, [
      el('h3', { text: 'Note' }),
      (() => {
        const area = el('textarea', { placeholder: 'Met at CES 2026' });
        area.value = card.note || '';
        area.addEventListener('input', () => { card.note = area.value; onChange(); });
        return area;
      })(),
    ]),
  ]);

  body.append(
    stylePicker({
      title: 'QR pattern', options: DOT_STYLES, current: card.dotStyle, card, key: 'dotStyle', onChange,
      note: 'Square is the most reliable. Decorative patterns scan fine on phone cameras, but some lightweight scanner apps find Dots harder to read.',
    }),
    stylePicker({ title: 'Corner frames', options: EYE_FRAME_STYLES, current: card.eyeFrameStyle, card, key: 'eyeFrameStyle', onChange }),
    stylePicker({ title: 'Corner dots', options: EYE_DOT_STYLES, current: card.eyeDotStyle, card, key: 'eyeDotStyle', onChange }),

    el('div', { class: 'section' }, [
      el('h3', { text: 'Colours' }),
      colorField('QR colour', card.qrColor, (v) => { card.qrColor = v; onChange(); }),
      colorField('QR background', card.qrBackground, (v) => { card.qrBackground = v; onChange(); }),
      colorField('Link colour', card.accentColor, (v) => { card.accentColor = v; onChange(); }),
    ]),

    logoSection(card, onChange),

    el('div', { class: 'section' }, [
      el('button', {
        class: 'btn btn--danger', type: 'button', text: 'Delete this card',
        style: 'width:100%',
        onclick: () => {
          if (!confirm(`Delete "${card.title || 'this card'}"? This cannot be undone.`)) return;
          const res = deleteCard(card.id);
          if (!res.ok) { toast(res.message); return; }
          toast('Card deleted.');
          navigate('#/');
        },
      }),
    ]),
  );

  root.replaceChildren(body);
  refresh();

  setAppBar({
    title: 'Edit card',
    left: { label: 'Cancel', onClick: () => navigate('#/') },
    right: {
      label: 'Save',
      onClick: () => {
        card.qrColor = normalizeHex(card.qrColor, '#000000');
        card.qrBackground = normalizeHex(card.qrBackground, '#FFFFFF');
        card.accentColor = normalizeHex(card.accentColor, '#3B82F6');
        // Belt and braces: a field saved without ever losing focus still stores a full URL.
        for (const u of card.urls) u.value = expandLink(u.type, u.value) || u.value;
        const res = saveCard(card);
        if (!res.ok) { toast(res.message); return; }
        toast('Saved.');
        navigate('#/');
      },
    },
  });
}
