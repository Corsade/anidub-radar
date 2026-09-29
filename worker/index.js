// Read-only public MAL list proxy. No XML, user tokens, database, or application logs.
export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin');
    const allowed = (env.ALLOWED_ORIGINS || 'https://corsade.github.io').split(',').map(value => value.trim());
    const headers = {'Content-Type':'application/json', 'Cache-Control':'no-store', 'Vary':'Origin'};
    if (allowed.includes(origin)) headers['Access-Control-Allow-Origin'] = origin;
    const reply = (status, value) => new Response(JSON.stringify(value), {status, headers});
    if (!origin || !allowed.includes(origin)) return reply(403, {error:'Origin not allowed'});
    const url = new URL(request.url);
    if (url.pathname !== '/list') return reply(404, {error:'Not found'});
    if (request.method === 'OPTIONS') return new Response(null, {status:204, headers:{...headers,'Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type','Access-Control-Max-Age':'600'}});
    if (request.method !== 'POST') return reply(405, {error:'Method not allowed'});
    if (!env.MAL_CLIENT_ID) return reply(503, {error:'Sync not configured'});
    // Optional Cloudflare rate-limit binding; no identity or list storage is needed.
    if (env.SYNC_RATE_LIMIT) {
      const result = await env.SYNC_RATE_LIMIT.limit({key:request.headers.get('CF-Connecting-IP') || 'unknown'});
      if (!result.success) return reply(429, {error:'Rate limited'});
    }
    let body;
    try {
      if (Number(request.headers.get('Content-Length')) > 1024) return reply(413,{error:'Request too large'});
      const raw = await request.text();
      if (raw.length > 1024) return reply(413,{error:'Request too large'});
      body = JSON.parse(raw);
    } catch { return reply(400,{error:'Invalid request'}); }
    const {username, offset = 0} = body || {};
    if (typeof username !== 'string' || !/^[A-Za-z0-9_-]{1,32}$/.test(username) || !Number.isInteger(offset) || offset < 0 || offset > 49000 || offset % 1000 !== 0) return reply(400,{error:'Invalid username or offset'});
    const upstream = new URL(`https://api.myanimelist.net/v2/users/${encodeURIComponent(username)}/animelist`);
    upstream.search = new URLSearchParams({fields:'list_status,num_episodes',limit:'1000',offset:String(offset),nsfw:'true'});
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(upstream, {headers:{'X-MAL-CLIENT-ID':env.MAL_CLIENT_ID,'Accept':'application/json'},signal:controller.signal,redirect:'error'});
      if (!response.ok) return reply([403,404,429].includes(response.status) ? response.status : response.status === 401 ? 503 : 502, {error:'MAL request failed'});
      const data = await response.json();
      if (!Array.isArray(data.data) || data.data.length > 1000 || !data.paging || typeof data.paging !== 'object') throw new Error('Invalid response');
      const count = value => Number.isSafeInteger(value) && value >= 0 ? value : null;
      const entries = data.data.map(item => {
        const status = item.list_status?.status?.replaceAll('_',' ');
        if (!Number.isSafeInteger(item.node?.id) || item.node.id < 1 || !['watching','plan to watch','completed','on hold','dropped'].includes(status)) throw new Error('Invalid entry');
        return {id:item.node.id, status, watched:count(item.list_status.num_episodes_watched), total:count(item.node.num_episodes)};
      });
      const hasMore = Boolean(data.paging.next);
      if (hasMore) {
        const next = new URL(data.paging.next);
        if (next.origin !== upstream.origin || next.pathname !== upstream.pathname || Number(next.searchParams.get('offset')) !== offset + 1000 || !entries.length) throw new Error('Invalid pagination');
      }
      return reply(200, {username, entries, hasMore});
    } catch { return reply(502, {error:'MAL unavailable or invalid response'}); }
    finally { clearTimeout(timeout); }
  }
};
