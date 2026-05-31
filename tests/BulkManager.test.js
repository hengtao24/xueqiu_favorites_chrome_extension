'use strict';
const BulkManager = require('../src/contentScript/components/BulkManager');

const groups = [
  { id: 'g1', name: 'A股', order: 0 },
  { id: 'g2', name: '美股', order: 1 },
];

beforeEach(() => {
  document.body.innerHTML = `
    <div id="xq-ext-bulk-bar"></div>
    <div id="xq-ext-list">
      <div class="xq-ext-card" data-id="s1"></div>
      <div class="xq-ext-card" data-id="s2"></div>
    </div>`;
});

test('activate 显示操作栏并在卡片上注入复选框', () => {
  BulkManager.activate(groups, jest.fn(), jest.fn());
  expect(document.getElementById('xq-ext-bulk-bar').innerHTML).toContain('批量管理模式');
  expect(document.querySelectorAll('.xq-ext-checkbox')).toHaveLength(2);
});

test('点击卡片复选框更新已选计数', () => {
  BulkManager.activate(groups, jest.fn(), jest.fn());
  document.querySelector('.xq-ext-checkbox').click();
  expect(document.getElementById('xq-ext-selected-count').textContent).toBe('已选 1 条');
});

test('点击确定时以选中 id 和分组 id 调用 onConfirm', () => {
  const onConfirm = jest.fn();
  BulkManager.activate(groups, onConfirm, jest.fn());
  document.querySelector('.xq-ext-checkbox').click();
  document.getElementById('xq-ext-bulk-group-select').value = 'g1';
  document.getElementById('xq-ext-bulk-confirm').click();
  expect(onConfirm).toHaveBeenCalledWith(['s1'], 'g1');
});

test('点击退出时调用 onExit', () => {
  const onExit = jest.fn();
  BulkManager.activate(groups, jest.fn(), onExit);
  document.getElementById('xq-ext-bulk-exit').click();
  expect(onExit).toHaveBeenCalled();
});

test('deactivate 移除操作栏和复选框', () => {
  BulkManager.activate(groups, jest.fn(), jest.fn());
  BulkManager.deactivate();
  expect(document.getElementById('xq-ext-bulk-bar').innerHTML).toBe('');
  expect(document.querySelectorAll('.xq-ext-checkbox')).toHaveLength(0);
});
