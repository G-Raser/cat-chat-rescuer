# 尾痕 | CatLog Mobile v0.1.0

这是 **尾痕 | CatLog** 的轻量移动端 userscript，主要用于 Firefox Android + Tampermonkey 场景。

> 已在 Firefox Android + Tampermonkey 实机测试：当前对话 API 读取、聊天 Markdown、思考轨迹 Markdown、Raw JSON 下载均可用。

## 当前功能

- 读取当前 `/c/...` ChatGPT 对话
- 导出可读聊天 Markdown
- 导出当前分支中有正文的已展示 `thoughts` 思考轨迹 Markdown
- 保留可用的 `Worked for ...`、model、time 元数据
- 导出 Raw conversation JSON
- 时间戳开关
- 自定义 `人类名 / AI名`
  - 输入框默认留空
  - 留空时导出仍使用 `User / Assistant`
  - 填入自定义称呼后使用自定义值
  - 自定义值保存在浏览器本地
- 右侧边缘小把手，尽量避开 ChatGPT 手机页面输入区

## 安装

脚本文件：[`catlog-mobile.user.js`](catlog-mobile.user.js)

推荐步骤：

1. Firefox Android 安装 Tampermonkey。
2. 打开 `catlog-mobile.user.js` 的 Raw 文件；如果 Tampermonkey 没有自动接管，就在 Tampermonkey 中新建脚本并粘贴完整内容。
3. 保存并启用脚本。
4. 打开一个具体的 ChatGPT 对话并刷新页面。
5. 页面右侧应出现 `尾痕` 小把手。
6. 点开后先按 `读取当前对话`，读取成功后再导出需要的文件。

脚本 metadata 已设置 GitHub Raw `@updateURL` / `@downloadURL`。后续版本更新时将继续使用同一路径。

## 和桌面扩展的关系

Mobile userscript 是轻量 companion，不替代桌面 Extension。

桌面 Extension 继续负责完整 API-first UI、整棵树思考导出、传统 DOM / 增量抢救等功能；Mobile 当前优先解决“手机上把当前对话和已展示思考轨迹直接叼回来”。

版本独立维护：

- Extension：当前正式版 v0.5.6
- Mobile userscript：当前正式版 v0.1.0

## 隐私

脚本使用当前浏览器已经登录的 ChatGPT 会话读取当前账号本来可以访问的 conversation 数据，不需要填写 OpenAI API key，也没有额外的归档服务器。

导出的 Markdown 和 Raw JSON 都应视为私密数据；Raw JSON 可能包含 conversation ID、项目元数据、消息元数据、时间戳和其他上下文。

不要把真实聊天、Raw JSON、conversation ID、账号 ID、token 或包含私密文本的截图提交到本公共仓库。

更多边界见仓库根目录 [`PRIVACY.md`](../PRIVACY.md)。

## 已知限制

- ChatGPT 内部 conversation 接口不是稳定公开 API，未来可能变化。
- 当前 Mobile 只提供“当前对话”读取，不提供桌面版的粘贴任意 conversation ID / URL 读取界面。
- 思考轨迹默认只导出当前分支中真正有正文的已展示 / 可恢复 `thoughts`。
- 当前不带传统 DOM / State / 增量抢救工具。
- 不保证完整重建图片、附件或其他富媒体。

## 授权状态

本仓库当前暂未提供软件许可证。源码公开可见不等于授予复制、修改、再发布或商业使用的许可。
