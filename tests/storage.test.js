'use strict';
const storage = require('../src/contentScript/storage');

beforeEach(() => {
  chrome.storage.local._store = {};
});

test('getGroups 初始返回空数组', async () => {
  const groups = await storage.getGroups();
  expect(groups).toEqual([]);
});

test('saveGroup 新增分组', async () => {
  await storage.saveGroup({ id: 'g1', name: 'A股', order: 0 });
  const groups = await storage.getGroups();
  expect(groups).toHaveLength(1);
  expect(groups[0].name).toBe('A股');
});

test('saveGroup 更新已有分组', async () => {
  await storage.saveGroup({ id: 'g1', name: 'A股', order: 0 });
  await storage.saveGroup({ id: 'g1', name: 'A股改名', order: 0 });
  const groups = await storage.getGroups();
  expect(groups).toHaveLength(1);
  expect(groups[0].name).toBe('A股改名');
});

test('deleteGroup 删除分组并清理 assignments', async () => {
  await storage.saveGroup({ id: 'g1', name: 'A股', order: 0 });
  await storage.addAssignments(['s1', 's2'], 'g1');
  await storage.deleteGroup('g1');
  const groups = await storage.getGroups();
  expect(groups).toHaveLength(0);
  const a = await storage.getAssignments('s1');
  expect(a).toEqual([]);
});

test('addAssignments 支持多对多', async () => {
  await storage.addAssignments(['s1'], 'g1');
  await storage.addAssignments(['s1'], 'g2');
  const a = await storage.getAssignments('s1');
  expect(a).toEqual(['g1', 'g2']);
});

test('addAssignments 不重复添加', async () => {
  await storage.addAssignments(['s1'], 'g1');
  await storage.addAssignments(['s1'], 'g1');
  const a = await storage.getAssignments('s1');
  expect(a).toHaveLength(1);
});
