# CatChat Rescuer Clean v0.3.6

语法修复版。

## 修复

v0.3.4 / v0.3.5 的 `content.js` 在 `startTotalTimer()` 后多了一个 `}`，导致浏览器报：

`Uncaught SyntaxError: Unexpected token 'function'`

v0.3.6 已移除这个多余括号，并保留：

- 安全文案：`清空插件缓存`
- 暂停计时 / 重置计时
- 自动上滚新一轮从 00:00 计时
- 标签清爽版扩展名
- 导出标记：`0.3.6-syntax-hotfix`

## 安装建议

1. 打开 `edge://extensions/`。
2. 删除旧版 CatChat Rescuer。
3. 关闭所有 ChatGPT 标签页。
4. 加载 `catchat_rescuer_v0_3_6_syntax_hotfix` 文件夹。
5. 重新打开 ChatGPT。
6. 面板标题应显示 `猫茶抢救器 v0.3.6`。
7. 扩展页不应再出现 `Unexpected token 'function'`。
