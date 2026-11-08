window.TVBROWSER_CONFIG = {
  token: 'tvb-7f3c9a1d5e8b2c4f6a0d9e3b7c1f5a8d',
  serviceId: 'com.personal.tvwebbrowser.service',
  port: 7792,
  homeUrl: 'http://127.0.0.1:7792/home',
  fileHomeUrl: 'file:///media/developer/apps/usr/palm/applications/com.personal.tvwebbrowser/index.html',
  appPathPrefix: '/com.personal.tvwebbrowser/',
  brand: 'ASTRA',
  /* Reachable-first defaults: the target list probes each entry at runtime and
     dims anything this TV cannot reach. Google / Wikipedia / YouTube are kept
     available as engines, not as start-page targets. */
  searchEngines: {
    baidu: { name: 'Baidu', url: 'https://www.baidu.com/s?wd=' },
    bing: { name: 'Bing', url: 'https://www.bing.com/search?q=' },
    duckduckgo: { name: 'DuckDuckGo', url: 'https://duckduckgo.com/?q=' },
    google: { name: 'Google', url: 'https://www.google.com/search?q=' }
  },
  quickLinks: [
    { name: 'Baidu', url: 'https://www.baidu.com/', letter: 'B', host: 'baidu.com' },
    { name: 'Bing', url: 'https://www.bing.com/', letter: 'B', host: 'bing.com' },
    { name: 'Bilibili', url: 'https://www.bilibili.com/', letter: 'B', host: 'bilibili.com' },
    { name: 'Zhihu', url: 'https://www.zhihu.com/', letter: 'Z', host: 'zhihu.com' },
    { name: 'Douban', url: 'https://www.douban.com/', letter: 'D', host: 'douban.com' },
    { name: 'Weibo', url: 'https://weibo.com/', letter: 'W', host: 'weibo.com' }
  ]
};
