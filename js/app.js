// App shell, router and browsing views.
import { db, loadData, searchWords, searchGroups } from './data.js';
import { store } from './store.js';
import { hydrateImages } from './images.js';
import { stopSpeaking, srSupported, recognize, speechScore } from './speech.js';
import { formatInterval } from './sm2.js';
import { $, $$, esc, fmt, pct, toast, openModal, closeModal, download, BOOK_LABEL, progressBar, STATUS_LABEL } from './ui.js';
import { say, pic, sayBtn, saveBtn, memInfo, wordCard, emptyState, pageHead } from './components.js';
import { SCENARIOS, CATEGORIES } from './scenarios.js';
import { renderFlashcards, renderListen, renderScenarios, renderScenario, renderQuiz } from './practice.js';

const view = $('#view');
let cleanup = null;
let allKeys = [];

/* ---------------- routing ---------------- */
function parseHash() {
  const raw = location.hash.replace(/^#\/?/, '');
  const [path, qs = ''] = raw.split('?');
  const parts = path.split('/').filter(Boolean).map(decodeURIComponent);
  return { name: parts[0] || 'home', arg: parts[1], query: Object.fromEntries(new URLSearchParams(qs)) };
}

const routes = {
  home: renderHome,
  words: renderWords,
  groups: renderGroups,
  group: renderGroup,
  lesson: renderLesson,
  saved: renderSaved,
  search: renderSearch,
  progress: renderProgress,
  flashcards: renderFlashcards,
  listen: renderListen,
  scenarios: renderScenarios,
  scenario: renderScenario,
  quiz: renderQuiz,
};

function route() {
  if (typeof cleanup === 'function') cleanup();
  cleanup = null;
  stopSpeaking();
  closeModal();
  document.body.classList.remove('menu-open');
  const r = parseHash();
  const fn = routes[r.name] || renderHome;
  cleanup = fn(view, r.arg, r.query) || null;
  $$('[data-nav]').forEach((a) => a.classList.toggle('active', a.dataset.nav === (r.name === 'group' || r.name === 'lesson' ? 'groups' : r.name === 'scenario' ? 'scenarios' : r.name)));
  if (r.name !== 'search') $('#search-input').value = '';
  window.scrollTo({ top: 0 });
  afterRender();
}

export function afterRender(root = view) {
  hydrateImages(root, (id) => db.cardMap.get(id));
}

/* ---------------- shell ---------------- */
function updateShell() {
  const s = store.summary(allKeys);
  $('#nav-due').textContent = fmt(s.due);
  $('#nav-saved').textContent = fmt(s.saved);
  const goal = +store.settings.newPerDay || 0;
  const done = store.newToday();
  $('#goal-box').innerHTML = `<b>Mục tiêu mỗi ngày</b><p>Học ${goal} từ mới qua hình ảnh, nghe câu mẫu và nói lớn thành tiếng.</p>${progressBar(pct(done, goal))}<small>Hôm nay: ${fmt(done)} / ${goal} từ mới · ${fmt(s.learned)} / ${fmt(allKeys.length)} từ đã thuộc</small>`;
  $$('[data-accent]').forEach((b) => b.classList.toggle('on', b.dataset.accent === store.settings.accent));
  $('#rate-btn').textContent = `${store.settings.rate.toFixed(1)}x`;
}

function bindShell() {
  window.addEventListener('hashchange', route);
  $('#menu-btn').addEventListener('click', () => document.body.classList.toggle('menu-open'));
  $('#backdrop').addEventListener('click', () => document.body.classList.remove('menu-open'));
  $('#search-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const q = $('#search-input').value.trim();
    if (q) location.hash = `#/search?q=${encodeURIComponent(q)}`;
  });
  let st;
  $('#search-input').addEventListener('input', (e) => {
    clearTimeout(st);
    const q = e.target.value.trim();
    st = setTimeout(() => {
      if (q.length >= 2) {
        const target = `#/search?q=${encodeURIComponent(q)}`;
        if (location.hash.startsWith('#/search')) history.replaceState(null, '', target), route();
        else location.hash = target;
        setTimeout(() => $('#search-input').focus(), 0);
        $('#search-input').value = q;
      }
    }, 350);
  });
  $$('[data-accent]').forEach((b) => b.addEventListener('click', () => { store.setSetting('accent', b.dataset.accent); say('Hello'); }));
  $('#rate-btn').addEventListener('click', () => {
    const rates = [0.6, 0.8, 1, 1.2];
    const i = rates.indexOf(store.settings.rate);
    store.setSetting('rate', rates[(i + 1) % rates.length]);
    toast(`Tốc độ đọc: ${store.settings.rate.toFixed(1)}x`);
  });
  $('#export-btn').addEventListener('click', exportProgress);
  $('#modal-close').addEventListener('click', closeModal);
  $('#modal').addEventListener('click', (e) => e.target.id === 'modal' && closeModal());
  document.addEventListener('keydown', (e) => e.key === 'Escape' && closeModal());

  // Delegated actions
  document.addEventListener('click', (e) => {
    const sayEl = e.target.closest('[data-say]');
    if (sayEl) {
      e.preventDefault();
      e.stopPropagation();
      say(sayEl.dataset.say, { slow: sayEl.dataset.slow === '1' });
      return;
    }
    const saveEl = e.target.closest('[data-save]');
    if (saveEl) {
      e.preventDefault();
      e.stopPropagation();
      const on = store.toggleSaved(saveEl.dataset.save);
      $$(`[data-save="${CSS.escape(saveEl.dataset.save)}"]`).forEach((b) => {
        b.classList.toggle('on', on);
        b.textContent = on ? '♥' : '♡';
        b.setAttribute('aria-pressed', on);
      });
      toast(on ? 'Đã lưu vào “Từ đã lưu” ♥' : 'Đã bỏ lưu');
      return;
    }
    const wordEl = e.target.closest('[data-word]');
    if (wordEl && !e.target.closest('a,button,input,select')) openWord(wordEl.dataset.word, wordEl.dataset.cid);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.matches?.('.word-card')) openWord(e.target.dataset.word, e.target.dataset.cid);
  });
  store.subscribe(updateShell);
}

function exportProgress() {
  download(`mindnest-tien-do-${new Date().toISOString().slice(0, 10)}.json`, store.exportJSON());
  toast('Đã xuất tệp tiến độ JSON');
}

/* ---------------- word modal ---------------- */
export function openWord(key, cardId) {
  const w = db.wordMap.get(key);
  if (!w) return;
  const card = (cardId && db.cardMap.get(cardId)) || w;
  const render = () => {
    const it = store.item(key);
    const m = memInfo(key);
    const groups = [...new Map(w.cards.map((c) => [c.lesson.id, c])).values()];
    return `<div class="word-modal">
      <div class="wm-pic">${pic(card, 'big')}</div>
      <div class="wm-info">
        <div class="wm-top"><span class="lvl-tag">${esc(card.level)}</span><span class="pos-tag">${esc(card.pos)}</span>${saveBtn(key)}</div>
        <h2>${esc(card.en)}</h2>
        <p class="ipa big">${esc(card.ipa)}</p>
        <div class="row gap">${sayBtn(card.en, '🔊 Nghe', 'pill')}<button type="button" class="say-btn pill" data-say="${esc(card.en)}" data-slow="1">🐢 Chậm</button>${srSupported ? '<button type="button" class="say-btn pill" id="wm-mic">🎙️ Luyện nói</button>' : ''}</div>
        <p class="wm-result" id="wm-result"></p>
        <p class="vi big">${esc(card.vi)}</p>
        ${card.col ? `<p class="col">Cụm từ: <b>${esc(card.col)}</b></p>` : ''}
        <div class="example"><p>“${esc(card.ex)}” ${sayBtn(card.ex)}</p><p class="ex-vi">${esc(card.exVi)}</p></div>
      </div>
      <div class="wm-srs">
        <h4>Trí nhớ SM-2</h4>
        <div class="srs-grid">
          <div><small>Trạng thái</small><b class="st st-${m.st}">${m.label}</b></div>
          <div><small>Độ nhớ</small><b>${m.strength}%</b></div>
          <div><small>Hệ số EF</small><b>${it ? it.ef.toFixed(2) : '2.50'}</b></div>
          <div><small>Lần ôn tới</small><b>${it ? (it.due <= Date.now() ? 'Đến hạn' : 'sau ' + formatInterval(it.due - Date.now())) : '—'}</b></div>
        </div>
        ${progressBar(m.strength)}
        <div class="row gap wrap">
          <button class="btn danger-soft" data-grade="1">✗ Chưa biết</button>
          <button class="btn ghost" data-grade="3">Hơi nhớ</button>
          <button class="btn success" data-grade="5">✓ Tôi đã biết</button>
        </div>
        <h4>Xuất hiện trong ${groups.length} bài học</h4>
        <div class="chips">${groups.map((c) => `<a class="chip" href="#/lesson/${encodeURIComponent(c.lesson.id)}">${esc(c.group.emoji)} ${esc(c.lesson.title)}</a>`).join('')}</div>
      </div>
    </div>`;
  };
  const body = openModal(render(), { wide: true });
  const bind = () => {
    afterRender(body);
    $$('[data-grade]', body).forEach((b) =>
      b.addEventListener('click', () => {
        const it = store.grade(key, +b.dataset.grade);
        toast(`Đã cập nhật lịch ôn: lần tới sau ${formatInterval(it.due - Date.now())}`);
        body.innerHTML = render();
        bind();
      })
    );
    $('#wm-mic', body)?.addEventListener('click', async () => {
      const out = $('#wm-result', body);
      out.textContent = '🎙️ Đang nghe… hãy đọc to từ này';
      try {
        const alts = await recognize(store.settings.accent);
        const { score, heard } = speechScore(card.en, alts);
        out.innerHTML = alts.length ? `Bạn nói: <b>${esc(heard)}</b> · Điểm phát âm: <b class="${score >= 80 ? 'ok' : 'bad'}">${score}/100</b>` : 'Không nghe rõ, thử lại nhé.';
      } catch (err) {
        out.textContent = 'Không truy cập được micro: ' + err.message;
      }
    });
  };
  bind();
  say(card.en);
}

/* ---------------- views ---------------- */
function statTiles(s) {
  return `<div class="stats">
    <div class="stat"><span class="stat-ic">🌟</span><div><b>${fmt(db.words.length)}</b><small>Từ vựng độc nhất · mỗi từ một ảnh minh họa riêng</small></div></div>
    <div class="stat"><span class="stat-ic">▦</span><div><b>${fmt(db.cards.length)}</b><small>Thẻ từ theo ngữ cảnh ${db.groups.length} nhóm chủ đề</small></div></div>
    <div class="stat"><span class="stat-ic">▤</span><div><b>${fmt(db.lessons.length)}</b><small>Bài học hoàn chỉnh (IPA, nghĩa Việt, câu ví dụ)</small></div></div>
    <div class="stat"><span class="stat-ic">✓</span><div><b>${fmt(s.learned)}</b><small>Từ độc nhất bạn đã thuộc (SM-2)</small></div></div>
  </div>`;
}

function groupCard(g) {
  const learned = g.keys.filter((k) => store.item(k)?.reps >= 1).length;
  return `<a class="group-card" href="#/group/${encodeURIComponent(g.id)}">
    <div class="gc-top"><span class="gc-emoji">${g.emoji}</span><span class="gc-book ${g.book}">${BOOK_LABEL[g.book]} · CH ${String(g.no).padStart(2, '0')}</span></div>
    <h3>${esc(g.title)}</h3>
    <p>${g.titleEn ? esc(g.titleEn) + ' · ' : ''}${g.lessons.length} bài học</p>
    ${progressBar(pct(learned, g.keys.length), 'thin')}
    <div class="gc-foot"><span>${fmt(g.cards.length)} thẻ từ · ${fmt(learned)} đã thuộc</span><span>→</span></div>
  </a>`;
}

export function scenarioCard(sc) {
  const done = store.state.scenarios[sc.id];
  return `<a class="scenario-card" href="#/scenario/${sc.id}">
    <div class="sc-top"><span class="sc-emoji">${sc.emoji}</span><span class="tag">${sc.level} · ${sc.turns.length} lượt thoại</span></div>
    <h3>${esc(sc.title)}</h3>
    <p>${esc(sc.desc)}</p>
    <div class="sc-foot"><span class="cat cat-${sc.cat}">${CATEGORIES[sc.cat]}</span><span>${done ? `✓ Đã luyện ${done.runs} lần` : 'Đóng vai & nghe hội thoại →'}</span></div>
  </a>`;
}

function renderHome(el) {
  const s = store.summary(allKeys);
  const newLeft = Math.max(0, store.settings.newPerDay - store.newToday());
  el.innerHTML = `
  <section class="hero">
    <div class="hero-text">
      <span class="hero-badge">🌟 ${fmt(db.words.length)} TỪ &amp; ẢNH MINH HỌA ĐỘC NHẤT · THUẬT TOÁN SM-2</span>
      <h1>Làm chủ <em>tiếng Anh giao tiếp</em> qua hình ảnh riêng biệt &amp; phản xạ nói.</h1>
      <p>Ứng dụng Mã hóa kép (Dual-Coding) và Lặp lại ngắt quãng SuperMemo SM-2: mỗi từ trong ${fmt(db.words.length)} từ thông dụng có hình minh họa, phiên âm IPA, nghĩa tiếng Việt và câu ví dụ — kèm nghe rảnh tay Shadowing, 12 hội thoại đóng vai và kiểm tra 4 kỹ năng.</p>
      <div class="row gap wrap">
        <a class="btn primary" href="#/flashcards">▣ Học flashcard hôm nay →</a>
        <a class="btn ghost" href="#/words">🌟 Bộ ${fmt(db.words.length)} từ</a>
        <a class="btn ghost" href="#/scenarios">🗣️ 12 tình huống</a>
      </div>
    </div>
    <div class="progress-card">
      <div class="pc-head"><span>TIẾN ĐỘ GHI NHỚ</span><b>${s.remembered}%</b></div>
      ${progressBar(s.remembered)}
      <div class="pc-grid">
        <div><b>${fmt(s.learned)}</b><small>Đã thuộc</small></div>
        <div><b>${fmt(s.saved)}</b><small>Đã lưu ♥</small></div>
        <div><b>${fmt(s.due)}</b><small>Đến hạn ôn</small></div>
        <div><b>${store.streak()}🔥</b><small>Ngày liên tiếp</small></div>
      </div>
    </div>
  </section>
  ${statTiles(s)}
  <section class="today">
    <div><h2>Hôm nay học gì?</h2><p>${s.due ? `<b>${fmt(s.due)}</b> từ đến hạn ôn theo SM-2` : 'Không có từ nào đến hạn ôn'} · còn <b>${newLeft}</b> từ mới theo mục tiêu ngày.</p></div>
    <div class="row gap wrap">
      <a class="btn primary" href="#/flashcards">Bắt đầu phiên học</a>
      <a class="btn ghost" href="#/listen">🎧 Nghe rảnh tay</a>
      <a class="btn ghost" href="#/quiz">◇ Kiểm tra nhanh</a>
    </div>
  </section>
  <section class="block">
    <div class="block-head"><div><h2>Tình huống giao tiếp thực tế hàng ngày</h2><p>Luyện nghe – đóng vai phản xạ nhanh theo 12 bối cảnh đời sống, du lịch và công sở.</p></div><a href="#/scenarios">Xem cả 12 tình huống →</a></div>
    <div class="grid three">${SCENARIOS.slice(0, 3).map(scenarioCard).join('')}</div>
  </section>
  <section class="block">
    <div class="block-head"><div><h2>Hai nguồn chủ đề nền tảng</h2><p>${fmt(db.lessons.length)} bài học đều có thẻ từ, phiên âm IPA, nghĩa tiếng Việt và câu ví dụ giao tiếp.</p></div></div>
    <div class="grid two">
      ${['mm', 'use'].map((b) => {
        const gs = db.groups.filter((g) => g.book === b);
        const book = db.books.find((x) => x.id === b);
        return `<a class="book-card ${b}" href="#/groups?book=${b}"><div class="book-ic">${b === 'mm' ? '🧠' : '💬'}</div><div><h3>${esc(book?.title || '')}</h3><p>${esc(book?.subtitle || '')}</p><div class="row gap"><span class="tag">${gs.length} chủ đề lớn</span><span class="tag">${fmt(gs.reduce((n, g) => n + g.cards.length, 0))} thẻ từ</span><span class="tag">${gs.reduce((n, g) => n + g.lessons.length, 0)} bài</span></div></div></a>`;
      }).join('')}
    </div>
  </section>
  <section class="block">
    <div class="block-head"><div><h2>Khám phá ${db.groups.length} nhóm chủ đề từ vựng</h2><p>Học theo cụm chủ đề giúp não bộ liên tưởng hình ảnh và bật ra câu nói nhanh hơn.</p></div><a href="#/groups">Xem tất cả ${db.groups.length} nhóm →</a></div>
    <div class="grid three">${db.groups.slice(0, 6).map(groupCard).join('')}</div>
  </section>
  ${sourcesFooter()}`;
}

function sourcesFooter() {
  return `<footer class="sources">Bộ từ vựng đối chiếu từ ${db.sources.filter((s) => !/wikimedia/i.test(s.title)).map((s) => `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title.split(' — ').pop().split(' (')[0])}</a>`).join(', ')} · Ảnh minh họa qua <a href="https://www.mediawiki.org/wiki/API:Page_info_in_search_results" target="_blank" rel="noopener">Wikipedia PageImages API</a> (ảnh SVG tự tạo khi không có ảnh).</footer>`;
}

function renderWords(el, _arg, q) {
  const level = q.level || 'all';
  const status = q.status || 'all';
  let list = db.words;
  if (level !== 'all') list = list.filter((w) => w.level === level);
  if (status !== 'all') list = list.filter((w) => (status === 'saved' ? store.isSaved(w.key) : memInfo(w.key).st === status));
  const link = (k, v) => `#/words?${new URLSearchParams({ level, status, [k]: v })}`;
  const levels = ['all', 'A1', 'A2', 'B1', 'B2'];
  const statuses = [['all', 'Tất cả'], ['new', 'Mới'], ['learning', 'Đang học'], ['review', 'Đang ôn'], ['mastered', 'Thuộc lòng'], ['saved', '♥ Đã lưu']];
  el.innerHTML = `${pageHead('BỘ TỪ VỰNG GIAO TIẾP', `${fmt(db.words.length)} từ thông dụng độc nhất`, 'Mỗi từ có ảnh minh họa, IPA, nghĩa tiếng Việt và câu ví dụ. Bấm vào thẻ để xem chi tiết, nghe phát âm và chấm điểm SM-2.', `<a class="btn primary" href="#/flashcards">▣ Học flashcard</a>`)}
    <div class="filters">
      <div class="chips">${levels.map((l) => `<a class="chip ${l === level ? 'on' : ''}" href="${link('level', l)}">${l === 'all' ? 'Mọi cấp độ' : l}</a>`).join('')}</div>
      <div class="chips">${statuses.map(([k, v]) => `<a class="chip ${k === status ? 'on' : ''}" href="${link('status', k)}">${v}</a>`).join('')}</div>
    </div>
    <p class="muted">${fmt(list.length)} từ</p>
    <div class="grid cards" id="word-grid"></div>
    <div class="center"><button class="btn ghost" id="more-btn">Xem thêm</button></div>`;
  paginate(list, $('#word-grid', el), $('#more-btn', el));
}

function paginate(list, grid, btn, size = 48, opts = {}) {
  let shown = 0;
  const more = () => {
    grid.insertAdjacentHTML('beforeend', list.slice(shown, shown + size).map((c) => wordCard(c, opts)).join(''));
    shown += size;
    btn.hidden = shown >= list.length;
    btn.textContent = `Xem thêm (${fmt(list.length - shown)} từ)`;
    afterRender(grid);
  };
  btn.addEventListener('click', more);
  if (!list.length) grid.outerHTML = emptyState('🔍', 'Không có từ nào', 'Thử bỏ bớt bộ lọc nhé.');
  more();
}

function renderGroups(el, _arg, q) {
  const book = q.book || 'all';
  const gs = book === 'all' ? db.groups : db.groups.filter((g) => g.book === book);
  const tabs = [['all', `Tất cả ${db.groups.length} chủ đề`], ['mm', 'Mind Map (19 nhóm)'], ['use', '2.000+ Giao tiếp (30 nhóm)']];
  el.innerHTML = `${pageHead('NHÓM CHỦ ĐỀ', `${db.groups.length} nhóm chủ đề · ${fmt(db.lessons.length)} bài học`, 'Chọn một nhóm để xem các bài học, học flashcard, luyện nghe hoặc làm bài kiểm tra theo chủ đề.')}
    <div class="chips tabs">${tabs.map(([k, v]) => `<a class="chip ${k === book ? 'on' : ''}" href="#/groups?book=${k}">${v}</a>`).join('')}</div>
    <div class="grid three">${gs.map(groupCard).join('')}</div>`;
}

function practiceButtons(scope) {
  const s = encodeURIComponent(scope);
  return `<a class="btn primary" href="#/flashcards?scope=${s}">▣ Học flashcard</a><a class="btn ghost" href="#/listen?scope=${s}">🎧 Luyện nghe</a><a class="btn ghost" href="#/quiz?scope=${s}">◇ Kiểm tra</a>`;
}

function renderGroup(el, id) {
  const g = db.groupMap.get(id);
  if (!g) return void (el.innerHTML = emptyState('🤔', 'Không tìm thấy nhóm', '', '<a class="btn primary" href="#/groups">Về danh sách</a>'));
  const learned = g.keys.filter((k) => store.item(k)?.reps >= 1).length;
  el.innerHTML = `<a class="back" href="#/groups">← 49 nhóm chủ đề</a>
    ${pageHead(`${g.emoji} ${BOOK_LABEL[g.book]} · CHƯƠNG ${g.no}`, esc(g.title), `${g.titleEn ? esc(g.titleEn) + ' · ' : ''}${g.lessons.length} bài học · ${fmt(g.cards.length)} thẻ từ · ${fmt(learned)}/${fmt(g.keys.length)} từ đã thuộc`, practiceButtons(`group:${g.id}`))}
    ${progressBar(pct(learned, g.keys.length))}
    <div class="lesson-list">${g.lessons.map((l) => {
      const keys = [...new Set(l.cards.map((c) => c.key))];
      const ln = keys.filter((k) => store.item(k)?.reps >= 1).length;
      return `<a class="lesson-row" href="#/lesson/${encodeURIComponent(l.id)}">
        <div class="lr-pics">${l.cards.slice(0, 3).map((c) => pic(c)).join('')}</div>
        <div class="lr-text"><small>BÀI ${l.no}</small><h3>${esc(l.title)}</h3><p>${l.titleEn ? esc(l.titleEn) + ' · ' : ''}${l.cards.length} thẻ từ · ${l.cards.slice(0, 5).map((c) => esc(c.en)).join(', ')}…</p>${progressBar(pct(ln, keys.length), 'thin')}</div>
        <span class="lr-count">${ln}/${keys.length}</span>
      </a>`;
    }).join('')}</div>`;
}

function renderLesson(el, id) {
  const l = db.lessonMap.get(id);
  if (!l) return void (el.innerHTML = emptyState('🤔', 'Không tìm thấy bài học', '', '<a class="btn primary" href="#/groups">Về danh sách</a>'));
  const idx = l.group.lessons.indexOf(l);
  const prev = l.group.lessons[idx - 1], next = l.group.lessons[idx + 1];
  el.innerHTML = `<a class="back" href="#/group/${encodeURIComponent(l.group.id)}">← ${l.group.emoji} ${esc(l.group.title)}</a>
    ${pageHead(`BÀI ${l.no} / ${l.group.lessons.length}`, esc(l.title), `${l.titleEn ? esc(l.titleEn) + ' · ' : ''}${l.cards.length} thẻ từ`, practiceButtons(`lesson:${l.id}`))}
    <div class="grid cards">${l.cards.map((c) => wordCard(c)).join('')}</div>
    <div class="pager">${prev ? `<a class="btn ghost" href="#/lesson/${encodeURIComponent(prev.id)}">← ${esc(prev.title)}</a>` : '<span></span>'}${next ? `<a class="btn ghost" href="#/lesson/${encodeURIComponent(next.id)}">${esc(next.title)} →</a>` : ''}</div>`;
}

function renderSaved(el) {
  const list = store.savedKeys().map((k) => db.wordMap.get(k)).filter(Boolean);
  el.innerHTML = `${pageHead('TỪ ĐÃ LƯU', `${fmt(list.length)} từ đã lưu ♥`, 'Bấm ♡ trên bất kỳ thẻ từ nào để lưu lại và ôn riêng.', list.length ? practiceButtons('saved') : '')}
    ${list.length ? `<div class="grid cards" id="saved-grid"></div><div class="center"><button class="btn ghost" id="more-btn">Xem thêm</button></div>` : emptyState('♡', 'Chưa có từ nào được lưu', 'Hãy mở <a href="#/words">bộ từ vựng</a> và bấm ♡ để lưu từ bạn muốn ôn riêng.')}`;
  if (list.length) paginate(list, $('#saved-grid', el), $('#more-btn', el), 48, { showGroup: true });
}

function renderSearch(el, _arg, q) {
  const query = q.q || '';
  $('#search-input').value = query;
  const words = searchWords(query, 120);
  const groups = searchGroups(query);
  el.innerHTML = `${pageHead('TÌM KIẾM', `Kết quả cho “${esc(query)}”`, `${fmt(words.length)} từ · ${groups.length} chủ đề / bài học`)}
    ${groups.length ? `<div class="chips">${groups.map(({ group, lesson }) => `<a class="chip" href="${lesson ? `#/lesson/${encodeURIComponent(lesson.id)}` : `#/group/${encodeURIComponent(group.id)}`}">${group.emoji} ${esc(lesson ? `${group.title} › ${lesson.title}` : group.title)}</a>`).join('')}</div>` : ''}
    ${words.length ? `<div class="grid cards">${words.map((w) => wordCard(w, { showGroup: true })).join('')}</div>` : emptyState('🔍', 'Không tìm thấy từ phù hợp', 'Thử từ tiếng Anh khác hoặc gõ nghĩa tiếng Việt (có thể không dấu).')}`;
}

function renderProgress(el) {
  const s = store.summary(allKeys);
  const st = store.state;
  const days = [...Array(14)].map((_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (13 - i));
    const k = d.toLocaleDateString('sv-SE');
    return { label: `${d.getDate()}/${d.getMonth() + 1}`, v: st.daily[k]?.reviews || 0 };
  });
  const maxV = Math.max(5, ...days.map((d) => d.v));
  const totalReviews = Object.values(st.daily).reduce((n, d) => n + d.reviews, 0);
  const topGroups = db.groups.map((g) => ({ g, n: g.keys.filter((k) => st.srs[k]?.reps >= 1).length })).sort((a, b) => b.n / b.g.keys.length - a.n / a.g.keys.length).slice(0, 8);
  el.innerHTML = `${pageHead('TIẾN ĐỘ & CÀI ĐẶT', 'Bảng theo dõi trí nhớ', 'Mọi tiến độ được lưu ngay trong trình duyệt (localStorage). Xuất tệp JSON để sao lưu hoặc chuyển sang thiết bị khác.')}
    <div class="stats six">
      <div class="stat"><div><b>${s.remembered}%</b><small>Tiến độ ghi nhớ tổng thể</small></div></div>
      <div class="stat"><div><b>${fmt(s.learned)}</b><small>Từ đã thuộc / ${fmt(allKeys.length)}</small></div></div>
      <div class="stat"><div><b>${fmt(s.saved)}</b><small>Từ đã lưu</small></div></div>
      <div class="stat"><div><b>${fmt(s.due)}</b><small>Đến hạn ôn hôm nay</small></div></div>
      <div class="stat"><div><b>${store.streak()}🔥</b><small>Chuỗi ngày học</small></div></div>
      <div class="stat"><div><b>${fmt(totalReviews)}</b><small>Tổng lượt ôn</small></div></div>
    </div>
    <div class="grid two">
      <section class="panel"><h3>Phân bố trạng thái từ</h3>
        <div class="stack-bar">${Object.entries(s.byStatus).map(([k, v]) => `<i class="st-bg-${k}" style="flex:${v}" title="${STATUS_LABEL[k]}: ${v}"></i>`).join('')}</div>
        <ul class="legend">${Object.entries(s.byStatus).map(([k, v]) => `<li><i class="st-bg-${k}"></i>${STATUS_LABEL[k]} <b>${fmt(v)}</b></li>`).join('')}</ul>
        <p class="muted small">Mới: chưa học · Đang học: khoảng ôn &lt; 6 ngày · Đang ôn: 6–20 ngày · Thuộc lòng: ≥ 21 ngày.</p>
      </section>
      <section class="panel"><h3>Lượt ôn 14 ngày qua</h3>
        <div class="chart">${days.map((d) => `<div class="col" title="${d.label}: ${d.v} lượt"><i style="height:${(d.v / maxV) * 100}%"></i><small>${d.label.split('/')[0]}</small></div>`).join('')}</div>
      </section>
      <section class="panel"><h3>Nhóm chủ đề tiến bộ nhất</h3>
        ${topGroups.map(({ g, n }) => `<a class="mini-row" href="#/group/${encodeURIComponent(g.id)}"><span>${g.emoji} ${esc(g.title)}</span>${progressBar(pct(n, g.keys.length), 'thin')}<b>${n}/${g.keys.length}</b></a>`).join('')}
      </section>
      <section class="panel"><h3>Lịch sử kiểm tra</h3>
        ${st.quiz.length ? st.quiz.slice(0, 8).map((r) => `<div class="mini-row"><span>${esc(r.label)} · ${new Date(r.at).toLocaleDateString('vi-VN')}</span>${progressBar(pct(r.correct, r.total), 'thin')}<b>${r.correct}/${r.total}</b></div>`).join('') : '<p class="muted">Chưa làm bài kiểm tra nào. <a href="#/quiz">Làm ngay →</a></p>'}
      </section>
    </div>
    <section class="panel settings"><h3>Cài đặt học tập</h3>
      <label>Số từ mới mỗi ngày <input type="number" min="1" max="200" id="set-new" value="${st.settings.newPerDay}"></label>
      <label>Số thẻ mỗi phiên <input type="number" min="5" max="200" id="set-size" value="${st.settings.sessionSize}"></label>
      <label class="check"><input type="checkbox" id="set-auto" ${st.settings.autoSpeak ? 'checked' : ''}> Tự động phát âm khi lật thẻ</label>
      <div class="row gap wrap">
        <button class="btn primary" id="btn-export">⇩ Xuất tiến độ (JSON)</button>
        <label class="btn ghost">⇧ Nhập tiến độ<input type="file" accept="application/json" id="btn-import" hidden></label>
        <button class="btn danger-soft" id="btn-reset">Xóa toàn bộ tiến độ</button>
      </div>
    </section>`;
  $('#set-new', el).addEventListener('change', (e) => store.setSetting('newPerDay', Math.max(1, Math.min(200, +e.target.value || 15))));
  $('#set-size', el).addEventListener('change', (e) => store.setSetting('sessionSize', Math.max(5, Math.min(200, +e.target.value || 20))));
  $('#set-auto', el).addEventListener('change', (e) => store.setSetting('autoSpeak', e.target.checked));
  $('#btn-export', el).addEventListener('click', exportProgress);
  $('#btn-import', el).addEventListener('change', async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    try {
      store.importJSON(await f.text());
      toast('Đã nhập tiến độ thành công');
      route();
    } catch (err) {
      toast('Lỗi: ' + err.message);
    }
  });
  $('#btn-reset', el).addEventListener('click', () => {
    if (confirm('Xóa toàn bộ tiến độ học, từ đã lưu và lịch sử? Không thể hoàn tác.')) {
      store.reset();
      toast('Đã xóa tiến độ');
      route();
    }
  });
}

/* ---------------- boot ---------------- */
async function boot() {
  bindShell();
  try {
    await loadData();
  } catch (e) {
    view.innerHTML = emptyState('⚠️', 'Không tải được dữ liệu', `${esc(e.message)}. Hãy chạy website qua một web server (xem README), không mở trực tiếp file index.html.`);
    return;
  }
  allKeys = db.words.map((w) => w.key);
  $('#nav-unique').textContent = fmt(db.words.length);
  updateShell();
  route();
}

export const getAllKeys = () => allKeys;
boot();
