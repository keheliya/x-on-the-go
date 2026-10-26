import test from 'node:test';
import assert from 'node:assert/strict';
import {articleURL, mergeBookmarks, runBatch, MAX_BATCH} from '../extension/bookmarks-model.js';
import {XSession, saveDownload} from '../extension/x-session.js';
import {scanBookmarkPage} from '../extension/bookmarks-dom.js';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

test('bookmark URLs are restricted and duplicates have a stable identity', () => {
  for (const url of ['javascript:alert(1)', 'https://evil.test/i/article/1', 'https://x.com.evil.test/i/article/1', 'https://x.com/home', 'https://user:pass@x.com/i/article/1', 'http://x.com/a/status/1']) assert.equal(articleURL(url), null);
  assert.equal(articleURL('https://x.com/a/status/123?s=20').url, 'https://x.com/a/status/123');
  const first = mergeBookmarks([], [{url:'https://x.com/a/status/123', title:'First'}, {url:'https://evil.test/a/status/456'}]);
  const second = mergeBookmarks(first, [{url:'https://x.com/a/status/123?s=20', title:'Updated'}, {url:'https://x.com/b/status/456', articleUrl:'https://evil.test/i/article/2'}]);
  assert.deepEqual(second.map(x => x.id), ['123', '456']);
  assert.equal(second[0].title, 'Updated');
  assert.equal(second[1].articleUrl, second[1].url);
});

test('a partial bookmark rescan preserves an already discovered title', () => {
  const url = 'https://x.com/example/status/123';
  const initial = mergeBookmarks([], [{url, title:'The proof is in the spec'}]);
  const rescanned = mergeBookmarks(initial, [{url, title:''}]);
  assert.equal(rescanned[0].title, 'The proof is in the spec');
  assert.match(mergeBookmarks([], [{url, title:''}])[0].title, /Title unavailable/);
});

test('batch runs sequentially, continues on failure, and reports each outcome', async () => {
  const calls = [], states = [];
  let active = 0;
  const results = await runBatch([{id:'1'}, {id:'2'}, {id:'3'}], async item => {
    assert.equal(++active, 1); calls.push(item.id);
    await Promise.resolve(); active--;
    if (item.id === '2') throw new Error('Unavailable');
    return {message:'Downloaded'};
  }, (id, state) => states.push([id, state.state]));
  assert.deepEqual(calls, ['1', '2', '3']);
  assert.deepEqual(results.map(r => r.state), ['done', 'failed', 'done']);
  assert.deepEqual(states, [['1','working'],['1','done'],['2','working'],['2','failed'],['3','working'],['3','done']]);
});

test('stop does not start remaining items and batch limits fail before processing', async () => {
  const controller = new AbortController(), calls = [], states = [];
  await runBatch([{id:'1'}, {id:'2'}], async item => { calls.push(item.id); controller.abort(); throw controller.signal.reason; }, (id, state) => states.push(state.state), controller.signal);
  assert.deepEqual(calls, ['1']); assert.deepEqual(states, ['working', 'cancelled']);
  await assert.rejects(runBatch(Array.from({length:MAX_BATCH+1}, () => ({})), () => assert.fail(), () => {}), /Choose up to/);
});

function fakeChrome({extractionError = false, account = '@reader', navigated = false} = {}) {
  const removed = [], records = {}, tabs = new Map(); let next = 1;
  const api = {
    tabs: {
      getCurrent: async () => ({id:90}),
      create: async ({url}) => { const id = next++; tabs.set(id, {id, url}); return {id}; },
      get: async id => navigated ? {id, url:'https://x.com/other/status/999'} : tabs.get(id),
      update: async (id, values) => Object.assign(tabs.get(id), values),
      remove: async id => { removed.push(id); tabs.delete(id); }
    },
    storage: {session: {set: async data => Object.assign(records, data), remove: async key => { delete records[key]; }}},
    scripting: {executeScript: async ({func, files}) => {
      if (files) return [{result:extractionError ? {error:'Unavailable article'} : {title:'Test', html:'<p>Content</p>'}}];
      const name = func.name;
      return [{result:name === 'scanBookmarkPage' ? {ready:true, account, items:[], empty:true} : name === 'inspectArticlePage' ? {ready:true} : {done:true, length:500}}];
    }}
  };
  return {api, removed, records};
}

test('article tabs are tracked and closed on success and extraction failure', async () => {
  for (const extractionError of [false, true]) {
    const mock = fakeChrome({extractionError}), session = new XSession(mock.api);
    session.bookmarkTab = 99; session.account = '@reader';
    const job = session.extract({url:'https://x.com/a/status/123'});
    if (extractionError) await assert.rejects(job, /Unavailable article/);
    else assert.equal((await job).source, 'https://x.com/a/status/123');
    assert.deepEqual(mock.removed, [1]); assert.deepEqual(mock.records, {});
  }
});

test('account mismatch prevents article work and accidental navigation prevents export', async () => {
  const mock = fakeChrome(), session = new XSession(mock.api);
  session.bookmarkTab = 99; session.account = '@different';
  await assert.rejects(session.extract({url:'https://x.com/a/status/123'}), /account changed/);
  assert.deepEqual(mock.removed, []);
  const moved = fakeChrome({navigated:true}), session2 = new XSession(moved.api);
  session2.bookmarkTab = 99; session2.account = '@reader';
  await assert.rejects(session2.extract({url:'https://x.com/a/status/123'}), /navigated elsewhere/);
  assert.deepEqual(moved.removed, [1]);
});

test('bulk save checks completion and reports interrupted downloads', async () => {
  let options, cancelled;
  const api = {downloads: {
    download: async o => { options = o; return 42; },
    search: async () => [{state:'complete'}],
    cancel: async id => { cancelled = id; }
  }};
  await saveDownload(new Blob(['test']), 'x-on-the-go/test.epub', undefined, api);
  assert.equal(options.conflictAction, 'uniquify'); assert.equal(options.saveAs, false);
  api.downloads.search = async () => [{state:'interrupted'}];
  await assert.rejects(saveDownload(new Blob(['test']), 'test.epub', undefined, api), /cancelled or interrupted/);
  assert.equal(cancelled, 42);
});

test('cancellation during article loading still closes the owned tab', async () => {
  const mock = fakeChrome(), session = new XSession(mock.api), controller = new AbortController();
  session.bookmarkTab = 99; session.account = '@reader';
  const execute = mock.api.scripting.executeScript;
  mock.api.scripting.executeScript = async options => {
    if (options.func?.name === 'inspectArticlePage') controller.abort();
    return execute(options);
  };
  await assert.rejects(session.extract({url:'https://x.com/a/status/123'}, controller.signal), {name:'AbortError'});
  assert.deepEqual(mock.removed, [1]); assert.deepEqual(mock.records, {});
});

test('closing a library cleans up only tabs registered to that library', async () => {
  let onRemoved;
  const removed = [];
  const data = {'worktab:1':{owner:90}, 'worktab:2':{owner:91}, 'article:example':{title:'Keep this preview'}};
  const chrome = {
    action:{onClicked:{addListener:()=>{}}},
    tabs:{onRemoved:{addListener: fn => { onRemoved = fn; }}, remove: async id => removed.push(id)},
    storage:{session:{get:async()=>({...data}), remove:async key=>{delete data[key];}}}
  };
  runInNewContext(readFileSync(new URL('../extension/background.js', import.meta.url), 'utf8'), {chrome});
  await onRemoved(90);
  assert.deepEqual(removed, [1]);
  assert.ok(data['worktab:2']); assert.ok(data['article:example']);
});

test('bookmark startup waits for navigation before interpreting the page', async () => {
  const mock = fakeChrome(), session = new XSession(mock.api);
  let reads = 0, inspected = 0;
  mock.api.tabs.get = async id => ++reads === 1 ? {id, status:'loading', url:'about:blank'} : {id, status:'complete', url:'https://x.com/i/bookmarks'};
  mock.api.scripting.executeScript = async () => {
    inspected++;
    return [{result:reads < 2 ? {error:'The scan tab left X Bookmarks.'} : {ready:true, account:'@reader', items:[]}}];
  };
  await session.startBookmarks();
  assert.ok(reads >= 2);
  assert.equal(inspected, 1);
  assert.equal(session.account, '@reader');
});

test('failed startup leaves the tab available and retry reuses it', async () => {
  const mock = fakeChrome(), session = new XSession(mock.api);
  const execute = mock.api.scripting.executeScript;
  mock.api.scripting.executeScript = async () => [{result:{error:'Sign in to X'}}];
  await assert.rejects(session.startBookmarks(), /Sign in/);
  assert.equal(session.bookmarkTab, 1);
  assert.deepEqual(mock.removed, []);
  mock.api.scripting.executeScript = execute;
  await session.startBookmarks();
  assert.equal(session.bookmarkTab, 1);
  assert.equal(session.account, '@reader');
  assert.deepEqual(mock.removed, []);
});

test('bookmark startup accepts X redirecting to /i/history', async () => {
  const mock = fakeChrome(), session = new XSession(mock.api);
  const primary = {
    querySelector: selector => selector === '[data-testid="emptyState"]' ? {} : null,
    querySelectorAll: () => []
  };
  const context = {
    document: {readyState:'complete', documentElement:{scrollHeight:1000}, querySelector: selector => {
      if (selector === '[data-testid="primaryColumn"]') return primary;
      if (selector === '[data-testid="SideNav_AccountSwitcher_Button"]') return {textContent:'Reader @reader'};
      return null;
    }},
    location:new URL('https://x.com/i/history'), innerHeight:1000, scrollY:0
  };
  mock.api.tabs.get = async id => ({id, status:'complete', url:'https://x.com/i/history'});
  // Execute the real serialized scanner, not a mocked success result.
  mock.api.scripting.executeScript = async ({func}) => [{result:runInNewContext(`(${func.toString()})()`, context)}];
  const page = await session.startBookmarks();
  assert.equal(page.ready, true);
  assert.equal(session.account, '@reader');
  await session.verifyAccount();
  const rejected = runInNewContext(`(${scanBookmarkPage.toString()})()`, {...context, location:new URL('https://x.com/home')});
  assert.match(rejected.error, /left X Bookmarks/);
});

test('toolbar opens the bookmark library on both bookmark routes', async () => {
  let clicked;
  const opened = [];
  const chrome = {
    action:{onClicked:{addListener:fn=>{clicked=fn;}}},
    tabs:{onRemoved:{addListener:()=>{}}, create:async options=>opened.push(options.url)},
    runtime:{getURL:path=>'chrome-extension://test/'+path},
    scripting:{executeScript:async()=>[{result:{error:'Not an article'}}]},
    storage:{session:{get:async()=>({}), set:async()=>{}}}
  };
  runInNewContext(readFileSync(new URL('../extension/background.js', import.meta.url), 'utf8'), {chrome, crypto:{randomUUID:()=> 'test'}});
  for (const url of ['https://x.com/i/bookmarks', 'https://x.com/i/history', 'https://x.com/i/history/?tab=bookmarks']) {
    await clicked({url});
  }
  assert.deepEqual(opened, Array(3).fill('chrome-extension://test/bookmarks.html'));
});
