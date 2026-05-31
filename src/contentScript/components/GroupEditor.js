'use strict';

function open(groups, onAdd, onDelete, onClose) {
  const overlay = document.createElement('div');
  overlay.className = 'xq-ext-editor-overlay';

  const items = groups.map(g => `
    <div class="xq-ext-editor-item" data-gid="${g.id}">
      <span class="xq-ext-editor-name">${g.name}</span>
      <button class="xq-ext-btn-danger" data-delete-gid="${g.id}">删除</button>
    </div>`).join('');

  overlay.innerHTML = `
    <div class="xq-ext-editor-modal">
      <div class="xq-ext-editor-title">管理分组</div>
      <div class="xq-ext-editor-list">${items}</div>
      <div class="xq-ext-editor-footer">
        <input id="xq-ext-new-group-input" class="xq-ext-input" placeholder="新分组名称">
        <button id="xq-ext-add-group-btn" class="xq-ext-btn-primary">添加</button>
      </div>
    </div>`;

  document.body.appendChild(overlay);

  overlay.addEventListener('click', e => {
    if (e.target === overlay) onClose();
  });

  document.getElementById('xq-ext-add-group-btn').addEventListener('click', () => {
    const name = document.getElementById('xq-ext-new-group-input').value.trim();
    if (name) onAdd(name);
  });

  overlay.querySelectorAll('[data-delete-gid]').forEach(btn => {
    btn.addEventListener('click', () => onDelete(btn.dataset.deleteGid));
  });
}

function close() {
  document.querySelector('.xq-ext-editor-overlay')?.remove();
}

module.exports = { open, close };
