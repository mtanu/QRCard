// Small DOM helpers shared by the views. No framework, no virtual DOM.

export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value == null || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key === 'html') node.innerHTML = value;
    else if (key.startsWith('on') && typeof value === 'function') {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (value === true) node.setAttribute(key, '');
    else node.setAttribute(key, value);
  }
  for (const child of [].concat(children)) {
    if (child == null || child === false) continue;
    node.append(child);
  }
  return node;
}

export function icon(name, className = 'pill__icon') {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', className);
  svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', `#ic-${name}`);
  svg.append(use);
  return svg;
}

let toastTimer = null;

export function toast(message, ms = 2600) {
  const node = document.getElementById('toast');
  if (!node) return;
  node.textContent = message;
  node.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { node.hidden = true; }, ms);
}

export function setAppBar({ title = 'QR Card', left = null, right = null }) {
  const titleNode = document.getElementById('ab-title');
  titleNode.textContent = title;
  for (const [id, spec] of [['ab-left', left], ['ab-right', right]]) {
    const button = document.getElementById(id);
    const fresh = button.cloneNode(false);   // drops listeners from the previous view
    fresh.textContent = spec ? spec.label : '';
    if (spec) fresh.addEventListener('click', spec.onClick);
    button.replaceWith(fresh);
  }
}

export function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const link = el('a', { href: url, download: name });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function debounce(fn, ms = 150) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

export function select(name, options, value, onChange) {
  const node = el('select', { name, 'aria-label': name });
  for (const [key, label] of options) {
    node.append(el('option', { value: key, selected: key === value, text: label }));
  }
  if (onChange) node.addEventListener('change', () => onChange(node.value));
  return node;
}
