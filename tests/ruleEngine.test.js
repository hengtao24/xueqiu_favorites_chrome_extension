'use strict';
const { evaluate, matchRule } = require('../src/contentScript/ruleEngine');

const features = { stocks: ['SH600519'], keywordText: '贵州茅台 白酒 #白酒板块#' };

test('stock eq 命中', () => {
  const rule = { id: 'r1', groupId: 'g1', enabled: true, logic: 'any',
    conditions: [{ type: 'stock', op: 'eq', value: 'SH600519' }] };
  expect(matchRule(features, rule)).toBe(true);
});

test('stock 代码大小写不敏感命中', () => {
  const rule = { id: 'r1', groupId: 'g1', enabled: true, logic: 'any',
    conditions: [{ type: 'stock', op: 'eq', value: 'sh600519' }] };
  expect(matchRule(features, rule)).toBe(true);
});

test('keyword contains 命中（大小写不敏感）', () => {
  const rule = { id: 'r1', groupId: 'g1', enabled: true, logic: 'any',
    conditions: [{ type: 'keyword', op: 'contains', value: '茅台' }] };
  expect(matchRule(features, rule)).toBe(true);
});

test('logic=all 需全部条件满足', () => {
  const rule = { id: 'r1', groupId: 'g1', enabled: true, logic: 'all',
    conditions: [
      { type: 'stock', op: 'eq', value: 'SH600519' },
      { type: 'keyword', op: 'contains', value: '不存在词' },
    ] };
  expect(matchRule(features, rule)).toBe(false);
});

test('logic=any 任一满足即可', () => {
  const rule = { id: 'r1', groupId: 'g1', enabled: true, logic: 'any',
    conditions: [
      { type: 'stock', op: 'eq', value: 'SZ000001' },
      { type: 'keyword', op: 'contains', value: '白酒' },
    ] };
  expect(matchRule(features, rule)).toBe(true);
});

test('enabled=false 的规则不参与', () => {
  const rules = [{ id: 'r1', groupId: 'g1', enabled: false, logic: 'any',
    conditions: [{ type: 'stock', op: 'eq', value: 'SH600519' }] }];
  expect(evaluate(features, rules)).toEqual([]);
});

test('空条件 / 空值被忽略，不误命中', () => {
  const rules = [{ id: 'r1', groupId: 'g1', enabled: true, logic: 'any',
    conditions: [{ type: 'keyword', op: 'contains', value: '  ' }] }];
  expect(evaluate(features, rules)).toEqual([]);
});

test('evaluate 返回去重后的命中 groupId 列表', () => {
  const rules = [
    { id: 'r1', groupId: 'g1', enabled: true, logic: 'any',
      conditions: [{ type: 'stock', op: 'eq', value: 'SH600519' }] },
    { id: 'r2', groupId: 'g1', enabled: true, logic: 'any',
      conditions: [{ type: 'keyword', op: 'contains', value: '白酒' }] },
    { id: 'r3', groupId: 'g2', enabled: true, logic: 'any',
      conditions: [{ type: 'keyword', op: 'contains', value: '茅台' }] },
  ];
  expect(evaluate(features, rules).sort()).toEqual(['g1', 'g2']);
});
