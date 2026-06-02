'use strict';

function closeContextMenu() {
  document.getElementById('xq-ext-tab-ctxmenu')?.remove();
  // Always detach listeners so a stale closer can't kill a freshly-opened menu.
  document.removeEventListener('click', closeContextMenu);
  document.removeEventListener('contextmenu', closeContextMenu);
}

function showContextMenu(e, gid, currentName, onRename, onDelete) {
  closeContextMenu();

  const menu = document.createElement('div');
  menu.id = 'xq-ext-tab-ctxmenu';
  menu.className = 'xq-ext-ctxmenu';
  menu.style.left = `${e.clientX}px`;
  menu.style.top = `${e.clientY}px`;
  menu.innerHTML = `
    <div class="xq-ext-ctxmenu-item" data-ctx-action="rename">重命名</div>
    <div class="xq-ext-ctxmenu-item xq-ext-ctxmenu-danger" data-ctx-action="delete">删除</div>`;
  document.body.appendChild(menu);

  menu.querySelector('[data-ctx-action="rename"]').addEventListener('click', () => {
    closeContextMenu();
    const next = window.prompt('重命名分组', currentName);
    if (next == null) return;
    const trimmed = next.trim();
    if (trimmed && trimmed !== currentName && onRename) onRename(gid, trimmed);
  });

  menu.querySelector('[data-ctx-action="delete"]').addEventListener('click', () => {
    closeContextMenu();
    if (window.confirm(`确定删除分组「${currentName}」？`) && onDelete) onDelete(gid);
  });

  // Close when clicking/right-clicking elsewhere. Deferred so the originating
  // right-click doesn't immediately trigger the closer as it bubbles to document.
  // Listeners are non-`once` and removed explicitly in closeContextMenu, so opening
  // a new menu (which calls closeContextMenu first) never leaves a stale closer behind.
  setTimeout(() => {
    document.addEventListener('click', closeContextMenu);
    document.addEventListener('contextmenu', closeContextMenu);
  }, 0);
}

function render(groups, activeGroupId, onSwitch, onBulk, onNewGroup, onRename, onDelete, onAutoGroup) {
  const container = document.getElementById('xq-ext-tabbar');
  if (!container) return;

  closeContextMenu();

  const tabs = [{ id: 'all', name: '全部' }, ...groups]
    .map(g => `
      <span class="xq-ext-tab ${g.id === activeGroupId ? 'xq-ext-tab--active' : ''}"
            data-gid="${g.id}">${g.name}</span>
    `).join('');

  container.innerHTML = `
    <div class="xq-ext-tabbar-inner">
      <div class="xq-ext-tabs">${tabs}</div>
      <div class="xq-ext-tabbar-actions">
        <button id="xq-ext-auto-btn" class="xq-ext-btn-ghost">⚡ 自动分组</button>
        <button id="xq-ext-bulk-btn" class="xq-ext-btn-outline">✏️ 批量管理</button>
        <button id="xq-ext-new-group-btn" class="xq-ext-btn-ghost">管理分组</button>
      </div>
    </div>`;

  container.querySelectorAll('.xq-ext-tab').forEach(el => {
    el.addEventListener('click', () => onSwitch(el.dataset.gid));
    if (el.dataset.gid !== 'all') {
      el.addEventListener('contextmenu', e => {
        e.preventDefault();
        showContextMenu(e, el.dataset.gid, el.textContent.trim(), onRename, onDelete);
      });
    }
  });
  document.getElementById('xq-ext-bulk-btn').addEventListener('click', onBulk);
  document.getElementById('xq-ext-new-group-btn').addEventListener('click', onNewGroup);
  const autoBtn = document.getElementById('xq-ext-auto-btn');
  if (autoBtn && onAutoGroup) autoBtn.addEventListener('click', onAutoGroup);
}

module.exports = { render };
