// Only public calendar IDs reach this module. Never pass imported list data here.
const cache = new Map();
const queue = [];
const POSTER_KEY = 'anidub:posters:v1';
const POSTER_TTL = 7 * 86400000;
const SCORE_TTL = 86400000;
const saved = new Map();
const validScore = value => typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= 10;
function safeImage(value) {
  try { const url = new URL(value); return url.protocol === 'https:' && ['cdn.myanimelist.net', 's4.anilist.co'].includes(url.hostname) ? url.href : null; }
  catch { return null; }
}
try {
  const rows = JSON.parse(localStorage.getItem(POSTER_KEY) || '[]');
  if (Array.isArray(rows)) for (const row of rows.slice(-500)) {
    if (!Array.isArray(row) || !Number.isSafeInteger(row[0]) || row[0] <= 0 || !row[1]) continue;
    const value = row[1], now = Date.now();
    const imageValid = safeImage(value.url) && Number.isFinite(value.expires) && value.expires > now && value.expires <= now + POSTER_TTL;
    const ratingValid = value.scoreAvailable !== false && (value.score === null || validScore(value.score)) && Number.isFinite(value.scoreExpires) && value.scoreExpires > now && value.scoreExpires <= now + SCORE_TTL && Number.isFinite(value.checkedAt) && value.checkedAt <= now;
    if (imageValid || ratingValid) saved.set(row[0], {
      url:imageValid ? value.url : null, expires:imageValid ? value.expires : 0,
      scoreAvailable:ratingValid, score:ratingValid ? value.score : null, scoreExpires:ratingValid ? value.scoreExpires : 0,
      checkedAt:ratingValid ? value.checkedAt : 0,
      scoredBy:Number.isSafeInteger(value.scoredBy) && value.scoredBy > 0 ? value.scoredBy : null
    });
  }
} catch { /* Storage can be disabled; in-memory caching still works. */ }
function persist() {
  for (const [id, entry] of saved) if (Math.max(entry.expires, entry.scoreExpires) <= Date.now()) saved.delete(id);
  while (saved.size > 500) saved.delete(saved.keys().next().value);
  try { localStorage.setItem(POSTER_KEY, JSON.stringify([...saved])); } catch { /* Best effort. */ }
}
function forgetMetadata(id) { saved.delete(id); cache.delete(id); persist(); }
let running = false;
let pausedUntil = 0;
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
let fallbackPausedUntil = 0;
async function fallbackPoster(id) {
  // Separate, conservative pacing for AniList; no user list data is sent.
  await delay(Math.max(0, fallbackPausedUntil - Date.now()));
  const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch('https://graphql.anilist.co', {
      method:'POST', headers:{'Content-Type':'application/json'}, credentials:'omit', referrerPolicy:'no-referrer', signal:controller.signal,
      body:JSON.stringify({query:'query ($id: Int!) { Media(idMal: $id, type: ANIME) { idMal coverImage { extraLarge large } } }', variables:{id}})
    });
    if (response.status === 429) {
      const retry = Number(response.headers.get('Retry-After'));
      fallbackPausedUntil = Date.now() + Math.max(60000, Math.min(Number.isFinite(retry) ? retry * 1000 : 60000, 300000));
    }
    if (!response.ok) return null;
    const {data} = await response.json();
    if (data?.Media?.idMal !== id) return null;
    return safeImage(data.Media.coverImage?.extraLarge) || safeImage(data.Media.coverImage?.large);
  } catch { return null; }
  finally { clearTimeout(timeout); fallbackPausedUntil = Math.max(fallbackPausedUntil, Date.now() + 2100); }
}
async function processQueue() {
  if (running) return;
  running = true;
  while (queue.length) {
    const job = queue.shift();
    if (!job.targets.some(target => target.isConnected)) { cache.delete(job.id); job.resolve(null); continue; }
    await delay(Math.max(0, pausedUntil - Date.now()));
    if (!job.targets.some(target => target.isConnected)) { cache.delete(job.id); job.resolve(null); continue; }
    const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 10000);
    const existing = saved.get(job.id);
    let metadata = existing?.scoreExpires > Date.now() ? {...existing} : null;
    try {
      if (!metadata) {
      const response = await fetch(`https://api.jikan.moe/v4/anime/${job.id}`, {
        signal:controller.signal, credentials:'omit', referrerPolicy:'no-referrer'
      });
      if (response.status === 429) pausedUntil = Date.now() + 60000;
      if (response.ok) {
        const {data} = await response.json();
        if (Number(data?.mal_id) === job.id) {
          const now = Date.now();
          metadata = {
            url:safeImage(data.images?.webp?.large_image_url || data.images?.jpg?.large_image_url), expires:now + POSTER_TTL,
            scoreAvailable:true, score:validScore(data.score) ? data.score : null,
            scoredBy:Number.isSafeInteger(data.scored_by) && data.scored_by > 0 ? data.scored_by : null,
            scoreExpires:now + SCORE_TTL, checkedAt:now
          };
        }
      }
      }
    } catch { /* Artwork and rating failures never block the calendar. */ }
    finally { clearTimeout(timeout); }
    // Reuse a working cached poster during metadata outages before consulting a fallback.
    if (!metadata?.url && job.targets.some(target => target.isConnected)) {
      const cachedUrl = existing?.expires > Date.now() ? existing.url : null;
      const url = cachedUrl || await fallbackPoster(job.id);
      if (url) metadata = {...(metadata || {scoreAvailable:false, score:null, scoredBy:null, scoreExpires:0, checkedAt:0}), url, expires:cachedUrl ? existing.expires : Date.now() + POSTER_TTL};
    }
    job.expires = metadata?.scoreExpires > Date.now() ? metadata.scoreExpires : Date.now() + 60000;
    if (metadata) { saved.set(job.id, metadata); persist(); }
    job.resolve(metadata);
    pausedUntil = Math.max(pausedUntil, Date.now() + 1100);
  }
  running = false;
}
function getMetadata(id, target) {
  const stored = saved.get(id);
  if (stored?.scoreExpires > Date.now() && ((stored.url && stored.expires > Date.now()) || target.closest('.compact'))) return Promise.resolve(stored);
  let job = cache.get(id);
  if (job && job.expires < Date.now()) { cache.delete(id); job = null; }
  if (!job) {
    job = {id, targets:[], expires:Infinity};
    job.promise = new Promise(resolve => {job.resolve = resolve;});
    cache.set(id, job); queue.push(job);
  }
  job.targets.push(target);
  void processQueue();
  return job.promise;
}
function loadImage(target, url, id) {
  if (target.dataset.loading === 'true' || target.classList.contains('has-poster')) return;
  const fail = () => {
    target.dataset.loading = 'false'; target.classList.add('poster-failed');
    target.querySelector('.poster-label').textContent = 'Poster unavailable';
  };
  if (!url) { fail(); return; }
  target.classList.remove('poster-failed'); target.dataset.loading = 'true';
  const image = new Image();
  image.alt = ''; image.decoding = 'async'; image.referrerPolicy = 'no-referrer';
  const timeout = setTimeout(() => image.onerror(), 15000);
  image.onload = () => {
    clearTimeout(timeout); image.onload = null; image.onerror = null;
    target.dataset.loading = 'false'; target.classList.add('has-poster');
  };
  image.onerror = () => {
    clearTimeout(timeout); image.onload = null; image.onerror = null;
    image.remove();
    const entry = saved.get(id);
    if (entry?.url === url) { entry.url = null; entry.expires = 0; cache.delete(id); persist(); }
    fail();
  };
  image.src = url; target.append(image);
}
async function loadCard(card) {
  if (card.dataset.loading === 'true') return;
  card.dataset.loading = 'true'; card.classList.remove('metadata-failed');
  const id = Number(card.dataset.malId), rating = card.querySelector('.rating'), poster = card.querySelector('.poster');
  rating.textContent = 'MAL score: loading…';
  const stored = saved.get(id);
  const showPoster = () => !card.closest('.compact');
  if (showPoster() && stored?.expires > Date.now() && stored.url) loadImage(poster, stored.url, id);
  const metadata = await getMetadata(id, card);
  card.dataset.loading = 'false';
  if (!card.isConnected) return;
  if (metadata && metadata.scoreAvailable !== false) {
    rating.textContent = metadata.score === null ? 'MAL: not rated yet' : `★ MAL ${metadata.score.toFixed(2)} / 10`;
    rating.title = `MAL community rating via Jikan. Checked ${new Date(metadata.checkedAt).toLocaleString()}.${metadata.scoredBy ? ` ${metadata.scoredBy.toLocaleString()} ratings.` : ''}`;
  } else {
    card.classList.add('metadata-failed'); rating.textContent = 'MAL score unavailable';
    rating.title = 'Could not retrieve the community rating. Use Retry artwork & ratings.';
  }
  if (showPoster()) loadImage(poster, metadata?.url || (stored?.expires > Date.now() ? stored.url : null), id);
}
export function retryPosters(container) {
  const cards = [...container.querySelectorAll('.event[data-mal-id]')].filter(card => card.classList.contains('metadata-failed') || card.querySelector('.poster-failed'));
  for (const card of cards) forgetMetadata(Number(card.dataset.malId));
  for (const card of cards) void loadCard(card);
}
const observer = 'IntersectionObserver' in window ? new IntersectionObserver(entries => {
  for (const entry of entries) if (entry.isIntersecting) { observer.unobserve(entry.target); void loadCard(entry.target); }
}, {rootMargin:'250px'}) : null;
export function observePosters(container) {
  observer?.disconnect();
  for (const card of container.querySelectorAll('.event[data-mal-id]')) {
    if (observer) observer.observe(card); else void loadCard(card);
  }
}
