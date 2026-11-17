# 序 · 个人任务系统

访问：https://mercuryhc.github.io/

项目管理、任务看板、时间线、JSON 导入导出，以及个人 GitHub 私有仓库读写。

## GitHub 数据同步

1. 创建独立的私有仓库，如 `taskspace-data`，勾选 Add a README 以初始化 main 分支。
2. 创建 fine-grained personal access token，仅选择该数据仓库，授予 Contents: Read and write（Metadata 随 GitHub 要求提供）。请设置合理有效期。
3. 打开任务系统，点击“连接私有仓库”，填写所有者、仓库、分支和 JSON 文件路径，直接在页面输入 Token。不要将 Token 写进源码、JSON 或聊天。
4. 初次无文件时点击“保存到 GitHub”创建；已有文件时先“读取 GitHub”。任务修改首先保存在本地，需手动保存到 GitHub。每次保存会产生一次提交。
5. 在另一台设备上连接同一数据仓库并读取，即可继续工作。Token 仅存在页面内存，刷新或断开后需重新输入。配置会保存在当前浏览器中。

仅允许私有数据仓库，公开 github.io 仓库仅存源码。远端版本有变化时会拒绝覆盖；先导出本地数据，再读取远端，人工合并修改。读取前保留最近三次本地快照，可下载最近快照后通过导入恢复。无自动合并、后台同步和 NAS 连接。

浏览器仍缓存一份任务数据，因此请在可信设备上使用。仅导出 projects/tasks 数据，不包含 Token 或连接设置。数据文件限 900 KB。
