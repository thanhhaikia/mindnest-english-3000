// Builds the compact runtime dataset (data/vocab.json) from raw/source-vocab.json.
// Usage: node scripts/build-data.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const src = JSON.parse(readFileSync(new URL('../raw/source-vocab.json', import.meta.url), 'utf8'));
const VM = { photo: 'p', diagram: 'd', commons: 'c' };

const groups = src.chapters.map((c) => ({
  id: c.id,
  book: c.book,
  no: c.chapter,
  title: c.group,
  titleEn: c.groupEn !== c.group ? c.groupEn : '',
  emoji: c.emoji,
  lessons: c.topics.map((t) => ({
    id: t.id,
    title: t.title,
    titleEn: t.titleEn && t.titleEn !== t.title ? t.titleEn : '',
    cards: t.words.map((w) => [
      w.en.trim(),
      w.pos,
      w.level,
      w.vi,
      w.ipa,
      w.collocation === w.en ? '' : w.collocation,
      w.example,
      w.exampleVi,
      w.wikiTitle || '',
      VM[w.visualMode] || 'd',
    ]),
  })),
}));

const out = {
  version: '1.0',
  fields: ['en', 'pos', 'level', 'vi', 'ipa', 'collocation', 'example', 'exampleVi', 'wikiTitle', 'visual'],
  books: src.books.map(({ id, title, subtitle }) => ({ id, title, subtitle })),
  sources: src.researchSources,
  groups,
};
writeFileSync(new URL('../data/vocab.json', import.meta.url), JSON.stringify(out));
const cards = groups.flatMap((g) => g.lessons.flatMap((l) => l.cards));
const unique = new Set(cards.map((c) => c[0].toLowerCase()));
console.log(`groups=${groups.length} lessons=${groups.reduce((n, g) => n + g.lessons.length, 0)} cards=${cards.length} unique=${unique.size}`);
