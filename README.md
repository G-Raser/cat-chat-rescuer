# CatChat Rescuer v0.5.1

CatChat Rescuer 是一个用于归档 ChatGPT 对话、保存已展示思考轨迹，并在必要时抢救超长对话的 Edge / Chrome 扩展。

当前实验分支采用 **API-first** 架构：优先直接读取当前 ChatGPT 会话可访问的 conversation JSON，不需要为了普通导出反复滚动页面；旧版 DOM / 增量扫描工具仍保留为救援模式。

> 非官方工具，与 OpenAI 无关联。它依赖 ChatGPT 当前网页和内部接口行为，因此页面或接口变化可能导致部分功能暂时失效。

## 当前结构

面板分为三部分：

1. **读取内容**：统一读取一次 conversation JSON。
2. **思考轨迹**：使用同一份已读取缓存导出 ChatGPT 已展示 / 可恢复的 `thoughts` 内容。
3. **传统 DOM / 增量抢救工具**：保留旧版滚动捕获、State 和增量扫描能力。

核心原则是：**一次读取，多路导出**。正文、Raw JSON 和思考轨迹不需要分别重新请求同一份对话。

## API-first 读取

### 当前对话

输入框留空，点击 `读取内容`。

扩展会读取当前 `/c/<conversation-id>` 对话，并在成功后解锁：

- `可读 MD`
- `Raw JSON`
- `思考轨迹 MD`
- `总文本 TXT`
- 开发诊断中的完整思考轨迹 / 探针 JSON

### 读取另一个对话

不需要打开目标对话。在输入框粘贴 ChatGPT `/c/...` 链接或直接粘贴 conversation ID，再点击同一个 `读取内容` 按钮。

如果目标属于 ChatGPT Project，扩展会尽量从链接中识别 project ID，并优先尝试带项目上下文的完整读取。

## 思考轨迹

这里的“思考轨迹”指 **ChatGPT 曾展示给用户、并仍存在于 conversation JSON 中的思考摘要 / thoughts 内容**，不是绕过产品界面去获取从未展示过的隐藏推理。

### 默认导出

默认主功能只把 **真正有正文内容的 `thoughts` 回合**算作“思考回合”。因此以下内容不会单独占据主计数或主导出：

- `Worked for 4s`
- `Worked for a few seconds`
- 只有时长的 `reasoning_recap`
- 没有正文的纯工具流水摘要

如果一个有正文的思考回合同时带有 `Worked for ...`，Markdown 可以把它作为该回合的附属信息保留。

支持两种范围：

- **当前分支**：只导出当前 conversation path 上的有效思考。
- **整棵对话树**：包含其他 branch 中可识别的有效思考。

### 完整原始轨迹

开发诊断区域仍保留完整模式，用于结构研究和排错。它可以包含纯 recap、工具摘要以及没有正文的原始思考回合。正常阅读建议使用默认的 `思考轨迹 MD` 或 `总文本 TXT`。

## 可读正文导出

`可读 MD` 默认导出当前分支上的用户 / 助手正文，并过滤思考节点和视觉隐藏节点。

导出称呼可以在面板中调整。公共默认值为：

```text
User
Assistant
```

设置会保存在浏览器本地。

`Raw JSON` 则尽量保留 API 返回的完整 conversation 结构，包括 mapping、branch、节点元数据以及其他底层字段。

## 读取状态

读取过程中状态栏会显示持续增长的秒数，例如：

```text
⟳ 当前对话 读取中 · 12s
```

这是为了区分“仍在读取超长对话”和“界面已经卡死”。读取成功后会显示正文数量、有效思考数量以及当前使用的读取模式，例如 `full`、`full_project` 或分页 fallback。

## 传统 DOM / 增量抢救模式

旧版工具仍保留，用于 API 路线失败、需要已有 State 增量归档，或需要处理特殊超长窗口时。

它包含：

- 当前页面 DOM 捕获
- 不同上滚速度
- IndexedDB 本地缓存
- JSON / Markdown 导出
- `.rescue-state.json`
- State-first 增量扫描
- 旧 JSON + 新 patch 合并
- 至少连续匹配 3 条旧尾巴锚点后才允许增量拼接

API-first 是默认路线；传统 DOM 模式是救援路线，不需要普通用户每次都使用。

## 安装与更新

### Edge

1. 打开 `edge://extensions/`。
2. 开启“开发人员模式”。
3. 点击“加载解压缩的扩展”。
4. 选择本仓库文件夹。
5. 更新代码后点击扩展卡片上的“重新加载”。
6. 刷新 ChatGPT 页面。

### Chrome

1. 打开 `chrome://extensions/`。
2. 开启“开发者模式”。
3. 点击“加载已解压的扩展程序”。
4. 选择本仓库文件夹。
5. 更新代码后重新加载扩展并刷新 ChatGPT。

实验分支当前面板版本应显示：

```text
0.5.1
```

### 面板没有出现时

v0.5.1 增加了一个**恢复 / 唤醒入口**。正常情况下刷新 ChatGPT 后面板会自动出现；如果重新加载扩展后，某个已经打开的 ChatGPT 标签页没有成功注入面板，可以在该标签页点击一次扩展图标。

扩展图标只会检查并恢复当前 v0.5.x 运行链：

```text
content.js → api-data.js → ui-controller.js
```

它不会再调用旧实验版的双重注入逻辑。若面板已经完整存在，点击图标只会把它重新显示出来，不会重复重建。

## 隐私与数据流

扩展不需要用户手动填写 OpenAI API key。

API-first 读取使用当前浏览器里已经登录的 ChatGPT 会话，在 ChatGPT 页面上下文中请求该账号本来可访问的对话数据。会话 access token / account 信息只用于运行时请求，不写入导出文件，也不由扩展持久化保存。

扩展本身不会把聊天内容主动发送到第三方服务器；导出文件通过浏览器直接保存到本机。

但是所有导出都应视为私密数据，尤其包括：

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

## 文件与模块

当前实验架构的主要文件：

```text
content.js          # 传统 DOM / 增量抢救核心，同时创建基础面板
api-background.js   # API 读取后台通道 + 面板恢复入口
api-data.js         # conversation / thoughts 解析与导出格式
ui-controller.js    # 一次读取、多路导出与三块面板 UI
style.css           # 面板样式
```

旧实验脚本可能仍留在分支历史中，但 v0.5.1 manifest 不再把它们放进默认运行链。

## 开发检查

至少建议运行：

```bash
node --check content.js
node --check api-background.js
node --check api-data.js
node --check ui-controller.js
```

并解析检查 `manifest.json`。

公共测试数据只能使用合成 / 匿名 fixture。不要提交真实 conversation JSON、thinking probe、conversation ID、账号 ID、token、真实聊天截图或诊断转储。

## 授权状态

当前仓库暂未提供软件许可证。公开可见不等于授予复制、修改、再发布或商业使用的许可；后续授权方式由仓库作者另行决定。
