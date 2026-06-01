# <img src="public/icons/icon_48.png" width="36" align="left" style="margin-right:8px"> 雪球收藏分组

为[雪球](https://xueqiu.com)收藏页添加自定义分组功能，让你的投资收藏更有条理。

---

## 功能

- **自定义分组** — 新建任意数量的分组（如 A股、美股、宏观、原材料）
- **单条添加** — 每条收藏底部「+分组」下拉框，一键归入分组
- **批量管理** — 多选后批量加入分组，或批量取消收藏
- **从分组移除** — 点击分组标签上的 × 移除该归属
- **分组重命名** — ✏️ 按钮行内编辑，Enter 保存
- **拖拽排序** — 弹窗内拖动 ⠿ 手柄调整分组 Tab 顺序
- **重复校验** — 新建/重命名时自动检测重名
- **SPA 感知** — 切换 Tab 自动激活/卸载，支持无限滚动
- **本地存储** — 数据存储在浏览器本地，无需登录，不上传任何信息

---

## 安装

### 从源码安装（开发模式）

```bash
git clone https://github.com/hengtao24/xueqiu_favorites_chrome_extension.git
cd xueqiu_favorites_chrome_extension
npm install
npm run build
```

然后在 Chrome 打开 `chrome://extensions`，开启「开发者模式」，点击「加载已解压的扩展程序」，选择 `build/` 目录。

---

## 使用方法

1. 打开你的雪球收藏页：`xueqiu.com/u/<你的UID>#/favorites`
2. 页面顶部会出现分组标签栏
3. 点击「**+ 新建分组**」创建第一个分组
4. 每条收藏底部的「**+分组**」下拉框选择要归入的分组
5. 点击顶部 Tab 切换查看不同分组
6. 点击「**✏️ 批量管理**」进入多选模式，可批量加入分组或批量取消收藏

---

## 技术方案

- Chrome Extension Manifest V3
- 纯原生 JS（无 React/Vue），Webpack 5 打包
- DOM 增强方案：读取雪球已渲染的 `article.timeline__item`，注入分组 UI
- 数据存储：`chrome.storage.local`（最大 5MB）
- 测试：Jest + jsdom，38 个单元测试

---

## 开发

```bash
npm test          # 运行单元测试
npm run build     # 生产构建
npm run watch     # 开发模式（热重载）
node scripts/generate-icons.js  # 重新生成图标
```
