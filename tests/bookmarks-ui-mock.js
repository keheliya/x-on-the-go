// Synthetic browser APIs for the local UI harness. Never included in the extension ZIP.
window.testHarness = {failId: '202', downloads: [], tabs: new Map(), records: {}, granted: true};
const harness = window.testHarness;
let tabSequence = 100;
const items = [
  {url:'https://x.com/reader/status/201', title:'A small guide to better reading', author:'Alex Reader'},
  {url:'https://x.com/reader/status/202', title:'An unavailable article', author:'Morgan Writer'},
  {url:'https://x.com/reader/status/203', title:'Notes worth keeping <script>', author:'Sam Author'}
];
window.chrome = {
  permissions: {request: async () => harness.granted},
  tabs: {
    getCurrent: async () => ({id:90}),
    create: async options => { const id = tabSequence++; harness.tabs.set(id, {id, ...options}); return {id}; },
    get: async id => harness.tabs.get(id),
    update: async (id, options) => Object.assign(harness.tabs.get(id), options),
    remove: async id => harness.tabs.delete(id)
  },
  storage: {session: {
    set: async data => Object.assign(harness.records, data),
    get: async key => ({[key]:harness.records[key]}),
    remove: async key => { delete harness.records[key]; }
  }},
  scripting: {executeScript: async ({target, func, files}) => {
    const tab = harness.tabs.get(target.tabId);
    if (!tab) throw new Error('Tab closed');
    if (files) {
      const id = tab.url.split('/').pop();
      return [{result:id === harness.failId ? {error:'This article is unavailable. Select it to retry.'} : {
        title:items.find(x => x.url === tab.url)?.title || 'Fixture article', author:'Test Author',
        html:'<h2>A fixture article</h2><p>This synthetic text tests bulk EPUB generation without using a real account.</p><p>The final paragraph.</p>',
        images:[], language:'en'
      }}];
    }
    const result = func.name === 'scanBookmarkPage' ? {items, account:'@test_reader', ready:true, atBottom:true} :
      func.name === 'inspectArticlePage' ? {ready:true} : {done:true, length:200};
    return [{result}];
  }},
  downloads: {
    download: async options => {
      const bytes = await (await fetch(options.url)).arrayBuffer();
      harness.downloads.push({filename:options.filename, bytes:Array.from(new Uint8Array(bytes))});
      return harness.downloads.length;
    },
    search: async () => [{state:'complete'}],
    cancel: async () => {}
  }
};
