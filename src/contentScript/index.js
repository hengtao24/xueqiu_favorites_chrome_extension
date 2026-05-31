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

module.exports.__isOnFavoritesPage = isOnFavoritesPage;
module.exports.__mount = mount;

function mount() {
  const anchor = document.querySelector('.user__desc') ||
    document.querySelector('.userpage-header');

  const wrapper = document.createElement('div');
  wrapper.innerHTML = `
    <div id="xq-ext-tabbar"></div>
    <div id="xq-ext-bulk-bar"></div>
    <div id="xq-ext-list"></div>`;

  if (anchor && anchor.parentNode) {
    anchor.parentNode.insertBefore(wrapper, anchor.nextSibling);
  } else {
    document.body.appendChild(wrapper);
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
