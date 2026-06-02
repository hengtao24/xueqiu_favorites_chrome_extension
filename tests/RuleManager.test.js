'use strict';
const RuleManager = require('../src/contentScript/components/RuleManager');

const groups = [
  { id: 'g1', name: '白酒', order: 0 },
  { id: 'g2', name: '有色', order: 1 },
];

const rules = [
  { id: 'r1', groupId: 'g1', enabled: true, logic: 'any',
    conditions: [{ type: 'keyword', op: 'contains', value: '茅台' }] },
];

const noop = jest.fn();

beforeEach(() => {
  document.body.innerHTML = '';
});

function open(over = {}) {
  RuleManager.open(groups, over.rules || rules, {
    onSave: over.onSave || noop,
    onDelete: over.onDelete || noop,
    onClose: over.onClose || noop,
  });
}

test('open 渲染遮罩与现有规则（含分组名与条件值）', () => {
  open();
  expect(document.querySelector('.xq-ext-rule-overlay')).not.toBeNull();
  const list = document.getElementById('xq-ext-rule-list');
  expect(list.textContent).toContain('白酒');
  expect(list.textContent).toContain('茅台');
});

test('无规则时显示空态', () => {
  open({ rules: [] });
  expect(document.getElementById('xq-ext-rule-list').textContent).toContain('暂无规则');
});

test('点「新建规则」出现编辑区，分组下拉含全部分组', () => {
  open({ rules: [] });
  document.getElementById('xq-ext-rule-new-btn').click();
  const sel = document.getElementById('xq-ext-rule-group-select');
  expect(sel).not.toBeNull();
  expect(sel.querySelectorAll('option')).toHaveLength(2);
});

test('「添加条件」可新增条件行，类型下拉含股票/关键词', () => {
  open({ rules: [] });
  document.getElementById('xq-ext-rule-new-btn').click();
  const before = document.querySelectorAll('.xq-ext-rule-cond').length;
  document.getElementById('xq-ext-rule-add-cond').click();
  const after = document.querySelectorAll('.xq-ext-rule-cond').length;
  expect(after).toBe(before + 1);
  const type = document.querySelector('.xq-ext-rule-cond-type');
  const values = [...type.querySelectorAll('option')].map(o => o.value);
  expect(values).toEqual(expect.arrayContaining(['stock', 'keyword']));
});

test('填写条件后保存以规范规则对象调用 onSave', () => {
  const onSave = jest.fn();
  open({ rules: [], onSave });
  document.getElementById('xq-ext-rule-new-btn').click();
  document.getElementById('xq-ext-rule-group-select').value = 'g2';
  document.querySelector('.xq-ext-rule-cond-type').value = 'keyword';
  document.querySelector('.xq-ext-rule-cond-value').value = '电解铝';
  document.getElementById('xq-ext-rule-logic').value = 'all';
  document.getElementById('xq-ext-rule-save').click();
  expect(onSave).toHaveBeenCalledTimes(1);
  const arg = onSave.mock.calls[0][0];
  expect(arg.groupId).toBe('g2');
  expect(arg.logic).toBe('all');
  expect(arg.enabled).toBe(true);
  expect(arg.conditions).toEqual([{ type: 'keyword', op: 'contains', value: '电解铝' }]);
  expect(typeof arg.id).toBe('string');
});

test('条件全空时保存不触发 onSave 并提示', () => {
  const onSave = jest.fn();
  open({ rules: [], onSave });
  document.getElementById('xq-ext-rule-new-btn').click();
  document.getElementById('xq-ext-rule-save').click();
  expect(onSave).not.toHaveBeenCalled();
  expect(document.getElementById('xq-ext-rule-error').textContent.length).toBeGreaterThan(0);
});

test('点规则删除触发 onDelete(ruleId)', () => {
  const onDelete = jest.fn();
  open({ onDelete });
  document.querySelector('[data-rule-del="r1"]').click();
  expect(onDelete).toHaveBeenCalledWith('r1');
});

test('切换启用开关以更新后的规则调用 onSave', () => {
  const onSave = jest.fn();
  open({ onSave });
  const toggle = document.querySelector('[data-rule-enable="r1"]');
  toggle.checked = false;
  toggle.dispatchEvent(new Event('change'));
  expect(onSave).toHaveBeenCalledTimes(1);
  expect(onSave.mock.calls[0][0].enabled).toBe(false);
});

test('点遮罩触发 onClose；close 移除 DOM', () => {
  const onClose = jest.fn();
  open({ onClose });
  document.querySelector('.xq-ext-rule-overlay').click();
  expect(onClose).toHaveBeenCalled();
  RuleManager.close();
  expect(document.querySelector('.xq-ext-rule-overlay')).toBeNull();
});
