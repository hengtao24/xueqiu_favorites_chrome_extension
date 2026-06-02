'use strict';

require('./styles.css');

const storage = require('./storage');
const extractor = require('./extractor');
const ruleEngine = require('./ruleEngine');
const GroupTabBar = require('./components/GroupTabBar');
const GroupEditor = require('./components/GroupEditor');
const RuleManager = require('./components/RuleManager');

let activeGroupId = 'all';
let scrollObserver = null;
let observedListContainer = null;
let watchdogTimer = null;

// Auto-matched group memberships the user hid via the "×" on an auto tag.
// Key: "statusId:groupId". Session-only — cleared on page reload (decision 5).
const sessionHidden = new Set();

function generateId() {
  return Math.random().toString(36).slice(2, 9);
}

const QUOTA_WARN_RATIO = 0.9;

function showToast(msg, type = 'info') {
  let toast = document.getElementById('xq-ext-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'xq-ext-toast';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.className = `xq-ext-toast xq-ext-toast--${type} xq-ext-toast--show`;
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => {
    toast.className = 'xq-ext-toast';
  }, 3500);
}

async function checkQuotaWarning() {
  try {
    const { ratio } = await storage.getUsage();
    if (ratio >= QUOTA_WARN_RATIO) {
      showToast(`存储空间即将用尽（已使用 ${Math.round(ratio * 100)}%），请清理部分分组`, 'warn');
    }
  } catch (_) { /* ignore */ }
}

// Wrap a storage write: surfaces quota-exceeded errors and warns near the limit.
async function safeWrite(fn) {
  try {
    await fn();
  } catch (_) {
    showToast('保存失败：存储空间已满，请清理后重试', 'error');
    return false;
  }
  await checkQuotaWarning();
  return true;
}

function isOnFavoritesPage() {
  return window.location.href.includes('xueqiu.com') &&
    window.location.hash.startsWith('#/favorites');
}

// Extract status id from an article element
function getStatusId(article) {
  return article.querySelector('a[data-id]')?.dataset?.id;
}

// Compute an article's group membership: manual ∪ auto − sessionHidden (decision 5).
function membershipFor(article, assignments, rules) {
  const statusId = getStatusId(article);
  const manualGids = (statusId && assignments[statusId]) || [];
  let autoGids = [];
  try {
    autoGids = ruleEngine.evaluate(extractor.extract(article), rules || []);
  } catch (_) { /* extraction failed — fall back to manual only */ }
  const autoOnly = autoGids.filter(g => !manualGids.includes(g));
  const finalGids = [...new Set([...manualGids, ...autoGids])]
    .filter(g => !sessionHidden.has(`${statusId}:${g}`));
  return { statusId, manualGids, autoOnly, finalGids };
}

// Add group selector to a single article (idempotent)
function addGroupSelector(article, groups, assignments, rules) {
  const { statusId, manualGids, autoOnly, finalGids } = membershipFor(article, assignments, rules);
  if (statusId) article.dataset.xqFinalGroups = finalGids.join(',');
  if (!statusId) return;
  if (article.querySelector('.xq-ext-group-selector')) return;

  const ft = article.querySelector('.timeline__item__ft');
  if (!ft) return;

  const manualTags = manualGids.map(gid => {
    const g = groups.find(x => x.id === gid);
    return g ? `<span class="xq-ext-tag">${g.name}<button class="xq-ext-tag-remove" data-status-id="${statusId}" data-group-id="${gid}" title="从分组移除">×</button></span>` : '';
  }).join('');

  const autoTags = autoOnly
    .filter(gid => !sessionHidden.has(`${statusId}:${gid}`))
    .map(gid => {
      const g = groups.find(x => x.id === gid);
      return g ? `<span class="xq-ext-tag xq-ext-tag--auto">${g.name}<span class="xq-ext-tag-auto-badge">自动</span><button class="xq-ext-tag-hide" data-status-id="${statusId}" data-group-id="${gid}" title="本次隐藏">×</button></span>` : '';
    }).join('');

  const options = groups.map(g =>
    `<option value="${g.id}">${g.name}</option>`
  ).join('');

  const wrap = document.createElement('span');
  wrap.className = 'xq-ext-group-selector';
  wrap.innerHTML = `
    <span class="xq-ext-tags xq-ext-inline-tags">${manualTags}${autoTags}</span>
    ${groups.length > 0 ? `
    <select class="xq-ext-assign-select" data-status-id="${statusId}">
      <option value="">+分组</option>
      ${options}
    </select>` : ''}`;

  ft.appendChild(wrap);

  // Remove from group (× on a manual tag)
  wrap.querySelectorAll('.xq-ext-tag-remove').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      await safeWrite(() => storage.removeAssignment(btn.dataset.statusId, btn.dataset.groupId));
      await augmentArticles();
    });
  });

  // Hide an auto-matched tag for this session only (× on an auto tag)
  wrap.querySelectorAll('.xq-ext-tag-hide').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      sessionHidden.add(`${btn.dataset.statusId}:${btn.dataset.groupId}`);
      await augmentArticles();
    });
  });

  if (groups.length > 0) {
    wrap.querySelector('.xq-ext-assign-select').addEventListener('change', async e => {
      const groupId = e.target.value;
      if (!groupId) return;
      e.target.value = '';
      await safeWrite(() => storage.addAssignments([statusId], groupId));
      await augmentArticles();
    });
  }
}


async function augmentArticles() {
  const { groups, assignments, rules } = await storage.getData();
  document.querySelectorAll('article.timeline__item').forEach(article => {
    article.querySelector('.xq-ext-group-selector')?.remove();
    addGroupSelector(article, groups, assignments, rules);
  });
  filterArticles(activeGroupId);
}

function filterArticles(gid) {
  document.querySelectorAll('article.timeline__item').forEach(article => {
    if (gid === 'all') {
      article.style.display = '';
      return;
    }
    const finals = (article.dataset.xqFinalGroups || '').split(',').filter(Boolean);
    article.style.display = finals.includes(gid) ? '' : 'none';
  });
}

function mount() {
  if (document.getElementById('xq-ext-tabbar')) return;

  const listContainer = document.querySelector('.profiles__timeline__bd');
  const wrapper = document.createElement('div');
  wrapper.id = 'xq-ext-wrapper';
  wrapper.innerHTML = `
    <div id="xq-ext-tabbar"></div>
    <div id="xq-ext-bulk-bar"></div>`;

  if (listContainer) {
    listContainer.parentNode.insertBefore(wrapper, listContainer);
  } else {
    document.body.appendChild(wrapper);
  }
}

async function refresh(gid) {
  activeGroupId = gid != null ? gid : activeGroupId;
  const { groups } = await storage.getData();
  const sortedGroups = [...groups].sort((a, b) => a.order - b.order);

  GroupTabBar.render(
    sortedGroups,
    activeGroupId,
    newGid => refresh(newGid),
    () => enterBulkMode(),
    () => openEditor(),
    (gid, newName) => renameGroup(gid, newName),
    gid => deleteGroupTab(gid),
    () => openRuleManager(),
  );

  await augmentArticles();
}

async function renameGroup(gid, newName) {
  const latest = await storage.getGroups();
  const group = latest.find(g => g.id === gid);
  if (!group) return;
  if (latest.some(g => g.name === newName && g.id !== gid)) {
    showToast(`分组「${newName}」已存在`, 'error');
    return;
  }
  const ok = await safeWrite(() => storage.saveGroup({ ...group, name: newName }));
  if (ok) refresh();
}

async function deleteGroupTab(gid) {
  const ok = await safeWrite(() => storage.deleteGroup(gid));
  if (ok) refresh(activeGroupId === gid ? 'all' : activeGroupId);
}

function enterBulkMode() {
  const bar = document.getElementById('xq-ext-bulk-bar');
  if (!bar) return;

  storage.getGroups().then(groups => {
    const options = groups.map(g => `<option value="${g.id}">${g.name}</option>`).join('');
    bar.innerHTML = `
      <div class="xq-ext-bulk-toolbar">
        <span class="xq-ext-bulk-label">批量管理模式</span>
        <span id="xq-ext-selected-count">已选 0 条</span>
        <select id="xq-ext-bulk-group-select">${options || '<option value="" disabled>（暂无分组）</option>'}</select>
        <button id="xq-ext-bulk-confirm" class="xq-ext-btn-primary"${!options ? ' disabled' : ''}>加入分组</button>
        <button id="xq-ext-bulk-unfav" class="xq-ext-btn-danger-outline">取消收藏</button>
        <button id="xq-ext-bulk-exit" class="xq-ext-btn-ghost">退出</button>
      </div>`;

    document.querySelectorAll('article.timeline__item').forEach(article => {
      if (article.style.display === 'none') return;
      if (article.querySelector('.xq-ext-checkbox')) return;
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.className = 'xq-ext-checkbox xq-ext-article-checkbox';
      article.style.position = 'relative';
      article.prepend(cb);
      cb.addEventListener('change', () => {
        const n = document.querySelectorAll('.xq-ext-article-checkbox:checked').length;
        const el = document.getElementById('xq-ext-selected-count');
        if (el) el.textContent = `已选 ${n} 条`;
      });
    });

    document.getElementById('xq-ext-bulk-confirm')?.addEventListener('click', async () => {
      const groupId = document.getElementById('xq-ext-bulk-group-select')?.value;
      if (!groupId) return;
      const ids = [...document.querySelectorAll('.xq-ext-article-checkbox:checked')]
        .map(cb => getStatusId(cb.closest('article.timeline__item')))
        .filter(Boolean);
      if (ids.length > 0) await safeWrite(() => storage.addAssignments(ids, groupId));
      exitBulkMode();
    });

    document.getElementById('xq-ext-bulk-unfav')?.addEventListener('click', async () => {
      const selected = [...document.querySelectorAll('.xq-ext-article-checkbox:checked')]
        .map(cb => cb.closest('article.timeline__item'))
        .filter(Boolean);
      if (selected.length === 0) return;
      if (!confirm(`确定取消收藏选中的 ${selected.length} 条内容？`)) return;

      const statusIds = selected.map(getStatusId).filter(Boolean);

      // Click xueqiu's native unfavorite button for each article
      selected.forEach(article => {
        const unfavBtn = [...article.querySelectorAll('.timeline__item__control')]
          .find(el => el.querySelector('span')?.textContent.trim() === '取消收藏');
        if (unfavBtn) unfavBtn.click();
      });

      // Clean up storage assignments for unfavorited items
      const { assignments } = await storage.getData();
      for (const sid of statusIds) {
        const groups = assignments[sid] || [];
        for (const gid of groups) {
          await storage.removeAssignment(sid, gid);
        }
      }

      // Remove articles from DOM then refresh
      selected.forEach(article => article.remove());
      exitBulkMode();
    });

    document.getElementById('xq-ext-bulk-exit')?.addEventListener('click', exitBulkMode);
  });
}

function exitBulkMode() {
  const bar = document.getElementById('xq-ext-bulk-bar');
  if (bar) bar.innerHTML = '';
  document.querySelectorAll('.xq-ext-article-checkbox').forEach(cb => cb.remove());
  document.querySelectorAll('article.timeline__item').forEach(a => a.style.position = '');
  refresh();
}

async function openEditor() {
  const groups = await storage.getGroups();
  const [syncEnabled, usage] = await Promise.all([
    storage.isSyncEnabled(),
    storage.getUsage().catch(() => null),
  ]);

  const usageText = usage
    ? `已用 ${(usage.bytes / 1024).toFixed(1)}KB / ${(usage.quota / 1024).toFixed(0)}KB（${Math.round(usage.ratio * 100)}%）`
    : '';

  GroupEditor.open(
    groups,
    async name => {
      const ok = await safeWrite(() => storage.saveGroup({ id: generateId(), name, order: groups.length }));
      if (ok) { GroupEditor.close(); refresh(); }
    },
    async groupId => {
      const ok = await safeWrite(() => storage.deleteGroup(groupId));
      if (ok) { GroupEditor.close(); refresh(activeGroupId === groupId ? 'all' : activeGroupId); }
    },
    async (groupId, newName) => {
      // Read fresh from storage to avoid stale closure
      const latest = await storage.getGroups();
      const group = latest.find(g => g.id === groupId);
      if (!group) return;
      const ok = await safeWrite(() => storage.saveGroup({ ...group, name: newName }));
      if (ok) refresh();
    },
    async orderedGroups => {
      const ok = await safeWrite(() => storage.saveAllGroups(orderedGroups));
      if (ok) refresh();
    },
    () => GroupEditor.close(),
    {
      enabled: syncEnabled,
      usageText,
      onToggle: async enabled => {
        const ok = await safeWrite(() => storage.setSyncEnabled(enabled));
        if (ok) {
          showToast(enabled ? '已开启跨设备同步' : '已关闭跨设备同步，数据保存在本设备', 'info');
          GroupEditor.close();
          refresh();
        }
      },
    },
  );
}

function openRuleManager() {
  Promise.all([storage.getGroups(), storage.getRules()]).then(([groups, rules]) => {
    if (groups.length === 0) {
      showToast('请先在「管理分组」创建分组，再设置自动规则', 'info');
      return;
    }
    RuleManager.open(groups, rules, {
      onSave: async rule => {
        if (!rule.id) rule.id = generateId();
        const ok = await safeWrite(() => storage.saveRule(rule));
        if (ok) refresh();
      },
      onDelete: async ruleId => {
        const ok = await safeWrite(() => storage.deleteRule(ruleId));
        if (ok) refresh();
      },
      onClose: () => RuleManager.close(),
    });
  });
}

// Watch for new articles loaded by infinite scroll
function startObserver() {
  if (scrollObserver) scrollObserver.disconnect();
  const container = document.querySelector('.profiles__timeline__bd');
  if (!container) return;
  observedListContainer = container;
  scrollObserver = new MutationObserver(() => augmentArticles());
  scrollObserver.observe(container, { childList: true, subtree: false });
}

// Detect when xueqiu's SPA re-renders away our injected UI or replaces the
// timeline node, and self-heal by re-mounting / re-binding. Without this, the
// buttons lose their handlers after an idle re-render and clicks do nothing.
function startWatchdog() {
  if (watchdogTimer) return;
  watchdogTimer = setInterval(() => {
    if (extensionContextInvalidated()) return;
    if (!isOnFavoritesPage()) return;

    const container = document.querySelector('.profiles__timeline__bd');
    if (!container) return;

    const tabbar = document.getElementById('xq-ext-tabbar');
    if (!tabbar || !document.body.contains(tabbar)) {
      // Our UI was removed by a re-render — rebuild it.
      mount();
      refresh();
      startObserver();
      return;
    }
    if (container !== observedListContainer) {
      // Timeline container was swapped — re-attach observer to the new node.
      startObserver();
      augmentArticles();
    }
  }, 1500);
}

// Returns true once the extension was reloaded/updated under a long-lived tab,
// at which point chrome.* calls throw "Extension context invalidated".
let contextInvalidWarned = false;
function extensionContextInvalidated() {
  const invalid = !(chrome && chrome.runtime && chrome.runtime.id);
  if (invalid && !contextInvalidWarned) {
    contextInvalidWarned = true;
    try { showToast('扩展已更新，请刷新本页面以恢复分组功能', 'warn'); } catch (_) { /* ignore */ }
  }
  return invalid;
}

function waitAndInit() {
  let tries = 0;
  const timer = setInterval(() => {
    const ready = document.querySelector('.profiles__timeline__bd') &&
      document.querySelector('article.timeline__item');
    if (ready) {
      clearInterval(timer);
      mount();
      refresh('all');
      startObserver();
    } else if (++tries > 30) {
      clearInterval(timer);
    }
  }, 300);
}

function teardown() {
  if (scrollObserver) { scrollObserver.disconnect(); scrollObserver = null; }
  observedListContainer = null;
  document.getElementById('xq-ext-wrapper')?.remove();
  document.getElementById('xq-ext-toast')?.remove();
  document.getElementById('xq-ext-tab-ctxmenu')?.remove();
  document.querySelector('.xq-ext-rule-overlay')?.remove();
  document.querySelectorAll('.xq-ext-group-selector').forEach(el => el.remove());
  document.querySelectorAll('.xq-ext-article-checkbox').forEach(cb => cb.remove());
  activeGroupId = 'all';
}

// Refresh the UI when group data changes elsewhere (e.g. another synced device).
let storageListenerAttached = false;
function startStorageListener() {
  if (storageListenerAttached) return;
  if (!(chrome.storage && chrome.storage.onChanged)) return;
  chrome.storage.onChanged.addListener((changes, area) => {
    if ((area === 'sync' || area === 'local') && changes[storage.DATA_KEY]) {
      if (isOnFavoritesPage() && document.getElementById('xq-ext-tabbar')) refresh();
    }
  });
  storageListenerAttached = true;
}

if (window.location.href.includes('xueqiu.com')) {
  startStorageListener();
  startWatchdog();
  if (isOnFavoritesPage()) waitAndInit();

  window.addEventListener('hashchange', () => {
    teardown();
    if (isOnFavoritesPage()) waitAndInit();
  });
}

module.exports.__isOnFavoritesPage = isOnFavoritesPage;
module.exports.__mount = mount;
