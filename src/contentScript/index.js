'use strict';

require('./styles.css');

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

// Wait for a DOM element matching selector, retrying up to maxTries times
function waitForElement(selector, callback, maxTries = 20, interval = 300) {
  let tries = 0;
  const timer = setInterval(() => {
    const el = document.querySelector(selector);
    if (el) {
      clearInterval(timer);
      callback(el);
    } else if (++tries >= maxTries) {
      clearInterval(timer);
    }
  }, interval);
}

function mount() {
  if (document.getElementById('xq-ext-tabbar')) return; // already mounted

  // Find the timeline/list container — try common xueqiu selectors
  const listContainer =
    document.querySelector('.timeline-container') ||
    document.querySelector('[class*="UserTimeline"]') ||
    document.querySelector('[class*="timeline__"]') ||
    document.querySelector('.user-pane__timeline');

  const wrapper = document.createElement('div');
  wrapper.id = 'xq-ext-wrapper';
  wrapper.innerHTML = `
    <div id="xq-ext-tabbar"></div>
    <div id="xq-ext-bulk-bar"></div>
    <div id="xq-ext-list"></div>`;

  if (listContainer) {
    listContainer.parentNode.insertBefore(wrapper, listContainer);
  } else {
    // Fallback: insert before the first status/post item
    const firstPost =
      document.querySelector('.timeline-item') ||
      document.querySelector('[class*="status-item"]') ||
      document.querySelector('[class*="StatusItem"]');
    if (firstPost && firstPost.parentNode) {
      firstPost.parentNode.insertBefore(wrapper, firstPost);
    } else {
      document.body.appendChild(wrapper);
    }
  }
}

async function fetchFavorites(page = 1) {
  try {
    const res = await fetch(`/statuses/favorites.json?page=${page}&count=20`, {
      credentials: 'include',
    });
    const data = await res.json();
    if (!data.statuses || data.statuses.length === 0) {
      refresh('all');
      return;
    }
    interceptor.addItems(data.statuses);
    // Auto-load next pages up to maxPage
    const maxPage = data.maxPage || 1;
    if (page < maxPage && page < 10) {
      fetchFavorites(page + 1);
    } else {
      refresh('all');
    }
  } catch (_) {
    refresh('all');
  }
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
  renderer.render(statuses, assignments, activeGroupId, groups, async (statusId, groupId) => {
    await storage.addAssignments([statusId], groupId);
    refresh(activeGroupId);
  });
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

function initOnFavoritesPage() {
  if (!isOnFavoritesPage()) return;

  // Wait for the page content to render, then mount
  waitForElement(
    '.timeline-container, [class*="UserTimeline"], [class*="timeline__"], .timeline-item, [class*="status-item"]',
    () => {
      mount();
      interceptor.install();
      interceptor.onData(() => refresh('all'));

      if (interceptor.getCache().length === 0) {
        // XHR already fired before we could intercept — re-fetch manually
        fetchFavorites();
      } else {
        refresh('all');
      }
    },
  );
}

// Only run on xueqiu.com
if (window.location.href.includes('xueqiu.com')) {
  // Install interceptor immediately so we catch any XHR before hash changes
  interceptor.install();
  interceptor.onData(() => {
    if (document.getElementById('xq-ext-tabbar')) {
      refresh('all');
    }
  });

  // Handle initial load
  initOnFavoritesPage();

  // Handle SPA navigation (tab switching changes the hash)
  window.addEventListener('hashchange', () => {
    // Remove old UI when leaving favorites
    if (!isOnFavoritesPage()) {
      const wrapper = document.getElementById('xq-ext-wrapper');
      if (wrapper) wrapper.remove();
      return;
    }
    initOnFavoritesPage();
  });
}

module.exports.__isOnFavoritesPage = isOnFavoritesPage;
module.exports.__mount = mount;
