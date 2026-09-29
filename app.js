import { observePosters } from './posters.js';
import { FEED_URL, parseICS, parseMAL, matchesFilter } from './parser.js';
const $ = id => document.getElementById(id);
const dateKey = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const addDays = (d,n) => new Date(d.getFullYear(),d.getMonth(),d.getDate()+n,12);
let week = addDays(new Date(), -((new Date().getDay()+6)%7));
let list = null, filter = 'all', feed = null, loading = false, fileVersion = 0;
const format = (d, options) => d.toLocaleDateString(undefined, options);
function element(tag, text, className) { const el = document.createElement(tag); el.textContent = text; if(className) el.className = className; return el; }
function render() {
  $('week-title').textContent = `${format(week,{month:'short',day:'numeric'})} – ${format(addDays(week,6),{month:'short',day:'numeric',year:'numeric'})}`;
  $('calendar').replaceChildren(); observePosters($('calendar')); $('empty').hidden = true;
  $('week-count').textContent = '';
  document.querySelectorAll('[data-filter]').forEach(button => { button.hidden = !list && button.dataset.filter !== 'all'; button.setAttribute('aria-pressed', String(button.dataset.filter === filter)); });
  if (!feed) return;
  const visible = feed.events.filter(event => matchesFilter(event,list,filter));
  let count = 0;
  for(let i=0;i<7;i++) {
    const day = addDays(week,i), key = dateKey(day);
    const section = element('section','',`day${key === dateKey(new Date()) ? ' is-today' : ''}`);
    const heading = element('h3',format(day,{weekday:'long'}));
    const time = element('time',format(day,{month:'short',day:'numeric'}) + (key === dateKey(new Date()) ? ' · Today' : '')); time.dateTime = key; heading.append(time); section.append(heading);
    const cards = element('div','','events');
    const events = visible.filter(event => event.date === key); count += events.length;
    for(const event of events) {
      const card = element('article','','event'), details = element('div','','event-details'), title = element('h4','');
      const poster = element(event.url ? 'a' : 'div', '', 'poster');
      if (event.url) { poster.href = event.url; poster.tabIndex = -1; poster.setAttribute('aria-label', `${event.title}, ${event.episode ? 'episode ' + event.episode : 'episode unspecified'} on MyAnimeList`); }
      if (event.malId) poster.dataset.malId = event.malId;
      poster.append(element('span', '◈', 'poster-mark'), element('span', event.malId ? 'Loading poster…' : 'Poster unavailable', 'poster-label'));
      const episode = element('span', event.episode ? `EP ${event.episode}` : 'Episode unspecified', 'episode');
      poster.append(episode);
      if(event.url) { const link = element('a',event.title + ' ↗'); link.href = event.url; link.setAttribute('aria-label',`${event.title} on MyAnimeList`); title.append(link); } else title.textContent = event.title;
      details.append(title);
      const entry = list?.get(event.malId);
      if(entry?.status === 'watching') details.append(element('p',`${entry.watched ?? '?'} / ${entry.total || '?'} episodes watched`,'progress'));
      if(!event.malId) details.append(element('small','No MAL ID supplied; cannot match to your list.'));
      details.append(element('p', 'ENGLISH DUB', 'dub-label'));
      card.append(poster, details); cards.append(card);
    }
    if(!events.length) cards.append(element('p','No episodes listed.','no-events'));
    section.append(cards); $('calendar').append(section);
  }
  $('week-count').textContent = `${count} episode${count === 1 ? '' : 's'}`;
  observePosters($('calendar'));
  if(!count) { $('empty').hidden = false; $('empty').textContent = filter === 'all' ? 'No episodes listed for this week. Try another week.' : 'No episodes match this filter this week. Try All or another week.'; }
}
async function fetchFeed() {
  if(loading) return; loading = true; $('refresh').disabled = true; $('calendar').setAttribute('aria-busy','true');
  $('feed-status').textContent = feed ? 'Refreshing calendar…' : 'Loading the dub calendar…';
  const controller = new AbortController(), timeout = setTimeout(() => controller.abort(),20000);
  try {
    const response = await fetch(FEED_URL,{signal:controller.signal,cache:'no-cache'});
    if(!response.ok) throw new Error('Network response failed');
    const parsed = parseICS(await response.text());
    if(!parsed.events.length && parsed.skipped) throw new Error('No readable events');
    feed = parsed;
    $('feed-status').textContent = `Checked ${format(new Date(),{hour:'2-digit',minute:'2-digit'})}${feed.updated ? ` · Source updated ${feed.updated}` : ' · Source update date unavailable'}`;
    const notices = [];
    const sourceDate = Date.parse(feed.updated);
    if(!Number.isNaN(sourceDate) && Date.now()-sourceDate > 14*86400000) notices.push('The source is over 14 days old; this schedule may be stale.');
    if(feed.events.length && feed.events.at(-1).date < dateKey(new Date())) notices.push('The feed contains no current or future dates and may be stale.');
    if(feed.skipped) notices.push(`${feed.skipped} unreadable events were skipped.`);
    $('warning').hidden = !notices.length; $('warning').textContent = notices.join(' ');
  } catch {
    $('feed-status').textContent = feed ? 'Refresh failed. Showing the last successful fetch from this tab; it may be stale.' : 'Could not load the calendar. Check your connection and retry with Refresh feed. The feed may be unavailable or unreadable.';
  } finally { clearTimeout(timeout); loading = false; $('refresh').disabled = false; $('calendar').setAttribute('aria-busy','false'); render(); }
}
$('previous').onclick = () => { week = addDays(week,-7); render(); };
$('next').onclick = () => { week = addDays(week,7); render(); };
$('today').onclick = () => { week = addDays(new Date(),-((new Date().getDay()+6)%7)); render(); };
$('refresh').onclick = fetchFeed;
document.querySelectorAll('[data-filter]').forEach(button => button.onclick = () => { filter = button.dataset.filter; render(); });
$('mal-file').onchange = async event => {
  const file = event.target.files[0]; if(!file) return;
  const version = ++fileVersion; $('list-status').textContent = 'Reading XML locally…';
  try {
    if(file.size > 20*1024*1024) throw new Error('This file is too large. Choose an uncompressed MAL XML export under 20 MB.');
    const parsed = parseMAL(await file.text()); if(version !== fileVersion) return;
    list = parsed; filter = 'all'; $('clear').hidden = false;
    $('list-status').textContent = `${list.size} anime loaded. Personal filters are ready${list.size ? '.' : '; this list is empty.'}`; render();
  } catch(error) { if(version === fileVersion) $('list-status').textContent = `${error.message} ${list ? 'Your previous list is still active.' : 'No list was loaded.'}`; }
  finally { if(version === fileVersion) event.target.value = ''; }
};
$('clear').onclick = () => { fileVersion++; list = null; filter = 'all'; $('mal-file').value = ''; $('clear').hidden = true; $('list-status').textContent = 'List cleared from this tab.'; render(); };
render(); fetchFeed();
