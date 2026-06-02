'use strict';

// onAdd(name), onDelete(groupId), onRename(groupId, newName), onReorder(orderedGroups), onClose
// syncState (optional): { enabled: boolean, onToggle: (enabled) => void, usageText?: string }
function open(groups, onAdd, onDelete, onRename, onReorder, onClose, syncState) {
  const overlay = document.createElement('div');
  overlay.className = 'xq-ext-editor-overlay';

  const syncSection = syncState ? `
    <div class="xq-ext-sync-section">
      <label class="xq-ext-sync-row">
        <input type="checkbox" id="xq-ext-sync-toggle" ${syncState.enabled ? 'checked' : ''}>
        <span class="xq-ext-sync-label">跨设备同步（chrome.storage.sync）</span>
      </label>
      <div class="xq-ext-sync-hint">${syncState.usageText || ''}</div>
    </div>` : '';

  overlay.innerHTML = `
    <div class="xq-ext-editor-modal">
      <div class="xq-ext-editor-title">管理分组</div>
      <div class="xq-ext-editor-list" id="xq-ext-group-list"></div>
      <div id="xq-ext-editor-error" class="xq-ext-editor-error"></div>
      <div class="xq-ext-editor-footer">
        <input id="xq-ext-new-group-input" class="xq-ext-input" placeholder="新分组名称">
        <button id="xq-ext-add-group-btn" class="xq-ext-btn-primary">添加</button>
      </div>
      ${syncSection}
    </div>`;
  document.body.appendChild(overlay);

  if (syncState) {
    const toggle = document.getElementById('xq-ext-sync-toggle');
    toggle.addEventListener('change', () => syncState.onToggle(toggle.checked));
  }

  let currentGroups = [...groups];

  function showError(msg) {
    const el = document.getElementById('xq-ext-editor-error');
    if (el) { el.textContent = msg; el.style.display = msg ? 'block' : 'none'; }
  }

  function isDuplicate(name, excludeId = null) {
    return currentGroups.some(g => g.name === name && g.id !== excludeId);
  }

  function renderList() {
    const list = document.getElementById('xq-ext-group-list');
    if (!list) return;
    list.innerHTML = '';
    currentGroups.forEach(g => {
      const item = document.createElement('div');
      item.className = 'xq-ext-editor-item';
      item.dataset.gid = g.id;
      item.draggable = true;
      item.innerHTML = `
        <span class="xq-ext-drag-handle" title="拖拽排序">⠿</span>
        <span class="xq-ext-editor-name" data-gid="${g.id}">${g.name}</span>
        <button class="xq-ext-btn-rename" data-rename-gid="${g.id}" title="重命名">✏️</button>
        <button class="xq-ext-btn-danger" data-delete-gid="${g.id}">删除</button>`;
      list.appendChild(item);
    });
    bindEvents(list);
    bindDrag(list);
  }

  function startRename(gid) {
    const nameEl = document.querySelector(`.xq-ext-editor-name[data-gid="${gid}"]`);
    if (!nameEl) return;
    const group = currentGroups.find(g => g.id === gid);
    if (!group) return;

    // Replace name span with input + save/cancel buttons
    const wrap = document.createElement('span');
    wrap.className = 'xq-ext-rename-wrap';
    wrap.innerHTML = `
      <input class="xq-ext-input xq-ext-rename-input" value="${group.name}">
      <button class="xq-ext-btn-save" data-save-gid="${gid}" title="保存">✓</button>
      <button class="xq-ext-btn-cancel-rename" data-cancel-gid="${gid}" title="取消">✗</button>`;
    nameEl.replaceWith(wrap);

    const input = wrap.querySelector('.xq-ext-rename-input');
    input.focus();
    input.select();

    function commit() {
      const newName = input.value.trim();
      if (!newName) { showError('分组名称不能为空'); input.focus(); return; }
      if (isDuplicate(newName, gid)) { showError(`"${newName}" 已存在`); input.focus(); return; }
      showError('');
      currentGroups = currentGroups.map(g => g.id === gid ? { ...g, name: newName } : g);
      onRename(gid, newName);
      renderList();
    }

    wrap.querySelector('[data-save-gid]').addEventListener('click', commit);
    wrap.querySelector('[data-cancel-gid]').addEventListener('click', renderList);
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); commit(); }
      if (e.key === 'Escape') renderList();
    });
  }

  function bindEvents(list) {
    list.querySelectorAll('[data-rename-gid]').forEach(btn => {
      btn.addEventListener('click', () => startRename(btn.dataset.renameGid));
    });
    list.querySelectorAll('[data-delete-gid]').forEach(btn => {
      btn.addEventListener('click', () => {
        currentGroups = currentGroups.filter(g => g.id !== btn.dataset.deleteGid);
        onDelete(btn.dataset.deleteGid);
        renderList();
      });
    });
  }

  function bindDrag(list) {
    let dragGid = null;

    list.querySelectorAll('.xq-ext-editor-item').forEach(item => {
      item.addEventListener('dragstart', e => {
        dragGid = item.dataset.gid;
        item.classList.add('xq-ext-dragging');
        e.dataTransfer.effectAllowed = 'move';
      });
      item.addEventListener('dragend', () => {
        dragGid = null;
        list.querySelectorAll('.xq-ext-editor-item').forEach(i => {
          i.classList.remove('xq-ext-dragging', 'xq-ext-drag-over');
        });
      });
      item.addEventListener('dragover', e => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (item.dataset.gid !== dragGid) {
          list.querySelectorAll('.xq-ext-drag-over').forEach(i => i.classList.remove('xq-ext-drag-over'));
          item.classList.add('xq-ext-drag-over');
        }
      });
      item.addEventListener('drop', e => {
        e.preventDefault();
        if (!dragGid || item.dataset.gid === dragGid) return;
        const fromIdx = currentGroups.findIndex(g => g.id === dragGid);
        const toIdx   = currentGroups.findIndex(g => g.id === item.dataset.gid);
        if (fromIdx < 0 || toIdx < 0) return;
        const reordered = [...currentGroups];
        const [moved] = reordered.splice(fromIdx, 1);
        reordered.splice(toIdx, 0, moved);
        currentGroups = reordered.map((g, i) => ({ ...g, order: i }));
        onReorder(currentGroups);
        renderList();
      });
    });
  }

  renderList();

  document.getElementById('xq-ext-add-group-btn').addEventListener('click', () => {
    const input = document.getElementById('xq-ext-new-group-input');
    const name = input.value.trim();
    if (!name) { showError('分组名称不能为空'); return; }
    if (isDuplicate(name)) { showError(`"${name}" 已存在`); return; }
    showError('');
    input.value = '';
    onAdd(name);
  });

  document.getElementById('xq-ext-new-group-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('xq-ext-add-group-btn').click();
  });

  overlay.addEventListener('click', e => {
    if (e.target === overlay) onClose();
  });
}

function close() {
  document.querySelector('.xq-ext-editor-overlay')?.remove();
}

module.exports = { open, close };
