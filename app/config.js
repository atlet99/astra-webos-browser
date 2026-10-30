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
    baidu: { name: '百度', url: 'https://www.baidu.com/s?wd=' },
    bing: { name: 'Bing', url: 'https://www.bing.com/search?q=' },
    duckduckgo: { name: 'DuckDuckGo', url: 'https://duckduckgo.com/?q=' },
    google: { name: 'Google', url: 'https://www.google.com/search?q=' }
  },
  quickLinks: [
    { name: '百度', url: 'https://www.baidu.com/', letter: '百', host: 'baidu.com' },
    { name: 'Bing', url: 'https://www.bing.com/', letter: 'B', host: 'bing.com' },
    { name: '哔哩哔哩', url: 'https://www.bilibili.com/', letter: 'B', host: 'bilibili.com' },
    { name: '知乎', url: 'https://www.zhihu.com/', letter: '知', host: 'zhihu.com' },
    { name: '豆瓣', url: 'https://www.douban.com/', letter: '豆', host: 'douban.com' },
    { name: '微博', url: 'https://weibo.com/', letter: '微', host: 'weibo.com' }
  ]
};
