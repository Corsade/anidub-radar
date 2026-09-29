import { restoreList, saveList, forgetList, nextForList } from './personal.js?v=0587ea92adc4';
import { observePosters, retryPosters } from './posters.js?v=0587ea92adc4';
import { FEED_URL, parseICS, parseMAL, matchesFilter } from './parser.js?v=0587ea92adc4';
const $ = id => document.getElementById(id);
const dateKey = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const addDays = (d,n) => new Date(d.getFullYear(),d.getMonth(),d.getDate()+n,12);
let week = addDays(new Date(), -((new Date().getDay()+6)%7));
let list = null, filter = 'all', feed = null, loading = false, fileVersion = 0, view = 'cards';
try { list = restoreList(); $('remember').checked = list !== null; if (list) $('list-status').textContent = `${list.size} anime restored from this device.`; }
catch { $('list-status').textContent = 'Saved list could not be read. Import your XML to continue, or clear saved data.'; $('clear').hidden = false; }
const format = (d, options) => d.toLocaleDateString(undefined, options);
function element(tag, text, className) { const el = document.createElement(tag); el.textContent = text; if(className) el.className = className; return el; }
function render() {
  $('week-title').textContent = `${format(week,{month:'short',day:'numeric'})} – ${format(addDays(week,6),{month:'short',day:'numeric',year:'numeric'})}`;
  $('calendar').replaceChildren(); observePosters($('calendar')); $('empty').hidden = true;
  $('week-count').textContent = '';
  document.querySelectorAll('[data-filter]').forEach(button => { button.hidden = !list && button.dataset.filter !== 'all'; button.setAttribute('aria-pressed', String(button.dataset.filter === filter)); });
  $('next-for-me').hidden = !list;
  $('next-for-me').disabled = !feed || loading;
  if (list) $('clear').hidden = false;
  $('calendar').classList.toggle('compact', view === 'compact');
  $('retry-posters').hidden = false;
  $('match-status').textContent = list && feed ? `${new Set(feed.events.filter(event => list.has(event.malId)).map(event => event.malId)).size} of your ${list.size} anime appear in the current feed (all dates).` : list ? 'Load the calendar to check list matches.' : '';
  if (!feed) return;
  const query = $('search').value.trim().toLocaleLowerCase();
  const visible = feed.events.filter(event => matchesFilter(event,list,filter) && event.title.toLocaleLowerCase().includes(query));
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
      if (event.url) {
        poster.href = event.url;
        poster.setAttribute('aria-label', `${event.title} on MyAnimeList`);
      }
      card.dataset.eventKey = `${event.date}/${event.malId}/${event.episode}`;
      card.tabIndex = -1;
      if (event.malId) { poster.dataset.malId = event.malId; card.dataset.malId = event.malId; }
      poster.append(element('span', '◈', 'poster-mark'), element('span', event.malId ? 'Loading poster…' : 'Poster unavailable', 'poster-label'));
      const episode = element('span', event.episode ? `EP ${event.episode}` : 'Episode unspecified', 'episode');
      details.append(episode);
      if (event.projected) { const badge = element('span', 'Projected', 'projected'); badge.title = 'The feed marks this date as a projection. It may change.'; details.append(badge); }
      if(event.url) { const link = element('a',event.title + ' ↗'); link.href = event.url; link.setAttribute('aria-label',`${event.title} on MyAnimeList`); title.append(link); } else title.textContent = event.title;
      details.append(title, element('p', event.malId ? 'MAL score: loading…' : 'MAL score unavailable', 'rating'));
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
  if(!count) { $('empty').hidden = false; $('empty').textContent = query ? 'No titles match your search and filter this week. Clear the search or try another week.' : filter === 'all' ? 'No episodes listed for this week. Try another week.' : 'No episodes match this filter this week. Try All or another week.'; }
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
$('previous').onclick = () => { $('next-status').textContent = ''; week = addDays(week,-7); render(); };
$('next').onclick = () => { $('next-status').textContent = ''; week = addDays(week,7); render(); };
$('today').onclick = () => { $('next-status').textContent = ''; week = addDays(new Date(),-((new Date().getDay()+6)%7)); render(); };
$('refresh').onclick = fetchFeed;
document.querySelectorAll('[data-filter]').forEach(button => button.onclick = () => { $('next-status').textContent = ''; filter = button.dataset.filter; render(); });
$('mal-file').onchange = async event => {
  const file = event.target.files[0]; if(!file) return;
  const version = ++fileVersion; $('list-status').textContent = 'Reading XML locally…';
  try {
    if(file.size > 20*1024*1024) throw new Error('This file is too large. Choose an uncompressed MAL XML export under 20 MB.');
    const parsed = parseMAL(await file.text()); if(version !== fileVersion) return;
    list = parsed; filter = 'all'; $('clear').hidden = false;
    let saved = '';
    if ($('remember').checked) { try { saveList(list); saved = ' Remembered on this device.'; } catch { saved = ' Could not save this list; it is available in this tab only. Clear saved data to remove any older saved list.'; } }
    $('list-status').textContent = `${list.size} anime loaded. Personal filters are ready${list.size ? '.' : '; this list is empty.'}${saved}`; $('next-status').textContent = ''; render();
  } catch(error) { if(version === fileVersion) $('list-status').textContent = `${error.message} ${list ? 'Your previous list is still active.' : 'No list was loaded.'}`; }
  finally { if(version === fileVersion) event.target.value = ''; }
};
$('clear').onclick = () => {
  fileVersion++; list = null; filter = 'all'; $('mal-file').value = ''; $('remember').checked = false;
  $('next-status').textContent = '';
  try { forgetList(); $('clear').hidden = true; $('list-status').textContent = 'List cleared and saved list data deleted from this device.'; }
  catch { $('clear').hidden = false; $('list-status').textContent = 'List cleared from this tab, but saved data could not be deleted. Allow browser storage and retry, or clear this site’s data in browser settings.'; }
  render();
};
$('remember').onchange = () => {
  try {
    if ($('remember').checked) {
      if (list) saveList(list);
      $('list-status').textContent = list ? 'List remembered on this device.' : 'Your next imported list will be remembered on this device.';
    } else { forgetList(); $('list-status').textContent = 'Saved list deleted. Any loaded list stays in this tab only.'; }
  } catch { $('list-status').textContent = 'Browser storage is unavailable. The requested save or deletion could not be completed; you can manage saved data in browser settings.'; }
};
$('search').oninput = () => { $('next-status').textContent = ''; render(); };
document.querySelectorAll('[data-view]').forEach(button => button.onclick = () => {
  view = button.dataset.view;
  document.querySelectorAll('[data-view]').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
  render();
});
$('retry-posters').onclick = () => retryPosters($('calendar'));
$('next-for-me').onclick = () => {
  const event = nextForList(feed?.events || [], list, dateKey(new Date()));
  if (!event) { $('next-status').textContent = 'No upcoming Watching or Plan to Watch episodes in the current feed. Dates beyond its coverage are unknown.'; return; }
  const day = new Date(`${event.date}T12:00:00`);
  week = addDays(day, -((day.getDay()+6)%7));
  filter = list.get(event.malId).status; $('search').value = ''; render();
  $('next-status').textContent = `Next for you: ${event.title}, ${event.episode ? 'episode ' + event.episode : 'episode unspecified'}, ${event.date}. Showing ${filter === 'watching' ? 'Watching' : 'Plan to Watch'}; search cleared. Dates do not indicate release times.`;
  const card = [...document.querySelectorAll('.event')].find(card => card.dataset.eventKey === `${event.date}/${event.malId}/${event.episode}`);
  card?.classList.add('next-match'); card?.focus({preventScroll:true}); card?.scrollIntoView({block:'center'});
};
render(); fetchFeed();
