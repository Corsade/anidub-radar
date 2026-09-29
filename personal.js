// Store only normalized list fields, never the XML, titles, or account details.
export const LIST_KEY = 'anidub:list:v1';
export function saveList(list) {
  localStorage.setItem(LIST_KEY, JSON.stringify([...list].map(([id, entry]) => [id, {
    status: entry.status, watched: entry.watched, total: entry.total
  }])));
}
export function forgetList() { localStorage.removeItem(LIST_KEY); }
export function restoreList() {
  const raw = localStorage.getItem(LIST_KEY);
  if (raw === null) return null;
  const rows = JSON.parse(raw);
  const count = value => value === null || (Number.isSafeInteger(value) && value >= 0);
  if (!Array.isArray(rows) || !rows.every(row => Array.isArray(row) && row.length === 2 &&
    Number.isSafeInteger(row[0]) && row[0] > 0 && row[1] && typeof row[1].status === 'string' &&
    count(row[1].watched) && count(row[1].total))) throw new Error('Invalid saved list');
  return new Map(rows.map(([id, entry]) => [id, { status: entry.status, watched: entry.watched, total: entry.total }]));
}
export function nextForList(events, list, today) {
  return events.filter(event => event.date >= today && ['watching', 'plan to watch'].includes(list?.get(event.malId)?.status))
    .sort((a,b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title))[0] || null;
}
