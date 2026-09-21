// Manage the collection: add, duplicate, reorder, delete, pick which card to show.

import {
  listCards, getActiveId, setActive, addCard, duplicateCard, deleteCard, moveCard,
} from '../store.js';
import { displayName } from '../vcard.js';
import { el, setAppBar, toast } from '../ui.js';

export function render(root, { navigate }) {
  const draw = () => {
    const cards = listCards();
    const activeId = getActiveId();

    const rows = cards.map((card, i) => el('div', {
      class: `cardrow${card.id === activeId ? ' cardrow--active' : ''}`,
    }, [
      el('button', {
        class: 'cardrow__body',
        type: 'button',
        onclick: () => { setActive(card.id); navigate('#/'); },
      }, [
        el('div', { class: 'cardrow__title', text: card.title || 'Untitled card' }),
        el('div', {
          class: 'cardrow__sub',
          text: [displayName(card), card.company].filter(Boolean).join(' · ') || 'No details yet',
        }),
      ]),
      el('div', { class: 'cardrow__tools' }, [
        el('button', {
          type: 'button', 'aria-label': 'Move up', text: '↑', disabled: i === 0,
          onclick: () => { moveCard(card.id, -1); draw(); },
        }),
        el('button', {
          type: 'button', 'aria-label': 'Move down', text: '↓', disabled: i === cards.length - 1,
          onclick: () => { moveCard(card.id, 1); draw(); },
        }),
        el('button', {
          type: 'button', 'aria-label': 'Edit', text: '✎',
          onclick: () => navigate(`#/edit/${card.id}`),
        }),
        el('button', {
          type: 'button', 'aria-label': 'Duplicate', text: '⧉',
          onclick: () => {
            const res = duplicateCard(card.id);
            if (!res.ok) { toast(res.message); return; }
            draw();
            toast('Card duplicated.');
          },
        }),
        el('button', {
          type: 'button', 'aria-label': 'Delete', text: '×',
          onclick: () => {
            if (!confirm(`Delete "${card.title || 'this card'}"? This cannot be undone.`)) return;
            const res = deleteCard(card.id);
            if (!res.ok) { toast(res.message); return; }
            draw();
          },
        }),
      ]),
    ]));

    rows.push(el('button', {
      class: 'btn btn--primary', type: 'button', text: '+ New card',
      onclick: () => {
        const res = addCard();
        if (!res.ok) { toast(res.message); return; }
        navigate(`#/edit/${res.card.id}`);
      },
    }));

    rows.push(el('p', {
      class: 'hint',
      text: 'Duplicate a card to make a second one for another company — it keeps your name and styling.',
    }));

    root.replaceChildren(el('div', { class: 'stack' }, rows));
  };

  draw();

  setAppBar({
    title: 'Cards',
    left: { label: 'Done', onClick: () => navigate('#/') },
    right: { label: 'Settings', onClick: () => navigate('#/settings') },
  });
}
