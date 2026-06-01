# 雪球收藏分组功能设计文档

**日期：** 2026-05-31（更新：2026-06-01）
**项目：** xueqiu-extension（Chrome MV3 扩展）
**功能：** 为雪球收藏 Tab 添加自定义分组能力

---

## 1. 功能概述

在雪球用户收藏页（`xueqiu.com/u/:uid#/favorites`）注入自定义分组 UI，允许用户将收藏内容归类到自定义分组，并通过顶部 Tab 快速筛选浏览。

**核心特性：**
- 一条收藏可同时属于多个分组（标签模型，多对多）
- 分组数据本地存储，无需服务端
- 每条收藏底部内联分组选择器，可直接单条分配
- 批量管理模式支持多选后批量分配分组

---

## 2. 整体架构

### 技术方案：DOM 增强

直接读取雪球已渲染的 `article.timeline__item` 元素，从 `a[data-id]` 属性提取 status_id，在每条帖子底部注入分组选择器 UI。保留雪球原生列表，通过 show/hide 实现分组筛选。

> **注：** 原设计方案为 XHR 拦截（拦截 `statuses/favorites.json` 后自行渲染列表）。实际实现中因 content script 运行时机晚于 XHR 请求，拦截不稳定，改为 DOM 增强方案——侵入性更低，且不依赖网络请求时机。

### 模块结构

```
src/
  contentScript/
    index.js            入口：路径检测、DOM 增强、筛选、SPA 导航监听
    storage.js          chrome.storage.local 读写封装
    interceptor.js      XHR 拦截模块（保留，未在主流程使用）
    renderer.js         列表渲染模块（保留，未在主流程使用）
    components/
      GroupTabBar.js    顶部分组 Tab 组件
      BulkManager.js    批量管理工具栏组件
      GroupEditor.js    分组新建/删除弹窗
    styles.css          注入样式（xq-ext- 前缀）
```

### 激活条件

仅在 URL 匹配 `xueqiu.com/*` 且 hash 为 `#/favorites` 时激活；切换到其他 Tab 时自动卸载注入的 UI。

---

## 3. 数据模型

数据存储于 `chrome.storage.local`，key 为 `xq_groups_data`：

```js
{
  "groups": [
    { "id": "g1", "name": "A股", "order": 0 },
    { "id": "g2", "name": "美股", "order": 1 }
  ],
  "assignments": {
    "383358736": ["g1"],
    "389940625": ["g1", "g2"]   // 多分组（标签模型）
  }
}
```

**说明：**
- `id` 使用随机字符串（`Math.random().toString(36).slice(2,9)`）
- `order` 字段保留，当前按创建顺序排列
- 删除分组时同步清除 `assignments` 中所有引用该 `id` 的记录
- 取消收藏后，`assignments` 中的孤立记录保留，不影响功能

---

## 4. 数据流

```
用户访问收藏页
  → index.js 检测 hash，轮询等待 article.timeline__item 出现
  → mount() 注入 TabBar 容器（#xq-ext-tabbar / #xq-ext-bulk-bar）
  → augmentArticles() 遍历所有 article 元素
    → 从 a[data-id] 提取 status_id
    → 在 .timeline__item__ft 追加 .xq-ext-group-selector（含分组标签 + 下拉框）
  → filterArticles() 按当前 Tab 显示/隐藏 article

用户切换 Tab
  → GroupTabBar 回调 refresh(gid)
  → filterArticles() 更新 article 的 display 样式

用户通过下拉框单条分配
  → storage.addAssignments([statusId], groupId)
  → augmentArticles() 重建所有选择器（更新标签显示）

用户批量操作
  → 进入批量模式：每条 article 注入 checkbox
  → 确定：storage.addAssignments(selectedIds, groupId)
  → 退出：移除 checkbox，refresh()

无限滚动加载新帖子
  → MutationObserver 监听 .profiles__timeline__bd 的 childList 变化
  → 触发 augmentArticles() 为新帖子补充选择器
```

---

## 5. UI 组件规范

### 5.1 GroupTabBar（顶部分组标签栏）

注入位置：`.profiles__timeline__bd` 容器之前（`.profiles__main` 内部）。

**布局：**
- 左侧：「全部」Tab + 各自定义分组 Tab（横向排列，可横向滚动）
- 右侧：「✏️ 批量管理」按钮 + 「+ 新建分组」按钮

**交互：**
- 点击 Tab → 切换当前分组视图，筛选 article 显示
- 点击「+ 新建分组」→ 打开 GroupEditor 弹窗

### 5.2 每条收藏内联分组选择器

注入位置：每个 `article.timeline__item` 的 `.timeline__item__ft` 尾部。

**内容：**
- 已归属分组的标签徽章（蓝色 `#1B7BF5`）
- 「+分组」下拉选择框（有分组时显示）
- 选择后立即写入 storage 并刷新标签

### 5.3 BulkManager（批量管理模式）

点击「批量管理」后激活，点击「退出」退出。

**激活后：**
- TabBar 下方出现操作栏：「已选 N 条」+ 分组下拉 + 「确定」+ 「退出」
- 每条 article 左上角出现 checkbox
- 「确定」→ 将选中收藏添加到指定分组（不覆盖已有分组）

### 5.4 GroupEditor（分组管理弹窗）

点击「+ 新建分组」触发，点击遮罩或「关闭」退出。

**功能：**
- 显示现有分组列表，每项可「删除」
- 底部输入框新建分组，点击「添加」确认

---

## 6. 色彩规范

| 用途 | 颜色值 |
|------|--------|
| 主色（选中 Tab、按钮、分组标签） | `#1B7BF5` |
| 选中 Tab 背景 | `#E8F1FE` |
| 未选中 Tab 文字 | `#666666` |
| 危险操作（删除） | `#FF3B30` |

所有注入的 CSS 类名以 `xq-ext-` 为前缀，避免与雪球原生样式冲突。

---

## 7. 边界情况

| 情况 | 处理方式 |
|------|----------|
| 无分组时 | 每条收藏不显示下拉框，仅显示空标签区域 |
| 分组内收藏数为 0 | Tab 正常显示，article 全部隐藏（列表视觉上为空） |
| 雪球 DOM 结构变更 | 轮询超时（30 次 × 300ms = 9s）后放弃，不注入 UI，不影响雪球原有功能 |
| SPA hash 切换 | hashchange 事件触发，自动卸载旧 UI，切换回收藏页时重新初始化 |
| 无限滚动新帖子 | MutationObserver 自动为新 article 补充分组选择器 |

---

## 8. 未实现项（后续可迭代）

- 右键 Tab 弹出重命名/删除菜单（当前通过 GroupEditor 弹窗管理）
- 分组拖拽排序（当前按创建顺序）
- 分组名重复校验
- 存储达到上限（5MB）时提示
- 跨设备同步（可升级为 `chrome.storage.sync`）
- 自动规则分组（按股票代码、关键词等）

---

## 9. 不在范围内

- 对他人收藏页的支持
- 分组内收藏的手动排序
