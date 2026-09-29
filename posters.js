// Only public calendar IDs reach this module. Never pass imported list data here.
const cache = new Map();
const queue = [];
const POSTER_KEY = 'anidub:posters:v1';
const POSTER_TTL = 7 * 86400000;
const saved = new Map();
try {
  const rows = JSON.parse(localStorage.getItem(POSTER_KEY) || '[]');
  if (Array.isArray(rows)) for (const row of rows.slice(-500)) {
    if (Array.isArray(row) && Number.isSafeInteger(row[0]) && row[0] > 0 &&
        safeImage(row[1]?.url) && Number.isFinite(row[1]?.expires) && row[1].expires > Date.now() && row[1].expires <= Date.now() + POSTER_TTL) saved.set(row[0], row[1]);
  }
} catch { /* Storage can be disabled; in-memory caching still works. */ }
function persist() {
  for (const [id, entry] of saved) if (entry.expires <= Date.now()) saved.delete(id);
  while (saved.size > 500) saved.delete(saved.keys().next().value);
  try { localStorage.setItem(POSTER_KEY, JSON.stringify([...saved])); } catch { /* Best effort. */ }
}
function forgetPoster(id) { saved.delete(id); cache.delete(id); persist(); }

let running = false;
let pausedUntil = 0;
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

function safeImage(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === 'cdn.myanimelist.net' ? url.href : null;
  } catch { return null; }
}

async function processQueue() {
  if (running) return;
  running = true;
  while (queue.length) {
    const job = queue.shift();
    // Week changes must not leave a backlog of invisible poster requests.
    if (!job.targets.some(target => target.isConnected)) {
      cache.delete(job.id);
      job.resolve(null);
      continue;
    }
    await delay(Math.max(0, pausedUntil - Date.now()));
    if (!job.targets.some(target => target.isConnected)) { cache.delete(job.id); job.resolve(null); continue; }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    let url = null;
    try {
      const response = await fetch(`https://api.jikan.moe/v4/anime/${job.id}`, {
        signal: controller.signal, credentials: 'omit', referrerPolicy: 'no-referrer'
      });
      if (response.status === 429) pausedUntil = Date.now() + 60000;
      if (response.ok) {
        const { data } = await response.json();
        if (Number(data?.mal_id) === job.id) {
          url = safeImage(data.images?.webp?.large_image_url || data.images?.jpg?.large_image_url);
        }
      }
    } catch { /* Poster failures never block the calendar. */ }
    finally { clearTimeout(timeout); }
    job.expires = Date.now() + (url ? POSTER_TTL : 60000);
    if (url) { saved.set(job.id, { url, expires: job.expires }); persist(); }
    job.resolve(url);
    // Stay below Jikan's per-minute limit, including during fast navigation.
    pausedUntil = Math.max(pausedUntil, Date.now() + 1100);
  }
  running = false;
}

function getPoster(id, target) {
  const stored = saved.get(id);
  if (stored?.expires > Date.now()) return Promise.resolve(stored.url);
  let job = cache.get(id);
  if (job && job.expires < Date.now()) { cache.delete(id); job = null; }
  if (!job) {
    job = { id, targets: [], expires: Infinity };
    job.promise = new Promise(resolve => { job.resolve = resolve; });
    cache.set(id, job);
    queue.push(job);
  }
  job.targets.push(target);
  void processQueue();
  return job.promise;
}

async function loadPoster(target) {
  if (target.dataset.loading === 'true') return;
  target.dataset.loading = 'true';
  target.classList.remove('poster-failed');
  target.querySelector('.poster-label').textContent = 'Loading poster…';
  const id = Number(target.dataset.malId);
  const fail = () => {
    target.dataset.loading = 'false';
    target.classList.add('poster-failed');
    target.querySelector('.poster-label').textContent = 'Poster unavailable';
  };
  const url = await getPoster(id, target);
  if (!target.isConnected) { target.dataset.loading = 'false'; return; }
  if (!url) { fail(); return; }
  const image = new Image();
  image.alt = '';
  image.decoding = 'async';
  image.referrerPolicy = 'no-referrer';
  const timeout = setTimeout(() => image.onerror(), 15000);
  image.onload = () => {
    clearTimeout(timeout); image.onload = null; image.onerror = null;
    target.dataset.loading = 'false'; target.classList.add('has-poster');
  };
  image.onerror = () => {
    clearTimeout(timeout); image.onload = null; image.onerror = null;
    image.remove(); forgetPoster(id); fail();
  };
  image.src = url;
  target.append(image);
}

export function retryPosters(container) {
  const targets = [...container.querySelectorAll('.poster-failed[data-mal-id]')];
  for (const target of targets) forgetPoster(Number(target.dataset.malId));
  for (const target of targets) void loadPoster(target);
}

const observer = 'IntersectionObserver' in window ? new IntersectionObserver(entries => {
  for (const entry of entries) if (entry.isIntersecting) {
    observer.unobserve(entry.target);
    void loadPoster(entry.target);
  }
}, { rootMargin: '250px' }) : null;

export function observePosters(container) {
  observer?.disconnect();
  for (const target of container.querySelectorAll('.poster[data-mal-id]')) {
    if (observer) observer.observe(target);
    else void loadPoster(target);
  }
}
