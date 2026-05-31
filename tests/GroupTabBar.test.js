'use strict';
const GroupTabBar = require('../src/contentScript/components/GroupTabBar');

const groups = [
  { id: 'g1', name: 'A股', order: 0 },
  { id: 'g2', name: '美股', order: 1 },
];

beforeEach(() => {
  document.body.innerHTML = '<div id="xq-ext-tabbar"></div>';
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

test('点击「+新建分组」触发 onNewGroup 回调', () => {
  const onNewGroup = jest.fn();
  GroupTabBar.render(groups, 'all', jest.fn(), jest.fn(), onNewGroup);
  document.getElementById('xq-ext-new-group-btn').click();
  expect(onNewGroup).toHaveBeenCalled();
});
