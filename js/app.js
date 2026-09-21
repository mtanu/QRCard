// Bootstrap: hash router, view switching, service worker registration.

import * as display from './views/display.js';
import * as editor from './views/editor.js';
import * as cards from './views/cards.js';
import * as settings from './views/settings.js';
import { initPresent, closePresent } from './views/present.js';
import { applyTheme, watchSystemTheme } from './theme.js';
import { toast } from './ui.js';

const root = document.getElementById('view');

function parseRoute() {
  const hash = window.location.hash || '#/';
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  if (!parts.length) return { name: 'display', params: {} };
  if (parts[0] === 'edit') return { name: 'editor', params: { id: parts[1] } };
  if (parts[0] === 'cards') return { name: 'cards', params: {} };
  if (parts[0] === 'settings') return { name: 'settings', params: {} };
  return { name: 'display', params: {} };
}

const VIEWS = { display, editor, cards, settings };

function navigate(hash) {
  if (window.location.hash === hash) renderRoute();
  else window.location.hash = hash;
}

function renderRoute() {
  closePresent();
  const route = parseRoute();
  const view = VIEWS[route.name] || display;
  try {
    view.render(root, { navigate, params: route.params });
  } catch (err) {
    console.error(err);
    root.innerHTML = '';
    toast(err.message || 'Something went wrong.');
  }
  window.scrollTo(0, 0);
}

window.addEventListener('hashchange', renderRoute);

// Re-render the deck on rotation so the QR is sized for the new viewport.
let resizeTimer = null;
window.addEventListener('resize', () => {
  if (parseRoute().name !== 'display') return;
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(renderRoute, 250);
});

applyTheme();
watchSystemTheme();
initPresent();
renderRoute();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((err) => {
      console.warn('Offline support unavailable.', err);
    });
  });
}
