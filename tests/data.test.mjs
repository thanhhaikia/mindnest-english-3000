import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const data = JSON.parse(readFileSync(new URL('../data/vocab.json', import.meta.url), 'utf8'));
const cards = data.groups.flatMap((g) => g.lessons.flatMap((l) => l.cards));

test('dataset has 49 groups, 233 lessons, 6,976 cards and 3,751 unique words', () => {
  assert.equal(data.groups.length, 49);
  assert.equal(data.groups.reduce((n, g) => n + g.lessons.length, 0), 233);
  assert.equal(cards.length, 6976);
  assert.equal(new Set(cards.map((c) => c[0].toLowerCase())).size, 3751);
});

test('every card has word, IPA, Vietnamese meaning and example sentence', () => {
  for (const [en, , level, vi, ipa, , ex, exVi] of cards) {
    assert.ok(en && vi && ipa && ex && exVi && level, `incomplete card: ${en}`);
  }
});
