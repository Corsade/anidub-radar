"""Browser integration checks. Run a local HTTP server, then: python tests/browser_checks.py
Requires the optional playwright Python package and Microsoft Edge.
All network data in this test is fictional and intercepted locally.
"""
from datetime import date, timedelta
import base64
import json
from playwright.sync_api import sync_playwright

BASE = 'http://localhost:8000/'
PNG = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=')
XML = '<myanimelist>' + ''.join(f'<anime><series_animedb_id>{id}</series_animedb_id><series_title>Private fictional title</series_title><my_status>{status}</my_status><my_watched_episodes>2</my_watched_episodes><series_episodes>12</series_episodes></anime>' for id,status in [(999001,'Watching'),(999002,'Plan to Watch'),(999099,'Watching')]) + '</myanimelist>'
today = date.today()
future = today + timedelta(days=14)
rows = [(999001, today-timedelta(days=14), 'Old Orbit', ''), (999002, future, 'Future Orbit', ' (Projected)'), (999003, today, 'Today Comet', '')]
ICS = 'BEGIN:VCALENDAR\r\n' + ''.join(f'BEGIN:VEVENT\r\nDTSTART;VALUE=DATE:{day:%Y%m%d}\r\nSUMMARY:{title} - Ep 3{suffix}\r\nURL:https://myanimelist.net/anime/{id}\r\nEND:VEVENT\r\n' for id,day,title,suffix in rows) + 'END:VCALENDAR'

def ready(page):
    page.wait_for_function("document.querySelector('#calendar').getAttribute('aria-busy') === 'false'")

def upload(page):
    page.locator('#mal-file').set_input_files({'name':'fiction.xml','mimeType':'application/xml','buffer':XML.encode()})
    page.wait_for_function("document.querySelector('#list-status').textContent.includes('3 anime loaded')")

with sync_playwright() as p:
    browser = p.chromium.launch(channel='msedge',headless=True)
    page = browser.new_page(viewport={'width':1200,'height':1000}, reduced_motion='reduce')
    errors, requests = [], []
    failed = [False]
    page.on('pageerror',lambda error: errors.append(str(error)))
    page.route('**/anime-dubs.ics',lambda route:route.fulfill(body=ICS,content_type='text/calendar'))
    def poster(route):
        id = int(route.request.url.rsplit('/',1)[1]); requests.append(id)
        if failed[0]: route.fulfill(status=503,body='Unavailable'); return
        route.fulfill(content_type='application/json',body=json.dumps({'data':{'mal_id':id,'images':{'jpg':{'large_image_url':f'https://cdn.myanimelist.net/images/{id}.jpg'}}}}))
    page.route('https://api.jikan.moe/**',poster)
    page.route('https://cdn.myanimelist.net/**',lambda route:route.fulfill(body=PNG,content_type='image/png'))
    page.goto(BASE+'tests/')
    page.wait_for_function('document.body.dataset.result')
    assert page.locator('body').get_attribute('data-result') == 'pass'
    print('PASS: parser and next-episode unit checks')
    page.goto(BASE); ready(page)
    upload(page)
    assert page.evaluate("localStorage.getItem('anidub:list:v1')") is None
    assert '2 of your 3 anime' in page.locator('#match-status').inner_text()
    page.reload(); ready(page)
    assert not page.locator('#next-for-me').is_visible()
    upload(page)
    page.locator('#remember').check()
    stored = page.evaluate("localStorage.getItem('anidub:list:v1')")
    assert 'Private' not in stored and 'series_title' not in stored
    page.reload(); ready(page)
    assert page.locator('#remember').is_checked()
    assert 'restored' in page.locator('#list-status').inner_text()
    page.locator('#search').fill('absent')
    assert page.locator('#empty').is_visible()
    page.locator('#next-for-me').click()
    assert page.locator('.next-match').count() == 1
    assert page.locator('.projected').inner_text() == 'Projected'
    assert page.locator('.episode').inner_text() == 'EP 3'
    assert page.locator('#search').input_value() == ''
    assert page.locator('[data-filter="plan to watch"]').get_attribute('aria-pressed') == 'true'
    page.locator('#search').fill('fUtUrE')
    assert page.locator('.event').count() == 1
    page.locator('[data-view="compact"]').click()
    assert not page.locator('.poster').is_visible()
    page.locator('#remember').uncheck()
    assert page.evaluate("localStorage.getItem('anidub:list:v1')") is None
    assert page.locator('#next-for-me').is_visible()
    page.locator('#remember').check()
    page.locator('#clear').click()
    assert page.evaluate("localStorage.getItem('anidub:list:v1')") is None
    page.reload(); ready(page)
    assert not page.locator('#next-for-me').is_visible()
    print('PASS: opt-in persistence, restoration, minimal stored data, deletion, match count, search, compact mode, next-week jump, projected badge')
    page.locator('.poster').first.scroll_into_view_if_needed()
    page.wait_for_selector('.has-poster')
    before = len(requests)
    page.reload(); ready(page)
    page.locator('.poster').first.scroll_into_view_if_needed()
    page.wait_for_selector('.has-poster')
    assert len(requests) == before
    page.evaluate("localStorage.setItem('anidub:posters:v1', JSON.stringify([[999003,{url:'https://cdn.myanimelist.net/images/999003.jpg',expires:1}]]))")
    failed[0] = True
    page.reload(); ready(page)
    page.locator('.poster').first.scroll_into_view_if_needed()
    page.wait_for_selector('.poster-failed')
    assert len(requests) > before
    failed[0] = False
    page.locator('#retry-posters').click()
    page.wait_for_selector('.has-poster')
    assert 999099 not in requests
    print('PASS: persistent poster cache, expiry, failed lookup and retry; no XML-only IDs requested')
    for width in [320,390,768,1440]:
        page.set_viewport_size({'width':width,'height':900})
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), width
    page.evaluate("localStorage.setItem('anidub:list:v1','broken')")
    page.reload(); ready(page)
    assert 'could not be read' in page.locator('#list-status').inner_text()
    page.locator('#clear').click()
    assert page.evaluate("localStorage.getItem('anidub:list:v1')") is None
    page.add_init_script("Storage.prototype.setItem = function() { throw new Error('blocked'); };")
    page.reload(); ready(page); upload(page)
    page.locator('#remember').check()
    assert 'unavailable' in page.locator('#list-status').inner_text()
    assert not errors, errors
    print('PASS: responsive widths, corrupt storage recovery, unavailable storage; no JS errors')
    browser.close()
