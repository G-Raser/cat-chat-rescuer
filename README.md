# 尾痕 | CatLog v0.5.6

**尾痕 | CatLog** 是一个用于归档 ChatGPT 对话、保存已展示思考轨迹，并在必要时抢救超长对话的 Edge / Chrome 扩展。

当前版本采用 **API-first** 架构：优先直接读取当前 ChatGPT 会话可访问的 conversation JSON；旧版 DOM / 增量扫描工具仍保留为救援模式。

> 非官方工具，与 OpenAI 无关联。它依赖 ChatGPT 当前网页和内部接口行为，因此页面或接口变化可能导致部分功能暂时失效。

## 当前结构

面板分为三部分：

1. **读取内容**：统一读取一次 conversation JSON。
2. **思考轨迹**：使用同一份已读取缓存导出 ChatGPT 已展示 / 可恢复的 `thoughts` 内容。
3. **传统 DOM / 增量抢救工具**：保留旧版滚动捕获、State 和增量扫描能力。

核心原则是：**一次读取，多路导出**。正文、Raw JSON 和思考轨迹不需要分别重新请求同一份对话。

## API-first 读取

输入框留空后点击 `读取内容`，会读取当前 `/c/<conversation-id>` 对话。

也可以粘贴 ChatGPT `/c/...` 链接或直接粘贴 conversation ID，再点击同一个按钮。目标属于 ChatGPT Project 时，扩展会尽量识别 project ID，并优先尝试带项目上下文的完整读取。

读取成功后会解锁：

- `可读 MD`
- `Raw JSON`
- `思考轨迹 MD`
- `总文本 TXT`
- 开发诊断中的完整思考轨迹 / 探针 JSON

## 可读正文导出

`可读 MD` 默认导出当前分支上的用户 / 助手正文，并过滤思考节点和视觉隐藏节点。

### 可选时间戳

`读取内容` 区域提供：

```text
☑ 导出时间戳
```

默认开启。

- 开启：每条正文写入 conversation API 提供的 `create_time`，导出为 ISO 时间戳。
- 关闭：只导出角色、序号和正文，适合更干净的语料或阅读文件。
- 该开关只影响可读 Markdown；Raw JSON 始终保留 API 原始数据。
- 设置保存在浏览器本地。
- v0.5.6 修复了 checkbox 被通用文本输入框样式误伤、导致无法正常勾选的问题。

导出称呼也可以调整，公共默认值为：

```text
User
Assistant
```

## 思考轨迹

这里的“思考轨迹”指 **ChatGPT 曾展示给用户、并仍存在于 conversation JSON 中的思考摘要 / thoughts 内容**，不是绕过产品界面去获取从未展示过的隐藏推理。

### 主计数与默认导出

主功能只把 **真正有正文内容的 `thoughts` 回合**算作“思考回合”。

以下内容不会单独占据主计数或主导出：

- `Worked for 4s`
- `Worked for a few seconds`
- 只有时长的 `reasoning_recap`
- 没有正文的纯工具流水摘要

如果一个有正文的思考回合同时带有 `Worked for ...`，Markdown 可以把它作为该回合的附属信息保留。

支持：

- **当前分支**
- **整棵对话树**

### 思考时间戳

`思考轨迹` 区域有独立的：

```text
☑ 导出时间戳
```

默认开启。

它控制 `思考轨迹 MD`、`总文本 TXT` 以及开发诊断中的完整 MD / TXT 是否写出每个思考回合的 `create_time`。关闭不会删除底层时间数据，也不会改变 Raw / probe 内容。

从 v0.5.5 起，思考导出的时间戳作为回合元数据放在**最底部**：正文之后依次显示可用的 `Worked for ...`、`model`，最后才是 `time`。

### 完整原始轨迹

开发诊断区域仍保留完整模式，用于结构研究和排错。它可以包含纯 recap、工具摘要以及没有正文的原始思考回合。

正常阅读建议使用默认的 `思考轨迹 MD` 或 `总文本 TXT`。

## 读取状态

读取过程中状态栏会显示持续增长的秒数，例如：

```text
⟳ 当前对话 读取中 · 12s
```

这样可以区分“仍在读取超长对话”和“界面已经卡死”。

读取成功后会显示正文数量、有效思考数量以及当前读取模式，例如 `full`、`full_project` 或分页 fallback。

## UI 启动与恢复

现代 UI 的加载顺序：

```text
boot-hide.js
→ content.js
→ api-data.js
→ ui-controller.js
```

`boot-hide.js` 会在现代三块界面挂载完成前隐藏旧基础面板，避免刷新时先闪出旧 UI。若现代 UI 15 秒内仍未成功挂载，会放开旧面板作为故障兜底。

如果重新加载扩展后某个已打开的 ChatGPT 标签页没有出现面板，可以在该标签页点击一次扩展图标触发恢复 / 唤醒入口。

## 传统 DOM / 增量抢救模式

旧版工具保留用于 API 路线失败、已有 State 增量归档，或特殊超长窗口：

- 当前页面 DOM 捕获
- 不同上滚速度
- IndexedDB 本地缓存
- JSON / Markdown 导出
- `.rescue-state.json`
- State-first 增量扫描
- 旧 JSON + 新 patch 合并
- 至少连续匹配 3 条旧尾巴锚点后才允许增量拼接

API-first 是默认路线；传统 DOM 模式是救援路线。

## 安装与更新

### Edge

1. 打开 `edge://extensions/`。
2. 开启开发人员模式。
3. 点击“加载解压缩的扩展”并选择本仓库文件夹。
4. 更新代码后点击扩展卡片上的“重新加载”。
5. 刷新 ChatGPT 页面。

### Chrome

1. 打开 `chrome://extensions/`。
2. 开启开发者模式。
3. 点击“加载已解压缩的扩展程序”并选择本仓库文件夹。
4. 更新代码后重新加载扩展并刷新 ChatGPT。

当前面板版本应显示：

```text
0.5.6
```

## 隐私与数据流

扩展不需要用户手动填写 OpenAI API key。

API-first 读取使用当前浏览器里已经登录的 ChatGPT 会话，在 ChatGPT 页面上下文中请求该账号本来可访问的对话数据。会话 access token / account 信息只用于运行时请求，不写入导出文件，也不由扩展持久化保存。

扩展本身不会把聊天内容主动发送到第三方服务器；导出文件通过浏览器直接保存到本机。

所有导出都应视为私密数据，尤其包括：

- 可读 Markdown
- Raw conversation JSON
- 思考轨迹 Markdown / TXT
- thinking probe JSON
- DOM 模式完整 JSON
- incremental patch / combined-full
- `.rescue-state.json`

不要把真实聊天、conversation ID、账号信息、探针文件或诊断转储提交到本公共仓库。

更多说明见 [`PRIVACY.md`](PRIVACY.md)。

## 已知限制

- ChatGPT 内部 conversation 接口不是稳定的公开 API，可能变化。
- 完整 endpoint 不可用时会尝试分页读取；分页 fallback 主要保证当前 path，不代表完整 branch tree。
- 读取特别异常或极长的窗口时，后续仍可能需要更强的 directed / cursor fallback。
- 当前主要面向文字正文和已展示思考摘要，不保证完整重建所有图片、附件或其他富媒体交互。
- Raw JSON 可能包含敏感元数据，分享前必须人工检查。
- 传统 DOM 模式仍会受到页面 DOM 改版影响。
- API 中缺失 `create_time` 的条目不会伪造时间戳。

## 文件与模块

```text
boot-hide.js        # 在现代 UI 挂载完成前隐藏旧面板，防止启动闪烁
content.js          # 传统 DOM / 增量抢救核心，同时创建基础面板
api-background.js   # API 读取后台通道 + 面板恢复入口
api-data.js         # conversation / thoughts 解析、时间戳与导出格式
ui-controller.js    # 一次读取、多路导出、导出选项与三块面板 UI
style.css           # 面板基础样式
ui-polish.css       # 现代 UI 对齐、字号与 checkbox 修正
```

早期试验脚本仍可从 Git 历史中回看，但当前 manifest 不再把它们放进默认运行链。

## 开发检查

至少建议运行：

```bash
node --check boot-hide.js
node --check content.js
node --check api-background.js
node --check api-data.js
node --check ui-controller.js
```

并解析检查 `manifest.json`。

公共测试数据只能使用合成 / 匿名 fixture。不要提交真实 conversation JSON、thinking probe、conversation ID、账号 ID、token、真实聊天截图或诊断转储。

## 授权状态

当前仓库暂未提供软件许可证。公开可见不等于授予复制、修改、再发布或商业使用的许可；后续授权方式由仓库作者另行决定。
