'use strict';
const storage = require('../src/contentScript/storage');

beforeEach(() => {
  chrome.storage.local._store = {};
  chrome.storage.sync._store = {};
  chrome.runtime.lastError = null;
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

test('getUsage 返回字节数、配额与占比（本地区域）', async () => {
  await storage.saveGroup({ id: 'g1', name: 'A股', order: 0 });
  const usage = await storage.getUsage();
  expect(usage.bytes).toBeGreaterThan(0);
  expect(usage.quota).toBe(5 * 1024 * 1024);
  expect(usage.ratio).toBeGreaterThan(0);
  expect(usage.ratio).toBeLessThan(1);
});

test('_save 在配额超限时 reject', async () => {
  const origSet = chrome.storage.local.set;
  chrome.storage.local.set = (obj, cb) => {
    chrome.runtime.lastError = { message: 'QUOTA_BYTES quota exceeded' };
    cb();
    chrome.runtime.lastError = null;
  };
  await expect(storage.saveGroup({ id: 'g1', name: 'x', order: 0 })).rejects.toThrow();
  chrome.storage.local.set = origSet;
});

test('isSyncEnabled 默认 false', async () => {
  expect(await storage.isSyncEnabled()).toBe(false);
});

test('setSyncEnabled(true) 切换到 sync 并迁移数据', async () => {
  await storage.saveGroup({ id: 'g1', name: 'A股', order: 0 });
  await storage.setSyncEnabled(true);
  expect(await storage.isSyncEnabled()).toBe(true);
  const groups = await storage.getGroups();
  expect(groups).toHaveLength(1);
  expect(chrome.storage.sync._store['xq_groups_data'].groups).toHaveLength(1);
});

test('启用 sync 后 getUsage 使用 sync 配额', async () => {
  await storage.setSyncEnabled(true);
  await storage.saveGroup({ id: 'g1', name: 'A股', order: 0 });
  const usage = await storage.getUsage();
  expect(usage.quota).toBe(102400);
});

test('setSyncEnabled(false) 切回 local 并迁移数据', async () => {
  await storage.saveGroup({ id: 'g1', name: 'A股', order: 0 });
  await storage.setSyncEnabled(true);
  await storage.setSyncEnabled(false);
  expect(await storage.isSyncEnabled()).toBe(false);
  const groups = await storage.getGroups();
  expect(groups).toHaveLength(1);
  expect(chrome.storage.local._store['xq_groups_data'].groups).toHaveLength(1);
});
