# CatChat Rescuer Clean v0.3.7

CatChat Rescuer 是用于抢救超长 ChatGPT 对话的本地 Edge/Chrome 扩展。

当前版本在 v0.3.6 稳定捕获逻辑上做了小步增强：

- 保留完整导出 MD / JSON。
- 导出文件名包含日期。
- Markdown 增加 YAML front matter。
- Markdown 明确写入 `date`、`exported_at`、`timezone`。
- 如果没有可靠的原始单条消息时间戳，会标记 `message_timestamps_available: false`，不编造时间。
- 导出 MD / JSON 时会同时下载 `.rescue-state.json`。
- 新增单独按钮：`导出 State`。

## 重要说明

当前 v0.3.7 只是 **Stage 1：生成 rescue-state**。

它还没有真正实现“读取旧 state 后自动增量 append 到旧文件”。

也就是说：

- 现在可以完整导出并生成尾部锚点状态文件。
- 后续 Codex / 猫猫可以基于 `.rescue-state.json` 实现真正的增量补充。

## 当前输出

点击 `导出 MD` 时，会下载：

```text
catchat-YYYY-MM-DD-v037-<conversation_id>-<timestamp>.md
catchat-YYYY-MM-DD-v037-<conversation_id>-<timestamp>.rescue-state.json
```

点击 `导出 JSON` 时，会下载：

```text
catchat-YYYY-MM-DD-v037-<conversation_id>-<timestamp>.json
catchat-YYYY-MM-DD-v037-<conversation_id>-<timestamp>.rescue-state.json
```

点击 `导出 State` 时，只下载：

```text
catchat-YYYY-MM-DD-v037-<conversation_id>-<timestamp>.rescue-state.json
```

## rescue-state 内容

`.rescue-state.json` 会保存：

- schema version
- exporter version
- conversation id
- source URL
- title
- exported time
- message count
- raw captured count
- export order
- total elapsed
- last 5–10 messages as tail anchors
- last message anchor
- output file names

这些 tail anchors 用于后续增量补充归档。

## 安装建议

1. 打开 `edge://extensions/`。
2. 删除或关闭旧版 CatChat Rescuer。
3. 关闭所有 ChatGPT 标签页。
4. 重新加载本仓库文件夹作为 unpacked extension。
5. 重新打开 ChatGPT。
6. 面板标题应显示 `猫茶抢救器 v0.3.7`。

## v0.3.6 修复保留

v0.3.6 修复过 v0.3.4 / v0.3.5 的 `content.js` 语法问题：`startTotalTimer()` 后多了一个 `}`，导致浏览器报：

```text
Uncaught SyntaxError: Unexpected token 'function'
```

v0.3.7 保留这个语法修复和既有捕获/上滚逻辑。

## 后续计划

下一阶段再实现：

- 读取 `.rescue-state.json`。
- 从当前对话底部查找 tail anchors。
- 只导出锚点后的新增消息。
- 找不到锚点时安全失败，不修改旧归档。

