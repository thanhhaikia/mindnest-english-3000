// Small DOM / formatting helpers shared by views.
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export const fmt = (n) => Number(n).toLocaleString('vi-VN');
export const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);

export function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

let toastTimer;
export function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}

let onModalClose = null;
export function openModal(html, { onClose, wide } = {}) {
  const m = $('#modal');
  $('#modal-body').innerHTML = html;
  m.querySelector('.modal-card').classList.toggle('wide', !!wide);
  m.hidden = false;
  document.body.classList.add('no-scroll');
  onModalClose = onClose || null;
  return $('#modal-body');
}
export function closeModal() {
  const m = $('#modal');
  if (m.hidden) return;
  m.hidden = true;
  document.body.classList.remove('no-scroll');
  const fn = onModalClose;
  onModalClose = null;
  fn?.();
}

export function download(filename, text) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export const STATUS_LABEL = { new: 'Mới', learning: 'Đang học', review: 'Đang ôn', mastered: 'Thuộc lòng' };
export const BOOK_LABEL = { mm: 'MIND MAP', use: '2.000+ GIAO TIẾP' };

export function progressBar(value, cls = '') {
  return `<div class="bar ${cls}"><i style="width:${Math.max(0, Math.min(100, value))}%"></i></div>`;
}
