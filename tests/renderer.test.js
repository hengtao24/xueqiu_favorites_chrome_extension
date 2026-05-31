'use strict';
const renderer = require('../src/contentScript/renderer');

const groups = [
  { id: 'g1', name: 'A股', order: 0 },
  { id: 'g2', name: '美股', order: 1 },
];

function makeStatus(id, title) {
  return { id, title, description: 'desc', user: { screen_name: 'user1' }, created_at: 1700000000000 };
}

beforeEach(() => {
  document.body.innerHTML = '<div id="xq-ext-list"></div>';
});

test('render 渲染收藏卡片', () => {
  renderer.render([makeStatus(1, '苹果财报')], [], 'all', groups, jest.fn());
  expect(document.querySelector('.xq-ext-card')).not.toBeNull();
  expect(document.body.innerHTML).toContain('苹果财报');
});

test('render 按分组筛选', () => {
  const statuses = [makeStatus(1, '文章A'), makeStatus(2, '文章B')];
  const assignments = { 1: ['g1'], 2: ['g2'] };
  renderer.render(statuses, assignments, 'g1', groups, jest.fn());
  const cards = document.querySelectorAll('.xq-ext-card');
  expect(cards).toHaveLength(1);
  expect(document.body.innerHTML).toContain('文章A');
});

test('render all 显示全部', () => {
  const statuses = [makeStatus(1, '文章A'), makeStatus(2, '文章B')];
  renderer.render(statuses, {}, 'all', groups, jest.fn());
  expect(document.querySelectorAll('.xq-ext-card')).toHaveLength(2);
});

test('render 无结果时显示提示文字', () => {
  renderer.render([makeStatus(1, '文章A')], { 1: ['g2'] }, 'g1', groups, jest.fn());
  expect(document.body.innerHTML).toContain('该分组暂无收藏');
});

test('render 显示分组标签', () => {
  renderer.render([makeStatus(1, '文章A')], { 1: ['g1'] }, 'all', groups, jest.fn());
  expect(document.body.innerHTML).toContain('A股');
});

test('render 下拉选择框触发 onAssign 回调', () => {
  const onAssign = jest.fn();
  renderer.render([makeStatus(1, '文章A')], {}, 'all', groups, onAssign);
  const sel = document.querySelector('.xq-ext-assign-select');
  expect(sel).not.toBeNull();
  sel.value = 'g1';
  sel.dispatchEvent(new Event('change'));
  expect(onAssign).toHaveBeenCalledWith('1', 'g1');
});
