// Per-word illustrations: real photos from the Wikipedia PageImages API (batched + cached),
// with a deterministic, unique SVG illustration as the instant placeholder / fallback.
const CACHE_KEY = 'mindnest.img.v1';
let cache = {};
try {
  cache = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}');
} catch {
  cache = {};
}
const pending = new Map();
let timer = null;
let saveTimer = null;
let inFlight = 0;

const NUMBERS = { zero: '0', one: '1', two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7', eight: '8', nine: '9', ten: '10', eleven: '11', twelve: '12', thirteen: '13', fourteen: '14', fifteen: '15', sixteen: '16', seventeen: '17', eighteen: '18', nineteen: '19', twenty: '20', thirty: '30', forty: '40', fifty: '50', sixty: '60', seventy: '70', eighty: '80', ninety: '90', hundred: '100', thousand: '1K', million: '1M', billion: '1B', first: '1st', second: '2nd', third: '3rd', fourth: '4th', fifth: '5th', half: '½', quarter: '¼', dozen: '12' };
const ICONS = {
  hello: '👋', hi: '👋', goodbye: '👋', yes: '✅', no: '⛔', thank: '🙏', thanks: '🙏', please: '🙏', sorry: '🙇', love: '❤️', like: '👍', happy: '😊', sad: '😢', angry: '😠', tired: '😴', hungry: '🍽️', thirsty: '🥤', sleep: '😴', eat: '🍴', drink: '🥤', run: '🏃', walk: '🚶', swim: '🏊', read: '📖', write: '✍️', speak: '🗣️', talk: '💬', listen: '👂', hear: '👂', see: '👀', look: '👀', watch: '👀', think: '💭', know: '🧠', learn: '🎓', study: '📚', teach: '🧑‍🏫', work: '💼', play: '🎮', sing: '🎤', dance: '💃', cook: '🍳', buy: '🛒', sell: '🏷️', pay: '💳', money: '💰', time: '⏰', day: '☀️', night: '🌙', morning: '🌅', evening: '🌆', today: '📅', tomorrow: '📅', yesterday: '📅', week: '🗓️', month: '🗓️', year: '🗓️', hot: '🔥', cold: '🥶', rain: '🌧️', snow: '❄️', sun: '☀️', wind: '💨', big: '🐘', small: '🐜', fast: '⚡', slow: '🐢', new: '✨', old: '🕰️', good: '👍', bad: '👎', up: '⬆️', down: '⬇️', left: '⬅️', right: '➡️', in: '📥', out: '📤', on: '🔛', under: '⬇️', over: '⤴️', between: '↔️', and: '➕', or: '🔀', but: '↩️', because: '💡', if: '❓', what: '❓', where: '📍', when: '🕒', who: '🧑', why: '🤔', how: '🛠️', which: '☑️', i: '🙋', you: '🫵', he: '👨', she: '👩', we: '👥', they: '👥', it: '📦', phone: '📱', computer: '💻', email: '📧', car: '🚗', bus: '🚌', train: '🚆', plane: '✈️', bike: '🚲', house: '🏠', home: '🏠', school: '🏫', hospital: '🏥', doctor: '🧑‍⚕️', teacher: '🧑‍🏫', friend: '🤝', family: '👨‍👩‍👧', water: '💧', food: '🍲', coffee: '☕', tea: '🍵', book: '📘', music: '🎵', movie: '🎬', sport: '⚽', game: '🎲', city: '🏙️', country: '🌍', world: '🌏', tree: '🌳', flower: '🌸', dog: '🐶', cat: '🐱', bird: '🐦', fish: '🐟',
};

export function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

const escXml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]);

function isCssColor(word) {
  if (typeof CSS === 'undefined' || !/^[a-z]+$/.test(word)) return false;
  return CSS.supports('color', word) && !['transparent', 'currentcolor', 'inherit', 'initial', 'unset', 'revert'].includes(word);
}

/** Unique SVG illustration per word (data URI). */
export function illustration(card) {
  const key = card.key || card.en.toLowerCase();
  const h = hashStr(key);
  const hue = h % 360, hue2 = (hue + 40 + (h >> 9) % 80) % 360;
  const first = key.split(/[\s-]/)[0];
  let center = '';
  if (isCssColor(key.replace(/\s/g, ''))) {
    center = `<circle cx="160" cy="92" r="52" fill="${key.replace(/\s/g, '')}" stroke="white" stroke-width="6"/>`;
  } else if (NUMBERS[key]) {
    center = `<text x="160" y="118" font-size="78" font-weight="800" text-anchor="middle" fill="white" font-family="Be Vietnam Pro,Arial">${NUMBERS[key]}</text>`;
  } else {
    const icon = ICONS[key] || ICONS[first] || card.group?.emoji || '💬';
    center = `<text x="160" y="120" font-size="72" text-anchor="middle">${icon}</text>`;
  }
  const dots = Array.from({ length: 6 }, (_, i) => {
    const v = hashStr(key + i);
    return `<circle cx="${v % 320}" cy="${(v >> 8) % 220}" r="${8 + ((v >> 16) % 34)}" fill="white" opacity="${(0.06 + ((v >> 4) % 10) / 70).toFixed(2)}"/>`;
  }).join('');
  const label = card.en.length > 22 ? card.en.slice(0, 21) + '…' : card.en;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 220"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${hue},70%,62%)"/><stop offset="1" stop-color="hsl(${hue2},72%,44%)"/></linearGradient></defs><rect width="320" height="220" fill="url(#g)"/>${dots}${center}<rect x="40" y="166" width="240" height="36" rx="18" fill="white" opacity=".92"/><text x="160" y="190" font-size="17" font-weight="700" text-anchor="middle" fill="hsl(${hue2},60%,25%)" font-family="Be Vietnam Pro,Arial">${escXml(label)}</text></svg>`;
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}

function titleFor(card) {
  if (card.visual === 'd') return null;
  if (card.wiki) return card.wiki.replace(/_/g, ' ');
  return card.en.charAt(0).toUpperCase() + card.en.slice(1);
}

function saveCache() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
    } catch {
      cache = {};
    }
  }, 800);
}

export function photoFor(card) {
  const t = titleFor(card);
  if (!t) return Promise.resolve(null);
  if (t in cache) return Promise.resolve(cache[t] || null);
  return new Promise((resolve) => {
    if (!pending.has(t)) pending.set(t, []);
    pending.get(t).push(resolve);
    clearTimeout(timer);
    timer = setTimeout(flush, 80);
  });
}

async function flush() {
  if (inFlight >= 2 || !pending.size) return;
  const titles = [...pending.keys()].slice(0, 40);
  const resolvers = titles.map((t) => [t, pending.get(t)]);
  titles.forEach((t) => pending.delete(t));
  inFlight++;
  const found = {};
  try {
    const url = 'https://en.wikipedia.org/w/api.php?action=query&prop=pageimages&piprop=thumbnail&pithumbsize=400&redirects=1&format=json&origin=*&titles=' + encodeURIComponent(titles.join('|'));
    const res = await fetch(url);
    const json = await res.json();
    const q = json.query || {};
    const alias = new Map();
    (q.normalized || []).forEach((n) => alias.set(n.from, n.to));
    (q.redirects || []).forEach((r) => alias.set(r.from, r.to));
    const thumbs = new Map();
    Object.values(q.pages || {}).forEach((p) => p.thumbnail && thumbs.set(p.title, p.thumbnail.source));
    for (const t of titles) {
      let cur = t;
      for (let i = 0; i < 3 && alias.has(cur); i++) cur = alias.get(cur);
      found[t] = thumbs.get(cur) || '';
    }
    Object.assign(cache, found);
    saveCache();
  } catch {
    // offline / blocked: keep SVG illustrations, retry next session
  }
  inFlight--;
  resolvers.forEach(([t, fns]) => fns.forEach((fn) => fn(found[t] || null)));
  if (pending.size) setTimeout(flush, 50);
}

let observer = null;
/** Upgrade every <img data-card> inside root to a real photo when it scrolls into view. */
export function hydrateImages(root, lookup) {
  if (!observer && 'IntersectionObserver' in window) {
    observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          observer.unobserve(e.target);
          loadInto(e.target, lookup);
        }
      },
      { rootMargin: '200px' }
    );
  }
  root.querySelectorAll('img[data-card]:not([data-hydrated])').forEach((img) => {
    img.dataset.hydrated = '1';
    if (observer) observer.observe(img);
    else loadInto(img, lookup);
  });
}

function loadInto(img, lookup) {
  const card = lookup(img.dataset.card);
  if (!card) return;
  photoFor(card).then((url) => {
    if (!url) return;
    const pre = new Image();
    pre.onload = () => {
      img.src = url;
      img.classList.add('is-photo');
    };
    pre.src = url;
  });
}
