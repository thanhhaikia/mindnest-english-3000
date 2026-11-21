// SuperMemo SM-2 spaced-repetition scheduler (pure functions, no DOM).
export const DAY = 86400000;
export const MINUTE = 60000;
export const RELEARN_DELAY = 10 * MINUTE;

export function createItem() {
  return { ef: 2.5, reps: 0, interval: 0, due: 0, lapses: 0, seen: 0, last: 0, q: null };
}

/**
 * Apply one SM-2 review.
 * quality: 0-5 (0-2 = forgot, 3 = hard, 4 = good, 5 = easy).
 * Failed items restart the repetition sequence and come back after RELEARN_DELAY (same day).
 */
export function review(item, quality, now = Date.now()) {
  const q = Math.max(0, Math.min(5, Math.round(quality)));
  const it = { ...createItem(), ...item };
  if (q >= 3) {
    if (it.reps === 0) it.interval = 1;
    else if (it.reps === 1) it.interval = 6;
    else it.interval = Math.max(1, Math.round(it.interval * it.ef));
    it.reps += 1;
    it.due = now + it.interval * DAY;
  } else {
    if (it.reps > 0) it.lapses += 1;
    it.reps = 0;
    it.interval = 1;
    it.due = now + RELEARN_DELAY;
  }
  it.ef = Math.max(1.3, Math.round((it.ef + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02))) * 1000) / 1000);
  it.last = now;
  it.seen += 1;
  it.q = q;
  return it;
}

/** Interval (ms) a grade would produce, for button previews. */
export function previewInterval(item, quality, now = Date.now()) {
  return review(item, quality, now).due - now;
}

export function isDue(item, now = Date.now()) {
  return !!item && item.due <= now;
}

/** A word counts as learned ("đã thuộc") once it has at least one successful repetition in a row. */
export function isLearned(item) {
  return !!item && item.reps >= 1;
}

export function statusOf(item) {
  if (!item || !item.seen) return 'new';
  if (item.reps === 0 || item.interval < 6) return 'learning';
  if (item.interval < 21) return 'review';
  return 'mastered';
}

/**
 * Estimated memory strength 0..1: grows with the interval (log scale, ~1 at 30+ days)
 * and decays exponentially when the card is overdue.
 */
export function memoryStrength(item, now = Date.now()) {
  if (!item || !item.seen) return 0;
  let s = item.reps === 0 ? 0.08 : Math.min(1, Math.log2(1 + item.interval) / Math.log2(31));
  if (now > item.due && item.reps > 0) {
    const overdueDays = (now - item.due) / DAY;
    s *= Math.exp(-overdueDays / Math.max(2, item.interval));
  }
  return Math.max(0, Math.min(1, s));
}

export function formatInterval(ms) {
  if (ms < 60 * MINUTE) return `${Math.max(1, Math.round(ms / MINUTE))} phút`;
  if (ms < DAY) return `${Math.round(ms / (60 * MINUTE))} giờ`;
  const d = Math.round(ms / DAY);
  if (d < 31) return `${d} ngày`;
  if (d < 365) return `${Math.round(d / 30)} tháng`;
  return `${(d / 365).toFixed(1)} năm`;
}
