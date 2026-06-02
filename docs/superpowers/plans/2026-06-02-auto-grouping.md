# 雪球收藏「自动规则分组」Implementation Plan

> 配套设计文档：`docs/superpowers/specs/2026-06-02-auto-grouping-design.md`（已评审定稿）
> 实现方式：TDD，逐任务推进，每个任务先写测试再实现，最后 commit。

**Goal:** 为分组配置自动规则（股票代码 / 关键词），收藏命中规则时实时（计算式）自动归入分组。

**核心决策回顾：**
- 方案 B 计算式：`finalGroups = (手动 ∪ 规则命中) − sessionHidden`，不持久化命中结果
- 独立规则面板（`RuleManager`），TabBar「⚡ 自动分组」入口
- 仅「股票代码 eq + 关键词 contains」，不正则
- 关键词文本 = 标题+正文 + 股票名称 + 话题标签
- 自动标签「×」= 仅本次隐藏（内存 `sessionHidden`，刷新清空）

**Tech Stack:** Vanilla JS, Webpack 5, Jest + jsdom, Chrome MV3（沿用现有约定）

---

## Task 1: 规则引擎 `ruleEngine.js`（纯函数，最先做）

**Files:** Create `src/contentScript/ruleEngine.js`, `tests/ruleEngine.test.js`

输入 features `{ stocks: string[], keywordText: string }` 与 rules，输出命中的 `groupId[]`（去重）。

- [ ] **1.1 写测试 `tests/ruleEngine.test.js`**

```js
'use strict';
const { evaluate, matchRule } = require('../src/contentScript/ruleEngine');

const features = { stocks: ['SH600519'], keywordText: '贵州茅台 白酒 #白酒板块#' };

test('stock eq 命中', () => {
  const rule = { id: 'r1', groupId: 'g1', enabled: true, logic: 'any',
    conditions: [{ type: 'stock', op: 'eq', value: 'SH600519' }] };
  expect(matchRule(features, rule)).toBe(true);
});

test('stock 代码大小写不敏感命中', () => {
  const rule = { id: 'r1', groupId: 'g1', enabled: true, logic: 'any',
    conditions: [{ type: 'stock', op: 'eq', value: 'sh600519' }] };
  expect(matchRule(features, rule)).toBe(true);
});

test('keyword contains 命中（大小写不敏感）', () => {
  const rule = { id: 'r1', groupId: 'g1', enabled: true, logic: 'any',
    conditions: [{ type: 'keyword', op: 'contains', value: '茅台' }] };
  expect(matchRule(features, rule)).toBe(true);
});

test('logic=all 需全部条件满足', () => {
  const rule = { id: 'r1', groupId: 'g1', enabled: true, logic: 'all',
    conditions: [
      { type: 'stock', op: 'eq', value: 'SH600519' },
      { type: 'keyword', op: 'contains', value: '不存在词' },
    ] };
  expect(matchRule(features, rule)).toBe(false);
});

test('logic=any 任一满足即可', () => {
  const rule = { id: 'r1', groupId: 'g1', enabled: true, logic: 'any',
    conditions: [
      { type: 'stock', op: 'eq', value: 'SZ000001' },
      { type: 'keyword', op: 'contains', value: '白酒' },
    ] };
  expect(matchRule(features, rule)).toBe(true);
});

test('enabled=false 的规则不参与', () => {
  const rules = [{ id: 'r1', groupId: 'g1', enabled: false, logic: 'any',
    conditions: [{ type: 'stock', op: 'eq', value: 'SH600519' }] }];
  expect(evaluate(features, rules)).toEqual([]);
});

test('空条件 / 空值被忽略，不误命中', () => {
  const rules = [{ id: 'r1', groupId: 'g1', enabled: true, logic: 'any',
    conditions: [{ type: 'keyword', op: 'contains', value: '  ' }] }];
  expect(evaluate(features, rules)).toEqual([]);
});

test('evaluate 返回去重后的命中 groupId 列表', () => {
  const rules = [
    { id: 'r1', groupId: 'g1', enabled: true, logic: 'any',
      conditions: [{ type: 'stock', op: 'eq', value: 'SH600519' }] },
    { id: 'r2', groupId: 'g1', enabled: true, logic: 'any',
      conditions: [{ type: 'keyword', op: 'contains', value: '白酒' }] },
    { id: 'r3', groupId: 'g2', enabled: true, logic: 'any',
      conditions: [{ type: 'keyword', op: 'contains', value: '茅台' }] },
  ];
  expect(evaluate(features, rules).sort()).toEqual(['g1', 'g2']);
});
```

- [ ] **1.2 实现 `src/contentScript/ruleEngine.js`**

```js
'use strict';

function matchCondition(features, cond) {
  const value = (cond.value || '').trim();
  if (!value) return false;
  if (cond.type === 'stock') {
    const v = value.toUpperCase();
    return (features.stocks || []).some(s => String(s).toUpperCase() === v);
  }
  if (cond.type === 'keyword') {
    return (features.keywordText || '').toLowerCase().includes(value.toLowerCase());
  }
  return false;
}

function matchRule(features, rule) {
  if (!rule || rule.enabled === false) return false;
  const conds = (rule.conditions || []).filter(c => (c.value || '').trim());
  if (conds.length === 0) return false;
  return rule.logic === 'all'
    ? conds.every(c => matchCondition(features, c))
    : conds.some(c => matchCondition(features, c));
}

function evaluate(features, rules) {
  const hit = new Set();
  (rules || []).forEach(rule => {
    if (matchRule(features, rule)) hit.add(rule.groupId);
  });
  return [...hit];
}

module.exports = { evaluate, matchRule, matchCondition };
```

- [ ] **1.3 跑测试通过**：`npx jest tests/ruleEngine.test.js`
- [ ] **1.4 Commit**：`feat: add rule engine for auto-grouping`

---

## Task 2: 特征提取 `extractor.js`

**Files:** Create `src/contentScript/extractor.js`, `tests/extractor.test.js`

从单个 article 元素提取 `{ statusId, stocks, keywordText }`。
> ⚠️ 真实选择器需线上验证；测试用构造的 DOM 片段覆盖逻辑。

- [ ] **2.1 写测试 `tests/extractor.test.js`**

```js
'use strict';
const { extract } = require('../src/contentScript/extractor');

function makeArticle(html) {
  const wrap = document.createElement('article');
  wrap.className = 'timeline__item';
  wrap.innerHTML = html;
  return wrap;
}

test('提取 statusId、股票代码与名称、正文、话题标签', () => {
  const article = makeArticle(`
    <a data-id="383358736" href="#"></a>
    <div class="timeline__item__bd">
      看好 <a href="/S/SH600519">$贵州茅台(SH600519)$</a>
      和 <a href="/S/SZ000858">$五粮液(SZ000858)$</a>
      <a href="/k?q=白酒">#白酒板块#</a>
      长期持有
    </div>`);
  const f = extract(article);
  expect(f.statusId).toBe('383358736');
  expect(f.stocks).toEqual(expect.arrayContaining(['SH600519', 'SZ000858']));
  expect(f.keywordText).toContain('贵州茅台');
  expect(f.keywordText).toContain('白酒');
  expect(f.keywordText).toContain('长期持有');
});

test('无股票/话题时返回空 stocks，仍含正文', () => {
  const article = makeArticle(`
    <a data-id="1" href="#"></a>
    <div class="timeline__item__bd">普通收藏内容</div>`);
  const f = extract(article);
  expect(f.stocks).toEqual([]);
  expect(f.keywordText).toContain('普通收藏内容');
});

test('无 data-id 时 statusId 为 undefined，不抛错', () => {
  const article = makeArticle('<div class="timeline__item__bd">x</div>');
  expect(() => extract(article)).not.toThrow();
  expect(extract(article).statusId).toBeUndefined();
});
```

- [ ] **2.2 实现 `src/contentScript/extractor.js`**

```js
'use strict';

// Stock links look like /S/SH600519 ; cashtag text like $贵州茅台(SH600519)$
function extract(article) {
  const statusId = article.querySelector('a[data-id]')?.dataset?.id;

  const stocks = [];
  const names = [];
  article.querySelectorAll('a[href*="/S/"]').forEach(a => {
    const m = a.getAttribute('href').match(/\/S\/([A-Za-z0-9]+)/);
    if (m) stocks.push(m[1].toUpperCase());
    const nameMatch = (a.textContent || '').match(/\$(.+?)\(/);
    if (nameMatch) names.push(nameMatch[1].trim());
  });

  const topics = [];
  article.querySelectorAll('a[href*="/k?q="]').forEach(a => {
    const t = (a.textContent || '').trim();
    if (t) topics.push(t);
  });

  const bodyText = article.querySelector('.timeline__item__bd')?.innerText
    || article.textContent || '';

  const keywordText = [bodyText, ...names, ...topics].join(' ').replace(/\s+/g, ' ').trim();

  return { statusId, stocks: [...new Set(stocks)], keywordText };
}

module.exports = { extract };
```

- [ ] **2.3 跑测试通过**：`npx jest tests/extractor.test.js`
- [ ] **2.4 Commit**：`feat: add article feature extractor for auto-grouping`

---

## Task 3: Storage 规则 CRUD

**Files:** Modify `src/contentScript/storage.js`, `tests/storage.test.js`

`xq_groups_data` 增加 `rules` 数组；`deleteGroup` 连带删除该分组的规则。

- [ ] **3.1 在 `tests/storage.test.js` 追加用例**

```js
test('getRules 初始返回空数组', async () => {
  expect(await storage.getRules()).toEqual([]);
});

test('saveRule 新增并更新规则', async () => {
  await storage.saveRule({ id: 'r1', groupId: 'g1', enabled: true, logic: 'any', conditions: [] });
  expect(await storage.getRules()).toHaveLength(1);
  await storage.saveRule({ id: 'r1', groupId: 'g1', enabled: false, logic: 'any', conditions: [] });
  const rules = await storage.getRules();
  expect(rules).toHaveLength(1);
  expect(rules[0].enabled).toBe(false);
});

test('deleteRule 删除指定规则', async () => {
  await storage.saveRule({ id: 'r1', groupId: 'g1', enabled: true, logic: 'any', conditions: [] });
  await storage.deleteRule('r1');
  expect(await storage.getRules()).toHaveLength(0);
});

test('deleteGroup 连带删除其规则', async () => {
  await storage.saveGroup({ id: 'g1', name: 'A', order: 0 });
  await storage.saveRule({ id: 'r1', groupId: 'g1', enabled: true, logic: 'any', conditions: [] });
  await storage.deleteGroup('g1');
  expect(await storage.getRules()).toEqual([]);
});
```

- [ ] **3.2 实现：在 `storage.js` 中**
  - `_load()` 默认结构补 `rules: []`：`result[KEY] || { groups: [], assignments: {}, rules: [] }`，并在读取时兜底 `data.rules = data.rules || []`
  - 新增 `getRules / saveRule(rule) / deleteRule(ruleId)`（参考 `saveGroup` 的 upsert 写法）
  - `deleteGroup` 末尾追加：`data.rules = (data.rules || []).filter(r => r.groupId !== groupId);`
  - `module.exports` 增加 `getRules, saveRule, deleteRule`

- [ ] **3.3 跑测试通过**：`npx jest tests/storage.test.js`
- [ ] **3.4 Commit**：`feat: add rule CRUD to storage`

---

## Task 4: 规则管理面板 `RuleManager.js`

**Files:** Create `src/contentScript/components/RuleManager.js`, `tests/RuleManager.test.js`

独立弹窗：列出规则、新建/编辑（选所属分组、加条件、逻辑、启用）、删除。

签名建议：
```
open(groups, rules, { onSave(rule), onDelete(ruleId), onClose })
```

- [ ] **4.1 写测试 `tests/RuleManager.test.js`**（覆盖以下点）
  - `open` 渲染遮罩与现有规则列表（含分组名、条件摘要）
  - 无规则时显示空态文案
  - 点「+ 新建规则」出现规则编辑区（分组下拉含所有 groups）
  - 编辑区「+ 添加条件」可增加条件行；类型下拉有「股票代码/关键词」
  - 填好条件点「保存」→ 以规范的 rule 对象调用 `onSave`（含 `id/groupId/logic/enabled/conditions`）
  - 条件全空时保存不触发 `onSave` 并提示
  - 点规则行「删除」→ `onDelete(ruleId)`
  - 切换启用开关 → `onSave` 持久化 enabled
  - 点遮罩 → `onClose`；`close()` 移除 DOM

> 测试用元素 id 前缀 `xq-ext-rule-*`，参照 `GroupEditor.test.js` 的 DOM 断言风格。

- [ ] **4.2 实现 `RuleManager.js`**
  - DOM 结构与样式类用 `xq-ext-` 前缀
  - 新建规则 `id` 由调用方（index.js）生成或内部 `Math.random().toString(36).slice(2,9)`
  - 条件类型固定两项：`stock`（op 恒 `eq`）/ `keyword`（op 恒 `contains`）
  - 保存前过滤空条件；无有效条件则 `showError` 不回调

- [ ] **4.3 跑测试通过**：`npx jest tests/RuleManager.test.js`
- [ ] **4.4 Commit**：`feat: add RuleManager panel component`

---

## Task 5: TabBar 增加「⚡ 自动分组」入口

**Files:** Modify `src/contentScript/components/GroupTabBar.js`, `tests/GroupTabBar.test.js`

- [ ] **5.1 追加测试**
```js
test('点击「自动分组」触发 onAutoGroup 回调', () => {
  const onAutoGroup = jest.fn();
  GroupTabBar.render(groups, 'all', jest.fn(), jest.fn(), jest.fn(), jest.fn(), jest.fn(), onAutoGroup);
  document.getElementById('xq-ext-auto-btn').click();
  expect(onAutoGroup).toHaveBeenCalled();
});
```
- [ ] **5.2 实现**：`render(..., onRename, onDelete, onAutoGroup)` 新增第 8 个参数；操作区加按钮
  `<button id="xq-ext-auto-btn" class="xq-ext-btn-ghost">⚡ 自动分组</button>`，绑定 `onAutoGroup`。
- [ ] **5.3 跑 GroupTabBar 测试通过**
- [ ] **5.4 Commit**：`feat: add auto-group entry button to tab bar`

---

## Task 6: index.js 整合（计算式归属 + sessionHidden + 自动标签）

**Files:** Modify `src/contentScript/index.js`

- [ ] **6.1 引入模块**：`const extractor = require('./extractor'); const ruleEngine = require('./ruleEngine'); const RuleManager = require('./components/RuleManager');`
- [ ] **6.2 模块级**：`const sessionHidden = new Set(); // "statusId:groupId"`
- [ ] **6.3 计算归属**：在 `addGroupSelector` / `augmentArticles` 中：
  - 取 `features = extractor.extract(article)`
  - `autoGids = ruleEngine.evaluate(features, rules)`
  - `manualGids = assignments[statusId] || []`
  - `finalGids = [...new Set([...manualGids, ...autoGids])].filter(g => !sessionHidden.has(`${statusId}:${g}`))`
  - 渲染标签：`manualGids` 含的为手动标签（× 删 assignment）；仅 `autoGids` 命中且非手动的为自动标签（浅蓝描边 + 「自动」角标，× 加入 `sessionHidden` 后 `augmentArticles()`）
  - `filterArticles` 改为基于 `finalGids` 判定（需要规则参与，签名传入 rules 或在函数内重新计算）
- [ ] **6.4 `augmentArticles` 与 `filterArticles`**：从 `storage.getData()` 一并取 `rules`，逐 article 计算 finalGids 后 show/hide
- [ ] **6.5 自动分组入口**：新增 `openRuleManager()`：读 `groups+rules` → `RuleManager.open(...)`，`onSave` 走 `safeWrite(() => storage.saveRule(rule))` 后 `refresh()`；`onDelete` 同理；新建规则 id 用 `generateId()`
- [ ] **6.6 `refresh` 里 `GroupTabBar.render(...)` 末尾补传 `() => openRuleManager()`**
- [ ] **6.7 手动验证构建无误**（index.js 无独立单测，靠 `index.test.js` 的挂载用例 + 全量 build）
- [ ] **6.8 Commit**：`feat: wire auto-grouping into content script (computed membership + session hide)`

---

## Task 7: 样式

**Files:** Modify `src/contentScript/styles.css`

- [ ] **7.1 新增**
  - 自动标签：`.xq-ext-tag--auto`（浅蓝描边、透明底、含「自动」角标 `.xq-ext-tag-auto-badge`）
  - 规则面板：`.xq-ext-rule-*`（复用 editor overlay/modal 视觉风格）
  - 条件行、类型下拉、逻辑切换、空态文案样式
- [ ] **7.2 Commit**：`feat: styles for rule panel and auto tags`

---

## Task 8: 文档与全量验证

**Files:** Modify `README.md`, design doc 状态

- [ ] **8.1 README** 使用方法补充「⚡ 自动分组」：新建规则按股票代码/关键词自动归类；自动标签可临时隐藏
- [ ] **8.2 设计文档**：把状态标为「已实现」，并回填线上实测确认后的真实选择器（若与假设不同）
- [ ] **8.3 全量测试**：`npx jest`（预期全绿）
- [ ] **8.4 构建**：`npm run build`（预期生成 contentScript.js/css 无错误）
- [ ] **8.5 真机自测清单**
  - [ ] 收藏页打开「⚡ 自动分组」，新建一条 `keyword contains 茅台 → 白酒` 规则
  - [ ] 含茅台的收藏出现「白酒（自动）」标签，切到「白酒」Tab 能看到
  - [ ] 点自动标签「×」，该条本次隐藏；刷新后恢复
  - [ ] 新建股票代码规则 `SH600519 → 白酒`，验证命中
  - [ ] 删除分组后其规则一并消失
  - [ ] **核对 extractor 选择器**：股票代码/名称、话题标签是否真的提取到（不对则修正 §2 选择器）
- [ ] **8.6 Commit**：`docs: mark auto-grouping implemented and update README`

---

## 风险与备注

- **DOM 选择器不确定**：`extractor` 的三类选择器（`a[href*="/S/"]`、`a[href*="/k?q="]`、`.timeline__item__bd`）为假设值，Task 2/8 必须线上核对，提取逻辑写成失败即降级（仅手动分配），不影响主流程。
- **性能**：每次 `augmentArticles` 对页内 article（数十条）跑规则匹配，计算量极小，可忽略。
- **与 sync 配额**：方案 B 不物化命中，仅存 `rules`（体量小），对 `chrome.storage.sync` 100KB 配额友好。
- **顺序建议**：严格按 Task 1→8。1/2/3 是纯逻辑/数据层，可先行并稳定；4/5 UI；6 整合；7 样式；8 收尾。
