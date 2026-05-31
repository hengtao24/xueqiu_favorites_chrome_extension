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
