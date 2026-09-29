"""Run with the local HTTP server and optional Playwright/Edge installed.
Tests the real Worker handler with mocked MAL responses and the UI with a mocked endpoint.
No real accounts, API credentials, or personal lists are used.
"""
import json
from datetime import date
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(channel='msedge',headless=True)
    page = browser.new_page()
    page.goto('http://localhost:8000/tests/')
    result = page.evaluate('''async () => {
      const worker = (await import('/worker/index.js')).default;
      const realFetch = window.fetch;
      const env = {MAL_CLIENT_ID:'fictional-test-key', ALLOWED_ORIGINS:'http://localhost:8000'};
      let mode = 'ok', calls = [];
      const request = (body, origin='http://localhost:8000', method='POST') => ({url:'https://sync.example.test/list',method,headers:new Headers({Origin:origin,'Content-Type':'application/json'}),text:async()=>JSON.stringify(body)});
      const check = (value, label) => { if(!value) throw new Error(label); };
      window.fetch = async (url, options) => {
        calls.push(String(url));
        check(options.headers['X-MAL-CLIENT-ID']==='fictional-test-key', 'Server key forwarded');
        check(new URL(url).hostname==='api.myanimelist.net', 'Only MAL can be fetched');
        check(!options.method || options.method === 'GET','Read-only MAL calls');
        if(mode==='private') return new Response('{}',{status:403});
        if(mode==='missing') return new Response('{}',{status:404});
        if(mode==='rate') return new Response('{}',{status:429});
        if(mode==='auth') return new Response('{}',{status:401});
        if(mode==='invalid') return new Response('not-json');
        return Response.json({data:mode==='empty'?[]:[{node:{id:123,num_episodes:12,title:'Do not expose'},list_status:{status:'plan_to_watch',num_episodes_watched:2,comments:'Do not expose'}}],paging:mode==='next'?{next:'https://api.myanimelist.net/v2/users/Fiction/animelist?offset=1000'}:{}});
      };
      try {
        let response=await worker.fetch(request({username:'Fiction',offset:0}),env);
        const body=await response.json(); if(response.status!==200) throw new Error(JSON.stringify({status:response.status,body}));
        check(response.status===200 && body.entries[0].status==='plan to watch' && body.entries[0].total===12, 'Normalized numeric match/progress');
        check(!JSON.stringify(body).includes('Do not expose') && !JSON.stringify(body).includes('fictional-test-key'),'Only minimal data returned');
        check(response.headers.get('Cache-Control')==='no-store','No shared list cache');
        check(response.headers.get('Access-Control-Allow-Origin')==='http://localhost:8000','Allowed CORS origin');
        mode='next'; response=await worker.fetch(request({username:'Fiction'}),env); check((await response.json()).hasMore, 'Pagination');
        mode='empty'; response=await worker.fetch(request({username:'Fiction'}),env); check((await response.json()).entries.length===0,'Empty list');
        for(const [value,status] of [['private',403],['missing',404],['rate',429],['auth',503],['invalid',502]]) {
          mode=value; check((await worker.fetch(request({username:'Fiction'}),env)).status===status,value);
        }
        const before=calls.length;
        check((await worker.fetch(request({username:'../bad'}),env)).status===400,'Reject invalid username');
        check((await worker.fetch(request({username:'Fiction',offset:3}),env)).status===400,'Reject invalid page');
        check((await worker.fetch(request({username:'Fiction'},'https://untrusted.example'),env)).status===403,'Reject other origin');
        check((await worker.fetch(request({username:'Fiction'}),{})).status===403,'Missing config fails closed');
        check((await worker.fetch(request({},undefined,'OPTIONS'),env)).status===204,'Preflight');
        check((await worker.fetch(request({username:'Fiction'}),{...env,SYNC_RATE_LIMIT:{limit:async()=>({success:false})}})).status===429,'Optional rate limit');
        check(calls.length===before,'Invalid requests do not reach MAL');
        return 'PASS: Worker normalization, pagination, empty/private/missing lists, auth/rate/malformed responses, CORS and request validation';
      } finally {window.fetch=realFetch;}
    }''')
    print(result)
    calls = []
    mode = ['ok']
    errors = []
    page.on('pageerror',lambda error:errors.append(str(error)))
    page.route('**/config.js*',lambda route:route.fulfill(body="export const SYNC_ENDPOINT = 'https://sync.example.test/list';",content_type='text/javascript'))
    today=date.today().strftime('%Y%m%d')
    feed=f'BEGIN:VCALENDAR\nBEGIN:VEVENT\nDTSTART;VALUE=DATE:{today}\nSUMMARY:Fiction - Ep 3\nURL:https://myanimelist.net/anime/123\nEND:VEVENT\nEND:VCALENDAR'
    page.route('**/anime-dubs.ics',lambda route:route.fulfill(body=feed,content_type='text/calendar'))
    page.route('https://api.jikan.moe/**',lambda route:route.abort())
    def sync(route):
        if route.request.method == 'OPTIONS':
            route.fulfill(status=204,headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Content-Type','Access-Control-Allow-Methods':'POST'}); return
        body=route.request.post_data_json; calls.append(body)
        headers={'Access-Control-Allow-Origin':'*'}
        if mode[0]=='private' or (mode[0]=='partial' and body['offset']>0):
            route.fulfill(status=403,body='{}',headers=headers); return
        entries=[] if mode[0]=='empty' else [{'id':123 if body['offset']==0 else 456,'status':'watching' if body['offset']==0 else 'completed','watched':2,'total':12}]
        route.fulfill(content_type='application/json',headers=headers,body=json.dumps({'username':body['username'],'entries':entries,'hasMore':mode[0]!='empty' and body['offset']==0}))
    page.route('https://sync.example.test/**',sync)
    page.goto('http://localhost:8000/')
    page.locator('#mal-username').fill('Fiction')
    page.locator('#sync-now').click()
    page.wait_for_function("document.querySelector('#sync-status').textContent.includes('Synced 2 anime')")
    assert [item['offset'] for item in calls]==[0,1000]
    page.locator('[data-filter="watching"]').click()
    assert page.locator('.progress').inner_text()=='2 / 12 episodes watched'
    assert page.evaluate("localStorage.getItem('anidub:list:v1')") is None
    page.locator('#remember').check()
    assert page.evaluate("JSON.parse(localStorage.getItem('anidub:list:v1')).source.username")=='Fiction'
    before=len(calls)
    page.reload()
    page.wait_for_selector('.event')
    assert len(calls)==before
    page.evaluate("const data=JSON.parse(localStorage.getItem('anidub:list:v1')); data.source.syncedAt=Date.now()-600000; localStorage.setItem('anidub:list:v1',JSON.stringify(data));")
    page.reload()
    page.wait_for_function("document.querySelector('#sync-status').textContent.includes('Synced 2 anime')")
    assert len(calls)==before+2
    mode[0]='partial'
    page.locator('#mal-username').fill('OtherFiction')
    page.locator('#sync-now').click()
    page.wait_for_function("document.querySelector('#sync-status').textContent.includes('previous list')")
    assert page.evaluate("JSON.parse(localStorage.getItem('anidub:list:v1')).source.username")=='Fiction'
    assert '2 anime' in page.locator('#match-status').inner_text()
    mode[0]='empty'
    page.locator('#sync-now').click()
    page.wait_for_function("document.querySelector('#sync-status').textContent.includes('Synced 0 anime')")
    assert page.evaluate("JSON.parse(localStorage.getItem('anidub:list:v1')).entries.length")==0
    xml='<myanimelist><anime><series_animedb_id>123</series_animedb_id><my_status>Watching</my_status></anime></myanimelist>'
    page.locator('#mal-file').set_input_files({'name':'fiction.xml','mimeType':'application/xml','buffer':xml.encode()})
    page.wait_for_function("document.querySelector('#list-status').textContent.includes('1 anime loaded')")
    assert page.evaluate("JSON.parse(localStorage.getItem('anidub:list:v1')).source") is None
    before=len(calls)
    page.reload(); page.wait_for_selector('.event')
    assert len(calls)==before
    page.locator('#clear').click()
    assert page.evaluate("localStorage.getItem('anidub:list:v1')") is None
    assert not errors, errors
    print('PASS: paginated public sync, numeric matching/progress, opt-in save, automatic refresh, freshness throttle, partial-failure retention, empty list, XML fallback disconnects, deletion')
    browser.close()

