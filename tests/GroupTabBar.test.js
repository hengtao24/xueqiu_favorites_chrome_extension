'use strict';
const GroupTabBar = require('../src/contentScript/components/GroupTabBar');

const groups = [
  { id: 'g1', name: 'A股', order: 0 },
  { id: 'g2', name: '美股', order: 1 },
];

beforeEach(() => {
  document.body.innerHTML = '<div id="xq-ext-tabbar"></div>';
  document.getElementById('xq-ext-tab-ctxmenu')?.remove();
});

test('渲染「全部」Tab 和自定义分组 Tab', () => {
  GroupTabBar.render(groups, 'all', jest.fn(), jest.fn(), jest.fn());
  expect(document.body.innerHTML).toContain('全部');
  expect(document.body.innerHTML).toContain('A股');
  expect(document.body.innerHTML).toContain('美股');
});

test('当前激活 Tab 有 active 类', () => {
  GroupTabBar.render(groups, 'g1', jest.fn(), jest.fn(), jest.fn());
  const active = document.querySelector('.xq-ext-tab--active');
  expect(active).not.toBeNull();
  expect(active.dataset.gid).toBe('g1');
});

test('点击 Tab 触发 onSwitch 回调', () => {
  const onSwitch = jest.fn();
  GroupTabBar.render(groups, 'all', onSwitch, jest.fn(), jest.fn());
  document.querySelector('[data-gid="g1"]').click();
  expect(onSwitch).toHaveBeenCalledWith('g1');
});

test('点击「批量管理」触发 onBulk 回调', () => {
  const onBulk = jest.fn();
  GroupTabBar.render(groups, 'all', jest.fn(), onBulk, jest.fn());
  document.getElementById('xq-ext-bulk-btn').click();
  expect(onBulk).toHaveBeenCalled();
});

test('点击「管理分组」触发 onNewGroup 回调', () => {
  const onNewGroup = jest.fn();
  GroupTabBar.render(groups, 'all', jest.fn(), jest.fn(), onNewGroup);
  document.getElementById('xq-ext-new-group-btn').click();
  expect(onNewGroup).toHaveBeenCalled();
});

test('点击「自动分组」触发 onAutoGroup 回调', () => {
  const onAutoGroup = jest.fn();
  GroupTabBar.render(groups, 'all', jest.fn(), jest.fn(), jest.fn(), jest.fn(), jest.fn(), onAutoGroup);
  document.getElementById('xq-ext-auto-btn').click();
  expect(onAutoGroup).toHaveBeenCalled();
});

function rightClick(el) {
  el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 10, clientY: 10 }));
}

test('右键自定义分组 Tab 弹出上下文菜单', () => {
  GroupTabBar.render(groups, 'all', jest.fn(), jest.fn(), jest.fn(), jest.fn(), jest.fn());
  rightClick(document.querySelector('[data-gid="g1"]'));
  expect(document.getElementById('xq-ext-tab-ctxmenu')).not.toBeNull();
});

test('右键「全部」Tab 不弹出上下文菜单', () => {
  GroupTabBar.render(groups, 'all', jest.fn(), jest.fn(), jest.fn(), jest.fn(), jest.fn());
  rightClick(document.querySelector('[data-gid="all"]'));
  expect(document.getElementById('xq-ext-tab-ctxmenu')).toBeNull();
});

test('点击「重命名」以新名称调用 onRename', () => {
  const onRename = jest.fn();
  window.prompt = jest.fn(() => '港股');
  GroupTabBar.render(groups, 'all', jest.fn(), jest.fn(), jest.fn(), onRename, jest.fn());
  rightClick(document.querySelector('[data-gid="g1"]'));
  document.querySelector('[data-ctx-action="rename"]').click();
  expect(onRename).toHaveBeenCalledWith('g1', '港股');
});

test('重命名输入未变更时不调用 onRename', () => {
  const onRename = jest.fn();
  window.prompt = jest.fn(() => 'A股');
  GroupTabBar.render(groups, 'all', jest.fn(), jest.fn(), jest.fn(), onRename, jest.fn());
  rightClick(document.querySelector('[data-gid="g1"]'));
  document.querySelector('[data-ctx-action="rename"]').click();
  expect(onRename).not.toHaveBeenCalled();
});

test('点击「删除」并确认后调用 onDelete', () => {
  const onDelete = jest.fn();
  window.confirm = jest.fn(() => true);
  GroupTabBar.render(groups, 'all', jest.fn(), jest.fn(), jest.fn(), jest.fn(), onDelete);
  rightClick(document.querySelector('[data-gid="g1"]'));
  document.querySelector('[data-ctx-action="delete"]').click();
  expect(onDelete).toHaveBeenCalledWith('g1');
});

test('删除取消时不调用 onDelete', () => {
  const onDelete = jest.fn();
  window.confirm = jest.fn(() => false);
  GroupTabBar.render(groups, 'all', jest.fn(), jest.fn(), jest.fn(), jest.fn(), onDelete);
  rightClick(document.querySelector('[data-gid="g1"]'));
  document.querySelector('[data-ctx-action="delete"]').click();
  expect(onDelete).not.toHaveBeenCalled();
});

test('多次右键仍可重复弹出菜单（回归：只能弹一次的 bug）', () => {
  jest.useFakeTimers();
  GroupTabBar.render(groups, 'all', jest.fn(), jest.fn(), jest.fn(), jest.fn(), jest.fn());
  const tab = document.querySelector('[data-gid="g1"]');

  rightClick(tab);
  jest.runAllTimers(); // 让延迟注册的关闭监听器生效
  expect(document.getElementById('xq-ext-tab-ctxmenu')).not.toBeNull();

  rightClick(tab);
  jest.runAllTimers();
  expect(document.getElementById('xq-ext-tab-ctxmenu')).not.toBeNull();

  jest.useRealTimers();
});

test('右键空白处关闭已打开的菜单', () => {
  jest.useFakeTimers();
  GroupTabBar.render(groups, 'all', jest.fn(), jest.fn(), jest.fn(), jest.fn(), jest.fn());
  rightClick(document.querySelector('[data-gid="g1"]'));
  jest.runAllTimers();
  expect(document.getElementById('xq-ext-tab-ctxmenu')).not.toBeNull();

  document.body.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }));
  expect(document.getElementById('xq-ext-tab-ctxmenu')).toBeNull();
  jest.useRealTimers();
});
