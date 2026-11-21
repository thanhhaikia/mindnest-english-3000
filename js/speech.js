// Text-to-speech, speech recognition and voice recording helpers (Web Speech API).
export const ttsSupported = typeof window !== 'undefined' && 'speechSynthesis' in window;
const SR = typeof window !== 'undefined' ? window.SpeechRecognition || window.webkitSpeechRecognition : null;
export const srSupported = !!SR;
export const recSupported = typeof window !== 'undefined' && !!(navigator.mediaDevices?.getUserMedia && window.MediaRecorder);

let voices = [];
if (ttsSupported) {
  const loadVoices = () => (voices = speechSynthesis.getVoices());
  loadVoices();
  speechSynthesis.addEventListener?.('voiceschanged', loadVoices);
}

function pickVoice(lang) {
  const exact = voices.filter((v) => v.lang.replace('_', '-').toLowerCase() === lang.toLowerCase());
  const pref = exact.find((v) => /google|natural|samantha|daniel|serena|aria|jenny|libby|sonia/i.test(v.name));
  return pref || exact[0] || voices.find((v) => v.lang.toLowerCase().startsWith(lang.slice(0, 2).toLowerCase()));
}

let token = 0;
export function speak(text, { lang = 'en-US', rate = 1 } = {}) {
  return new Promise((resolve) => {
    if (!ttsSupported || !text) return resolve();
    const my = ++token;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang;
    u.rate = rate;
    const v = pickVoice(lang);
    if (v) u.voice = v;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      resolve(my === token);
    };
    u.onend = finish;
    u.onerror = finish;
    // Safety net: some browsers never fire onend.
    setTimeout(finish, 1500 + (text.length * 110) / rate);
    setTimeout(() => speechSynthesis.speak(u), 30);
  });
}

export function stopSpeaking() {
  token++;
  if (ttsSupported) speechSynthesis.cancel();
}

export function recognize(lang = 'en-US') {
  return new Promise((resolve, reject) => {
    if (!SR) return reject(new Error('unsupported'));
    const r = new SR();
    r.lang = lang;
    r.interimResults = false;
    r.maxAlternatives = 5;
    let got = false;
    r.onresult = (e) => {
      got = true;
      resolve([...e.results[0]].map((a) => a.transcript));
    };
    r.onerror = (e) => (got ? null : reject(new Error(e.error)));
    r.onend = () => (got ? null : resolve([]));
    r.start();
  });
}

const clean = (s) => String(s).toLowerCase().replace(/[^a-z0-9' ]+/g, ' ').replace(/\s+/g, ' ').trim();

export function levenshtein(a, b) {
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[n];
}

/** Similarity score 0-100 between the target text and the best recognised alternative. */
export function speechScore(target, alternatives) {
  const t = clean(target);
  let best = 0, heard = alternatives[0] || '';
  for (const alt of alternatives) {
    const a = clean(alt);
    const s = Math.round((1 - levenshtein(a, t) / Math.max(a.length, t.length, 1)) * 100);
    const contains = a.split(' ').includes(t) || ` ${a} `.includes(` ${t} `) ? 100 : 0;
    const score = Math.max(s, contains);
    if (score > best) [best, heard] = [score, alt];
  }
  return { score: best, heard };
}

/** Record the microphone; returns { stop(): Promise<objectURL> }. */
export async function startRecording() {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const rec = new MediaRecorder(stream);
  const chunks = [];
  rec.ondataavailable = (e) => chunks.push(e.data);
  rec.start();
  return {
    stop: () =>
      new Promise((resolve) => {
        rec.onstop = () => {
          stream.getTracks().forEach((t) => t.stop());
          resolve(URL.createObjectURL(new Blob(chunks, { type: rec.mimeType || 'audio/webm' })));
        };
        rec.stop();
      }),
  };
}
