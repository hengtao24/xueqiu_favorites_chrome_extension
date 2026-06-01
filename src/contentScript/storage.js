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

async function saveAllGroups(groups) {
  const data = await _load();
  data.groups = groups;
  await _save(data);
}

module.exports = { getGroups, saveGroup, saveAllGroups, deleteGroup, getAssignments, addAssignments, removeAssignment, getData: _load };
