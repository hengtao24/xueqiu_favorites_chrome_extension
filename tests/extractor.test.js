'use strict';
const { extract } = require('../src/contentScript/extractor');

function makeArticle(html) {
  const wrap = document.createElement('article');
  wrap.className = 'timeline__item';
  wrap.innerHTML = html;
  return wrap;
}

test('提取 statusId、股票代码与名称、正文、话题标签', () => {
  const article = makeArticle(`
    <a data-id="383358736" href="#"></a>
    <div class="timeline__item__bd">
      看好 <a href="/S/SH600519">$贵州茅台(SH600519)$</a>
      和 <a href="/S/SZ000858">$五粮液(SZ000858)$</a>
      <a href="/k?q=白酒">#白酒板块#</a>
      长期持有
    </div>`);
  const f = extract(article);
  expect(f.statusId).toBe('383358736');
  expect(f.stocks).toEqual(expect.arrayContaining(['SH600519', 'SZ000858']));
  expect(f.keywordText).toContain('贵州茅台');
  expect(f.keywordText).toContain('白酒');
  expect(f.keywordText).toContain('长期持有');
});

test('无股票/话题时返回空 stocks，仍含正文', () => {
  const article = makeArticle(`
    <a data-id="1" href="#"></a>
    <div class="timeline__item__bd">普通收藏内容</div>`);
  const f = extract(article);
  expect(f.stocks).toEqual([]);
  expect(f.keywordText).toContain('普通收藏内容');
});

test('无 data-id 时 statusId 为 undefined，不抛错', () => {
  const article = makeArticle('<div class="timeline__item__bd">x</div>');
  expect(() => extract(article)).not.toThrow();
  expect(extract(article).statusId).toBeUndefined();
});

test('股票代码去重', () => {
  const article = makeArticle(`
    <a data-id="2" href="#"></a>
    <div class="timeline__item__bd">
      <a href="/S/SH600519">$贵州茅台(SH600519)$</a>
      <a href="/S/SH600519">茅台</a>
    </div>`);
  expect(extract(article).stocks).toEqual(['SH600519']);
});
