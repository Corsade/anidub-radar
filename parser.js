export const FEED_URL = 'https://fizzyfrys.github.io/anime-dub-calendar/anime-dubs.ics';
const unescapeICS = value => value.replace(/\\([nN,;\\])/g, (_, c) => /n/i.test(c) ? '\n' : c);
export function parseICS(text) {
  const lines = text.replace(/\r\n?/g, '\n').replace(/\n[ \t]/g, '').split('\n');
  if (!lines.includes('BEGIN:VCALENDAR') || !lines.includes('END:VCALENDAR')) throw new Error('Invalid calendar feed.');
  const events = []; let item = null; let skipped = 0; let updated = '';
  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') { item = {}; continue; }
    if (line === 'END:VEVENT') {
      if (!item) continue;
      const raw = item.DTSTART || '';
      const date = /^\d{8}(?:T\d{6}Z?)?$/.test(raw) ? `${raw.slice(0,4)}-${raw.slice(4,6)}-${raw.slice(6,8)}` : '';
      const validDate = date && !Number.isNaN(Date.parse(date)) && new Date(date).toISOString().slice(0,10) === date;
      if (validDate && item.SUMMARY && item.STATUS !== 'CANCELLED') {
        const summary = unescapeICS(item.SUMMARY);
        const episode = summary.match(/^(.*?)\s*[-–—:]\s*(?:Ep\.?|Episode)\s*(\d+(?:\s*[-–]\s*\d+)?)(.*)$/i);
        const mal = `${item.URL || ''} ${item.DESCRIPTION || ''}`.match(/https?:\/\/(?:www\.)?myanimelist\.net\/anime\/(\d+)(?=[/\s?#]|$)/i);
        const malId = mal ? Number(mal[1]) : null;
        events.push({ date, title: episode ? episode[1] : summary, episode: episode ? episode[2] + episode[3] : null, malId, url: malId ? `https://myanimelist.net/anime/${malId}` : null });
      } else if (item.STATUS !== 'CANCELLED') skipped++;
      item = null; continue;
    }
    const colon = line.indexOf(':'); if (colon < 0) continue;
    const key = line.slice(0, colon).split(';')[0].toUpperCase();
    const value = line.slice(colon + 1);
    if (item) item[key] = value;
    if (key === 'X-WR-CALDESC') updated = unescapeICS(value).match(/Source updated:\s*([^)]*)/i)?.[1] || '';
  }
  if (item) throw new Error('Incomplete calendar feed.');
  return { events: events.sort((a,b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title)), skipped, updated };
}
export function parseMAL(text) {
  if (/<!DOCTYPE|<!ENTITY/i.test(text)) throw new Error('Please select a standard MAL XML export without a document type or entities.');
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (doc.querySelector('parsererror') || doc.documentElement.tagName !== 'myanimelist') throw new Error('This is not a valid MyAnimeList XML export.');
  const list = new Map();
  for (const anime of doc.documentElement.children) {
    if (anime.tagName !== 'anime') continue;
    const get = name => anime.querySelector(name)?.textContent.trim() || '';
    const id = get('series_animedb_id');
    if (!/^\d+$/.test(id) || Number(id) < 1) throw new Error('An anime entry is missing a valid numeric MAL ID.');
    const status = get('my_status').toLowerCase().replace(/[_-]/g, ' ');
    const count = name => /^\d+$/.test(get(name)) ? Number(get(name)) : null;
    list.set(Number(id), { status: ({'1':'watching','6':'plan to watch'})[status] || status, watched: count('my_watched_episodes'), total: count('series_episodes') });
  }
  return list;
}
export function matchesFilter(event, list, filter) {
  if (filter === 'all') return true;
  if (!list) return false;
  const entry = list.get(event.malId);
  if (filter === 'missing') return event.malId !== null && !entry;
  return entry?.status === filter;
}
