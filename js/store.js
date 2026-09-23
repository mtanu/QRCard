// The only module that touches localStorage. Everything else goes through here.

const KEY = 'qrcard.v1';
const SCHEMA = 1;

export const PHONE_TYPES = [
  ['mobile', 'Mobile'], ['home', 'Home'], ['office', 'Office'], ['other', 'Other'],
];
export const EMAIL_TYPES = [
  ['work', 'Work'], ['home', 'Home'], ['other', 'Other'],
];
// Lives in links.js, next to the URL templates and the service names it feeds.
import { URL_TYPES } from './links.js';

export { URL_TYPES };
export const ADDRESS_TYPES = [
  ['work', 'Work'], ['home', 'Home'],
];

export function labelOf(list, key) {
  const hit = list.find((p) => p[0] === key);
  return hit ? hit[1] : key;
}

export function uid(prefix) {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

export function blankCard(overrides = {}) {
  const now = new Date().toISOString();
  return {
    id: uid('c'),
    title: 'My card',
    prefix: '', firstName: '', middleName: '', lastName: '', suffix: '',
    jobTitle: '', company: '', department: '',
    phones: [{ id: uid('p'), type: 'mobile', value: '' }],
    emails: [{ id: uid('e'), type: 'work', value: '' }],
    urls: [{ id: uid('u'), type: 'website', value: '' }],
    addresses: [],
    note: '',
    qrColor: '#000000',
    qrBackground: '#FFFFFF',
    accentColor: '#3B82F6',
    dotStyle: 'square',
    eyeFrameStyle: 'square',
    eyeDotStyle: 'square',
    logoDataUrl: null,
    logoScale: 0.2,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function freshState() {
  const card = blankCard();
  return { schemaVersion: SCHEMA, theme: 'system', activeCardId: card.id, cards: [card] };
}

// Fill in anything a card is missing, so cards written by an older version of the app
// (or hand-edited backup files) still load instead of throwing at render time.
function normalizeCard(raw) {
  const base = blankCard();
  const card = { ...base, ...(raw || {}) };
  card.id = raw && raw.id ? String(raw.id) : base.id;
  for (const key of ['phones', 'emails', 'urls', 'addresses']) {
    card[key] = Array.isArray(card[key]) ? card[key] : [];
    card[key] = card[key].map((row) => ({ id: uid('r'), ...row }));
  }
  // A link row whose service is no longer offered — such as the old custom-label 'other'
  // — becomes a plain website, so its dropdown still has a matching option to show. The
  // label it carried is dropped with it: labels were only ever shown in this app, never
  // exported, so there is nothing left to keep them for.
  const linkTypes = new Set(URL_TYPES.map((p) => p[0]));
  card.urls = card.urls.map(({ label, ...row }) => (
    linkTypes.has(row.type) ? row : { ...row, type: 'website' }
  ));
  card.logoScale = Number.isFinite(card.logoScale) ? card.logoScale : 0.2;
  return card;
}

function migrate(state) {
  if (!state || typeof state !== 'object') return freshState();
  const cards = Array.isArray(state.cards) ? state.cards.map(normalizeCard) : [];
  if (!cards.length) return freshState();
  const activeCardId = cards.some((c) => c.id === state.activeCardId)
    ? state.activeCardId
    : cards[0].id;
  const theme = ['system', 'light', 'dark'].includes(state.theme) ? state.theme : 'system';
  return { schemaVersion: SCHEMA, theme, activeCardId, cards };
}

let state = null;

function read() {
  if (state) return state;
  let parsed = null;
  try {
    const raw = localStorage.getItem(KEY);
    parsed = raw ? JSON.parse(raw) : null;
  } catch (err) {
    console.warn('Could not read saved cards, starting fresh.', err);
  }
  state = migrate(parsed);
  return state;
}

function write() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    return { ok: true };
  } catch (err) {
    const quota = err && (err.name === 'QuotaExceededError' || err.code === 22);
    return {
      ok: false,
      message: quota
        ? 'Out of storage space. Remove a logo or delete a card, then try again.'
        : 'Could not save. Private browsing can block storage.',
    };
  }
}

export function listCards() {
  return read().cards;
}

export function getCard(id) {
  return read().cards.find((c) => c.id === id) || null;
}

export function getActiveId() {
  return read().activeCardId;
}

export function setActive(id) {
  const s = read();
  if (!s.cards.some((c) => c.id === id) || s.activeCardId === id) return { ok: true };
  s.activeCardId = id;
  return write();
}

export function saveCard(card) {
  const s = read();
  const clean = normalizeCard({ ...card, updatedAt: new Date().toISOString() });
  const i = s.cards.findIndex((c) => c.id === clean.id);
  if (i === -1) s.cards.push(clean); else s.cards[i] = clean;
  s.activeCardId = clean.id;
  return write();
}

export function addCard() {
  const s = read();
  const card = blankCard({ title: `Card ${s.cards.length + 1}` });
  s.cards.push(card);
  s.activeCardId = card.id;
  const res = write();
  return { ...res, card };
}

export function duplicateCard(id) {
  const s = read();
  const src = getCard(id);
  if (!src) return { ok: false, message: 'Card not found.' };
  const copy = normalizeCard({
    ...structuredClone(src),
    id: uid('c'),
    title: `${src.title} copy`,
    createdAt: new Date().toISOString(),
  });
  copy.phones = copy.phones.map((r) => ({ ...r, id: uid('p') }));
  copy.emails = copy.emails.map((r) => ({ ...r, id: uid('e') }));
  copy.urls = copy.urls.map((r) => ({ ...r, id: uid('u') }));
  copy.addresses = copy.addresses.map((r) => ({ ...r, id: uid('a') }));
  s.cards.splice(s.cards.findIndex((c) => c.id === id) + 1, 0, copy);
  s.activeCardId = copy.id;
  const res = write();
  return { ...res, card: copy };
}

export function deleteCard(id) {
  const s = read();
  const i = s.cards.findIndex((c) => c.id === id);
  if (i === -1) return { ok: false, message: 'Card not found.' };
  s.cards.splice(i, 1);
  if (!s.cards.length) s.cards.push(blankCard());
  if (!s.cards.some((c) => c.id === s.activeCardId)) {
    s.activeCardId = s.cards[Math.min(i, s.cards.length - 1)].id;
  }
  return write();
}

export function moveCard(id, delta) {
  const s = read();
  const i = s.cards.findIndex((c) => c.id === id);
  const j = i + delta;
  if (i === -1 || j < 0 || j >= s.cards.length) return { ok: true };
  [s.cards[i], s.cards[j]] = [s.cards[j], s.cards[i]];
  return write();
}

export function getTheme() {
  return read().theme;
}

export function setTheme(theme) {
  const s = read();
  s.theme = ['system', 'light', 'dark'].includes(theme) ? theme : 'system';
  return write();
}

export function exportJson() {
  const s = read();
  return JSON.stringify({ app: 'qrcard', schemaVersion: SCHEMA, exportedAt: new Date().toISOString(), cards: s.cards }, null, 2);
}

// mode: 'merge' keeps existing cards and appends the imported ones (new ids, so nothing
// is silently overwritten); 'replace' swaps the whole collection.
export function importJson(text, mode = 'merge') {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, message: 'That file is not valid JSON.' };
  }
  const incoming = Array.isArray(parsed) ? parsed : parsed && parsed.cards;
  if (!Array.isArray(incoming) || !incoming.length) {
    return { ok: false, message: 'No cards found in that file.' };
  }
  const cards = incoming.map((c) => normalizeCard({ ...c, id: uid('c') }));
  const s = read();
  s.cards = mode === 'replace' ? cards : s.cards.concat(cards);
  s.activeCardId = cards[0].id;
  const res = write();
  return { ...res, count: cards.length };
}

// Rough, but enough to warn before the ~5MB localStorage ceiling bites.
export function storageUsage() {
  const bytes = new Blob([JSON.stringify(read())]).size;
  return { bytes, kb: Math.round(bytes / 1024), limitKb: 5120 };
}

export function reload() {
  state = null;
  return read();
}
