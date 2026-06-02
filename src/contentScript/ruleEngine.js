'use strict';

// Evaluate auto-grouping rules against a single article's extracted features.
// features: { stocks: string[], keywordText: string }

function matchCondition(features, cond) {
  const value = (cond.value || '').trim();
  if (!value) return false;
  if (cond.type === 'stock') {
    const v = value.toUpperCase();
    return (features.stocks || []).some(s => String(s).toUpperCase() === v);
  }
  if (cond.type === 'keyword') {
    return (features.keywordText || '').toLowerCase().includes(value.toLowerCase());
  }
  return false;
}

function matchRule(features, rule) {
  if (!rule || rule.enabled === false) return false;
  const conds = (rule.conditions || []).filter(c => (c.value || '').trim());
  if (conds.length === 0) return false;
  return rule.logic === 'all'
    ? conds.every(c => matchCondition(features, c))
    : conds.some(c => matchCondition(features, c));
}

function evaluate(features, rules) {
  const hit = new Set();
  (rules || []).forEach(rule => {
    if (matchRule(features, rule)) hit.add(rule.groupId);
  });
  return [...hit];
}

module.exports = { evaluate, matchRule, matchCondition };
