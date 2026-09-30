"""Community rating checks with fictional feed/API data. Requires local server and Playwright/Edge."""
import json
from datetime import date
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser=p.chromium.launch(channel='msedge',headless=True)
    page=browser.new_page(viewport={'width':1440,'height':1400})
    today=date.today().strftime('%Y%m%d')
    feed='BEGIN:VCALENDAR\n'+''.join(f'BEGIN:VEVENT\nDTSTART;VALUE=DATE:{today}\nSUMMARY:Fiction {i} - Ep {i}\nURL:https://myanimelist.net/anime/{id}\nEND:VEVENT\n' for i,id in enumerate([111,111,222,333],1))+'END:VCALENDAR'
    page.route('**/anime-dubs.ics',lambda route:route.fulfill(body=feed,content_type='text/calendar'))
    calls=[]; score=[8.45]; failure=[True]; errors=[]
    page.on('pageerror',lambda error:errors.append(str(error)))
    def api(route):
        id=int(route.request.url.rsplit('/',1)[1]); calls.append(id)
        if id==333 and failure[0]: route.fulfill(status=503,body='unavailable'); return
        route.fulfill(content_type='application/json',body=json.dumps({'data':{'mal_id':id,'score':None if id==222 else score[0],'scored_by':12345,'images':{}}}))
    page.route('https://api.jikan.moe/**',api)
    page.route('https://graphql.anilist.co',lambda route:route.abort())
    page.goto('http://localhost:8000/')
    page.locator('.event').first.scroll_into_view_if_needed()
    page.wait_for_function("document.querySelectorAll('.rating').length === 4 && [...document.querySelectorAll('.rating')].every(e=>!e.textContent.includes('loading'))")
    assert page.locator('.rating').nth(0).inner_text()=='★ MAL 8.45 / 10'
    assert page.locator('.rating').nth(1).inner_text()=='★ MAL 8.45 / 10'
    assert '12,345 ratings' in page.locator('.rating').first.get_attribute('title')
    assert page.locator('.rating').nth(2).inner_text()=='MAL: not rated yet'
    assert page.locator('.rating').nth(3).inner_text()=='MAL score unavailable'
    assert calls.count(111)==1
    assert not page.locator('.has-poster').count()
    page.locator('[data-view="compact"]').click()
    page.locator('.event').first.scroll_into_view_if_needed()
    page.wait_for_function("document.querySelector('.rating').textContent.includes('8.45')")
    assert page.locator('.rating').first.is_visible()
    assert not page.locator('.poster').first.is_visible()
    before=len(calls)
    failure[0]=False
    page.reload()
    page.locator('.event').first.scroll_into_view_if_needed()
    page.wait_for_function("document.querySelectorAll('.rating').length === 4 && [...document.querySelectorAll('.rating')].every(e=>!e.textContent.includes('loading'))")
    assert calls.count(111)==1 and calls.count(222)==1
    page.evaluate("let rows=JSON.parse(localStorage.getItem('anidub:posters:v1')); rows.find(r=>r[0]===111)[1].scoreExpires=1; localStorage.setItem('anidub:posters:v1',JSON.stringify(rows));")
    score[0]=8.67
    page.reload()
    page.locator('.event').first.scroll_into_view_if_needed()
    page.wait_for_function("document.querySelector('.rating').textContent.includes('8.67')")
    assert calls.count(111)==2
    assert calls.count(222)==1
    assert not errors,errors
    print('PASS: community score, vote count, duplicate-ID deduplication, no-score and network-failure states, scores without images, compact view, cached scores and one-day expiry')
    browser.close()
