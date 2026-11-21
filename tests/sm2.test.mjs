import { test } from 'node:test';
import assert from 'node:assert/strict';
import { review, createItem, DAY, RELEARN_DELAY, statusOf, isLearned, memoryStrength, formatInterval } from '../js/sm2.js';

const now = Date.UTC(2026, 0, 1);

test('first successful reviews follow 1 → 6 → interval × EF', () => {
  let it = review(undefined, 4, now);
  assert.equal(it.interval, 1);
  assert.equal(it.reps, 1);
  assert.equal(it.due, now + DAY);
  it = review(it, 4, now);
  assert.equal(it.interval, 6);
  it = review(it, 4, now);
  assert.equal(it.interval, Math.round(6 * it.ef));
  assert.equal(it.reps, 3);
});

test('EF update matches SM-2 formula and is floored at 1.3', () => {
  assert.equal(review(createItem(), 5, now).ef, 2.6);
  assert.equal(review(createItem(), 4, now).ef, 2.5);
  assert.equal(review(createItem(), 3, now).ef, 2.36);
  let it = createItem();
  for (let i = 0; i < 20; i++) it = review(it, 0, now);
  assert.equal(it.ef, 1.3);
});

test('failed review resets repetitions and schedules a same-day relearn', () => {
  let it = review(review(review(undefined, 5, now), 5, now), 5, now);
  it = review(it, 1, now);
  assert.equal(it.reps, 0);
  assert.equal(it.interval, 1);
  assert.equal(it.lapses, 1);
  assert.equal(it.due, now + RELEARN_DELAY);
  assert.equal(isLearned(it), false);
});

test('status, strength and formatting helpers', () => {
  assert.equal(statusOf(undefined), 'new');
  assert.equal(statusOf({ seen: 1, reps: 1, interval: 1 }), 'learning');
  assert.equal(statusOf({ seen: 3, reps: 3, interval: 15 }), 'review');
  assert.equal(statusOf({ seen: 4, reps: 4, interval: 40 }), 'mastered');
  assert.equal(memoryStrength(undefined), 0);
  const strong = { seen: 4, reps: 4, interval: 30, due: now + DAY };
  assert.ok(memoryStrength(strong, now) > 0.99);
  assert.ok(memoryStrength({ ...strong, due: now - 60 * DAY }, now) < memoryStrength(strong, now));
  assert.equal(formatInterval(10 * 60000), '10 phút');
  assert.equal(formatInterval(6 * DAY), '6 ngày');
});
