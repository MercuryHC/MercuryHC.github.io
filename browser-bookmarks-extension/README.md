# 个人工作站书签扩展

1. 解压整个 ZIP 文件。
2. Chrome 打开 chrome://extensions，Edge 打开 edge://extensions。
3. 开启开发者模式，点击「加载已解压的扩展程序」，选择本文件夹。
4. 刷新 https://mercuryhc.github.io/，进入左侧「书签」。
5. 点击扩展图标设置来源名称、立即同步。自动同步默认关闭，按需开启。

扩展仅使用 bookmarks.getTree 读取当前浏览器配置文件的书签，不修改原书签，不访问历史记录或 Cookie。只向 MercuryHC GitHub Pages 的打开页面发送快照，由页面保存在当前浏览器 IndexedDB。扩展不会自动上传 GitHub。自动同步反映新增、修改、移动、删除；工作站关闭时，下次打开会获取最新快照。不同浏览器或配置文件分别生成来源。

Firefox/Safari 请导出 HTML 后在工作站导入。最多每来源30000条书签，HTTP/HTTPS 以外链接被过滤。关闭开发者模式或卸载后刷新页面，页面将不再接收扩展同步。导出备份可保留本机快照。自托管其他域名需要修改 manifest 的域名、background.js 的 APP 并重新加载扩展。
