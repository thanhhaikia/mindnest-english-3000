// Reusable HTML fragments.
import { store } from './store.js';
import { illustration } from './images.js';
import { speak } from './speech.js';
import { esc, STATUS_LABEL, progressBar } from './ui.js';
import { statusOf, memoryStrength } from './sm2.js';

export const say = (text, opts = {}) => speak(text, { lang: store.settings.accent, rate: store.settings.rate * (opts.slow ? 0.7 : 1), ...opts.lang ? { lang: opts.lang } : {} });

export const pic = (card, cls = '', { hideWord = false } = {}) => `<img class="pic ${cls}" data-card="${esc(card.id)}" src="${illustration(card, { label: !hideWord })}" alt="${hideWord ? '' : esc(card.en)}" loading="lazy" decoding="async">`;

export const sayBtn = (text, label = '🔊', cls = '') => `<button type="button" class="say-btn ${cls}" data-say="${esc(text)}" title="Nghe phát âm" aria-label="Nghe: ${esc(text)}">${label}</button>`;

export const saveBtn = (key) => {
  const on = store.isSaved(key);
  return `<button type="button" class="save-btn ${on ? 'on' : ''}" data-save="${esc(key)}" title="${on ? 'Bỏ lưu' : 'Lưu từ'}" aria-pressed="${on}">${on ? '♥' : '♡'}</button>`;
};

export function memInfo(key) {
  const it = store.item(key);
  const st = statusOf(it);
  return { st, label: STATUS_LABEL[st], strength: Math.round(memoryStrength(it) * 100) };
}

export function wordCard(card, { showGroup = false } = {}) {
  const m = memInfo(card.key);
  return `<article class="word-card" data-word="${esc(card.key)}" data-cid="${esc(card.id)}" tabindex="0">
    <div class="pic-wrap">${pic(card)}<span class="lvl">${esc(card.level)}</span>${saveBtn(card.key)}</div>
    <div class="wc-body">
      <div class="wc-head"><h3>${esc(card.en)}</h3>${sayBtn(card.en)}</div>
      <p class="ipa">${esc(card.ipa)} <span class="pos">${esc(card.pos)}</span></p>
      <p class="vi">${esc(card.vi)}</p>
      <p class="ex">“${esc(card.ex)}”</p>
      ${showGroup ? `<p class="from">${esc(card.group.emoji)} ${esc(card.group.title)}</p>` : ''}
      <div class="wc-foot"><span class="st st-${m.st}">${m.label}</span>${progressBar(m.strength, 'thin')}<b>${m.strength}%</b></div>
    </div>
  </article>`;
}

export function emptyState(icon, title, text, action = '') {
  return `<div class="empty"><div class="empty-ic">${icon}</div><h3>${esc(title)}</h3><p>${text}</p>${action}</div>`;
}

export function pageHead(kicker, title, sub = '', actions = '') {
  return `<section class="page-head"><div><p class="kicker">${kicker}</p><h1>${title}</h1>${sub ? `<p class="sub">${sub}</p>` : ''}</div>${actions ? `<div class="head-actions">${actions}</div>` : ''}</section>`;
}
