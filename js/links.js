// Link services: the dropdown vocabulary, the label that goes into X-ABLabel, and the URL
// template each service expands a bare handle with. Imports nothing, so the node test
// runner can load it without a DOM or a localStorage stub.

export const URL_TYPES = [
  ['website', 'Website'],
  ['linkedin', 'LinkedIn'], ['x', 'X'], ['instagram', 'Instagram'],
  ['facebook', 'Facebook'], ['youtube', 'YouTube'], ['tiktok', 'TikTok'],
  ['github', 'GitHub'], ['whatsapp', 'WhatsApp'],
];

export function normalizeUrl(value) {
  const v = String(value || '').trim();
  if (!v) return '';
  return /^[a-z][a-z0-9+.-]*:/i.test(v) ? v : `https://${v}`;
}

/**
 * The service name shown beside a link on the card screen. Empty for a plain website, and
 * for any type no longer offered. This never reaches the vCard — labels are not exported,
 * because Android drops any URL line decorated enough to carry one.
 */
export function urlLabel(row) {
  if (!row || row.type === 'website') return '';
  const hit = URL_TYPES.find((p) => p[0] === row.type);
  return hit ? hit[1] : '';
}

// wa.me serves two different things at the same host: a username, or an international
// phone number as bare digits. WhatsApp's own rule is that a username must contain at
// least one letter, which is exactly what tells the two apart.
function isUsername(v) {
  return /[a-z]/i.test(v);
}

function whatsappSegment(raw) {
  // Usernames are 3-35 characters of Latin letters, digits, dots and underscores. A value
  // that cannot be one is rejected rather than guessed at, so "call me" does not become a
  // link with a space in it.
  if (isUsername(raw)) return /^[a-z0-9._]{3,35}$/i.test(raw) ? raw : '';
  return raw.replace(/\D/g, '').replace(/^00/, '');   // no +, no 00, no spaces
}

/**
 * Each service is a URL prefix plus the rules for the path segment after it. `clean` maps
 * what the user typed onto that segment and returns '' when it cannot make a usable one;
 * `reusable` says whether a segment may be carried over to another service when the
 * dropdown changes.
 *
 * No "www." anywhere: every one of these hosts resolves without it, and four bytes per
 * link is real money against the QR budget — the same reason telValue strips phone
 * formatting. The prefixes cover the personal-profile form; company pages and legacy
 * YouTube /c/ and /channel/ URLs are supported by pasting the full link instead.
 */
const SERVICES = {
  linkedin: { prefix: 'https://linkedin.com/in/' },
  x: { prefix: 'https://x.com/' },
  instagram: { prefix: 'https://instagram.com/' },
  facebook: { prefix: 'https://facebook.com/' },
  youtube: { prefix: 'https://youtube.com/@' },
  tiktok: { prefix: 'https://tiktok.com/@' },
  github: { prefix: 'https://github.com/' },
  // A WhatsApp username can travel to another service; a phone number cannot.
  whatsapp: { prefix: 'https://wa.me/', clean: whatsappSegment, reusable: isUsername },
};

// A slash or a scheme means they pasted a link; anything else is an identifier. Testing
// for a dot would be wrong — plenty of Instagram and TikTok handles contain one.
function looksLikeUrl(v) {
  return v.includes('/') || /^[a-z][a-z0-9+.-]*:/i.test(v);
}

/**
 * Turn whatever is in a link field into a full URL. Idempotent: an already-expanded value
 * passes straight through, so running this again on blur or on save is harmless. Returns
 * '' when there is nothing usable, and the caller then leaves the field alone.
 */
export function expandLink(type, raw) {
  const v = String(raw || '').trim();
  if (!v) return '';
  const service = SERVICES[type];
  if (!service || looksLikeUrl(v)) return normalizeUrl(v);
  const handle = v.replace(/^@+/, '');      // people type @ada out of habit
  const segment = service.clean ? service.clean(handle) : handle;
  return segment ? service.prefix + segment : '';
}

/**
 * The inverse, used only when the service dropdown changes: the bare handle if `url` is
 * exactly what this service would have produced, otherwise null. The strictness is the
 * point — a URL the user typed or pasted themselves must never be rewritten.
 *
 * A WhatsApp phone number returns null, because a number is not a username and
 * instagram.com/15550100100 would be nonsense. A WhatsApp username carries over.
 */
export function handleOf(type, url) {
  const service = SERVICES[type];
  const v = String(url || '').trim();
  if (!service || !v || !v.startsWith(service.prefix)) return null;
  const segment = v.slice(service.prefix.length);
  if (!segment || segment.includes('/')) return null;
  return !service.reusable || service.reusable(segment) ? segment : null;
}
