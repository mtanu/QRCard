// vCard 3.0 serialiser. The output of build() is exactly what the QR encodes, so anything
// added here costs QR density — keep it to what phones actually import.

import { normalizeUrl } from './links.js';

const TEL_PARAMS = {
  mobile: 'CELL,VOICE',
  home: 'HOME,VOICE',
  office: 'WORK,VOICE',
  other: 'VOICE',
};

const EMAIL_PARAMS = {
  work: 'INTERNET,WORK',
  home: 'INTERNET,HOME',
  other: 'INTERNET',
};

const ADR_PARAMS = { work: 'WORK', home: 'HOME' };

// Order matters in a vCard value list, so escape the backslash first.
export function escapeValue(value) {
  return String(value == null ? '' : value)
    .replace(/\\/g, '\\\\')
    .replace(/\r\n|\r|\n/g, '\\n')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,');
}

function joinParts(parts) {
  return parts.map(escapeValue).join(';');
}

export function displayName(card) {
  return [card.prefix, card.firstName, card.middleName, card.lastName, card.suffix]
    .map((p) => (p || '').trim())
    .filter(Boolean)
    .join(' ');
}

function hasAddress(a) {
  return [a.street, a.city, a.region, a.postalCode, a.country].some((v) => (v || '').trim());
}

// The pretty spacing a person types is for the card display. Inside the vCard, strip it
// down to dial-safe characters: shorter payload, denser QR, and it still dials.
export function telValue(value) {
  return String(value || '').replace(/[^\d+*#,]/g, '');
}

/**
 * Build a vCard 3.0 string for a card. Empty fields are omitted entirely rather than
 * emitted blank, and lines are deliberately NOT folded at 75 octets: folding is
 * spec-correct but adds bytes to an already dense QR, and scanners accept unfolded input.
 */
export function build(card) {
  const lines = ['BEGIN:VCARD', 'VERSION:3.0'];

  lines.push(`N:${joinParts([card.lastName, card.firstName, card.middleName, card.prefix, card.suffix])}`);

  const fn = displayName(card) || (card.company || '').trim() || (card.title || '').trim();
  if (fn) lines.push(`FN:${escapeValue(fn)}`);

  if ((card.jobTitle || '').trim()) lines.push(`TITLE:${escapeValue(card.jobTitle.trim())}`);

  const org = (card.company || '').trim();
  const dept = (card.department || '').trim();
  if (org || dept) lines.push(`ORG:${joinParts(dept ? [org, dept] : [org])}`);

  for (const p of card.phones || []) {
    const v = telValue(p.value);
    if (!v) continue;
    lines.push(`TEL;TYPE=${TEL_PARAMS[p.type] || TEL_PARAMS.other}:${escapeValue(v)}`);
  }

  for (const e of card.emails || []) {
    const v = (e.value || '').trim();
    if (!v) continue;
    lines.push(`EMAIL;TYPE=${EMAIL_PARAMS[e.type] || EMAIL_PARAMS.other}:${escapeValue(v)}`);
  }

  // Every link goes out as a bare URL line, with no label of any kind. This was tested on
  // a Galaxy S24 Ultra, through Google Contacts and Samsung Contacts, against six
  // encodings of the same links: anything whose property name is exactly URL imported,
  // while both `itemN.URL` + `itemN.X-ABLabel` and `X-SOCIALPROFILE` were dropped
  // outright — link and all. The group prefix is what binds a label to a URL for Apple,
  // but it also makes the property name unrecognisable to Android's parser, so the very
  // decoration meant to describe the link is what loses it.
  //
  // Labels were not worth another attempt regardless: neither Android contacts app has a
  // label field for a link, so nothing can render one there, and the label is mostly
  // redundant anyway — linkedin.com/in/… and wa.me/… say what they are. The service name
  // still shows on this app's own card screen, which is where it costs no QR capacity.
  for (const u of card.urls || []) {
    const v = normalizeUrl(u.value || '');
    if (v) lines.push(`URL:${escapeValue(v)}`);
  }

  for (const a of card.addresses || []) {
    if (!hasAddress(a)) continue;
    const params = ADR_PARAMS[a.type] || ADR_PARAMS.work;
    lines.push(`ADR;TYPE=${params}:${joinParts(['', '', a.street, a.city, a.region, a.postalCode, a.country])}`);
  }

  if ((card.note || '').trim()) lines.push(`NOTE:${escapeValue(card.note.trim())}`);

  // Use the card's own updatedAt, not "now" — otherwise the QR image would change on
  // every single render and never match a previously exported PNG.
  const rev = (card.updatedAt || new Date().toISOString()).replace(/\.\d{3}/, '');
  lines.push(`REV:${rev}`);

  lines.push('END:VCARD');
  return lines.join('\r\n');
}

export function filename(card) {
  const base = (displayName(card) || card.title || 'contact')
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
  return `${base || 'contact'}.vcf`;
}
