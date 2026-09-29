export const validUsername = value => /^[A-Za-z0-9_-]{1,32}$/.test(value);
export async function fetchPublicList(endpoint, username, signal, onProgress = () => {}) {
  if (!validUsername(username)) throw new Error('Enter a MAL username using letters, numbers, underscores, or hyphens.');
  if (!endpoint) throw new Error('Public-list sync is not configured yet. XML import is still available.');
  const url = new URL(endpoint);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost','127.0.0.1'].includes(url.hostname))) throw new Error('Sync requires a secure endpoint.');
  const list = new Map();
  for (let page = 0; page < 50; page++) {
    onProgress(`Syncing ${username}: page ${page + 1}…`);
    let response;
    try {
      response = await fetch(url, { method:'POST', headers:{'Content-Type':'application/json'},
        body:JSON.stringify({username, offset:page * 1000}), credentials:'omit', referrerPolicy:'no-referrer', cache:'no-store', signal });
    } catch(error) {
      if (signal.aborted) throw error;
      throw new Error('Could not reach MAL sync. Check your connection and try again.');
    }
    if (!response.ok) {
      const messages = {403:'This MAL list is private or inaccessible. Use XML import instead.',404:'MAL user not found. Check the username.',429:'MAL sync is busy. Wait a minute before retrying.',503:'MAL sync is not configured or is temporarily unavailable.'};
      throw new Error(messages[response.status] || 'MAL sync failed. Please try again later.');
    }
    const data = await response.json();
    const count = value => value === null || (Number.isSafeInteger(value) && value >= 0);
    if (data.username !== username || !Array.isArray(data.entries) || data.entries.length > 1000 || typeof data.hasMore !== 'boolean') throw new Error('The sync service returned an invalid list.');
    for (const entry of data.entries) {
      if (!Number.isSafeInteger(entry.id) || entry.id < 1 || !['watching','plan to watch','completed','on hold','dropped'].includes(entry.status) || !count(entry.watched) || !count(entry.total)) throw new Error('The sync service returned an invalid anime entry.');
      list.set(entry.id, {status:entry.status, watched:entry.watched, total:entry.total});
    }
    if (!data.hasMore) return list;
    if (data.entries.length === 0) throw new Error('MAL returned incomplete pagination. Please retry.');
  }
  throw new Error('This list exceeds the sync limit of 50,000 entries. Please use XML import.');
}
