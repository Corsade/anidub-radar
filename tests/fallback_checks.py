"""Exact-ID poster fallback regression checks; local server + Playwright/Edge required."""
import base64
import json
from datetime import date
from playwright.sync_api import sync_playwright
PNG=base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=')
with sync_playwright() as p:
 b=p.chromium.launch(channel='msedge',headless=True)
 page=b.new_page(viewport={'width':1440,'height':1800})
 ids=[111,222,333]
 feed='BEGIN:VCALENDAR\n'+''.join(f'BEGIN:VEVENT\nDTSTART;VALUE=DATE:{date.today():%Y%m%d}\nSUMMARY:Fiction {id} - Ep 1\nURL:https://myanimelist.net/anime/{id}\nEND:VEVENT\n' for id in ids)+'END:VCALENDAR'
 page.route('**/anime-dubs.ics',lambda r:r.fulfill(body=feed,content_type='text/calendar'))
 page.route('https://api.jikan.moe/**',lambda r:r.fulfill(status=504,body='{}'))
 calls=[]
 def fallback(r):
  if r.request.method=='OPTIONS':
   r.fulfill(status=204,headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Content-Type'}); return
  body=r.request.post_data_json; id=body['variables']['id']; calls.append(id)
  assert 'score' not in body['query']
  r.fulfill(content_type='application/json',headers={'Access-Control-Allow-Origin':'*'},body=json.dumps({'data':{'Media':{'idMal':999 if id==333 else id,'coverImage':{'extraLarge':f'https://s4.anilist.co/file/{id}.png'}}}}))
 page.route('https://graphql.anilist.co',fallback)
 page.route('https://s4.anilist.co/**',lambda r:r.fulfill(body=PNG,content_type='image/png'))
 # Reproduce the old cache state: good rating, missing artwork.
 page.add_init_script("if(!sessionStorage.getItem('seeded')) {localStorage.setItem('anidub:posters:v1',JSON.stringify([[222,{url:null,expires:0,score:7.25,scoreExpires:Date.now()+86400000,checkedAt:Date.now(),scoredBy:100}]]));sessionStorage.setItem('seeded','yes');}")
 page.goto('http://localhost:8000/')
 page.locator('.event').first.scroll_into_view_if_needed()
 page.wait_for_function("document.querySelectorAll('.has-poster').length===2 && document.querySelector('.event[data-mal-id=\"333\"] .poster-failed')")
 assert page.locator('.event[data-mal-id="111"] .rating').inner_text()=='MAL score unavailable'
 assert '7.25' in page.locator('.event[data-mal-id="222"] .rating').inner_text()
 assert not page.locator('.event[data-mal-id="333"] .has-poster').count()
 before=calls.count(111)
 page.reload()
 page.locator('.event').first.scroll_into_view_if_needed()
 page.wait_for_function("document.querySelectorAll('.has-poster').length===2")
 assert calls.count(111)==before
 print('PASS: upstream failure fallback, exact ID enforcement, missing-artwork cache recovery, MAL-only ratings, cached fallback images reused')
 b.close()
