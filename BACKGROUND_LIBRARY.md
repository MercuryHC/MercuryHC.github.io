# 页面背景与自带图片库

右上角 Dock 的风景图标打开背景设置。可选纯色、渐变、118 张自带壁纸或本地 PNG/JPG/WebP；可调整模糊、柔化遮罩，以及仅主页/全部工作区。点击「应用背景」后保存到此浏览器。图片保存在 IndexedDB，设置在 localStorage；本地上传不会自动写入 GitHub。

自带图库来源：[MercuryHC/wallpaper](https://github.com/MercuryHC/wallpaper)，源版本写在 wallpaper-catalog.json 中，保留来源仓库、文件名、大小和 Git blob SHA。预览使用分页缩略图拼图，总计约643 KiB，选中后才加载原图。

## 复制到私有数据仓库

1. 在顶部 GitHub 菜单连接数据仓库，例如 MercuryHC/taskspace-data；Token 需要该仓库 Contents 读写权限。
2. 打开背景设置，点击「同步到数据仓库」。
3. 查看上传进度；完成后图片在 `backgrounds/wallpaper/originals/`，索引在 `backgrounds/wallpaper/index.json`。

首次复制原图合计约192 MiB，需要保持页面打开。上传前检查远端 blob SHA，内容一致则跳过；中断后同一浏览器会记住已上传对象，重试可继续。所有图片上传完成后一次性提交，保留目标仓库其他路径；遇到同时发生的分支更新会重新基于最新版本提交。原图下载使用公开源且不携带 Token，上传仅使用当前连接的私有数据仓库。图片按大小和 Git SHA-1 校验。

选择壁纸时优先读取当前数据仓库；尚未复制或未连接时使用公开源。应用后的壁纸保存在本机，刷新无需再次下载。当前图库索引固定到源版本，源仓库新增图片后需更新索引和缩略图。

## 书签功能

左侧「书签」支持浏览器导出 HTML、Chrome/Edge Bookmarks JSON 和本站备份 JSON，按来源保存本机快照，保留目录并支持搜索、撤销和加入主页收藏。快照不自动上传 GitHub；加入主页后的收藏可使用现有 GitHub 同步。

扩展在 `downloads/browser-bookmarks-extension.zip`，源码在 `browser-bookmarks-extension/`。解压后在 Chrome/Edge 扩展管理页加载，刷新本站。自动同步默认关闭，启用后反映新增、修改、移动和删除；关闭网页期间的更改在下次打开时读取。扩展只读浏览器书签，不调用修改 API。详情见扩展 README。

## 验证

新增逻辑测试需要 Node.js 和开发依赖 `linkedom@0.18.12`、`fake-indexeddb@6.2.4`，不影响静态站点运行。安装后运行：

```
node test-browser-bookmarks.cjs
node test-browser-bookmarks-ui.cjs
node test-bookmark-extension.cjs
node test-backgrounds.cjs
node test-wallpaper-library.cjs
```

覆盖 HTML 层级、危险链接过滤、搜索、IndexedDB 替换/撤销、扩展权限与自动同步开关、背景范围和持久化、壁纸校验、差异上传、续传及并发提交。测试使用模拟 DOM/API；浏览器实际安装扩展与页面视觉需要人工检查。
