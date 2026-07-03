# CatChat Rescuer Clean v0.3.8

CatChat Rescuer 是用于抢救超长 ChatGPT 对话的本地 Edge/Chrome 扩展。

当前版本在 v0.3.7 的 rescue-state 地基上，增加了一个可测试的“增量补丁导出”流程。

## 当前能力

- 保留完整导出 MD / JSON。
- 导出文件名包含日期。
- Markdown 增加 YAML front matter。
- Markdown 明确写入 `date`、`exported_at`、`timezone`。
- 如果没有可靠的原始单条消息时间戳，会标记 `message_timestamps_available: false`，不编造时间。
- 导出 MD / JSON 时会同时下载 `.rescue-state.json`。
- 单独按钮：`导出 State`。
- 新增按钮：`载入 State`。
- 新增按钮：`导出增量`。

## 重要说明

v0.3.8 的“导出增量”是 **incremental patch export / 增量补丁导出**，不是直接覆盖或修改旧文件。

也就是说：

- 它会读取上一次完整导出的 `.rescue-state.json`。
- 在当前已捕获消息里寻找旧 tail anchors。
- 匹配成功后，只导出锚点之后的新消息。
- 它会下载一个独立的 incremental `.json`、incremental `.md`，以及新的 `.rescue-state.json`。
- 它不会直接修改旧 `.md` / `.json`，避免误覆盖。

## 增量测试流程

推荐先用中等窗口测试。

1. 用 v0.3.8 打开同一个中等窗口。
2. 确认之前已经做过一次完整导出，并保存了 `.rescue-state.json`。
3. 继续在这个窗口新增 1–3 条消息。
4. 点 `抓当前屏`，把最新尾巴抓进缓存。
5. 点 `载入 State`，选择上一次完整导出的 `.rescue-state.json`。
6. 点 `导出增量`。
7. 如果匹配成功，会下载：

```text
catchat-YYYY-MM-DD-v038-<conversation_id>-<timestamp>-incremental.json
catchat-YYYY-MM-DD-v038-<conversation_id>-<timestamp>-incremental.md
catchat-YYYY-MM-DD-v038-<conversation_id>-<timestamp>-incremental.rescue-state.json
```

## 增量失败时

如果找不到旧尾巴锚点，会显示失败并停止，不会硬拼接，也不会修改旧归档。

常见原因：

- 载入了别的窗口的 `.rescue-state.json`。
- 当前页面还没抓到旧尾巴附近的消息。
- ChatGPT 当前可见尾巴和旧导出尾巴不一致。

可以先在当前窗口底部点一次 `抓当前屏`，或手动滚到旧尾巴附近再抓一次。

## 当前输出

点击 `导出 MD` 时，会下载：

```text
catchat-YYYY-MM-DD-v038-<conversation_id>-<timestamp>.md
catchat-YYYY-MM-DD-v038-<conversation_id>-<timestamp>.rescue-state.json
```

点击 `导出 JSON` 时，会下载：

```text
catchat-YYYY-MM-DD-v038-<conversation_id>-<timestamp>.json
catchat-YYYY-MM-DD-v038-<conversation_id>-<timestamp>.rescue-state.json
```

点击 `导出 State` 时，只下载：

```text
catchat-YYYY-MM-DD-v038-<conversation_id>-<timestamp>.rescue-state.json
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

这些 tail anchors 用于增量补丁导出。

## 安装建议

1. 打开 `edge://extensions/`。
2. 删除或关闭旧版 CatChat Rescuer。
3. 关闭所有 ChatGPT 标签页。
4. 重新加载本仓库文件夹作为 unpacked extension。
5. 重新打开 ChatGPT。
6. 面板标题应显示 `猫茶抢救器 v0.3.8`。

## v0.3.6 修复保留

v0.3.6 修复过 v0.3.4 / v0.3.5 的 `content.js` 语法问题：`startTotalTimer()` 后多了一个 `}`，导致浏览器报：

```text
Uncaught SyntaxError: Unexpected token 'function'
```

v0.3.8 保留这个语法修复和既有捕获/上滚逻辑。

## 后续计划

下一阶段可以再实现：

- 更自动化的旧文件合并。
- 更清楚的补丁预览。
- 更完整的跨窗口 / 无缓存锚点查找流程。

