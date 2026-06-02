'use strict';

// Independent panel for managing auto-grouping rules.
// open(groups, rules, { onSave(rule), onDelete(ruleId), onClose })

function genId() {
  return Math.random().toString(36).slice(2, 9);
}

function condOp(type) {
  return type === 'stock' ? 'eq' : 'contains';
}

function typeLabel(type) {
  return type === 'stock' ? '股票代码' : '关键词';
}

function open(groups, rules, handlers) {
  const onSave = handlers.onSave || (() => {});
  const onDelete = handlers.onDelete || (() => {});
  const onClose = handlers.onClose || (() => {});

  let currentRules = rules.map(r => ({ ...r, conditions: [...(r.conditions || [])] }));

  const overlay = document.createElement('div');
  overlay.className = 'xq-ext-rule-overlay';
  overlay.innerHTML = `
    <div class="xq-ext-rule-modal">
      <div class="xq-ext-editor-title">自动分组规则</div>
      <div class="xq-ext-rule-list" id="xq-ext-rule-list"></div>
      <button id="xq-ext-rule-new-btn" class="xq-ext-btn-outline">+ 新建规则</button>
      <div id="xq-ext-rule-editor"></div>
    </div>`;
  document.body.appendChild(overlay);

  overlay.addEventListener('click', e => {
    if (e.target === overlay) onClose();
  });

  function groupName(gid) {
    return groups.find(g => g.id === gid)?.name || '(已删除分组)';
  }

  function summarize(rule) {
    const sep = rule.logic === 'all' ? ' 且 ' : ' 或 ';
    return (rule.conditions || [])
      .filter(c => (c.value || '').trim())
      .map(c => `${typeLabel(c.type)}「${c.value}」`)
      .join(sep) || '(无条件)';
  }

  function renderList() {
    const list = document.getElementById('xq-ext-rule-list');
    if (currentRules.length === 0) {
      list.innerHTML = '<div class="xq-ext-rule-empty">暂无规则，点下方「新建规则」添加</div>';
      return;
    }
    list.innerHTML = currentRules.map(r => `
      <div class="xq-ext-rule-item" data-rule-id="${r.id}">
        <label class="xq-ext-rule-enable-wrap" title="启用/停用">
          <input type="checkbox" class="xq-ext-rule-enable" data-rule-enable="${r.id}" ${r.enabled === false ? '' : 'checked'}>
        </label>
        <div class="xq-ext-rule-info">
          <div class="xq-ext-rule-group">→ ${groupName(r.groupId)}</div>
          <div class="xq-ext-rule-summary">${summarize(r)}</div>
        </div>
        <button class="xq-ext-btn-rename" data-rule-edit="${r.id}" title="编辑">✏️</button>
        <button class="xq-ext-btn-danger" data-rule-del="${r.id}">删除</button>
      </div>`).join('');

    list.querySelectorAll('[data-rule-enable]').forEach(cb => {
      cb.addEventListener('change', () => {
        const id = cb.dataset.ruleEnable;
        const rule = currentRules.find(r => r.id === id);
        if (!rule) return;
        rule.enabled = cb.checked;
        onSave({ ...rule });
      });
    });
    list.querySelectorAll('[data-rule-del]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.ruleDel;
        currentRules = currentRules.filter(r => r.id !== id);
        onDelete(id);
        renderList();
      });
    });
    list.querySelectorAll('[data-rule-edit]').forEach(btn => {
      btn.addEventListener('click', () => {
        const rule = currentRules.find(r => r.id === btn.dataset.ruleEdit);
        if (rule) openEditor(rule);
      });
    });
  }

  function condRowHtml(cond = { type: 'stock', value: '' }) {
    return `
      <div class="xq-ext-rule-cond">
        <select class="xq-ext-rule-cond-type">
          <option value="stock" ${cond.type === 'stock' ? 'selected' : ''}>股票代码</option>
          <option value="keyword" ${cond.type === 'keyword' ? 'selected' : ''}>关键词</option>
        </select>
        <input class="xq-ext-input xq-ext-rule-cond-value" placeholder="如 SH600519 或 茅台" value="${cond.value || ''}">
        <button class="xq-ext-btn-danger xq-ext-rule-cond-del" title="删除条件">×</button>
      </div>`;
  }

  function openEditor(rule) {
    const editing = !!rule;
    const conds = editing && rule.conditions.length ? rule.conditions : [{ type: 'stock', value: '' }];
    const options = groups.map(g =>
      `<option value="${g.id}" ${editing && rule.groupId === g.id ? 'selected' : ''}>${g.name}</option>`
    ).join('');

    const editor = document.getElementById('xq-ext-rule-editor');
    editor.innerHTML = `
      <div class="xq-ext-rule-edit-box">
        <div class="xq-ext-rule-row">
          <span class="xq-ext-rule-label">归入分组</span>
          <select id="xq-ext-rule-group-select">${options}</select>
        </div>
        <div class="xq-ext-rule-row">
          <span class="xq-ext-rule-label">满足</span>
          <select id="xq-ext-rule-logic">
            <option value="any" ${editing && rule.logic === 'all' ? '' : 'selected'}>任一条件</option>
            <option value="all" ${editing && rule.logic === 'all' ? 'selected' : ''}>全部条件</option>
          </select>
        </div>
        <div id="xq-ext-rule-conditions">${conds.map(condRowHtml).join('')}</div>
        <button id="xq-ext-rule-add-cond" class="xq-ext-btn-ghost">+ 添加条件</button>
        <div id="xq-ext-rule-error" class="xq-ext-editor-error"></div>
        <div class="xq-ext-rule-edit-actions">
          <button id="xq-ext-rule-save" class="xq-ext-btn-primary">保存</button>
          <button id="xq-ext-rule-cancel" class="xq-ext-btn-ghost">取消</button>
        </div>
      </div>`;

    bindCondDeletes();
    document.getElementById('xq-ext-rule-add-cond').addEventListener('click', () => {
      document.getElementById('xq-ext-rule-conditions').insertAdjacentHTML('beforeend', condRowHtml());
      bindCondDeletes();
    });
    document.getElementById('xq-ext-rule-cancel').addEventListener('click', () => { editor.innerHTML = ''; });
    document.getElementById('xq-ext-rule-save').addEventListener('click', () => save(rule));
  }

  function bindCondDeletes() {
    document.querySelectorAll('.xq-ext-rule-cond-del').forEach(btn => {
      btn.onclick = () => {
        const rows = document.querySelectorAll('.xq-ext-rule-cond');
        if (rows.length > 1) btn.closest('.xq-ext-rule-cond').remove();
      };
    });
  }

  function showError(msg) {
    const el = document.getElementById('xq-ext-rule-error');
    if (el) el.textContent = msg || '';
  }

  function save(existing) {
    const conditions = [...document.querySelectorAll('.xq-ext-rule-cond')].map(row => {
      const type = row.querySelector('.xq-ext-rule-cond-type').value;
      const value = row.querySelector('.xq-ext-rule-cond-value').value.trim();
      return { type, op: condOp(type), value };
    }).filter(c => c.value);

    if (conditions.length === 0) {
      showError('请至少填写一个有效条件');
      return;
    }
    showError('');

    const rule = {
      id: existing ? existing.id : genId(),
      groupId: document.getElementById('xq-ext-rule-group-select').value,
      enabled: existing ? existing.enabled !== false : true,
      logic: document.getElementById('xq-ext-rule-logic').value,
      conditions,
    };

    const idx = currentRules.findIndex(r => r.id === rule.id);
    if (idx >= 0) currentRules[idx] = rule;
    else currentRules.push(rule);

    onSave(rule);
    document.getElementById('xq-ext-rule-editor').innerHTML = '';
    renderList();
  }

  renderList();
  document.getElementById('xq-ext-rule-new-btn').addEventListener('click', () => openEditor(null));
}

function close() {
  document.querySelector('.xq-ext-rule-overlay')?.remove();
}

module.exports = { open, close };
