"""Theme checks: run local HTTP server, then python tests/theme_checks.py (Playwright/Edge)."""
from datetime import date
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    browser=p.chromium.launch(channel='msedge',headless=True)
    page=browser.new_page(color_scheme='dark',viewport={'width':390,'height':844})
    errors=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    today=date.today().strftime('%Y%m%d')
    feed=f'BEGIN:VCALENDAR\nBEGIN:VEVENT\nDTSTART;VALUE=DATE:{today}\nSUMMARY:Fictional Orbit - Ep 3 (Projected)\nURL:https://myanimelist.net/anime/999001\nEND:VEVENT\nEND:VCALENDAR'
    page.route('**/anime-dubs.ics',lambda r:r.fulfill(body=feed,content_type='text/calendar'))
    page.route('https://api.jikan.moe/**',lambda r:r.abort())
    page.route('https://graphql.anilist.co',lambda route:route.abort())
    page.goto('http://localhost:8000/')
    page.wait_for_selector('.event')
    theme=lambda:page.locator('html').get_attribute('data-theme')
    assert theme()=='dark'
    assert page.evaluate('getComputedStyle(document.body).backgroundColor')=='rgb(12, 22, 36)'
    page.emulate_media(color_scheme='light')
    page.wait_for_function("document.documentElement.dataset.theme==='light'")
    button=page.locator('#theme-toggle')
    button.focus(); page.keyboard.press('Space')
    assert theme()=='dark'
    assert button.get_attribute('aria-pressed')=='true'
    page.reload(); page.wait_for_selector('.event')
    assert theme()=='dark'
    page.locator('[data-view="compact"]').click()
    assert page.locator('.event').first.evaluate('(e)=>getComputedStyle(e).backgroundColor')=='rgb(23, 38, 56)'
    for width in [320,390,768,1440]:
        page.set_viewport_size({'width':width,'height':900})
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),width
    page.set_viewport_size({'width':390,'height':844})
    button.click(); page.reload(); page.wait_for_selector('.event')
    assert theme()=='light'
    page.add_init_script("Storage.prototype.getItem=()=>{throw Error('blocked')}; Storage.prototype.setItem=()=>{throw Error('blocked')};")
    page.reload(); page.wait_for_selector('.event')
    assert theme()=='light'
    button.click(); assert theme()=='dark'
    assert not errors,errors
    print('PASS: system theme and changes, keyboard toggle, persistence in both directions, compact dark surfaces, mobile widths, and blocked storage')
    browser.close()
