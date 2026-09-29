// Store normalized list fields and optional public sync provenance, never XML or credentials.
export const LIST_KEY = 'anidub:list:v1';
export function saveList(list, source = null) {
  localStorage.setItem(LIST_KEY, JSON.stringify({source, entries:[...list].map(([id, entry]) => [id, {
    status: entry.status, watched: entry.watched, total: entry.total
  }])}));
}
export function forgetList() { localStorage.removeItem(LIST_KEY); }
export function restoreSnapshot() {
  const raw = localStorage.getItem(LIST_KEY);
  if (raw === null) return null;
  const data = JSON.parse(raw);
  const rows = Array.isArray(data) ? data : data?.entries;
  const source = Array.isArray(data) ? null : data?.source;
  if (source != null && (typeof source.username !== 'string' || !/^[A-Za-z0-9_-]{1,32}$/.test(source.username) || !Number.isFinite(source.syncedAt) || source.syncedAt < 0)) throw new Error('Invalid saved sync source');
  const count = value => value === null || (Number.isSafeInteger(value) && value >= 0);
  if (!Array.isArray(rows) || !rows.every(row => Array.isArray(row) && row.length === 2 &&
    Number.isSafeInteger(row[0]) && row[0] > 0 && row[1] && typeof row[1].status === 'string' &&
    count(row[1].watched) && count(row[1].total))) throw new Error('Invalid saved list');
  return {source: source || null, list:new Map(rows.map(([id, entry]) => [id, { status: entry.status, watched: entry.watched, total: entry.total }]))};
}
export function nextForList(events, list, today) {
  return events.filter(event => event.date >= today && ['watching', 'plan to watch'].includes(list?.get(event.malId)?.status))
    .sort((a,b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title))[0] || null;
}

export function restoreList() { return restoreSnapshot()?.list || null; }
