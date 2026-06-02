'use strict';

// Extract matchable features from a single xueqiu article element.
// Returns { statusId, stocks: string[], keywordText: string }.
// Selectors are best-effort; on any miss the article still yields whatever
// could be read, and the caller falls back to manual assignments only.
//
// NOTE: stock/topic selectors are assumptions about xueqiu's DOM and must be
// confirmed against the live favorites page.
function extract(article) {
  const statusId = article.querySelector('a[data-id]')?.dataset?.id;

  const stocks = [];
  const names = [];
  article.querySelectorAll('a[href*="/S/"]').forEach(a => {
    const m = (a.getAttribute('href') || '').match(/\/S\/([A-Za-z0-9]+)/);
    if (m) stocks.push(m[1].toUpperCase());
    // cashtag text like "$贵州茅台(SH600519)$" -> capture the name before "("
    const nameMatch = (a.textContent || '').match(/\$(.+?)\(/);
    if (nameMatch) names.push(nameMatch[1].trim());
  });

  const topics = [];
  article.querySelectorAll('a[href*="/k?q="]').forEach(a => {
    const t = (a.textContent || '').trim();
    if (t) topics.push(t);
  });

  const bodyEl = article.querySelector('.timeline__item__bd');
  const bodyText = (bodyEl && (bodyEl.innerText || bodyEl.textContent)) || article.textContent || '';

  const keywordText = [bodyText, ...names, ...topics]
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();

  return { statusId, stocks: [...new Set(stocks)], keywordText };
}

module.exports = { extract };
