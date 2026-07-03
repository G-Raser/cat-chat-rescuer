# CatChat Rescuer Clean v0.3.9

CatChat Rescuer 是用于抢救超长 ChatGPT 对话的本地 Edge/Chrome 扩展。

当前版本在 v0.3.8 的增量补丁导出基础上，进一步增加了“增量成功后自动导出合并完整归档”。

## 当前能力

- 保留完整导出 MD / JSON。
- 导出文件名包含日期。
- Markdown 增加 YAML front matter。
- Markdown 明确写入 `date`、`exported_at`、`timezone`。
- 如果没有可靠的原始单条消息时间戳，会标记 `message_timestamps_available: false`，不编造时间。
- 导出 MD / JSON 时会同时下载 `.rescue-state.json`。
- 单独按钮：`导出 State`。
- 增量按钮：`载入 State`。
- 增量按钮：`导出增量`。
- 增量匹配成功后，会同时导出 incremental patch 和 combined full archive。

## 重要说明

v0.3.9 的 `导出增量` 会读取上一次完整导出的 `.rescue-state.json`，在当前已捕获消息里寻找旧 tail anchors。匹配成功后，它会导出两类文件：

1. **incremental patch**：只包含锚点之后的新消息。
2. **combined full archive**：包含当前缓存里的完整消息，也就是旧内容 + 新内容。

它仍然不会直接覆盖旧 `.md` / `.json`，避免误写坏旧归档。

## 增量测试流程

推荐先用中等窗口测试。

1. 用 v0.3.9 打开同一个中等窗口。
2. 确认之前已经做过一次完整导出，并保存了 `.rescue-state.json`。
3. 继续在这个窗口新增 1–3 条消息。
4. 点 `抓当前屏`，把最新尾巴抓进缓存。
5. 点 `载入 State`，选择上一次完整导出的 `.rescue-state.json`。
6. 点 `导出增量`。

匹配成功后会下载：

```text
catchat-YYYY-MM-DD-v039-<conversation_id>-<timestamp>-incremental.patch.json
catchat-YYYY-MM-DD-v039-<conversation_id>-<timestamp>-incremental.patch.md
catchat-YYYY-MM-DD-v039-<conversation_id>-<timestamp>-incremental.combined-full.json
catchat-YYYY-MM-DD-v039-<conversation_id>-<timestamp>-incremental.combined-full.md
catchat-YYYY-MM-DD-v039-<conversation_id>-<timestamp>-incremental.rescue-state.json
```

## 结果怎么用

- `.patch.md` / `.patch.json`：只看新增尾巴，适合快速检查增量是否切对。
- `.combined-full.md` / `.combined-full.json`：可以作为新的完整归档版本保存。
- `.rescue-state.json`：下一轮增量继续用的新 state。

## 增量失败时

如果找不到旧尾巴锚点，会显示失败并停止，不会硬拼接，也不会修改旧归档。

常见原因：

- 载入了别的窗口的 `.rescue-state.json`。
- 当前页面还没抓到旧尾巴附近的消息。
- ChatGPT 当前可见尾巴和旧导出尾巴不一致。

可以先在当前窗口底部点一次 `抓当前屏`，或手动滚到旧尾巴附近再抓一次。

## 当前完整导出输出

点击 `导出 MD` 时，会下载：

```text
catchat-YYYY-MM-DD-v039-<conversation_id>-<timestamp>.md
catchat-YYYY-MM-DD-v039-<conversation_id>-<timestamp>.rescue-state.json
```

点击 `导出 JSON` 时，会下载：

```text
catchat-YYYY-MM-DD-v039-<conversation_id>-<timestamp>.json
catchat-YYYY-MM-DD-v039-<conversation_id>-<timestamp>.rescue-state.json
```

点击 `导出 State` 时，只下载：

```text
catchat-YYYY-MM-DD-v039-<conversation_id>-<timestamp>.rescue-state.json
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

这些 tail anchors 用于下一轮增量导出。

## 安装建议

1. 打开 `edge://extensions/`。
2. 删除或关闭旧版 CatChat Rescuer。
3. 关闭所有 ChatGPT 标签页。
4. 重新加载本仓库文件夹作为 unpacked extension。
5. 重新打开 ChatGPT。
6. 面板标题应显示 `猫茶抢救器 v0.3.9`。

## v0.3.6 修复保留

v0.3.6 修复过 v0.3.4 / v0.3.5 的 `content.js` 语法问题：`startTotalTimer()` 后多了一个 `}`，导致浏览器报：

```text
Uncaught SyntaxError: Unexpected token 'function'
```

v0.3.9 保留这个语法修复和既有捕获/上滚逻辑。

## 后续计划

下一阶段可以再实现：

- 支持载入旧 JSON，即使本地缓存没了也能合并旧完整 JSON + 新尾巴。
- 更清楚的补丁预览。
- 更完整的跨窗口 / 无缓存锚点查找流程。

