'use strict';
const GroupEditor = require('../src/contentScript/components/GroupEditor');

const groups = [
  { id: 'g1', name: 'A股', order: 0 },
  { id: 'g2', name: '美股', order: 1 },
];
const noop = jest.fn();

beforeEach(() => {
  document.body.innerHTML = '';
});

test('open 渲染弹窗并显示现有分组', () => {
  GroupEditor.open(groups, noop, noop, noop, noop, noop);
  expect(document.querySelector('.xq-ext-editor-overlay')).not.toBeNull();
  expect(document.body.innerHTML).toContain('A股');
  expect(document.body.innerHTML).toContain('美股');
});

test('输入名称后点击「添加」触发 onAdd', () => {
  const onAdd = jest.fn();
  GroupEditor.open(groups, onAdd, noop, noop, noop, noop);
  document.getElementById('xq-ext-new-group-input').value = '港股';
  document.getElementById('xq-ext-add-group-btn').click();
  expect(onAdd).toHaveBeenCalledWith('港股');
});

test('输入为空时不触发 onAdd', () => {
  const onAdd = jest.fn();
  GroupEditor.open(groups, onAdd, noop, noop, noop, noop);
  document.getElementById('xq-ext-new-group-input').value = '  ';
  document.getElementById('xq-ext-add-group-btn').click();
  expect(onAdd).not.toHaveBeenCalled();
});

test('重复名称时不触发 onAdd 并显示错误', () => {
  const onAdd = jest.fn();
  GroupEditor.open(groups, onAdd, noop, noop, noop, noop);
  document.getElementById('xq-ext-new-group-input').value = 'A股';
  document.getElementById('xq-ext-add-group-btn').click();
  expect(onAdd).not.toHaveBeenCalled();
  expect(document.getElementById('xq-ext-editor-error').textContent).toContain('A股');
});

test('点击删除触发 onDelete', () => {
  const onDelete = jest.fn();
  GroupEditor.open(groups, noop, onDelete, noop, noop, noop);
  document.querySelector('[data-delete-gid="g1"]').click();
  expect(onDelete).toHaveBeenCalledWith('g1');
});

test('点击重命名按钮显示输入框', () => {
  GroupEditor.open(groups, noop, noop, noop, noop, noop);
  document.querySelector('[data-rename-gid="g1"]').click();
  const input = document.querySelector('.xq-ext-rename-input');
  expect(input).not.toBeNull();
  expect(input.value).toBe('A股');
});

test('重命名 Enter 触发 onRename', () => {
  const onRename = jest.fn();
  GroupEditor.open(groups, noop, noop, onRename, noop, noop);
  document.querySelector('[data-rename-gid="g1"]').click();
  const input = document.querySelector('.xq-ext-rename-input');
  input.value = 'A股改名';
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  expect(onRename).toHaveBeenCalledWith('g1', 'A股改名');
});

test('重命名为重复名称时不触发 onRename 并显示错误', () => {
  const onRename = jest.fn();
  GroupEditor.open(groups, noop, noop, onRename, noop, noop);
  document.querySelector('[data-rename-gid="g1"]').click();
  const input = document.querySelector('.xq-ext-rename-input');
  input.value = '美股';
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  expect(onRename).not.toHaveBeenCalled();
  expect(document.getElementById('xq-ext-editor-error').textContent).toContain('美股');
});

test('点击遮罩层关闭弹窗', () => {
  const onClose = jest.fn();
  GroupEditor.open(groups, noop, noop, noop, noop, onClose);
  document.querySelector('.xq-ext-editor-overlay').click();
  expect(onClose).toHaveBeenCalled();
});

test('close 移除弹窗 DOM', () => {
  GroupEditor.open(groups, noop, noop, noop, noop, noop);
  GroupEditor.close();
  expect(document.querySelector('.xq-ext-editor-overlay')).toBeNull();
});
