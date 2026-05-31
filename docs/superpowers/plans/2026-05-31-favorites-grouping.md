# 雪球收藏分组功能 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在雪球收藏页注入自定义分组 UI，支持顶部 Tab 切换、批量管理分配、分组 CRUD。

**Architecture:** Content script 拦截 `statuses/favorites.json` XHR 响应获取原始数据，扩展自行渲染收藏列表和分组 UI，分组配置存储于 `chrome.storage.local`。

**Tech Stack:** Vanilla JS, Webpack 5, Jest + jsdom, Chrome Extension MV3

---

### Task 1: 项目配置

**Files:**
- Modify: `package.json` — 添加 Jest 依赖和配置
- Create: `tests/setup.js` — Chrome API mock
- Modify: `config/webpack.config.js` — 更新 contentScript 入口
- Modify: `public/manifest.json` — 限制匹配域名，添加 CSS

- [ ] **1.1 安装 Jest**
```bash
cd xueqiu-extension
npm install --save-dev jest jest-environment-jsdom
```

- [ ] **1.2 配置 Jest（`package.json`）**
在 `package.json` 中添加：
```json
"scripts": {
  "test": "jest"
},
"jest": {
  "testEnvironment": "jsdom",
  "setupFiles": ["./tests/setup.js"]
}
```

- [ ] **1.3 创建 Chrome API mock（`tests/setup.js`）**
```js
global.chrome = {
  storage: {
    local: {
      _store: {},
      get(key, cb) {
        cb({ [key]: this._store[key] });
      },
      set(obj, cb) {
        Object.assign(this._store, obj);
        cb && cb();
      },
    },
  },
};
```

- [ ] **1.4 更新 webpack 入口（`config/webpack.config.js`）**
```js
entry: {
  popup: PATHS.src + '/popup.js',
  contentScript: PATHS.src + '/contentScript/index.js',
  background: PATHS.src + '/background.js',
},
```

- [ ] **1.5 更新 manifest（`public/manifest.json`）**
```json
"content_scripts": [
  {
    "matches": ["https://xueqiu.com/*"],
    "run_at": "document_idle",
    "js": ["contentScript.js"],
    "css": ["contentScript.css"]
  }
]
```

- [ ] **1.6 验证 Jest 可运行**
```bash
npm test -- --passWithNoTests
```
预期：`No tests found, exiting with code 0`

- [ ] **1.7 Commit**
```bash
git add package.json tests/setup.js config/webpack.config.js public/manifest.json
git commit -m "chore: setup jest and update content script entry"
```

---

### Task 2: Storage 层（`storage.js`）

**Files:**
- Create: `src/contentScript/storage.js`
- Create: `tests/storage.test.js`

- [ ] **2.1 创建测试文件**

```js
// tests/storage.test.js
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
```

- [ ] **2.2 运行测试，确认全部失败**
```bash
npm test -- tests/storage.test.js
```
预期：`Cannot find module '../src/contentScript/storage'`

- [ ] **2.3 实现 `src/contentScript/storage.js`**

```js
'use strict';

const KEY = 'xq_groups_data';

async function _load() {
  return new Promise(resolve => {
    chrome.storage.local.get(KEY, result => {
      resolve(result[KEY] || { groups: [], assignments: {} });
    });
  });
}

async function _save(data) {
  return new Promise(resolve => {
    chrome.storage.local.set({ [KEY]: data }, resolve);
  });
}

async function getGroups() {
  return (await _load()).groups;
}

async function saveGroup(group) {
  const data = await _load();
  const idx = data.groups.findIndex(g => g.id === group.id);
  if (idx >= 0) data.groups[idx] = group;
  else data.groups.push(group);
  await _save(data);
}

async function deleteGroup(groupId) {
  const data = await _load();
  data.groups = data.groups.filter(g => g.id !== groupId);
  for (const sid of Object.keys(data.assignments)) {
    data.assignments[sid] = data.assignments[sid].filter(id => id !== groupId);
    if (data.assignments[sid].length === 0) delete data.assignments[sid];
  }
  await _save(data);
}

async function getAssignments(statusId) {
  return (await _load()).assignments[statusId] || [];
}

async function addAssignments(statusIds, groupId) {
  const data = await _load();
  for (const sid of statusIds) {
    if (!data.assignments[sid]) data.assignments[sid] = [];
    if (!data.assignments[sid].includes(groupId)) data.assignments[sid].push(groupId);
  }
  await _save(data);
}

async function removeAssignment(statusId, groupId) {
  const data = await _load();
  if (data.assignments[statusId]) {
    data.assignments[statusId] = data.assignments[statusId].filter(id => id !== groupId);
  }
  await _save(data);
}

module.exports = { getGroups, saveGroup, deleteGroup, getAssignments, addAssignments, removeAssignment, getData: _load };
```

- [ ] **2.4 运行测试，确认全部通过**
```bash
npm test -- tests/storage.test.js
```
预期：`6 passed`

- [ ] **2.5 Commit**
```bash
git add src/contentScript/storage.js tests/storage.test.js
git commit -m "feat: add storage layer for groups and assignments"
```

---

### Task 3: XHR 拦截器（`interceptor.js`）

**Files:**
- Create: `src/contentScript/interceptor.js`
- Create: `tests/interceptor.test.js`

- [ ] **3.1 创建测试文件**

```js
// tests/interceptor.test.js
'use strict';
const interceptor = require('../src/contentScript/interceptor');

class MockXHR {
  constructor() { this._listeners = {}; }
  open(method, url) { this._url = url; }
  send() {
    if (this._url.includes('statuses/favorites.json')) {
      setTimeout(() => this._listeners['load']?.(), 0);
    }
  }
  addEventListener(event, fn) { this._listeners[event] = fn; }
  get responseText() {
    return JSON.stringify({ statuses: [{ id: 1, title: 'Test' }] });
  }
}

beforeEach(() => {
  interceptor.clearCache();
  global.XMLHttpRequest = MockXHR;
  interceptor.install();
});

test('拦截 favorites.json 并填充缓存', done => {
  interceptor.onData(items => {
    expect(items).toHaveLength(1);
    expect(items[0].id).toBe(1);
    done();
  });
  const xhr = new XMLHttpRequest();
  xhr.open('GET', '/statuses/favorites.json');
  xhr.send();
});

test('分页合并时去重', done => {
  let callCount = 0;
  interceptor.onData(items => {
    callCount++;
    if (callCount === 2) {
      expect(items).toHaveLength(1);
      done();
    }
  });
  const xhr1 = new XMLHttpRequest();
  xhr1.open('GET', '/statuses/favorites.json');
  xhr1.send();
  setTimeout(() => {
    const xhr2 = new XMLHttpRequest();
    xhr2.open('GET', '/statuses/favorites.json');
    xhr2.send();
  }, 10);
});

test('非 favorites URL 不触发缓存', done => {
  let called = false;
  interceptor.onData(() => { called = true; });
  const xhr = new XMLHttpRequest();
  xhr.open('GET', '/other/api.json');
  xhr.send();
  setTimeout(() => {
    expect(called).toBe(false);
    done();
  }, 20);
});
```

- [ ] **3.2 运行测试，确认失败**
```bash
npm test -- tests/interceptor.test.js
```
预期：`Cannot find module '../src/contentScript/interceptor'`

- [ ] **3.3 实现 `src/contentScript/interceptor.js`**

```js
'use strict';

let _cache = [];
let _listeners = [];

function install() {
  const _open = XMLHttpRequest.prototype.open;
  const _send = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function(method, url) {
    this._xqUrl = url;
    return _open.apply(this, arguments);
  };

  XMLHttpRequest.prototype.send = function() {
    if (this._xqUrl && this._xqUrl.includes('statuses/favorites.json')) {
      this.addEventListener('load', () => {
        try {
          const data = JSON.parse(this.responseText);
          if (Array.isArray(data.statuses)) {
            const existingIds = new Set(_cache.map(s => s.id));
            const fresh = data.statuses.filter(s => !existingIds.has(s.id));
            _cache = [..._cache, ...fresh];
            _listeners.forEach(fn => fn([..._cache]));
          }
        } catch (_) {}
      });
    }
    return _send.apply(this, arguments);
  };
}

function onData(fn) { _listeners.push(fn); }
function getCache() { return [..._cache]; }
function clearCache() { _cache = []; _listeners = []; }

module.exports = { install, onData, getCache, clearCache };
```

- [ ] **3.4 运行测试，确认通过**
```bash
npm test -- tests/interceptor.test.js
```
预期：`3 passed`

- [ ] **3.5 Commit**
```bash
git add src/contentScript/interceptor.js tests/interceptor.test.js
git commit -m "feat: add XHR interceptor for favorites API"
```

---

### Task 4: 渲染器（`renderer.js`）

**Files:**
- Create: `src/contentScript/renderer.js`
- Create: `tests/renderer.test.js`

- [ ] **4.1 创建测试文件**

```js
// tests/renderer.test.js
'use strict';
const renderer = require('../src/contentScript/renderer');

function makeStatus(id, title) {
  return { id, title, description: 'desc', user: { screen_name: 'user1' }, created_at: 1700000000000 };
}

beforeEach(() => {
  document.body.innerHTML = '<div id="xq-ext-list"></div>';
});

test('render 渲染收藏卡片', () => {
  renderer.render([makeStatus(1, '苹果财报')], [], 'all');
  expect(document.querySelector('.xq-ext-card')).not.toBeNull();
  expect(document.body.innerHTML).toContain('苹果财报');
});

test('render 按分组筛选', () => {
  const statuses = [makeStatus(1, '文章A'), makeStatus(2, '文章B')];
  const assignments = { 1: ['g1'], 2: ['g2'] };
  renderer.render(statuses, assignments, 'g1');
  const cards = document.querySelectorAll('.xq-ext-card');
  expect(cards).toHaveLength(1);
  expect(document.body.innerHTML).toContain('文章A');
});

test('render all 显示全部', () => {
  const statuses = [makeStatus(1, '文章A'), makeStatus(2, '文章B')];
  renderer.render(statuses, {}, 'all');
  expect(document.querySelectorAll('.xq-ext-card')).toHaveLength(2);
});

test('render 无结果时显示占位文字', () => {
  renderer.render([makeStatus(1, '文章A')], { 1: ['g2'] }, 'g1');
  expect(document.body.innerHTML).toContain('该分组暂无收藏');
});
```

- [ ] **4.2 运行测试，确认失败**
```bash
npm test -- tests/renderer.test.js
```
预期：`Cannot find module '../src/contentScript/renderer'`

- [ ] **4.3 实现 `src/contentScript/renderer.js`**

```js
'use strict';

function formatTime(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function render(statuses, assignments, activeGroupId) {
  const container = document.getElementById('xq-ext-list');
  if (!container) return;

  const filtered = activeGroupId === 'all'
    ? statuses
    : statuses.filter(s => (assignments[s.id] || []).includes(activeGroupId));

  if (filtered.length === 0) {
    container.innerHTML = '<p class="xq-ext-empty">该分组暂无收藏</p>';
    return;
  }

  container.innerHTML = filtered.map(s => {
    const groupTags = (assignments[s.id] || [])
      .map(gid => `<span class="xq-ext-tag" data-gid="${gid}"></span>`)
      .join('');
    return `
      <div class="xq-ext-card" data-id="${s.id}">
        <div class="xq-ext-card-title">${s.title || s.description || ''}</div>
        <div class="xq-ext-card-meta">
          ${s.user?.screen_name || ''} · ${formatTime(s.created_at)}
          <span class="xq-ext-tags">${groupTags}</span>
        </div>
      </div>`;
  }).join('');
}

module.exports = { render };
```

- [ ] **4.4 运行测试，确认通过**
```bash
npm test -- tests/renderer.test.js
```
预期：`4 passed`

- [ ] **4.5 Commit**
```bash
git add src/contentScript/renderer.js tests/renderer.test.js
git commit -m "feat: add favorites list renderer with group filtering"
```

---

### Task 5: GroupTabBar 组件（`components/GroupTabBar.js`）

**Files:**
- Create: `src/contentScript/components/GroupTabBar.js`
- Create: `tests/GroupTabBar.test.js`

- [ ] **5.1 创建测试文件**

```js
// tests/GroupTabBar.test.js
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
```

- [ ] **5.2 运行测试，确认失败**
```bash
npm test -- tests/GroupTabBar.test.js
```
预期：`Cannot find module '../src/contentScript/components/GroupTabBar'`

- [ ] **5.3 创建目录并实现组件**
```bash
mkdir -p src/contentScript/components
```

```js
// src/contentScript/components/GroupTabBar.js
'use strict';

function render(groups, activeGroupId, onSwitch, onBulk, onNewGroup) {
  const container = document.getElementById('xq-ext-tabbar');
  if (!container) return;

  const tabs = [{ id: 'all', name: '全部' }, ...groups]
    .map(g => `
      <span class="xq-ext-tab ${g.id === activeGroupId ? 'xq-ext-tab--active' : ''}"
            data-gid="${g.id}">${g.name}</span>
    `).join('');

  container.innerHTML = `
    <div class="xq-ext-tabbar-inner">
      <div class="xq-ext-tabs">${tabs}</div>
      <div class="xq-ext-tabbar-actions">
        <button id="xq-ext-bulk-btn" class="xq-ext-btn-outline">✏️ 批量管理</button>
        <button id="xq-ext-new-group-btn" class="xq-ext-btn-ghost">+ 新建分组</button>
      </div>
    </div>`;

  container.querySelectorAll('.xq-ext-tab').forEach(el => {
    el.addEventListener('click', () => onSwitch(el.dataset.gid));
  });
  document.getElementById('xq-ext-bulk-btn').addEventListener('click', onBulk);
  document.getElementById('xq-ext-new-group-btn').addEventListener('click', onNewGroup);
}

module.exports = { render };
```

- [ ] **5.4 运行测试，确认通过**
```bash
npm test -- tests/GroupTabBar.test.js
```
预期：`5 passed`

- [ ] **5.5 Commit**
```bash
git add src/contentScript/components/GroupTabBar.js tests/GroupTabBar.test.js
git commit -m "feat: add GroupTabBar component"
```

---

### Task 6: BulkManager 组件（`components/BulkManager.js`）

**Files:**
- Create: `src/contentScript/components/BulkManager.js`
- Create: `tests/BulkManager.test.js`

- [ ] **6.1 创建测试文件**

```js
// tests/BulkManager.test.js
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
```

- [ ] **6.2 运行测试，确认失败**
```bash
npm test -- tests/BulkManager.test.js
```
预期：`Cannot find module '../src/contentScript/components/BulkManager'`

- [ ] **6.3 实现 `src/contentScript/components/BulkManager.js`**

```js
'use strict';

function activate(groups, onConfirm, onExit) {
  const bar = document.getElementById('xq-ext-bulk-bar');
  const options = groups.map(g => `<option value="${g.id}">${g.name}</option>`).join('');

  bar.innerHTML = `
    <div class="xq-ext-bulk-toolbar">
      <span class="xq-ext-bulk-label">批量管理模式</span>
      <span id="xq-ext-selected-count">已选 0 条</span>
      <select id="xq-ext-bulk-group-select">${options}</select>
      <button id="xq-ext-bulk-confirm" class="xq-ext-btn-primary">确定</button>
      <button id="xq-ext-bulk-exit" class="xq-ext-btn-ghost">退出</button>
    </div>`;

  document.querySelectorAll('.xq-ext-card').forEach(card => {
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.className = 'xq-ext-checkbox';
    cb.addEventListener('change', updateCount);
    card.prepend(cb);
  });

  function updateCount() {
    const n = document.querySelectorAll('.xq-ext-checkbox:checked').length;
    document.getElementById('xq-ext-selected-count').textContent = `已选 ${n} 条`;
  }

  document.getElementById('xq-ext-bulk-confirm').addEventListener('click', () => {
    const selectedIds = [...document.querySelectorAll('.xq-ext-checkbox:checked')]
      .map(cb => cb.closest('.xq-ext-card').dataset.id);
    const groupId = document.getElementById('xq-ext-bulk-group-select').value;
    onConfirm(selectedIds, groupId);
  });

  document.getElementById('xq-ext-bulk-exit').addEventListener('click', onExit);
}

function deactivate() {
  const bar = document.getElementById('xq-ext-bulk-bar');
  if (bar) bar.innerHTML = '';
  document.querySelectorAll('.xq-ext-checkbox').forEach(cb => cb.remove());
}

module.exports = { activate, deactivate };
```

- [ ] **6.4 运行测试，确认通过**
```bash
npm test -- tests/BulkManager.test.js
```
预期：`5 passed`

- [ ] **6.5 Commit**
```bash
git add src/contentScript/components/BulkManager.js tests/BulkManager.test.js
git commit -m "feat: add BulkManager component for batch group assignment"
```

---

### Task 7: GroupEditor 组件（`components/GroupEditor.js`）

**Files:**
- Create: `src/contentScript/components/GroupEditor.js`
- Create: `tests/GroupEditor.test.js`

- [ ] **7.1 创建测试文件**

```js
// tests/GroupEditor.test.js
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
```

- [ ] **7.2 运行测试，确认失败**
```bash
npm test -- tests/GroupEditor.test.js
```
预期：`Cannot find module '../src/contentScript/components/GroupEditor'`

- [ ] **7.3 实现 `src/contentScript/components/GroupEditor.js`**

```js
'use strict';

function open(groups, onAdd, onDelete, onClose) {
  const overlay = document.createElement('div');
  overlay.className = 'xq-ext-editor-overlay';

  const items = groups.map(g => `
    <div class="xq-ext-editor-item" data-gid="${g.id}">
      <span class="xq-ext-editor-name">${g.name}</span>
      <button class="xq-ext-btn-danger" data-delete-gid="${g.id}">删除</button>
    </div>`).join('');

  overlay.innerHTML = `
    <div class="xq-ext-editor-modal">
      <div class="xq-ext-editor-title">管理分组</div>
      <div class="xq-ext-editor-list">${items}</div>
      <div class="xq-ext-editor-footer">
        <input id="xq-ext-new-group-input" class="xq-ext-input" placeholder="新分组名称">
        <button id="xq-ext-add-group-btn" class="xq-ext-btn-primary">添加</button>
      </div>
    </div>`;

  document.body.appendChild(overlay);

  overlay.addEventListener('click', e => {
    if (e.target === overlay) onClose();
  });

  document.getElementById('xq-ext-add-group-btn').addEventListener('click', () => {
    const name = document.getElementById('xq-ext-new-group-input').value.trim();
    if (name) onAdd(name);
  });

  overlay.querySelectorAll('[data-delete-gid]').forEach(btn => {
    btn.addEventListener('click', () => onDelete(btn.dataset.deleteGid));
  });
}

function close() {
  document.querySelector('.xq-ext-editor-overlay')?.remove();
}

module.exports = { open, close };
```

- [ ] **7.4 运行测试，确认通过**
```bash
npm test -- tests/GroupEditor.test.js
```
预期：`6 passed`

- [ ] **7.5 Commit**
```bash
git add src/contentScript/components/GroupEditor.js tests/GroupEditor.test.js
git commit -m "feat: add GroupEditor component for group CRUD"
```

---

### Task 8: 样式（`src/contentScript/styles.css`）

**Files:**
- Create: `src/contentScript/styles.css`

- [ ] **8.1 创建 `src/contentScript/styles.css`**

```css
/* === 容器 === */
#xq-ext-tabbar { margin-bottom: 12px; }
#xq-ext-list { min-height: 200px; }

/* === TabBar === */
.xq-ext-tabbar-inner {
  display: flex;
  align-items: center;
  border-bottom: 2px solid #f0f0f0;
  padding-bottom: 0;
}
.xq-ext-tabs { display: flex; flex: 1; gap: 0; overflow-x: auto; }
.xq-ext-tab {
  padding: 8px 16px;
  font-size: 14px;
  color: #666;
  cursor: pointer;
  white-space: nowrap;
  border-bottom: 2px solid transparent;
  margin-bottom: -2px;
  transition: color 0.2s;
}
.xq-ext-tab:hover { color: #1B7BF5; }
.xq-ext-tab--active { color: #1B7BF5; border-bottom-color: #1B7BF5; font-weight: 600; }
.xq-ext-tabbar-actions { display: flex; gap: 8px; padding: 0 4px 8px; flex-shrink: 0; }

/* === 收藏卡片 === */
.xq-ext-card {
  background: #fff;
  border: 1px solid #eee;
  border-radius: 8px;
  padding: 12px 16px;
  margin-bottom: 8px;
  display: flex;
  align-items: flex-start;
  gap: 10px;
}
.xq-ext-card-title { font-size: 14px; font-weight: 600; color: #222; margin-bottom: 4px; }
.xq-ext-card-meta { font-size: 12px; color: #999; display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.xq-ext-tags { display: inline-flex; gap: 4px; }
.xq-ext-tag { color: #1B7BF5; font-size: 11px; }
.xq-ext-empty { text-align: center; color: #999; padding: 40px 0; font-size: 14px; }

/* === 批量管理 === */
.xq-ext-bulk-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: #f0f6ff;
  border: 1px solid #cce0ff;
  border-radius: 6px;
  margin-bottom: 10px;
  font-size: 13px;
}
.xq-ext-bulk-label { font-weight: 600; color: #1B7BF5; }
#xq-ext-selected-count { color: #666; flex: 1; }
.xq-ext-checkbox { width: 16px; height: 16px; accent-color: #1B7BF5; flex-shrink: 0; cursor: pointer; }

/* === GroupEditor 弹窗 === */
.xq-ext-editor-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.4);
  z-index: 999999;
  display: flex;
  align-items: center;
  justify-content: center;
}
.xq-ext-editor-modal {
  background: #fff;
  border-radius: 10px;
  padding: 20px;
  width: 320px;
  max-height: 80vh;
  overflow-y: auto;
  box-shadow: 0 8px 32px rgba(0,0,0,0.18);
}
.xq-ext-editor-title { font-size: 15px; font-weight: 700; margin-bottom: 14px; color: #222; }
.xq-ext-editor-item {
  display: flex;
  align-items: center;
  padding: 8px 10px;
  background: #f7f7f7;
  border-radius: 6px;
  margin-bottom: 6px;
}
.xq-ext-editor-name { flex: 1; font-size: 13px; color: #333; }
.xq-ext-editor-footer { display: flex; gap: 8px; margin-top: 14px; }

/* === 通用按钮 === */
.xq-ext-btn-primary { background: #1B7BF5; color: #fff; border: none; border-radius: 5px; padding: 5px 14px; font-size: 13px; cursor: pointer; }
.xq-ext-btn-outline { background: transparent; color: #1B7BF5; border: 1px solid #1B7BF5; border-radius: 5px; padding: 5px 12px; font-size: 12px; cursor: pointer; }
.xq-ext-btn-ghost { background: transparent; color: #999; border: none; font-size: 12px; cursor: pointer; padding: 5px 8px; }
.xq-ext-btn-danger { background: transparent; color: #FF3B30; border: none; font-size: 12px; cursor: pointer; }
.xq-ext-input { flex: 1; border: 1px solid #ddd; border-radius: 5px; padding: 6px 10px; font-size: 13px; outline: none; }
.xq-ext-input:focus { border-color: #1B7BF5; }
```

- [ ] **8.2 Commit**
```bash
git add src/contentScript/styles.css
git commit -m "feat: add content script styles with xueqiu blue theme"
```

---

### Task 9: 入口整合（`src/contentScript/index.js`）

**Files:**
- Create: `src/contentScript/index.js`
- Create: `tests/index.test.js`

- [ ] **9.1 创建测试文件**

```js
// tests/index.test.js
'use strict';

jest.mock('../src/contentScript/interceptor', () => ({
  install: jest.fn(),
  onData: jest.fn(),
  getCache: jest.fn(() => []),
}));
jest.mock('../src/contentScript/storage', () => ({
  getGroups: jest.fn(async () => []),
  saveGroup: jest.fn(async () => {}),
  deleteGroup: jest.fn(async () => {}),
  addAssignments: jest.fn(async () => {}),
  getData: jest.fn(async () => ({ groups: [], assignments: {} })),
}));
jest.mock('../src/contentScript/renderer', () => ({ render: jest.fn() }));
jest.mock('../src/contentScript/components/GroupTabBar', () => ({ render: jest.fn() }));
jest.mock('../src/contentScript/components/BulkManager', () => ({ activate: jest.fn(), deactivate: jest.fn() }));
jest.mock('../src/contentScript/components/GroupEditor', () => ({ open: jest.fn(), close: jest.fn() }));

test('非收藏页不挂载 UI', () => {
  Object.defineProperty(window, 'location', {
    value: { href: 'https://xueqiu.com/u/123#/timeline' },
    writable: true,
  });
  document.body.innerHTML = '';
  require('../src/contentScript/index');
  expect(document.getElementById('xq-ext-tabbar')).toBeNull();
});

test('收藏页挂载 TabBar 和 List 容器', () => {
  jest.resetModules();
  Object.defineProperty(window, 'location', {
    value: { href: 'https://xueqiu.com/u/123#/favorites' },
    writable: true,
  });
  document.body.innerHTML = '';
  require('../src/contentScript/index');
  expect(document.getElementById('xq-ext-tabbar')).not.toBeNull();
  expect(document.getElementById('xq-ext-list')).not.toBeNull();
});
```

- [ ] **9.2 运行测试，确认失败**
```bash
npm test -- tests/index.test.js
```
预期：`Cannot find module '../src/contentScript/index'`

- [ ] **9.3 实现 `src/contentScript/index.js`**

```js
'use strict';

import './styles.css';

const interceptor = require('./interceptor');
const storage = require('./storage');
const renderer = require('./renderer');
const GroupTabBar = require('./components/GroupTabBar');
const BulkManager = require('./components/BulkManager');
const GroupEditor = require('./components/GroupEditor');

function generateId() {
  return Math.random().toString(36).slice(2, 9);
}

function isOnFavoritesPage() {
  return window.location.href.includes('xueqiu.com') &&
    window.location.hash.startsWith('#/favorites');
}

function mount() {
  const pageMain = document.querySelector('.user__desc') ||
    document.querySelector('.userpage-header') ||
    document.body;

  const wrapper = document.createElement('div');
  wrapper.innerHTML = `
    <div id="xq-ext-tabbar"></div>
    <div id="xq-ext-bulk-bar"></div>
    <div id="xq-ext-list"></div>`;

  pageMain.parentNode.insertBefore(wrapper, pageMain.nextSibling);
}

async function refresh(activeGroupId) {
  const statuses = interceptor.getCache();
  const { groups, assignments } = await storage.getData();

  GroupTabBar.render(
    groups,
    activeGroupId,
    gid => refresh(gid),
    () => enterBulkMode(activeGroupId),
    () => openEditor(activeGroupId),
  );
  renderer.render(statuses, assignments, activeGroupId);
}

function enterBulkMode(activeGroupId) {
  storage.getGroups().then(groups => {
    BulkManager.activate(
      groups,
      async (statusIds, groupId) => {
        await storage.addAssignments(statusIds, groupId);
        BulkManager.deactivate();
        refresh(activeGroupId);
      },
      () => {
        BulkManager.deactivate();
        refresh(activeGroupId);
      },
    );
  });
}

function openEditor(activeGroupId) {
  storage.getGroups().then(groups => {
    GroupEditor.open(
      groups,
      async name => {
        await storage.saveGroup({ id: generateId(), name, order: groups.length });
        GroupEditor.close();
        refresh(activeGroupId);
      },
      async groupId => {
        await storage.deleteGroup(groupId);
        GroupEditor.close();
        refresh(activeGroupId === groupId ? 'all' : activeGroupId);
      },
      () => GroupEditor.close(),
    );
  });
}

if (isOnFavoritesPage()) {
  mount();
  interceptor.install();
  interceptor.onData(() => refresh('all'));
  refresh('all');
}
```

- [ ] **9.4 运行测试，确认通过**
```bash
npm test -- tests/index.test.js
```
预期：`2 passed`

- [ ] **9.5 运行全量测试，确认无回归**
```bash
npm test
```
预期：所有测试通过

- [ ] **9.6 构建验证**
```bash
npm run build
```
预期：`build/` 目录生成 `contentScript.js` 和 `contentScript.css`，无错误

- [ ] **9.7 Commit**
```bash
git add src/contentScript/index.js tests/index.test.js
git commit -m "feat: wire up content script entry point for favorites grouping"
```
