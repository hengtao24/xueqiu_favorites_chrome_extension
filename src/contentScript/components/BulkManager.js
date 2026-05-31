'use strict';

function activate(groups, onConfirm, onExit) {
  const bar = document.getElementById('xq-ext-bulk-bar');
  const options = groups.map(g => `<option value="${g.id}">${g.name}</option>`).join('');

  bar.innerHTML = `
    <div class="xq-ext-bulk-toolbar">
      <span class="xq-ext-bulk-label">批量管理模式</span>
      <span id="xq-ext-selected-count">已选 0 条</span>
      <select id="xq-ext-bulk-group-select">${options}</select>
      <button id="xq-ext-bulk-confirm" class="xq-ext-btn-primary">确定</button>
      <button id="xq-ext-bulk-exit" class="xq-ext-btn-ghost">退出</button>
    </div>`;

  document.querySelectorAll('.xq-ext-card').forEach(card => {
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.className = 'xq-ext-checkbox';
    cb.addEventListener('change', updateCount);
    card.prepend(cb);
  });

  function updateCount() {
    const n = document.querySelectorAll('.xq-ext-checkbox:checked').length;
    document.getElementById('xq-ext-selected-count').textContent = `已选 ${n} 条`;
  }

  document.getElementById('xq-ext-bulk-confirm').addEventListener('click', () => {
    const selectedIds = [...document.querySelectorAll('.xq-ext-checkbox:checked')]
      .map(cb => cb.closest('.xq-ext-card').dataset.id);
    const groupId = document.getElementById('xq-ext-bulk-group-select').value;
    onConfirm(selectedIds, groupId);
  });

  document.getElementById('xq-ext-bulk-exit').addEventListener('click', onExit);
}

function deactivate() {
  const bar = document.getElementById('xq-ext-bulk-bar');
  if (bar) bar.innerHTML = '';
  document.querySelectorAll('.xq-ext-checkbox').forEach(cb => cb.remove());
}

module.exports = { activate, deactivate };
