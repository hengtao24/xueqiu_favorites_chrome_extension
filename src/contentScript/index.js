'use strict';

require('./styles.css');

const storage = require('./storage');
const GroupTabBar = require('./components/GroupTabBar');
const GroupEditor = require('./components/GroupEditor');

let activeGroupId = 'all';
let scrollObserver = null;

function generateId() {
  return Math.random().toString(36).slice(2, 9);
}

function isOnFavoritesPage() {
  return window.location.href.includes('xueqiu.com') &&
    window.location.hash.startsWith('#/favorites');
}

// Extract status id from an article element
function getStatusId(article) {
  return article.querySelector('a[data-id]')?.dataset?.id;
}

// Add group selector to a single article (idempotent)
function addGroupSelector(article, groups, assignments) {
  const statusId = getStatusId(article);
  if (!statusId) return;
  if (article.querySelector('.xq-ext-group-selector')) return;

  const ft = article.querySelector('.timeline__item__ft');
  if (!ft) return;

  const myGroups = assignments[statusId] || [];

  const groupTags = myGroups.map(gid => {
    const g = groups.find(x => x.id === gid);
    return g ? `<span class="xq-ext-tag">${g.name}<button class="xq-ext-tag-remove" data-status-id="${statusId}" data-group-id="${gid}" title="从分组移除">×</button></span>` : '';
  }).join('');

  const options = groups.map(g =>
    `<option value="${g.id}">${g.name}</option>`
  ).join('');

  const wrap = document.createElement('span');
  wrap.className = 'xq-ext-group-selector';
  wrap.innerHTML = `
    <span class="xq-ext-tags xq-ext-inline-tags">${groupTags}</span>
    ${groups.length > 0 ? `
    <select class="xq-ext-assign-select" data-status-id="${statusId}">
      <option value="">+分组</option>
      ${options}
    </select>` : ''}`;

  ft.appendChild(wrap);

  // Remove from group (× button on each tag)
  wrap.querySelectorAll('.xq-ext-tag-remove').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      const sid = btn.dataset.statusId;
      const gid = btn.dataset.groupId;
      await storage.removeAssignment(sid, gid);
      await augmentArticles();
    });
  });

  if (groups.length > 0) {
    wrap.querySelector('.xq-ext-assign-select').addEventListener('change', async e => {
      const groupId = e.target.value;
      if (!groupId) return;
      e.target.value = '';
      await storage.addAssignments([statusId], groupId);
      await augmentArticles();
    });
  }
}


async function augmentArticles() {
  const { groups, assignments } = await storage.getData();
  document.querySelectorAll('article.timeline__item').forEach(article => {
    article.querySelector('.xq-ext-group-selector')?.remove();
    addGroupSelector(article, groups, assignments);
  });
  filterArticles(activeGroupId, assignments);
}

function filterArticles(gid, assignments) {
  document.querySelectorAll('article.timeline__item').forEach(article => {
    const statusId = getStatusId(article);
    if (gid === 'all') {
      article.style.display = '';
    } else {
      const myGroups = (statusId && assignments[statusId]) || [];
      article.style.display = myGroups.includes(gid) ? '' : 'none';
    }
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
  const { groups, assignments } = await storage.getData();
  const sortedGroups = [...groups].sort((a, b) => a.order - b.order);

  GroupTabBar.render(
    sortedGroups,
    activeGroupId,
    newGid => refresh(newGid),
    () => enterBulkMode(),
    () => openEditor(),
  );

  filterArticles(activeGroupId, assignments);
  await augmentArticles();
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
      if (ids.length > 0) await storage.addAssignments(ids, groupId);
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

function openEditor() {
  storage.getGroups().then(groups => {
    GroupEditor.open(
      groups,
      async name => {
        await storage.saveGroup({ id: generateId(), name, order: groups.length });
        GroupEditor.close();
        refresh();
      },
      async groupId => {
        await storage.deleteGroup(groupId);
        GroupEditor.close();
        refresh(activeGroupId === groupId ? 'all' : activeGroupId);
      },
      async (groupId, newName) => {
        // Read fresh from storage to avoid stale closure
        const latest = await storage.getGroups();
        const group = latest.find(g => g.id === groupId);
        if (!group) return;
        await storage.saveGroup({ ...group, name: newName });
        refresh();
      },
      async orderedGroups => {
        await storage.saveAllGroups(orderedGroups);
        refresh();
      },
      () => GroupEditor.close(),
    );
  });
}

// Watch for new articles loaded by infinite scroll
function startObserver() {
  if (scrollObserver) scrollObserver.disconnect();
  const container = document.querySelector('.profiles__timeline__bd');
  if (!container) return;
  scrollObserver = new MutationObserver(() => augmentArticles());
  scrollObserver.observe(container, { childList: true, subtree: false });
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
  document.getElementById('xq-ext-wrapper')?.remove();
  document.querySelectorAll('.xq-ext-group-selector').forEach(el => el.remove());
  document.querySelectorAll('.xq-ext-article-checkbox').forEach(cb => cb.remove());
  activeGroupId = 'all';
}

if (window.location.href.includes('xueqiu.com')) {
  if (isOnFavoritesPage()) waitAndInit();

  window.addEventListener('hashchange', () => {
    teardown();
    if (isOnFavoritesPage()) waitAndInit();
  });
}

module.exports.__isOnFavoritesPage = isOnFavoritesPage;
module.exports.__mount = mount;
