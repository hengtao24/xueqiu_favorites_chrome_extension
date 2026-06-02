'use strict';

const KEY = 'xq_groups_data';
const PREF_KEY = 'xq_sync_enabled';

// chrome.storage.local quota is ~5MB; chrome.storage.sync total quota is ~100KB.
const LOCAL_QUOTA = 5 * 1024 * 1024;
const SYNC_QUOTA = 102400;

function _byteLength(str) {
  if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(str).length;
  return unescape(encodeURIComponent(str)).length;
}

// The sync preference itself always lives in local storage.
async function isSyncEnabled() {
  return new Promise(resolve => {
    chrome.storage.local.get(PREF_KEY, result => resolve(!!result[PREF_KEY]));
  });
}

async function _area() {
  const sync = await isSyncEnabled();
  return sync && chrome.storage.sync ? chrome.storage.sync : chrome.storage.local;
}

async function _load() {
  const area = await _area();
  return new Promise(resolve => {
    area.get(KEY, result => {
      resolve(result[KEY] || { groups: [], assignments: {} });
    });
  });
}

async function _save(data) {
  const area = await _area();
  return new Promise((resolve, reject) => {
    area.set({ [KEY]: data }, () => {
      const err = chrome.runtime && chrome.runtime.lastError;
      if (err) reject(new Error(err.message || 'QUOTA_EXCEEDED'));
      else resolve();
    });
  });
}

async function getQuota() {
  return (await isSyncEnabled()) ? SYNC_QUOTA : LOCAL_QUOTA;
}

async function getUsage() {
  const data = await _load();
  const bytes = _byteLength(KEY + JSON.stringify(data));
  const quota = await getQuota();
  return { bytes, quota, ratio: quota ? bytes / quota : 0 };
}

async function setSyncEnabled(enabled) {
  // Read current data from the currently-active area before switching.
  const data = await _load();
  await new Promise(resolve => {
    chrome.storage.local.set({ [PREF_KEY]: !!enabled }, resolve);
  });
  // Persist the data into the newly-active area so it follows the toggle.
  await _save(data);
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

async function saveAllGroups(groups) {
  const data = await _load();
  data.groups = groups;
  await _save(data);
}

module.exports = {
  getGroups,
  saveGroup,
  saveAllGroups,
  deleteGroup,
  getAssignments,
  addAssignments,
  removeAssignment,
  getData: _load,
  getUsage,
  getQuota,
  isSyncEnabled,
  setSyncEnabled,
  DATA_KEY: KEY,
  LOCAL_QUOTA,
  SYNC_QUOTA,
};
