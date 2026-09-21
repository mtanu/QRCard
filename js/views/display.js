// The main screen: a swipeable deck of cards, each with its QR panel and field pills.

import {
  listCards, getActiveId, setActive,
  PHONE_TYPES, EMAIL_TYPES, URL_TYPES, ADDRESS_TYPES, labelOf,
} from '../store.js';
import { displayName } from '../vcard.js';
import { renderInto } from '../qr.js';
import { el, icon, setAppBar, toast } from '../ui.js';
import { shareContact } from '../share.js';
import { openPresent } from './present.js';

function pill({ iconName, label, value, sub, href }) {
  const body = el('span', { class: 'pill__body' }, [
    label ? el('span', { class: 'pill__label', text: label }) : null,
    el('span', { class: 'pill__value', text: value }),
    sub ? el('span', { class: 'pill__value pill__value--sub', text: sub }) : null,
  ]);
  const attrs = href
    ? { class: 'pill', href, rel: 'noopener' }
    : { class: 'pill' };
  return el(href ? 'a' : 'div', attrs, [icon(iconName), body]);
}

function telHref(value) {
  const dial = String(value).replace(/[^\d+*#,]/g, '');
  return dial ? `tel:${dial}` : null;
}

function webHref(value) {
  const v = String(value).trim();
  if (!v) return null;
  return /^[a-z][a-z0-9+.-]*:/i.test(v) ? v : `https://${v}`;
}

function fieldsFor(card) {
  const rows = [];
  const name = displayName(card);
  if (name) rows.push(pill({ iconName: 'person', value: name }));

  if (card.jobTitle || card.company) {
    rows.push(pill({
      iconName: 'work',
      value: card.jobTitle || card.company,
      sub: card.jobTitle && card.company ? card.company : '',
    }));
  }

  for (const p of card.phones || []) {
    if (!(p.value || '').trim()) continue;
    rows.push(pill({
      iconName: 'phone',
      label: labelOf(PHONE_TYPES, p.type),
      value: p.value.trim(),
      href: telHref(p.value),
    }));
  }

  for (const e of card.emails || []) {
    if (!(e.value || '').trim()) continue;
    rows.push(pill({
      iconName: 'mail',
      label: labelOf(EMAIL_TYPES, e.type),
      value: e.value.trim(),
      href: `mailto:${e.value.trim()}`,
    }));
  }

  for (const u of card.urls || []) {
    if (!(u.value || '').trim()) continue;
    rows.push(pill({
      iconName: 'link',
      label: u.type === 'website' ? '' : labelOf(URL_TYPES, u.type),
      value: u.value.trim().replace(/^https?:\/\//i, ''),
      href: webHref(u.value),
    }));
  }

  for (const a of card.addresses || []) {
    const line = [a.street, a.city, [a.region, a.postalCode].filter(Boolean).join(' '), a.country]
      .map((s) => (s || '').trim()).filter(Boolean).join(', ');
    if (!line) continue;
    rows.push(pill({
      iconName: 'pin',
      label: labelOf(ADDRESS_TYPES, a.type),
      value: line,
      href: `https://maps.google.com/?q=${encodeURIComponent(line)}`,
    }));
  }

  if ((card.note || '').trim()) {
    rows.push(pill({ iconName: 'note', value: card.note.trim() }));
  }

  if (!rows.length) {
    rows.push(el('p', { class: 'empty', text: 'This card is empty. Tap Edit to fill it in.' }));
  }
  return rows;
}

// The QR is sized from the viewport so it fills the panel on a phone but never grows
// past a comfortable size on a desktop browser.
function qrSize() {
  const width = Math.min(window.innerWidth, 520);
  return Math.max(200, Math.round(width - 52));
}

export function render(root, { navigate }) {
  const cards = listCards();
  const activeId = getActiveId();
  const startIndex = Math.max(0, cards.findIndex((c) => c.id === activeId));

  const deck = el('div', { class: 'deck' });
  const size = qrSize();

  cards.forEach((card) => {
    const qrHost = el('div', {
      class: 'qrpanel',
      role: 'button',
      tabindex: '0',
      'aria-label': 'Show full screen',
      onclick: () => openPresent(card),
      onkeydown: (ev) => {
        if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); openPresent(card); }
      },
    });

    try {
      renderInto(qrHost, card, { size });
    } catch (err) {
      qrHost.append(el('p', { class: 'empty', text: err.message }));
    }

    deck.append(el('div', { class: 'panel', 'data-card': card.id }, [
      qrHost,
      el('div', { class: 'cardtitle' }, [
        el('h2', { text: card.title || displayName(card) || 'Untitled card' }),
      ]),
      el('div', { class: 'fields' }, fieldsFor(card)),
      el('div', { class: 'cardactions' }, [
        el('button', {
          class: 'btn', type: 'button', text: 'Share',
          onclick: () => shareContact(card).catch((err) => toast(err.message)),
        }),
        el('button', {
          class: 'btn', type: 'button', text: 'Full screen',
          onclick: () => openPresent(card),
        }),
      ]),
    ]));
  });

  const dots = el('div', { class: 'dots', hidden: cards.length < 2 });
  cards.forEach((card, i) => {
    dots.append(el('button', {
      class: 'dot',
      type: 'button',
      'aria-label': `Card ${i + 1}`,
      'aria-current': String(i === startIndex),
      onclick: () => {
        deck.scrollTo({ left: deck.clientWidth * i, behavior: 'smooth' });
      },
    }));
  });

  root.replaceChildren(deck, dots);

  // Jump to the active card without animating, before the first paint the user sees.
  requestAnimationFrame(() => {
    deck.scrollLeft = deck.clientWidth * startIndex;
  });

  let current = startIndex;
  const syncToScroll = () => {
    if (!deck.clientWidth) return;
    const index = Math.round(deck.scrollLeft / deck.clientWidth);
    if (index === current || !cards[index]) return;
    current = index;
    dots.querySelectorAll('.dot').forEach((dot, i) => {
      dot.setAttribute('aria-current', String(i === index));
    });
    setActive(cards[index].id);
    updateBar(cards[index]);
  };

  let scrollTimer = null;
  deck.addEventListener('scroll', () => {
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(syncToScroll, 80);
  }, { passive: true });

  function updateBar(card) {
    setAppBar({
      title: 'QR Card',
      left: { label: 'Cards', onClick: () => navigate('#/cards') },
      right: { label: 'Edit', onClick: () => navigate(`#/edit/${card.id}`) },
    });
  }

  updateBar(cards[startIndex]);
}
