'use strict';

function formatTime(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function render(statuses, assignments, activeGroupId, groups, onAssign) {
  const container = document.getElementById('xq-ext-list');
  if (!container) return;

  if (statuses.length === 0) {
    container.innerHTML = '<p class="xq-ext-empty">收藏加载中…</p>';
    return;
  }

  const filtered = activeGroupId === 'all'
    ? statuses
    : statuses.filter(s => (assignments[s.id] || []).includes(activeGroupId));

  if (filtered.length === 0) {
    container.innerHTML = '<p class="xq-ext-empty">该分组暂无收藏，可在「全部」视图下为收藏添加分组</p>';
    return;
  }

  container.innerHTML = filtered.map(s => {
    const myGroups = assignments[s.id] || [];
    const groupTags = myGroups.map(gid => {
      const g = (groups || []).find(x => x.id === gid);
      return g ? `<span class="xq-ext-tag">${g.name}</span>` : '';
    }).join('');

    const groupOptions = (groups || []).map(g =>
      `<option value="${g.id}" ${myGroups.includes(g.id) ? 'selected' : ''}>${g.name}</option>`
    ).join('');

    const hasGroups = groups && groups.length > 0;

    return `
      <div class="xq-ext-card" data-id="${s.id}">
        <div class="xq-ext-card-body">
          <div class="xq-ext-card-title">${s.title || s.description || '（无标题）'}</div>
          <div class="xq-ext-card-meta">
            ${s.user?.screen_name || ''} · ${formatTime(s.created_at)}
          </div>
          <div class="xq-ext-card-footer">
            <span class="xq-ext-tags">${groupTags}</span>
            ${hasGroups ? `
            <span class="xq-ext-assign-wrap">
              <select class="xq-ext-assign-select" data-status-id="${s.id}">
                <option value="">+ 添加到分组</option>
                ${groupOptions}
              </select>
            </span>` : ''}
          </div>
        </div>
      </div>`;
  }).join('');

  if (onAssign) {
    container.querySelectorAll('.xq-ext-assign-select').forEach(sel => {
      sel.addEventListener('change', e => {
        const groupId = e.target.value;
        const statusId = e.target.dataset.statusId;
        if (groupId) onAssign(statusId, groupId);
      });
    });
  }
}

module.exports = { render };
