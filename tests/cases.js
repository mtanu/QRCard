// Assertions shared by tests/index.html (browser) and tests/run.mjs (node).

import { build, escapeValue, telValue, filename, displayName } from '../js/vcard.js';
import {
  normalizeHex, isHex, contrastRatio, contrastWarning, optionsFor,
  DOT_STYLES, EYE_FRAME_STYLES, EYE_DOT_STYLES, MAX_LOGO_SCALE,
} from '../js/qr.js';
import * as store from '../js/store.js';

const B = String.fromCharCode(92);   // a literal backslash

const sample = () => ({
  id: 'c_test',
  title: 'Ada @ Example Co',
  prefix: '', firstName: 'Ada', middleName: '', lastName: 'Lovelace', suffix: '',
  jobTitle: 'CTO', company: 'Example Co', department: '',
  phones: [
    { id: 'p1', type: 'mobile', value: '+1 555-010-0100' },
    { id: 'p2', type: 'office', value: '' },
  ],
  emails: [{ id: 'e1', type: 'work', value: 'ada@example.com' }],
  urls: [{ id: 'u1', type: 'website', value: 'www.example.com' }],
  addresses: [],
  note: '',
  qrColor: '#000000', qrBackground: '#FFFFFF', accentColor: '#3B82F6',
  dotStyle: 'square', eyeFrameStyle: 'square', eyeDotStyle: 'square',
  logoDataUrl: null, logoScale: 0.2,
  createdAt: '2026-09-21T10:00:00.000Z',
  updatedAt: '2026-09-21T10:00:00.123Z',
});

function lines(card) {
  return build(card).split('\r\n');
}

const TESTS = [
  ['escapes backslash, semicolon, comma and newline', () => {
    const out = escapeValue(`a${B}b;c,d\ne`);
    if (out !== `a${B}${B}b${B};c${B},d${B}ne`) throw new Error(out);
  }],

  ['keeps a semicolon in a company name out of the ORG structure', () => {
    const card = sample();
    card.company = 'Example Co; Inc.';
    const org = lines(card).find((l) => l.startsWith('ORG:'));
    if (org !== `ORG:Example Co${B}; Inc.`) throw new Error(org);
  }],

  ['omits empty fields entirely', () => {
    const all = build(sample());
    if (all.includes('TEL;TYPE=WORK,VOICE:')) throw new Error('emitted a blank office phone');
    if (/NOTE:/.test(all)) throw new Error('emitted an empty NOTE');
    if (/ADR/.test(all)) throw new Error('emitted an empty ADR');
  }],

  ['labels each phone type the way phones expect', () => {
    const card = sample();
    card.phones = [
      { type: 'mobile', value: '1' }, { type: 'home', value: '2' },
      { type: 'office', value: '3' }, { type: 'other', value: '4' },
    ];
    const tel = lines(card).filter((l) => l.startsWith('TEL'));
    const expected = [
      'TEL;TYPE=CELL,VOICE:1', 'TEL;TYPE=HOME,VOICE:2',
      'TEL;TYPE=WORK,VOICE:3', 'TEL;TYPE=VOICE:4',
    ];
    if (tel.join('|') !== expected.join('|')) throw new Error(tel.join('|'));
  }],

  ['strips display formatting from phone numbers', () => {
    if (telValue('+1 (555) 010-0100') !== '+15550100100') throw new Error(telValue('+1 (555) 010-0100'));
  }],

  ['adds a scheme to a bare domain', () => {
    const url = lines(sample()).find((l) => l.startsWith('URL:'));
    if (url !== 'URL:https://www.example.com') throw new Error(url);
  }],

  ['leaves an existing scheme alone', () => {
    const card = sample();
    card.urls = [{ type: 'linkedin', value: 'https://linkedin.com/in/x' }];
    const url = lines(card).find((l) => l.startsWith('URL:'));
    if (url !== 'URL:https://linkedin.com/in/x') throw new Error(url);
  }],

  ['builds a full address in vCard field order', () => {
    const card = sample();
    card.addresses = [{ type: 'work', street: '1 Main St', city: 'Seattle', region: 'WA', postalCode: '98101', country: 'USA' }];
    const adr = lines(card).find((l) => l.startsWith('ADR'));
    if (adr !== 'ADR;TYPE=WORK:;;1 Main St;Seattle;WA;98101;USA') throw new Error(adr);
  }],

  ['keeps REV tied to updatedAt so the QR image is stable', () => {
    const a = lines(sample()).find((l) => l.startsWith('REV:'));
    const b = lines(sample()).find((l) => l.startsWith('REV:'));
    if (a !== 'REV:2026-09-21T10:00:00Z' || a !== b) throw new Error(a);
  }],

  ['starts and ends with the vCard envelope', () => {
    const l = lines(sample());
    if (l[0] !== 'BEGIN:VCARD' || l[1] !== 'VERSION:3.0' || l[l.length - 1] !== 'END:VCARD') {
      throw new Error(l.join('|'));
    }
  }],

  ['falls back to the company when there is no name', () => {
    const card = sample();
    card.firstName = ''; card.lastName = '';
    if (displayName(card) !== '') throw new Error('displayName should be empty');
    const fn = lines(card).find((l) => l.startsWith('FN:'));
    if (fn !== 'FN:Example Co') throw new Error(fn);
  }],

  ['puts a middle name or initial in the additional-names slot of N', () => {
    const card = sample();
    card.middleName = 'Q.';
    const l = lines(card);
    // N is Family;Given;Additional;Prefixes;Suffixes — the middle name is the third part.
    if (l.find((x) => x.startsWith('N:')) !== 'N:Lovelace;Ada;Q.;;') throw new Error(l.find((x) => x.startsWith('N:')));
    if (l.find((x) => x.startsWith('FN:')) !== 'FN:Ada Q. Lovelace') throw new Error(l.find((x) => x.startsWith('FN:')));
    if (displayName(card) !== 'Ada Q. Lovelace') throw new Error(displayName(card));
  }],

  ['makes a safe filename', () => {
    if (filename(sample()) !== 'ada-lovelace.vcf') throw new Error(filename(sample()));
  }],

  ['normalises hex colours, including shorthand', () => {
    if (normalizeHex('#abc') !== '#AABBCC') throw new Error(normalizeHex('#abc'));
    if (normalizeHex('3b82f6') !== '#3B82F6') throw new Error(normalizeHex('3b82f6'));
    if (normalizeHex('nonsense', '#123456') !== '#123456') throw new Error('bad fallback');
    if (!isHex('#fff') || isHex('#ff')) throw new Error('isHex is wrong');
  }],

  ['measures contrast and warns about unscannable colours', () => {
    const ratio = contrastRatio('#000000', '#FFFFFF');
    if (Math.round(ratio) !== 21) throw new Error(String(ratio));
    const ok = { qrColor: '#000000', qrBackground: '#FFFFFF' };
    const bad = { qrColor: '#DDDDDD', qrBackground: '#FFFFFF' };
    if (contrastWarning(ok)) throw new Error('warned about black on white');
    if (!contrastWarning(bad)) throw new Error('did not warn about light grey on white');
  }],

  ['maps every style option onto library options', () => {
    for (const [dot] of DOT_STYLES) {
      for (const [frame] of EYE_FRAME_STYLES) {
        for (const [eyeDot] of EYE_DOT_STYLES) {
          const opts = optionsFor({ ...sample(), dotStyle: dot, eyeFrameStyle: frame, eyeDotStyle: eyeDot });
          if (opts.dotsOptions.type !== dot) throw new Error(dot);
          if (opts.cornersSquareOptions.type !== frame) throw new Error(frame);
          if (opts.cornersDotOptions.type !== eyeDot) throw new Error(eyeDot);
        }
      }
    }
  }],

  ['always asks for level H error correction', () => {
    if (optionsFor(sample()).qrOptions.errorCorrectionLevel !== 'H') throw new Error('not H');
  }],

  ['clamps the logo to a size the code can survive', () => {
    const opts = optionsFor({ ...sample(), logoScale: 0.9 });
    if (opts.imageOptions.imageSize !== MAX_LOGO_SCALE) throw new Error(String(opts.imageOptions.imageSize));
  }],

  ['forces black on white in mono mode', () => {
    const opts = optionsFor({ ...sample(), qrColor: '#FF0000', qrBackground: '#EEEEEE' }, { mono: true });
    if (opts.dotsOptions.color !== '#000000' || opts.backgroundOptions.color !== '#FFFFFF') {
      throw new Error(JSON.stringify(opts.dotsOptions));
    }
  }],

  ['encodes the card vCard as the QR payload', () => {
    if (optionsFor(sample()).data !== build(sample())) throw new Error('payload mismatch');
  }],

  ['saves, reads back and deletes a card', () => {
    localStorage.clear();
    store.reload();
    const card = store.blankCard({ title: 'Round trip', firstName: 'Ada' });
    if (!store.saveCard(card).ok) throw new Error('save failed');
    store.reload();
    const back = store.getCard(card.id);
    if (!back || back.firstName !== 'Ada') throw new Error('did not read back');
    store.deleteCard(card.id);
    store.reload();
    if (store.getCard(card.id)) throw new Error('still there after delete');
  }],

  ['always keeps at least one card', () => {
    localStorage.clear();
    store.reload();
    for (const c of [...store.listCards()]) store.deleteCard(c.id);
    if (store.listCards().length !== 1) throw new Error('collection went empty');
  }],

  ['duplicates a card with fresh ids', () => {
    localStorage.clear();
    store.reload();
    const src = store.listCards()[0];
    store.saveCard({ ...src, title: 'Original', phones: [{ id: 'p1', type: 'mobile', value: '123' }] });
    const res = store.duplicateCard(src.id);
    if (!res.ok) throw new Error(res.message);
    if (res.card.id === src.id) throw new Error('reused the id');
    if (res.card.phones[0].id === 'p1') throw new Error('reused a row id');
    if (res.card.phones[0].value !== '123') throw new Error('lost the data');
  }],

  ['reorders cards', () => {
    localStorage.clear();
    store.reload();
    const first = store.listCards()[0];
    const second = store.addCard().card;
    store.moveCard(second.id, -1);
    if (store.listCards()[0].id !== second.id) throw new Error('move up did nothing');
    store.moveCard(second.id, -1);   // already at the top: must be a no-op, not a crash
    if (store.listCards()[1].id !== first.id) throw new Error('order corrupted');
  }],

  ['exports and re-imports without losing anything', () => {
    localStorage.clear();
    store.reload();
    const card = store.listCards()[0];
    store.saveCard({ ...card, title: 'Backup me', lastName: 'Lovelace', logoScale: 0.18 });
    const json = store.exportJson();
    localStorage.clear();
    store.reload();
    const res = store.importJson(json, 'replace');
    if (!res.ok || res.count !== 1) throw new Error(res.message || 'wrong count');
    const back = store.listCards()[0];
    if (back.title !== 'Backup me' || back.lastName !== 'Lovelace' || back.logoScale !== 0.18) {
      throw new Error(JSON.stringify(back).slice(0, 120));
    }
  }],

  ['merging an import keeps the existing cards', () => {
    localStorage.clear();
    store.reload();
    const json = store.exportJson();
    const before = store.listCards().length;
    const res = store.importJson(json, 'merge');
    if (!res.ok) throw new Error(res.message);
    if (store.listCards().length !== before + 1) throw new Error('merge replaced instead of added');
  }],

  ['rejects a file that is not a backup', () => {
    if (store.importJson('not json at all').ok) throw new Error('accepted garbage');
    if (store.importJson('{"cards":[]}').ok) throw new Error('accepted an empty backup');
  }],

  ['repairs a card that is missing fields', () => {
    localStorage.clear();
    localStorage.setItem('qrcard.v1', JSON.stringify({ cards: [{ id: 'c_old', title: 'Legacy' }] }));
    store.reload();
    const card = store.getCard('c_old');
    if (!card) throw new Error('dropped the card');
    if (!Array.isArray(card.phones) || card.qrColor !== '#000000' || card.logoScale !== 0.2) {
      throw new Error('did not fill in the defaults');
    }
    build(card);   // must not throw
  }],
];

export function runCases() {
  const saved = localStorage.getItem('qrcard.v1');
  const results = [];
  try {
    for (const [name, fn] of TESTS) {
      try {
        fn();
        results.push({ name, ok: true });
      } catch (err) {
        results.push({ name, ok: false, detail: err && err.message ? err.message : String(err) });
      }
    }
  } finally {
    // The storage tests scribble over real data, so put the user's cards back.
    localStorage.clear();
    if (saved != null) localStorage.setItem('qrcard.v1', saved);
    store.reload();
  }
  return results;
}
