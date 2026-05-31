'use strict';
const GroupEditor = require('../src/contentScript/components/GroupEditor');

const groups = [
  { id: 'g1', name: 'A股', order: 0 },
  { id: 'g2', name: '美股', order: 1 },
];

beforeEach(() => {
  document.body.innerHTML = '';
});

test('open 渲染弹窗并显示现有分组', () => {
  GroupEditor.open(groups, jest.fn(), jest.fn(), jest.fn());
  expect(document.querySelector('.xq-ext-editor-overlay')).not.toBeNull();
  expect(document.body.innerHTML).toContain('A股');
  expect(document.body.innerHTML).toContain('美股');
});

test('输入名称后点击「添加」触发 onAdd 回调', () => {
  const onAdd = jest.fn();
  GroupEditor.open(groups, onAdd, jest.fn(), jest.fn());
  document.getElementById('xq-ext-new-group-input').value = '港股';
  document.getElementById('xq-ext-add-group-btn').click();
  expect(onAdd).toHaveBeenCalledWith('港股');
});

test('输入为空时点击「添加」不触发回调', () => {
  const onAdd = jest.fn();
  GroupEditor.open(groups, onAdd, jest.fn(), jest.fn());
  document.getElementById('xq-ext-new-group-input').value = '  ';
  document.getElementById('xq-ext-add-group-btn').click();
  expect(onAdd).not.toHaveBeenCalled();
});

test('点击删除触发 onDelete 并传入 groupId', () => {
  const onDelete = jest.fn();
  GroupEditor.open(groups, jest.fn(), onDelete, jest.fn());
  document.querySelector('[data-delete-gid="g1"]').click();
  expect(onDelete).toHaveBeenCalledWith('g1');
});

test('点击遮罩层关闭弹窗', () => {
  const onClose = jest.fn();
  GroupEditor.open(groups, jest.fn(), jest.fn(), onClose);
  document.querySelector('.xq-ext-editor-overlay').click();
  expect(onClose).toHaveBeenCalled();
});

test('close 移除弹窗 DOM', () => {
  GroupEditor.open(groups, jest.fn(), jest.fn(), jest.fn());
  GroupEditor.close();
  expect(document.querySelector('.xq-ext-editor-overlay')).toBeNull();
});
