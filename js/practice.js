// Practice views: SM-2 flashcards, listening & shadowing, role-play scenarios, 4-skill quiz.
import { db, scopeCards, scopeLabel } from './data.js';
import { store } from './store.js';
import { isDue, previewInterval, formatInterval } from './sm2.js';
import { speak, stopSpeaking, srSupported, recSupported, recognize, speechScore, startRecording, levenshtein } from './speech.js';
import { $, $$, esc, fmt, pct, shuffle, toast, progressBar } from './ui.js';
import { say, pic, sayBtn, saveBtn, emptyState, pageHead, wordCard } from './components.js';
import { afterRender, scenarioCard } from './app.js';
import { SCENARIOS, CATEGORIES } from './scenarios.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function scopeSelect(scope, { allowAll = true } = {}) {
  const opt = (v, label) => `<option value="${esc(v)}" ${v === scope ? 'selected' : ''}>${esc(label)}</option>`;
  const lessonOpt = scope.startsWith('lesson:') ? opt(scope, '📘 ' + scopeLabel(scope)) : '';
  return `<select class="select" id="scope-select" aria-label="Phạm vi học">
    <optgroup label="Chung">${allowAll ? opt('all', `🌟 Toàn bộ ${fmt(db.words.length)} từ`) : ''}${opt('saved', '♥ Từ đã lưu')}${opt('studied', '🧠 Từ đã học')}${opt('learned', '✓ Từ đã thuộc')}${lessonOpt}</optgroup>
    <optgroup label="Mind Map · 19 nhóm">${db.groups.filter((g) => g.book === 'mm').map((g) => opt(`group:${g.id}`, `${g.emoji} ${g.title}`)).join('')}</optgroup>
    <optgroup label="2.000+ Giao tiếp · 30 nhóm">${db.groups.filter((g) => g.book === 'use').map((g) => opt(`group:${g.id}`, `${g.emoji} ${g.title}`)).join('')}</optgroup>
  </select>`;
}

function bindScope(el, route) {
  $('#scope-select', el)?.addEventListener('change', (e) => (location.hash = `#/${route}?scope=${encodeURIComponent(e.target.value)}`));
}

function distractors(card, n, field) {
  const pick = [];
  const used = new Set([card.key, String(card[field]).toLowerCase()]);
  const pools = [shuffle(card.group.cards), shuffle(db.words.slice(0, 4000)).slice(0, 80)];
  for (const pool of pools) {
    for (const c of pool) {
      const v = String(c[field]).toLowerCase();
      if (used.has(c.key) || used.has(v)) continue;
      used.add(c.key);
      used.add(v);
      pick.push(c);
      if (pick.length >= n) return pick;
    }
  }
  return pick;
}

/* =================== Flashcards (SM-2) =================== */
export function renderFlashcards(el, _a, q) {
  const scope = q.scope || 'all';
  const dir = q.dir === 'vi' ? 'vi' : 'en';
  const now = Date.now();
  const cards = scopeCards(scope, store);
  const size = store.settings.sessionSize;
  const due = cards.filter((c) => isDue(store.item(c.key), now)).sort((a, b) => store.item(a.key).due - store.item(b.key).due);
  const fresh = cards.filter((c) => !store.item(c.key));
  let queue;
  if (scope === 'list') queue = cards.slice(0, 100);
  else if (q.extra === 'new') queue = fresh.slice(0, size);
  else if (q.extra === 'ahead') queue = cards.filter((c) => store.item(c.key)).sort((a, b) => store.item(a.key).due - store.item(b.key).due).slice(0, size);
  else {
    const newLimit = scope === 'all' ? Math.max(0, store.settings.newPerDay - store.newToday()) : size;
    queue = [...due.slice(0, size), ...fresh.slice(0, Math.max(0, Math.min(newLimit, size - due.length)))];
  }
  const base = `#/flashcards?scope=${encodeURIComponent(scope)}`;
  const head = pageHead('FLASHCARDS · SUPERMEMO SM-2', 'Học thẻ từ lặp lại ngắt quãng', `${esc(scopeLabel(scope))} · ${fmt(due.length)} từ đến hạn · ${fmt(fresh.length)} từ mới`,
    `${scopeSelect(scope)}<a class="btn ghost" href="${base}&dir=${dir === 'en' ? 'vi' : 'en'}" title="Đổi chiều thẻ">${dir === 'en' ? 'EN → VI' : 'VI → EN'} ⇄</a>`);

  if (!queue.length) {
    el.innerHTML = `${head}${emptyState('🎉', 'Bạn đã hoàn thành phiên học hôm nay!', `Không còn thẻ đến hạn${scope === 'all' ? ' và đã đạt mục tiêu từ mới trong ngày' : ''}. Lặp lại ngắt quãng hiệu quả nhất khi bạn quay lại vào ngày mai.`,
      `<div class="row gap wrap center">${fresh.length ? `<a class="btn primary" href="${base}&extra=new">+ Học thêm ${Math.min(size, fresh.length)} từ mới</a>` : ''}${cards.some((c) => store.item(c.key)) ? `<a class="btn ghost" href="${base}&extra=ahead">Ôn trước hạn</a>` : ''}<a class="btn ghost" href="#/quiz?scope=${encodeURIComponent(scope)}">◇ Làm bài kiểm tra</a></div>`)}`;
    bindScope(el, 'flashcards');
    return;
  }

  let i = 0, flipped = false, good = 0, bad = 0;
  const requeued = new Map();
  const total = queue.length;
  el.innerHTML = `${head}<div class="fc-wrap"><div class="fc-meta"><span id="fc-count"></span><span><b class="ok" id="fc-good">0</b> nhớ · <b class="bad" id="fc-bad">0</b> chưa nhớ</span></div><div id="fc-progress"></div><div id="fc-stage"></div>
    <p class="muted small center">Phím tắt: <kbd>Space</kbd> lật thẻ · <kbd>1</kbd> Chưa nhớ · <kbd>2</kbd> Khó · <kbd>3</kbd> Nhớ · <kbd>4</kbd> Dễ</p></div>`;
  bindScope(el, 'flashcards');
  const stage = $('#fc-stage', el);

  const show = () => {
    if (i >= queue.length) return finish();
    flipped = false;
    const c = queue[i];
    const it = store.item(c.key);
    const front = dir === 'en'
      ? `<div class="fc-pic">${pic(c, 'big')}</div><h2>${esc(c.en)}</h2><p class="ipa big">${esc(c.ipa)}</p><p class="muted">${esc(c.pos)} · ${esc(c.level)}</p>`
      : `<div class="fc-pic">${pic(c, 'big', { hideWord: true })}</div><h2 class="vi-front">${esc(c.vi)}</h2><p class="muted">${esc(c.pos)} · ${esc(c.level)} · Từ tiếng Anh là gì?</p>`;
    const grades = [[1, '✗ Chưa nhớ', 'danger-soft'], [3, 'Khó', 'ghost'], [4, '✓ Nhớ', 'success'], [5, 'Dễ', 'primary']];
    stage.innerHTML = `<div class="flip" id="flip" tabindex="0" role="button" aria-label="Lật thẻ">
        <div class="flip-inner">
          <div class="face front">${!it ? '<span class="new-tag">TỪ MỚI</span>' : ''}${saveBtn(c.key)}${front}<p class="hint">Chạm để lật thẻ ↻</p></div>
          <div class="face back">${saveBtn(c.key)}<h2>${esc(c.en)} ${sayBtn(c.en)}</h2><p class="ipa">${esc(c.ipa)}</p><p class="vi big">${esc(c.vi)}</p>${c.col ? `<p class="col">Cụm từ: <b>${esc(c.col)}</b></p>` : ''}<div class="example"><p>“${esc(c.ex)}” ${sayBtn(c.ex)}</p><p class="ex-vi">${esc(c.exVi)}</p></div><p class="from">${c.group.emoji} ${esc(c.group.title)} › ${esc(c.lesson.title)}</p></div>
        </div>
      </div>
      <div class="grade-row" id="grade-row">
        <button class="btn primary wide" id="flip-btn">Lật thẻ (Space)</button>
      </div>`;
    $('#grade-row', stage).dataset.grades = JSON.stringify(grades);
    $('#fc-count', el).textContent = `Thẻ ${Math.min(i + 1, queue.length)} / ${queue.length}`;
    $('#fc-progress', el).innerHTML = progressBar(pct(i, queue.length));
    $('#flip', stage).addEventListener('click', (e) => !e.target.closest('button') && flip());
    $('#flip-btn', stage).addEventListener('click', flip);
    afterRender(stage);
    if (dir === 'en' && store.settings.autoSpeak) say(c.en);
  };

  const flip = () => {
    if (flipped) return;
    flipped = true;
    const c = queue[i];
    $('#flip', stage).classList.add('flipped');
    const it = store.item(c.key);
    const grades = JSON.parse($('#grade-row', stage).dataset.grades);
    $('#grade-row', stage).innerHTML = grades.map(([g, label, cls], k) => `<button class="btn ${cls}" data-g="${g}"><span>${label}</span><small>${k + 1} · ${formatInterval(previewInterval(it, g))}</small></button>`).join('');
    $$('[data-g]', stage).forEach((b) => b.addEventListener('click', () => grade(+b.dataset.g)));
    if (store.settings.autoSpeak) say(dir === 'en' ? c.ex : c.en);
  };

  const grade = (g) => {
    if (!flipped) return;
    const c = queue[i];
    store.grade(c.key, g);
    if (g >= 3) good++;
    else {
      bad++;
      const n = requeued.get(c.key) || 0;
      if (n < 2) {
        requeued.set(c.key, n + 1);
        queue.splice(Math.min(queue.length, i + 4), 0, c);
      }
    }
    $('#fc-good', el).textContent = good;
    $('#fc-bad', el).textContent = bad;
    i++;
    stopSpeaking();
    show();
  };

  const finish = () => {
    $('#fc-progress', el).innerHTML = progressBar(100);
    $('#fc-count', el).textContent = `Hoàn thành ${total} thẻ`;
    stage.innerHTML = emptyState('🏆', 'Hoàn thành phiên học!', `Bạn đã ôn <b>${total}</b> từ: <b class="ok">${good}</b> lượt nhớ, <b class="bad">${bad}</b> lượt chưa nhớ. Lịch ôn SM-2 đã được cập nhật.`,
      `<div class="row gap wrap center"><a class="btn primary" href="${base}&t=${Date.now()}">Phiên tiếp theo</a><a class="btn ghost" href="#/quiz?scope=${encodeURIComponent(scope)}">◇ Kiểm tra lại</a><a class="btn ghost" href="#/progress">📈 Xem tiến độ</a></div>`);
  };

  const onKey = (e) => {
    if (e.target.matches('input,select,textarea')) return;
    if (e.code === 'Space' || e.key === 'Enter') {
      e.preventDefault();
      flip();
    } else if (['1', '2', '3', '4'].includes(e.key) && flipped) grade([1, 3, 4, 5][+e.key - 1]);
  };
  document.addEventListener('keydown', onKey);
  show();
  return () => document.removeEventListener('keydown', onKey);
}

/* =================== Listening & Shadowing =================== */
export function renderListen(el, _a, q) {
  const scope = q.scope || `group:${db.groups[0].id}`;
  const list = scopeCards(scope, store);
  const opts = { repeat: 2, example: true, vi: false, shadow: true, gap: 1 };
  let i = 0, playing = false, runId = 0, recorder = null;

  el.innerHTML = `${pageHead('LUYỆN NGHE & SHADOWING', 'Nghe rảnh tay – nhại theo giọng bản xứ', 'Phát lần lượt từ → câu ví dụ, có khoảng dừng để bạn nhắc lại (shadowing). Bấm 🎙️ để chấm điểm phát âm hoặc ⏺ để ghi âm và so sánh.', scopeSelect(scope))}
    ${list.length ? `<div class="listen">
      <div class="player panel">
        <div id="lp-card"></div>
        <div class="lp-controls">
          <button class="icon-btn lg" id="lp-prev" aria-label="Từ trước">⏮</button>
          <button class="play-btn" id="lp-play" aria-label="Phát">▶</button>
          <button class="icon-btn lg" id="lp-next" aria-label="Từ tiếp">⏭</button>
        </div>
        <div id="lp-progress"></div>
        <div class="lp-shadow">
          ${srSupported ? '<button class="btn ghost" id="lp-mic">🎙️ Nói lại câu ví dụ</button>' : ''}
          ${recSupported ? '<button class="btn ghost" id="lp-rec">⏺ Ghi âm giọng tôi</button>' : ''}
          <span id="lp-result" class="muted"></span>
        </div>
      </div>
      <aside class="panel lp-opts">
        <h3>Tùy chọn</h3>
        <label>Lặp mỗi từ <select class="select sm" id="o-repeat">${[1, 2, 3].map((n) => `<option ${n === opts.repeat ? 'selected' : ''}>${n}</option>`).join('')}</select> lần</label>
        <label>Khoảng nghỉ <select class="select sm" id="o-gap">${[0.5, 1, 2, 3].map((n) => `<option value="${n}" ${n === opts.gap ? 'selected' : ''}>${n}s</option>`).join('')}</select></label>
        <label class="check"><input type="checkbox" id="o-example" checked> Đọc câu ví dụ</label>
        <label class="check"><input type="checkbox" id="o-vi"> Đọc nghĩa tiếng Việt</label>
        <label class="check"><input type="checkbox" id="o-shadow" checked> Dừng để tôi nhắc lại (shadowing)</label>
        <button class="btn ghost sm" id="o-shuffle">🔀 Trộn thứ tự</button>
        <h3>Danh sách (${fmt(list.length)} từ)</h3>
        <ol class="lp-list" id="lp-list"></ol>
      </aside>
    </div>` : emptyState('🎧', 'Chưa có từ nào trong phạm vi này', 'Hãy chọn một nhóm chủ đề khác ở menu phía trên.')}`;
  bindScope(el, 'listen');
  if (!list.length) return;

  const renderList = () => {
    $('#lp-list', el).innerHTML = list.slice(0, 400).map((c, k) => `<li data-i="${k}" class="${k === i ? 'on' : ''}"><b>${esc(c.en)}</b> <span>${esc(c.vi)}</span></li>`).join('') + (list.length > 400 ? `<li class="muted">… và ${fmt(list.length - 400)} từ nữa</li>` : '');
  };
  const renderCard = (phase = '') => {
    const c = list[i];
    $('#lp-card', el).innerHTML = `<div class="lp-card"><div class="lp-pic">${pic(c, 'big')}</div><div><p class="kicker">${i + 1} / ${fmt(list.length)} ${phase ? '· ' + phase : ''}</p><h2>${esc(c.en)} ${sayBtn(c.en)}</h2><p class="ipa big">${esc(c.ipa)}</p><p class="vi big">${esc(c.vi)}</p><div class="example"><p>“${esc(c.ex)}” ${sayBtn(c.ex)}</p><p class="ex-vi">${esc(c.exVi)}</p></div></div></div>`;
    $('#lp-progress', el).innerHTML = progressBar(pct(i + 1, list.length), 'thin');
    $$('#lp-list li', el).forEach((li) => li.classList.toggle('on', +li.dataset.i === i));
    $('#lp-list li.on', el)?.scrollIntoView({ block: 'nearest' });
    afterRender($('#lp-card', el));
  };
  const setPlaying = (p) => {
    playing = p;
    $('#lp-play', el).textContent = p ? '⏸' : '▶';
    if (!p) {
      runId++;
      stopSpeaking();
    }
  };
  const shadowPause = (text) => (opts.shadow ? sleep(1200 + text.length * 75) : Promise.resolve());

  const loop = async () => {
    const my = ++runId;
    const alive = () => my === runId && playing;
    while (alive() && i < list.length) {
      const c = list[i];
      renderCard('đang phát');
      for (let r = 0; r < opts.repeat && alive(); r++) {
        await say(c.en);
        if (!alive()) return;
        await shadowPause(c.en);
        await sleep(opts.gap * 1000);
      }
      if (alive() && opts.example) {
        renderCard('câu ví dụ');
        await say(c.ex);
        if (!alive()) return;
        await shadowPause(c.ex);
        await sleep(opts.gap * 1000);
      }
      if (alive() && opts.vi) {
        await speak(c.vi, { lang: 'vi-VN', rate: store.settings.rate });
        await sleep(opts.gap * 1000);
      }
      if (!alive()) return;
      if (i < list.length - 1) i++;
      else {
        setPlaying(false);
        renderCard('hoàn thành');
        toast('Đã nghe hết danh sách 🎉');
        return;
      }
    }
  };

  $('#lp-play', el).addEventListener('click', () => {
    if (playing) setPlaying(false);
    else {
      setPlaying(true);
      loop();
    }
  });
  const jump = (k) => {
    i = Math.max(0, Math.min(list.length - 1, k));
    const was = playing;
    setPlaying(false);
    renderCard();
    if (was) {
      setPlaying(true);
      loop();
    }
  };
  $('#lp-prev', el).addEventListener('click', () => jump(i - 1));
  $('#lp-next', el).addEventListener('click', () => jump(i + 1));
  $('#lp-list', el).addEventListener('click', (e) => {
    const li = e.target.closest('li[data-i]');
    if (li) jump(+li.dataset.i);
  });
  $('#o-repeat', el).addEventListener('change', (e) => (opts.repeat = +e.target.value));
  $('#o-gap', el).addEventListener('change', (e) => (opts.gap = +e.target.value));
  $('#o-example', el).addEventListener('change', (e) => (opts.example = e.target.checked));
  $('#o-vi', el).addEventListener('change', (e) => (opts.vi = e.target.checked));
  $('#o-shadow', el).addEventListener('change', (e) => (opts.shadow = e.target.checked));
  $('#o-shuffle', el).addEventListener('click', () => {
    const sh = shuffle(list);
    list.splice(0, list.length, ...sh);
    renderList();
    jump(0);
  });
  $('#lp-mic', el)?.addEventListener('click', async () => {
    setPlaying(false);
    const c = list[i];
    const out = $('#lp-result', el);
    out.textContent = '🎙️ Đang nghe… đọc to câu ví dụ';
    try {
      const alts = await recognize(store.settings.accent);
      const { score, heard } = speechScore(c.ex, alts);
      out.innerHTML = alts.length ? `Bạn nói: “${esc(heard)}” · <b class="${score >= 75 ? 'ok' : 'bad'}">${score}/100</b>` : 'Không nghe rõ, thử lại nhé.';
    } catch (err) {
      out.textContent = 'Không dùng được micro: ' + err.message;
    }
  });
  $('#lp-rec', el)?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    const out = $('#lp-result', el);
    if (!recorder) {
      setPlaying(false);
      try {
        recorder = await startRecording();
        btn.textContent = '⏹ Dừng ghi âm';
        out.textContent = 'Đang ghi âm…';
      } catch (err) {
        out.textContent = 'Không truy cập được micro: ' + err.message;
      }
    } else {
      const url = await recorder.stop();
      recorder = null;
      btn.textContent = '⏺ Ghi âm giọng tôi';
      out.innerHTML = `<audio controls src="${url}"></audio> ${sayBtn(list[i].ex, '🔊 Nghe mẫu')}`;
    }
  });
  renderList();
  renderCard();
  return () => {
    runId++;
    playing = false;
    recorder?.stop();
  };
}

/* =================== Scenarios =================== */
export function renderScenarios(el, _a, q) {
  const cat = q.cat || 'all';
  const list = cat === 'all' ? SCENARIOS : SCENARIOS.filter((s) => s.cat === cat);
  el.innerHTML = `${pageHead('GIAO TIẾP TÌNH HUỐNG', '12 tình huống đóng vai thực tế', 'Nghe cả đoạn hội thoại, sau đó nhập vai một nhân vật: đến lượt bạn thì nói câu thoại (có chấm điểm phát âm) trước khi xem câu mẫu.')}
    <div class="chips tabs">${[['all', 'Tất cả 12'], ...Object.entries(CATEGORIES)].map(([k, v]) => `<a class="chip ${k === cat ? 'on' : ''}" href="#/scenarios?cat=${k}">${v}</a>`).join('')}</div>
    <div class="grid three">${list.map(scenarioCard).join('')}</div>`;
}

export function renderScenario(el, id) {
  const sc = SCENARIOS.find((s) => s.id === id);
  if (!sc) return void (el.innerHTML = emptyState('🤔', 'Không tìm thấy tình huống', '', '<a class="btn primary" href="#/scenarios">Về danh sách</a>'));
  let showVi = true, role = null, step = 0, runId = 0;
  const idx = SCENARIOS.indexOf(sc);
  const next = SCENARIOS[(idx + 1) % SCENARIOS.length];

  el.innerHTML = `<a class="back" href="#/scenarios">← 12 tình huống</a>
    ${pageHead(`${sc.emoji} ${CATEGORIES[sc.cat].toUpperCase()} · ${sc.level}`, esc(sc.title), `${esc(sc.titleEn)} · ${esc(sc.desc)}`)}
    <div class="chips kw">${sc.keywords.map(([en, vi]) => `<button class="chip" data-say="${esc(en)}">🔊 <b>${esc(en)}</b> · ${esc(vi)}</button>`).join('')}</div>
    <div class="sc-controls panel">
      <button class="btn primary" id="sc-play">▶ Nghe cả hội thoại</button>
      <button class="btn ghost" data-role="A">🎭 Đóng vai ${esc(sc.roles.A)}</button>
      <button class="btn ghost" data-role="B">🎭 Đóng vai ${esc(sc.roles.B)}</button>
      <label class="check"><input type="checkbox" id="sc-vi" checked> Hiện nghĩa tiếng Việt</label>
    </div>
    <div class="dialog" id="dialog"></div>
    <div class="pager"><span></span><a class="btn ghost" href="#/scenario/${next.id}">${next.emoji} ${esc(next.title)} →</a></div>`;
  const dialog = $('#dialog', el);

  const bubble = (t, k, extra = '') => `<div class="bubble ${t.who === 'B' ? 'right' : 'left'} ${extra}" data-k="${k}">
      <div class="who">${esc(t.speaker)}</div>
      <p class="en">${esc(t.en)} ${sayBtn(t.en)}</p>
      ${showVi ? `<p class="vi-line">${esc(t.vi)}</p>` : ''}
    </div>`;

  const renderAll = (active = -1) => {
    dialog.innerHTML = sc.turns.map((t, k) => bubble(t, k, k === active ? 'active' : '')).join('');
  };

  const renderRoleplay = () => {
    const html = [];
    for (let k = 0; k < step && k < sc.turns.length; k++) html.push(bubble(sc.turns[k], k));
    if (step < sc.turns.length) {
      const t = sc.turns[step];
      if (t.who === role) {
        html.push(`<div class="bubble ${t.who === 'B' ? 'right' : 'left'} mine" data-k="${step}">
          <div class="who">Lượt của bạn · ${esc(sc.roles[role])}</div>
          <p class="vi-line">💡 Hãy nói: <b>${esc(t.vi)}</b></p>
          <p class="en hidden-line" id="rp-answer">${esc(t.en)} ${sayBtn(t.en)}</p>
          <p id="rp-result" class="muted"></p>
          <div class="row gap wrap">
            ${srSupported ? '<button class="btn primary sm" id="rp-mic">🎙️ Nói</button>' : ''}
            <button class="btn ghost sm" id="rp-reveal">👁 Xem câu mẫu</button>
            <button class="btn success sm" id="rp-next">Tiếp →</button>
          </div>
        </div>`);
      } else html.push(bubble(t, step, 'active typing'));
    } else {
      html.push(`<div class="done-box">🎉 Hoàn thành vai ${esc(sc.roles[role])}! <button class="btn primary sm" id="rp-again">Luyện lại</button> <button class="btn ghost sm" id="rp-swap">Đổi vai</button></div>`);
    }
    dialog.innerHTML = html.join('');
    dialog.lastElementChild?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    const t = sc.turns[step];
    if (!t) {
      store.markScenario(sc.id);
      $('#rp-again', dialog).addEventListener('click', () => startRole(role));
      $('#rp-swap', dialog).addEventListener('click', () => startRole(role === 'A' ? 'B' : 'A'));
      return;
    }
    if (t.who !== role) {
      const my = ++runId;
      say(t.en).then(() => sleep(500)).then(() => {
        if (my !== runId) return;
        step++;
        renderRoleplay();
      });
      return;
    }
    $('#rp-reveal', dialog).addEventListener('click', () => $('#rp-answer', dialog).classList.remove('hidden-line'));
    $('#rp-next', dialog).addEventListener('click', () => {
      step++;
      renderRoleplay();
    });
    $('#rp-mic', dialog)?.addEventListener('click', async () => {
      const out = $('#rp-result', dialog);
      out.textContent = '🎙️ Đang nghe…';
      try {
        const alts = await recognize(store.settings.accent);
        const { score, heard } = speechScore(t.en, alts);
        out.innerHTML = alts.length ? `Bạn nói: “${esc(heard)}” · <b class="${score >= 70 ? 'ok' : 'bad'}">${score}/100</b>` : 'Không nghe rõ, thử lại nhé.';
        $('#rp-answer', dialog).classList.remove('hidden-line');
      } catch (err) {
        out.textContent = 'Không dùng được micro: ' + err.message;
      }
    });
  };

  const startRole = (r) => {
    runId++;
    stopSpeaking();
    role = r;
    step = 0;
    $$('[data-role]', el).forEach((b) => b.classList.toggle('on', b.dataset.role === r));
    renderRoleplay();
  };

  $('#sc-play', el).addEventListener('click', async () => {
    role = null;
    $$('[data-role]', el).forEach((b) => b.classList.remove('on'));
    const my = ++runId;
    for (let k = 0; k < sc.turns.length; k++) {
      if (my !== runId) return;
      renderAll(k);
      dialog.querySelector('.active')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      await say(sc.turns[k].en);
      await sleep(450);
    }
    if (my === runId) {
      renderAll();
      store.markScenario(sc.id);
    }
  });
  $$('[data-role]', el).forEach((b) => b.addEventListener('click', () => startRole(b.dataset.role)));
  $('#sc-vi', el).addEventListener('change', (e) => {
    showVi = e.target.checked;
    role ? renderRoleplay() : renderAll();
  });
  renderAll();
  return () => runId++;
}

/* =================== Quiz: 4 skills =================== */
const SKILLS = {
  listening: { icon: '🎧', name: 'Nghe', desc: 'Nghe phát âm, chọn nghĩa đúng' },
  speaking: { icon: '🎙️', name: 'Nói', desc: 'Đọc to từ, chấm điểm phát âm' },
  reading: { icon: '📖', name: 'Đọc', desc: 'Điền từ còn thiếu vào câu' },
  writing: { icon: '✍️', name: 'Viết', desc: 'Nhìn nghĩa, gõ đúng từ tiếng Anh' },
  mixed: { icon: '🔀', name: 'Tổng hợp', desc: 'Trộn cả 4 kỹ năng' },
};

const clozeRe = (word) => new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');

function buildQuestion(card, skill) {
  if (skill === 'listening' || skill === 'speaking' || skill === 'writing') {
    const opts = skill === 'listening' ? shuffle([card, ...distractors(card, 3, 'vi')]) : null;
    return { card, skill, opts };
  }
  const re = clozeRe(card.en);
  if (re.test(card.ex)) {
    return { card, skill, cloze: card.ex.replace(re, '_____'), opts: shuffle([card, ...distractors(card, 3, 'en')]) };
  }
  return { card, skill, opts: shuffle([card, ...distractors(card, 3, 'vi')]), meaning: true };
}

export function renderQuiz(el, _a, q) {
  let scope = q.scope || 'all';
  let skill = q.skill && SKILLS[q.skill] ? q.skill : 'mixed';
  let count = 10;

  const setup = () => {
    el.innerHTML = `${pageHead('KIỂM TRA 4 KỸ NĂNG', 'Nghe · Nói · Đọc · Viết', 'Câu hỏi được tạo tự động từ bộ từ vựng. Câu trả lời sai sẽ được đưa vào lịch ôn SM-2 để bạn gặp lại sớm hơn.')}
      <div class="skill-grid">${Object.entries(SKILLS).map(([k, s]) => `<button class="skill ${k === skill ? 'on' : ''}" data-skill="${k}"><span>${s.icon}</span><b>${s.name}</b><small>${s.desc}</small></button>`).join('')}</div>
      <div class="panel quiz-setup">
        <label>Phạm vi ${scopeSelect(scope)}</label>
        <label>Số câu <select class="select sm" id="q-count">${[10, 20, 30].map((n) => `<option ${n === count ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
        <button class="btn primary" id="q-start">Bắt đầu kiểm tra →</button>
      </div>
      ${!srSupported ? '<p class="muted small">Trình duyệt này chưa hỗ trợ nhận dạng giọng nói — phần Nói sẽ dùng chế độ tự đánh giá (nghe mẫu, đọc to rồi tự chấm). Dùng Chrome/Edge để được chấm tự động.</p>' : ''}`;
    $$('[data-skill]', el).forEach((b) => b.addEventListener('click', () => {
      skill = b.dataset.skill;
      $$('[data-skill]', el).forEach((x) => x.classList.toggle('on', x === b));
    }));
    $('#scope-select', el).addEventListener('change', (e) => (scope = e.target.value));
    $('#q-count', el).addEventListener('change', (e) => (count = +e.target.value));
    $('#q-start', el).addEventListener('click', start);
  };

  let questions = [], idx = 0, results = [];
  const start = () => {
    const pool = shuffle(scopeCards(scope, store));
    if (pool.length < 1) return toast('Phạm vi này chưa có từ nào — hãy chọn phạm vi khác');
    const order = ['listening', 'reading', 'writing', 'speaking'];
    questions = [];
    for (let k = 0; k < count; k++) questions.push(buildQuestion(pool[k % pool.length], skill === 'mixed' ? order[k % 4] : skill));
    idx = 0;
    results = [];
    ask();
  };

  const ask = () => {
    if (idx >= questions.length) return finish();
    const qn = questions[idx];
    const c = qn.card;
    const s = SKILLS[qn.skill];
    let body = '';
    if (qn.skill === 'listening') {
      body = `<p class="q-prompt">Nghe và chọn nghĩa đúng của từ:</p><div class="row gap center"><button class="play-btn" data-say="${esc(c.en)}">🔊</button><button class="btn ghost sm" data-say="${esc(c.en)}" data-slow="1">🐢 Nghe chậm</button></div>
        <div class="options">${qn.opts.map((o, k) => `<button class="opt" data-k="${k}">${esc(o.vi)}</button>`).join('')}</div>`;
    } else if (qn.skill === 'reading') {
      body = qn.meaning
        ? `<p class="q-prompt">Đọc câu và chọn nghĩa của từ <b>${esc(c.en)}</b>:</p><blockquote>“${esc(c.ex)}”</blockquote><div class="options">${qn.opts.map((o, k) => `<button class="opt" data-k="${k}">${esc(o.vi)}</button>`).join('')}</div>`
        : `<p class="q-prompt">Chọn từ phù hợp điền vào chỗ trống:</p><blockquote>“${esc(qn.cloze)}”</blockquote><p class="ex-vi">${esc(c.exVi)}</p><div class="options">${qn.opts.map((o, k) => `<button class="opt" data-k="${k}">${esc(o.en)}</button>`).join('')}</div>`;
    } else if (qn.skill === 'writing') {
      body = `<div class="q-word">${pic(c, '', { hideWord: true })}<div><p class="q-prompt">Viết từ tiếng Anh có nghĩa:</p><p class="vi big">${esc(c.vi)}</p><p class="muted">${esc(c.pos)} · ${esc(c.ipa)} · ${c.en.length} ký tự</p></div></div>
        <form class="write-form" id="w-form"><input id="w-input" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Gõ từ tiếng Anh…"><button class="btn primary">Kiểm tra</button><button type="button" class="btn ghost" id="w-hint">💡 Gợi ý</button></form>`;
    } else {
      body = `<div class="q-word">${pic(c)}<div><p class="q-prompt">Đọc to từ sau:</p><h2>${esc(c.en)}</h2><p class="ipa big">${esc(c.ipa)}</p><p class="vi">${esc(c.vi)}</p></div></div>
        <div class="row gap wrap center">${sayBtn(c.en, '🔊 Nghe mẫu', 'pill')}${srSupported ? '<button class="btn primary" id="s-mic">🎙️ Bấm và nói</button>' : '<button class="btn success" id="s-yes">✓ Tôi đọc đúng</button><button class="btn danger-soft" id="s-no">✗ Chưa đúng</button>'}</div><p id="s-result" class="center"></p>`;
    }
    el.innerHTML = `<div class="quiz">
      <div class="quiz-top"><span class="tag">${s.icon} ${s.name}</span><span>Câu ${idx + 1} / ${questions.length}</span><button class="btn ghost sm" id="q-quit">Thoát</button></div>
      ${progressBar(pct(idx, questions.length))}
      <div class="panel q-card">${body}<div id="q-feedback"></div></div>
    </div>`;
    afterRender(el);
    $('#q-quit', el).addEventListener('click', setup);
    if (qn.skill === 'listening') say(c.en);
    $$('.opt', el).forEach((b) => b.addEventListener('click', () => {
      const chosen = qn.opts[+b.dataset.k];
      const ok = chosen.key === c.key;
      $$('.opt', el).forEach((x, k) => {
        x.disabled = true;
        if (qn.opts[k].key === c.key) x.classList.add('correct');
      });
      if (!ok) b.classList.add('wrong');
      answer(ok);
    }));
    $('#w-form', el)?.addEventListener('submit', (e) => {
      e.preventDefault();
      const v = $('#w-input', el).value.trim().toLowerCase().replace(/\s+/g, ' ');
      if (!v) return;
      const target = c.en.toLowerCase();
      const dist = levenshtein(v, target);
      const ok = dist === 0 || (dist === 1 && target.length >= 5);
      $('#w-input', el).disabled = true;
      $('#w-input', el).classList.add(ok ? 'correct' : 'wrong');
      answer(ok, dist === 1 && ok ? 'Gần đúng — chú ý chính tả!' : '');
    });
    let hints = 0;
    $('#w-hint', el)?.addEventListener('click', () => {
      hints = Math.min(c.en.length - 1, hints + 1);
      $('#w-input', el).placeholder = c.en.slice(0, hints) + '…';
      $('#w-input', el).focus();
    });
    $('#w-input', el)?.focus();
    $('#s-mic', el)?.addEventListener('click', async () => {
      const out = $('#s-result', el);
      out.textContent = '🎙️ Đang nghe…';
      try {
        const alts = await recognize(store.settings.accent);
        if (!alts.length) return void (out.textContent = 'Không nghe rõ, thử lại nhé.');
        const { score, heard } = speechScore(c.en, alts);
        out.innerHTML = `Bạn nói: “${esc(heard)}” · <b class="${score >= 70 ? 'ok' : 'bad'}">${score}/100</b>`;
        $('#s-mic', el).disabled = true;
        answer(score >= 70);
      } catch (err) {
        out.innerHTML = `Không dùng được micro (${esc(err.message)}). <button class="btn success sm" id="s-yes">✓ Tôi đọc đúng</button> <button class="btn danger-soft sm" id="s-no">✗ Chưa đúng</button>`;
        bindSelf();
      }
    });
    const bindSelf = () => {
      $('#s-yes', el)?.addEventListener('click', () => answer(true));
      $('#s-no', el)?.addEventListener('click', () => answer(false));
    };
    bindSelf();
  };

  const answer = (ok, note = '') => {
    const qn = questions[idx];
    if (qn.answered) return;
    qn.answered = true;
    const c = qn.card;
    results.push({ key: c.key, skill: qn.skill, ok });
    const it = store.item(c.key);
    if (!ok) store.grade(c.key, 2);
    else if (ok && isDue(it)) store.grade(c.key, 4);
    $('#q-feedback', el).innerHTML = `<div class="feedback ${ok ? 'ok' : 'bad'}">
      <b>${ok ? '✓ Chính xác!' : '✗ Chưa đúng'}</b> ${note}
      <p><b>${esc(c.en)}</b> ${esc(c.ipa)} — ${esc(c.vi)} ${sayBtn(c.en)}</p>
      <p class="ex">“${esc(c.ex)}”</p>
      <button class="btn primary" id="q-next">${idx + 1 < questions.length ? 'Câu tiếp →' : 'Xem kết quả'}</button>
    </div>`;
    $('#q-next', el).addEventListener('click', () => {
      idx++;
      ask();
    });
    $('#q-next', el).focus();
  };

  const finish = () => {
    const correct = results.filter((r) => r.ok).length;
    const wrongKeys = [...new Set(results.filter((r) => !r.ok).map((r) => r.key))];
    store.recordQuiz({ label: `${SKILLS[skill].name} · ${scopeLabel(scope)}`, skill, scope, correct, total: results.length });
    sessionStorage.setItem('mindnest.list', JSON.stringify(wrongKeys));
    const by = Object.keys(SKILLS).filter((k) => k !== 'mixed').map((k) => {
      const rs = results.filter((r) => r.skill === k);
      return rs.length ? `<div class="skill-score"><span>${SKILLS[k].icon} ${SKILLS[k].name}</span>${progressBar(pct(rs.filter((r) => r.ok).length, rs.length), 'thin')}<b>${rs.filter((r) => r.ok).length}/${rs.length}</b></div>` : '';
    }).join('');
    const score = pct(correct, results.length);
    el.innerHTML = `${pageHead('KẾT QUẢ KIỂM TRA', `${correct}/${results.length} câu đúng · ${score}%`, score >= 80 ? 'Xuất sắc! Bạn nhớ từ rất chắc.' : score >= 50 ? 'Khá tốt! Ôn lại các từ sai để nhớ lâu hơn.' : 'Cần ôn thêm — các từ sai đã được đưa vào lịch ôn SM-2.')}
      <div class="panel">${by}</div>
      <div class="row gap wrap">${wrongKeys.length ? `<a class="btn primary" href="#/flashcards?scope=list&extra=ahead">▣ Ôn ${wrongKeys.length} từ sai bằng flashcard</a>` : ''}<button class="btn ghost" id="q-again">↻ Làm bài mới</button><a class="btn ghost" href="#/progress">📈 Tiến độ</a></div>
      ${wrongKeys.length ? `<h2 class="section-title">Các từ cần ôn lại</h2><div class="grid cards">${wrongKeys.map((k) => wordCard(db.wordMap.get(k))).join('')}</div>` : ''}`;
    afterRender(el);
    $('#q-again', el).addEventListener('click', setup);
  };

  setup();
}
