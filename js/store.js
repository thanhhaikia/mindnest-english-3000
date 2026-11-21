// Persistent learner state in localStorage.
import { review, isLearned, memoryStrength, statusOf, isDue } from './sm2.js';

const KEY = 'mindnest.v1';
const defaults = () => ({
  v: 1,
  srs: {},
  saved: {},
  settings: { accent: 'en-US', rate: 1, newPerDay: 15, sessionSize: 20, autoSpeak: true },
  daily: {},
  quiz: [],
  scenarios: {},
});

export function today(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const clampNum = (v, min, max, dflt) => (Number.isFinite(+v) ? Math.min(max, Math.max(min, +v)) : dflt);
function cleanSettings(s) {
  const d = defaults().settings;
  const src = s && typeof s === 'object' ? s : {};
  return {
    accent: src.accent === 'en-GB' ? 'en-GB' : 'en-US',
    rate: clampNum(src.rate, 0.5, 2, d.rate),
    newPerDay: Math.round(clampNum(src.newPerDay, 0, 200, d.newPerDay)),
    sessionSize: Math.round(clampNum(src.sessionSize, 5, 100, d.sessionSize)),
    autoSpeak: src.autoSpeak === undefined ? d.autoSpeak : !!src.autoSpeak,
  };
}

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    if (!s || typeof s !== 'object') return defaults();
    const d = defaults();
    return { ...d, ...s, settings: cleanSettings(s.settings) };
  } catch {
    return defaults();
  }
}

let state = load();
const listeners = new Set();

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch (e) {
    console.warn('Không lưu được tiến độ', e);
  }
  listeners.forEach((f) => f());
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key !== KEY && e.key !== null) return;
    state = load();
    listeners.forEach((f) => f());
  });
}

function dayBucket() {
  const d = today();
  return (state.daily[d] ||= { reviews: 0, newWords: 0, correct: 0 });
}

export const store = {
  get state() {
    return state;
  },
  get settings() {
    return state.settings;
  },
  subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
  item(key) {
    return state.srs[key];
  },
  grade(key, q) {
    const prev = state.srs[key];
    const next = review(prev, q);
    state.srs[key] = next;
    const day = dayBucket();
    day.reviews += 1;
    if (!prev) day.newWords += 1;
    if (q >= 3) day.correct += 1;
    persist();
    return next;
  },
  isSaved(key) {
    return !!state.saved[key];
  },
  toggleSaved(key) {
    if (state.saved[key]) delete state.saved[key];
    else state.saved[key] = Date.now();
    persist();
    return !!state.saved[key];
  },
  savedKeys() {
    return Object.entries(state.saved).sort((a, b) => b[1] - a[1]).map(([k]) => k);
  },
  setSetting(k, v) {
    state.settings = cleanSettings({ ...state.settings, [k]: v });
    persist();
  },
  recordQuiz(result) {
    state.quiz.unshift({ ...result, at: Date.now() });
    state.quiz = state.quiz.slice(0, 50);
    persist();
  },
  markScenario(id) {
    const s = (state.scenarios[id] ||= { runs: 0, last: 0 });
    s.runs += 1;
    s.last = Date.now();
    persist();
  },
  newToday() {
    return state.daily[today()]?.newWords || 0;
  },
  summary(allKeys, now = Date.now()) {
    let learned = 0, strength = 0, due = 0;
    const byStatus = { new: 0, learning: 0, review: 0, mastered: 0 };
    for (const k of allKeys) {
      const it = state.srs[k];
      byStatus[statusOf(it)] += 1;
      if (isLearned(it)) learned += 1;
      if (isDue(it, now)) due += 1;
      strength += memoryStrength(it, now);
    }
    const total = allKeys.length || 1;
    return {
      learned,
      due,
      byStatus,
      saved: Object.keys(state.saved).length,
      remembered: Math.round((strength / total) * 1000) / 10,
      studied: Object.keys(state.srs).length,
    };
  },
  streak() {
    let n = 0;
    const d = new Date();
    if (!state.daily[today(d)]?.reviews) d.setDate(d.getDate() - 1);
    while (state.daily[today(d)]?.reviews) {
      n += 1;
      d.setDate(d.getDate() - 1);
    }
    return n;
  },
  exportJSON() {
    return JSON.stringify({ app: 'mindnest-english-3000', exportedAt: new Date().toISOString(), ...state }, null, 2);
  },
  importJSON(text) {
    const data = JSON.parse(text);
    if (!data || typeof data.srs !== 'object') throw new Error('Tệp không hợp lệ');
    const d = defaults();
    state = { ...d, srs: data.srs, saved: data.saved || {}, settings: cleanSettings(data.settings), daily: data.daily || {}, quiz: data.quiz || [], scenarios: data.scenarios || {} };
    persist();
  },
  reset() {
    state = defaults();
    persist();
  },
};
