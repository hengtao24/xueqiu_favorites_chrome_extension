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
