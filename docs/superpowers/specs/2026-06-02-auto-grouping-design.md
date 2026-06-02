# 雪球收藏「自动规则分组」设计文档（待 Review）

**日期：** 2026-06-02
**项目：** xueqiu-extension（Chrome MV3 扩展）
**功能：** 按规则（股票代码 / 关键词等）自动把收藏归入分组
**状态：** 已实现（2026-06-02）。⚠️ `extractor.js` 的股票/话题选择器为假设值，仍需在真实收藏页核对

> **评审结论（2026-06-02）：**
> 1. 采用方案 B（计算式，不物化）
> 2. 规则管理用**独立面板**（非挂在分组项下）
> 3. 仅支持「股票代码 + 关键词」，**不做正则**
> 4. 关键词匹配范围扩展到：标题+正文、**股票名称、话题标签**
> 5. 自动标签的「×」= **仅本次隐藏**（不持久化，刷新后恢复）

---

## 1. 目标

让用户为分组配置「自动规则」，收藏内容命中规则时自动归入对应分组，无需逐条手动分配。例如：

- 含股票 `$贵州茅台(SH600519)$` → 自动进「白酒」分组
- 标题/正文包含关键词「电解铝 / 氧化铝」→ 自动进「有色」分组

与现有手动分配（内联下拉框、批量管理）共存。

---

## 2. 与现有架构的关系

现状（DOM 增强方案，见 `2026-05-31-favorites-grouping-design.md`）：

- 从 `article.timeline__item` 里 `a[data-id]` 提取 `status_id`
- 手动分配存于 `assignments[statusId] = [groupId, ...]`
- 筛选 `filterArticles()` 按 `assignments` show/hide article

自动分组需要新增两件事：
1. **规则的存储与管理 UI**
2. **从 article DOM 中提取「可匹配特征」**（股票代码、文本），再按规则计算归属

---

## 3. 关键设计决策：物化 vs 计算（**需重点 Review**）

### 方案 A：物化（把命中结果写入 assignments）
扫描时把命中的 `groupId` 直接写进 `assignments[statusId]`。

- 优点：与现有筛选逻辑零改动；离线后仍保留
- 缺点：
  - 存储膨胀（尤其 `chrome.storage.sync` 仅 ~100KB），与配额提示功能冲突
  - 规则改了要回溯清理旧的自动分配，复杂
  - 无法区分「这条是自动加的还是手动加的」，删除/重算易出错

### 方案 B：计算（虚拟成员，**推荐**）
不落库。article 的最终归属 = `手动分配 ∪ 规则命中 − 手动排除`，在 `augmentArticles()/filterArticles()` 时实时计算。

- 优点：
  - 规则改动立即生效，无需回溯
  - 不占存储，sync 友好
  - 自动/手动天然区分
- 缺点：
  - 只对「当前 DOM 中的 article」生效——但本扩展筛选本就是 DOM 级，无影响
  - 每次 render 需对页面内 article 跑一遍匹配（数量级为几十条，性能可忽略）

> **已定：方案 B。** 下文按 B 展开。

---

## 4. 数据模型（方案 B）

在现有 `xq_groups_data` 中仅新增 `rules`（不持久化排除项）：

```js
{
  "groups": [ { "id": "g1", "name": "白酒", "order": 0 } ],
  "assignments": { "383358736": ["g2"] },          // 手动分配（不变）
  "rules": [
    {
      "id": "r1",
      "groupId": "g1",
      "enabled": true,
      "logic": "any",                               // any | all
      "conditions": [
        { "type": "stock",   "op": "eq",       "value": "SH600519" },
        { "type": "keyword", "op": "contains", "value": "茅台" }
      ]
    }
  ]
}
```

**字段说明：**
- `conditions[].type`：`stock`（股票代码）/ `keyword`（标题+正文+股票名称+话题标签文本）/ 预留 `author`、`source`
- `op`：`stock` 用 `eq`；`keyword` 用 `contains`（大小写不敏感，**不支持正则**）
- `logic`：多条件 `any`（或）/ `all`（与）

**「仅本次隐藏」（决策 5）：** 不持久化排除项。用一个**模块级内存 Set** `sessionHidden`（`"statusId:groupId"`）记录用户在本次会话点「×」隐藏的自动命中；它在多次 `augmentArticles()`/重渲染间保留，但**页面刷新即清空**。

**最终归属计算：**
```
finalGroups(statusId, features) =
   (assignments[statusId] ∪ matchedByRules(features))  −  sessionHidden(statusId)
```

---

## 5. 特征提取（**需 Review，依赖线上 DOM，需实测确认选择器**）

新增 `src/contentScript/extractor.js`，从单个 article 提取：

```js
{
  statusId: "383358736",
  stocks: ["SH600519", "SZ000858"],          // 股票代码集合（供 stock 条件 eq 匹配）
  keywordText: "标题 正文 贵州茅台 #白酒# ..."  // 关键词匹配的合并文本（决策 4）
}
```

`keywordText` 合并以下内容（**决策 4：名称、话题标签也纳入**）：
- 标题 + 正文纯文本
- 股票**名称**（cashtag 中括号前的中文名，如「贵州茅台」）
- 话题标签文本（如 `#白酒#`）

提取来源（**待线上验证**）：
- 股票代码/名称：article 内 `a[href*="/S/"]`，从 href 尾段解析代码（如 `/S/SH600519`），从链接文本解析名称；雪球 cashtag 形如 `$贵州茅台(SH600519)$`
- 话题标签：`a[href*="/k?q="]` 或形如 `#话题#` 的标签链接（选择器待实测）
- 正文：`article.querySelector('.timeline__item__bd')?.innerText`

> ⚠️ 三类选择器均需在真实收藏页 DOM 上确认。提取失败时该 article 仅按手动分配处理，不报错。

---

## 6. 匹配与刷新时机

复用现有 `augmentArticles()` 流程：
1. 遍历 article → `extractor.extract(article)` 得到 features
2. `evaluateRules(features, rules)` → 命中的 groupId 列表
3. 计算 `finalGroups`，渲染内联标签（自动命中的标签加视觉区分，见 §7）
4. `filterArticles()` 用 `finalGroups` 判定 show/hide

无限滚动新增 article 时，已有的 MutationObserver → `augmentArticles()` 会自动覆盖，无需额外逻辑。

---

## 7. UI 设计

### 7.1 规则管理入口（决策 2：独立面板）
TabBar 操作区新增「⚡ 自动分组」按钮，打开**独立的规则管理弹窗**（新组件 `RuleManager`），与「管理分组」弹窗分离。面板内容：
- 规则列表，每条规则一行：所属分组（下拉选择）、条件摘要、启用开关、删除
- 展开/新建规则时编辑条件：
  - 条件列表：类型下拉（股票代码 / 关键词）+ 输入框 + 删除
  - 「+ 添加条件」
  - 逻辑切换：满足任一 / 满足全部
- 股票代码条件输入支持 `SH600519` 形式；关键词条件为纯文本（不正则）

### 7.2 自动标签视觉区分
内联分组标签中，自动命中的用浅色/虚线描边 + 「自动」小标，区别于手动标签：
- 手动标签：实心蓝（现状），点「×」= 删除手动分配
- 自动标签：浅蓝描边 + 角标；点「×」= **仅本次隐藏**（加入内存 `sessionHidden`，刷新后恢复），不改规则、不改分配

### 7.3 「重新应用规则」
方案 B 下每次 render 已自动应用规则；改规则后调用 `refresh()` 即时可见，无需额外按钮。RuleManager 保存规则后直接触发 `refresh()`。

---

## 8. 边界与冲突处理

| 情况 | 处理 |
|------|------|
| 同一条同时被手动 + 规则归入同组 | 去重，显示为手动标签（手动优先） |
| 用户移除自动命中标签 | 加入内存 `sessionHidden`，本次会话扫描时跳过该组；刷新后恢复 |
| 删除分组 | 同步删除其关联 `rules` |
| 规则命中但该 article 不在当前 DOM | 不处理（方案 B 仅作用于已加载 article，与现有筛选一致） |
| 关键词为空 / 股票码非法 | 保存前校验，忽略空条件 |
| 提取失败（DOM 变更） | 该 article 退化为仅手动分配，不影响其他 |

---

## 9. 改动文件清单（预估）

| 文件 | 改动 |
|------|------|
| `src/contentScript/storage.js` | 新增 `getRules/saveRule/deleteRule`；`deleteGroup` 连带清理关联 rules |
| `src/contentScript/extractor.js` | **新增**：从 article 提取 `stocks` + `keywordText`（含名称/话题标签） |
| `src/contentScript/ruleEngine.js` | **新增**：纯函数 `evaluate(features, rules)` → groupId[]（易测试） |
| `src/contentScript/components/RuleManager.js` | **新增**：独立规则管理弹窗组件 |
| `src/contentScript/index.js` | `augmentArticles` 接入规则计算与 `finalGroups`；`sessionHidden` 内存集合；自动标签「×」加入 sessionHidden；TabBar「⚡ 自动分组」入口 |
| `src/contentScript/components/GroupTabBar.js` | 新增「⚡ 自动分组」按钮 + 回调 |
| `src/contentScript/styles.css` | 规则面板、自动标签样式 |
| `tests/` | `ruleEngine.test.js`、`extractor.test.js`、`RuleManager.test.js`、storage 增量用例 |

`ruleEngine` 设计为不依赖 DOM 的纯函数，便于单测；`extractor` 用 jsdom 构造 article 片段测试。

---

## 10. 分期实现建议

1. **P1（核心）**：数据模型 + `ruleEngine` + `extractor` + 计算式归属，规则用最简 UI（先支持 stock eq / keyword contains，logic=any）
2. **P2**：`exclusions` 与自动标签「×」交互、逻辑 any/all、启用开关
3. **P3**：作者/来源条件、正则匹配、规则导入导出

---

## 11. 评审决策（已确认 2026-06-02）

1. ✅ 数据模型采用**方案 B（计算式，不物化）**
2. ✅ 规则管理用**独立面板**（`RuleManager` 弹窗，TabBar「⚡ 自动分组」入口）
3. ✅ 匹配维度仅「股票代码 + 关键词」，**不做正则**
4. ✅ 关键词匹配范围 = 标题+正文 + **股票名称** + **话题标签**
5. ✅ 自动标签「×」= **仅本次隐藏**（内存 `sessionHidden`，刷新恢复，不持久化）
