# CatChat Rescuer v0.4.2

CatChat Rescuer 是一个用于本地抢救和增量归档超长 ChatGPT 对话的 Edge / Chrome 扩展。

它会从当前 ChatGPT 页面读取已经加载到 DOM 中的文字消息，保存在浏览器本地缓存中，并导出为 Markdown、JSON 和用于下一轮增量定位的 `.rescue-state.json`。

> 非官方工具，与 OpenAI 无关联。ChatGPT 页面结构变化可能导致扩展暂时失效。

## 适合什么场景

- 超长对话需要完整导出。
- 同一个对话后续又新增了很多消息，只想补抓新增尾巴。
- 希望保留 Markdown 便于阅读，同时保留 JSON 便于后续处理。
- 不希望为了增量导出把旧归档交给第三方服务器。

## 隐私说明

当前版本不需要 OpenAI Token，也不会主动把聊天内容发送到第三方服务器。

数据主要经过两条本地路径：

- 捕获缓存保存在浏览器 IndexedDB 中。
- 导出文件由浏览器直接下载到本机。

但请注意：

- 导出的 Markdown / JSON 包含真实聊天内容。
- `.rescue-state.json` 也不是匿名元数据；它包含对话标题、URL、conversation ID、尾部锚点和少量尾部文字预览。
- 请把 State 文件当作私密聊天归档保管，不要随意上传、提交到 GitHub 或转发。
- 清除浏览器站点数据、浏览器配置或扩展本地数据，可能导致未导出的本地缓存丢失。

更多说明见 [`PRIVACY.md`](PRIVACY.md)。

## 当前能力

- 完整导出 Markdown / JSON。
- 导出文件名包含日期和导出时间。
- Markdown 带 YAML front matter。
- 不伪造单条消息原始时间；无法可靠读取时会标记 `message_timestamps_available: false`。
- 完整导出时同时生成 `.rescue-state.json`。
- 支持真正的 state-first 增量扫描。
- 增量扫描只使用本轮扫描缓存寻找旧尾巴，不使用旧全局缓存冒充匹配结果。
- 至少连续匹配 3 条旧尾巴锚点才允许导出。
- 载入同一轮旧 JSON 后，可生成新的 `combined-full` 完整归档。
- 没有旧 JSON 时，只生成 patch 和 patch-only state，不假装已经得到完整归档。
- 找不到稳定锚点时安全失败，不导出错误拼接文件。

## 安装

### Edge

1. 打开 `edge://extensions/`。
2. 开启“开发人员模式”。
3. 点击“加载解压缩的扩展”。
4. 选择本仓库文件夹。
5. 打开或刷新 ChatGPT 对话页。

### Chrome

1. 打开 `chrome://extensions/`。
2. 开启“开发者模式”。
3. 点击“加载已解压的扩展程序”。
4. 选择本仓库文件夹。
5. 打开或刷新 ChatGPT 对话页。

面板标题应显示 `猫茶抢救器 v0.4.2`。

升级旧版本时，建议先关闭旧扩展和所有 ChatGPT 标签页，再重新加载扩展并打开对话。

## 最快上手

### 第一次完整导出

1. 打开一个具体 ChatGPT 对话。
2. 点击 `温和上滚`，等待扩展把需要的历史消息抓进完整缓存。
3. 点击 `导出 JSON`，保存 JSON 和同批生成的 State。
4. 需要易读文本时，再点击 `导出 MD`。

下一轮增量最好保存这一对文件：

```text
上一次完整导出的 .json
同一轮完整导出的 .rescue-state.json
```

### 后续增量导出

1. 点击 `载入 State`，选择上一次完整导出的 `.rescue-state.json`。
2. 点击 `载入旧 JSON`，选择与该 State 同一轮导出的完整 `.json`。
3. 点击 `增量扫描`。
4. 扩展会自动跳到底部，从底部向上建立本轮扫描缓存。
5. 找到至少 3 条连续旧尾巴锚点后停止并导出。

成功后通常会得到：

```text
*.incremental.patch.json
*.incremental.patch.md
*.incremental.combined-full.json
*.incremental.combined-full.md
*.incremental.rescue-state.json
```

下一轮继续使用最新的：

```text
combined-full.json
rescue-state.json
```

## 各文件用途

- `.patch.md` / `.patch.json`：只包含本轮新增尾巴，适合快速检查切分是否正确。
- `.combined-full.md` / `.combined-full.json`：旧完整 JSON 加本轮新增消息，可作为新的完整归档。
- `.rescue-state.json`：下一轮增量定位所需的尾部坐标文件。
- `.patch-only.rescue-state.json`：只描述本轮扫描结果，不代表旧完整归档。

State 不是旧全文，不能单独恢复完整历史。

## 增量失败时

找不到至少 3 条连续旧尾巴锚点时，扩展会停止且不导出文件。

常见原因：

- 载入了另一个对话的 State。
- 旧 JSON 和 State 不是同一轮导出。
- 当前页面还没有加载到旧尾巴附近。
- ChatGPT 页面中的尾部内容发生了变化。
- 新增消息太多，默认扫描仍未走到旧锚点。

可以切到 `慢速` 或 `普通` 后重试，或先手动滚到接近旧尾巴的位置。

## 重要限制

- 最安全的使用位置是具体的 `/c/<conversation-id>` 对话页。
- 如果导出文件名中的 ID 显示为 `unknown-...`，不要直接拿它做高价值增量合并；请刷新并确认自己位于具体对话页。
- 当前主要导出文字消息，不保证完整导出图片、附件、画布或其他富媒体内容。
- 单条消息的 `capturedAt` 是插件捕获时间，不是消息原始发送时间。
- 当前 Markdown 角色标题仍使用项目原始的中文显示名“主人 / 猫猫”；这只是显示文本，后续可改成可配置项。
- 页面 DOM 改版后，选择器和滚动逻辑可能需要更新。

## 输出示例

完整 Markdown 导出：

```text
catchat-YYYY-MM-DD-v042-<conversation_id>-<timestamp>.md
catchat-YYYY-MM-DD-v042-<conversation_id>-<timestamp>.rescue-state.json
```

完整 JSON 导出：

```text
catchat-YYYY-MM-DD-v042-<conversation_id>-<timestamp>.json
catchat-YYYY-MM-DD-v042-<conversation_id>-<timestamp>.rescue-state.json
```

## 开发检查

仓库带有最小 GitHub Actions 检查：

- `node --check content.js`
- `node --check background.js`
- 解析并校验 `manifest.json`

本地也可以直接运行同样的命令。

## 授权状态

当前仓库暂未提供软件许可证。公开可见不等于授予复制、修改、再发布或商业使用的许可；后续授权方式由仓库作者另行决定。
