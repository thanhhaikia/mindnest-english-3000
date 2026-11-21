// Loads data/vocab.json and builds lookup indexes.
export const db = {
  groups: [],
  lessons: [],
  cards: [],
  words: [],
  wordMap: new Map(),
  groupMap: new Map(),
  lessonMap: new Map(),
  cardMap: new Map(),
  books: [],
  sources: [],
};

export const norm = (s) =>
  String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .trim();

export async function loadData(url = 'data/vocab.json') {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Không tải được dữ liệu (${res.status})`);
  const raw = await res.json();
  db.books = raw.books;
  db.sources = raw.sources || [];
  for (const g of raw.groups) {
    const group = { id: g.id, book: g.book, no: g.no, title: g.title, titleEn: g.titleEn, emoji: g.emoji, lessons: [], cards: [], keys: [] };
    db.groups.push(group);
    db.groupMap.set(group.id, group);
    g.lessons.forEach((l, li) => {
      const lesson = { id: l.id, no: li + 1, title: l.title, titleEn: l.titleEn, group, cards: [] };
      l.cards.forEach((c, i) => {
        const [en, pos, level, vi, ipa, col, ex, exVi, wiki, visual] = c;
        const key = en.toLowerCase();
        const card = { id: `${l.id}-${i}`, key, en, pos, level, vi, ipa, col, ex, exVi, wiki, visual, lesson, group };
        lesson.cards.push(card);
        group.cards.push(card);
        db.cards.push(card);
        db.cardMap.set(card.id, card);
        let w = db.wordMap.get(key);
        if (!w) {
          w = { ...card, cards: [] };
          db.wordMap.set(key, w);
          db.words.push(w);
        }
        w.cards.push(card);
      });
      group.lessons.push(lesson);
      db.lessons.push(lesson);
      db.lessonMap.set(lesson.id, lesson);
    });
    group.keys = [...new Set(group.cards.map((c) => c.key))];
  }
  for (const w of db.words) w._n = norm(w.en) + ' | ' + norm(w.cards.map((c) => c.vi).join(' / '));
  return db;
}

export function searchWords(q, limit = 60) {
  const n = norm(q);
  if (!n) return [];
  const out = [];
  for (const w of db.words) {
    const en = w.key;
    let s = 0;
    if (en === n) s = 100;
    else if (en.startsWith(n)) s = 80 - Math.min(20, en.length - n.length);
    else if (en.includes(n)) s = 50;
    else if (w._n.includes(n)) s = norm(w.vi) === n ? 70 : 35;
    if (s) out.push([s, w]);
  }
  return out.sort((a, b) => b[0] - a[0]).slice(0, limit).map((x) => x[1]);
}

export function searchGroups(q) {
  const n = norm(q);
  if (!n) return [];
  const res = [];
  for (const g of db.groups) {
    if (norm(g.title).includes(n) || norm(g.titleEn).includes(n)) res.push({ group: g });
    for (const l of g.lessons) if (norm(l.title).includes(n) || norm(l.titleEn).includes(n)) res.push({ group: g, lesson: l });
  }
  return res.slice(0, 20);
}

/** Resolve a scope string to study cards (one card per unique word). */
export function scopeCards(scope, store) {
  const [type, id] = String(scope || 'all').split(':');
  let cards;
  if (type === 'group') cards = db.groupMap.get(id)?.cards || [];
  else if (type === 'lesson') cards = db.lessonMap.get(id)?.cards || [];
  else if (type === 'saved') cards = store.savedKeys().map((k) => db.wordMap.get(k)).filter(Boolean);
  else if (type === 'learned') cards = db.words.filter((w) => store.item(w.key)?.reps >= 1);
  else if (type === 'studied') cards = db.words.filter((w) => store.item(w.key));
  else if (type === 'list') {
    const keys = JSON.parse(sessionStorage.getItem('mindnest.list') || '[]');
    cards = keys.map((k) => db.wordMap.get(k)).filter(Boolean);
  } else cards = db.words;
  const seen = new Set();
  return cards.filter((c) => (seen.has(c.key) ? false : seen.add(c.key)));
}

export function scopeLabel(scope) {
  const [type, id] = String(scope || 'all').split(':');
  if (type === 'group') return db.groupMap.get(id)?.title || 'Nhóm chủ đề';
  if (type === 'lesson') {
    const l = db.lessonMap.get(id);
    return l ? `${l.group.title} · ${l.title}` : 'Bài học';
  }
  return { saved: 'Từ đã lưu', learned: 'Từ đã thuộc', studied: 'Từ đã học', list: 'Danh sách ôn tập', all: 'Toàn bộ 3.751 từ' }[type] || 'Toàn bộ';
}
