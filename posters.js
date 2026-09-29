// Only public calendar IDs reach this module. Never pass imported list data here.
const cache = new Map();
const queue = [];
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
    job.expires = url ? Infinity : Date.now() + 60000;
    job.resolve(url);
    // Stay below Jikan's per-minute limit, including during fast navigation.
    pausedUntil = Math.max(pausedUntil, Date.now() + 1100);
  }
  running = false;
}

function getPoster(id, target) {
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
  const url = await getPoster(Number(target.dataset.malId), target);
  if (!target.isConnected) return;
  if (!url) { target.querySelector('.poster-label').textContent = 'Poster unavailable'; return; }
  const image = new Image();
  image.alt = ''; // The adjacent linked title already names the anime.
  image.decoding = 'async';
  image.referrerPolicy = 'no-referrer';
  image.onload = () => { target.classList.add('has-poster'); };
  image.onerror = () => {
    image.remove();
    target.querySelector('.poster-label').textContent = 'Poster unavailable';
  };
  image.src = url;
  target.append(image);
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
