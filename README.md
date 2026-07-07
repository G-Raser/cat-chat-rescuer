# CatChat Rescuer Clean v0.4.1

CatChat Rescuer 是用于抢救超长 ChatGPT 对话的本地 Edge/Chrome 扩展。

当前版本把增量流程改成更严格的 **state-first incremental scan**：先载入上一次完整导出的 `.rescue-state.json`，再由插件从当前窗口底部开始自动向上扫描，直到找到旧 tail anchors。

## 当前能力

- 保留完整导出 MD / JSON。
- 导出文件名包含日期。
- Markdown 增加 YAML front matter。
- Markdown 明确写入 `date`、`exported_at`、`timezone`。
- 如果没有可靠的原始单条消息时间戳，会标记 `message_timestamps_available: false`，不编造时间。
- 导出 MD / JSON 时会同时下载 `.rescue-state.json`。
- 单独按钮：`导出 State`。
- 增量按钮：`载入 State`。
- 增量按钮：`增量扫描`。
- 增量扫描会从底部开始向上自动抓取，直到找到旧 state 的 tail anchors。
- v0.4.1 要求至少连续匹配 3 条旧尾巴锚点；只匹配 1–2 条会继续扫描，不会导出。
- 增量匹配成功后，会同时导出 incremental patch 和 combined full archive。

## 重要说明

v0.4.1 的正确顺序是：

1. 先点 `载入 State`，选择上一次完整导出的 `.rescue-state.json`。
2. 再点 `增量扫描`。
3. 插件会自动跳到底部，从底部向上抓取新增消息。
4. 找到至少 3 条连续旧尾巴锚点后停止扫描。
5. 导出 patch、combined-full 和新的 rescue-state。

这版不要求你只点 `抓当前屏`，因为新增消息可能有很多屏。

## 为什么要 3 条锚点

旧版本可能因为只撞上一条重复短消息，就误以为已经找到旧尾巴，导致“没找到稳定锚点也导出”。v0.4.1 改成至少 3 条连续锚点，弱匹配会显示在状态栏里，但不会触发导出。

## 增量测试流程

推荐先用中等窗口测试。

1. 用 v0.4.1 打开同一个中等窗口。
2. 确认之前已经做过一次完整导出，并保存了 `.rescue-state.json`。
3. 继续在这个窗口新增多条消息。
4. 点 `载入 State`，选择上一次完整导出的 `.rescue-state.json`。
5. 点 `增量扫描`。
6. 等插件从底部自动向上找旧尾巴锚点。

匹配成功后会下载：

```text
catchat-YYYY-MM-DD-v041-<conversation_id>-<timestamp>-incremental.patch.json
catchat-YYYY-MM-DD-v041-<conversation_id>-<timestamp>-incremental.patch.md
catchat-YYYY-MM-DD-v041-<conversation_id>-<timestamp>-incremental.combined-full.json
catchat-YYYY-MM-DD-v041-<conversation_id>-<timestamp>-incremental.combined-full.md
catchat-YYYY-MM-DD-v041-<conversation_id>-<timestamp>-incremental.rescue-state.json
```

## 结果怎么用

- `.patch.md` / `.patch.json`：只看新增尾巴，适合快速检查增量是否切对。
- `.combined-full.md` / `.combined-full.json`：可以作为新的完整归档版本保存。
- `.rescue-state.json`：下一轮增量继续用的新 state。

## 增量失败时

如果找不到至少 3 条连续旧尾巴锚点，会显示失败并停止，不会硬拼接，也不会修改旧归档。

常见原因：

- 载入了别的窗口的 `.rescue-state.json`。
- 当前窗口没有加载到旧 tail anchors 附近。
- ChatGPT 当前可见尾巴和旧导出尾巴不一致。
- 新增消息太多，扫描步数仍不够。

可以切到 `慢速` 或 `普通` 再试，或者手动滚到接近旧尾巴附近后再点 `增量扫描`。

## 当前完整导出输出

点击 `导出 MD` 时，会下载：

```text
catchat-YYYY-MM-DD-v041-<conversation_id>-<timestamp>.md
catchat-YYYY-MM-DD-v041-<conversation_id>-<timestamp>.rescue-state.json
```

点击 `导出 JSON` 时，会下载：

```text
catchat-YYYY-MM-DD-v041-<conversation_id>-<timestamp>.json
catchat-YYYY-MM-DD-v041-<conversation_id>-<timestamp>.rescue-state.json
```

点击 `导出 State` 时，只下载：

```text
catchat-YYYY-MM-DD-v041-<conversation_id>-<timestamp>.rescue-state.json
```

## 安装建议

1. 打开 `edge://extensions/`。
2. 删除或关闭旧版 CatChat Rescuer。
3. 关闭所有 ChatGPT 标签页。
4. 重新加载本仓库文件夹作为 unpacked extension。
5. 重新打开 ChatGPT。
6. 面板标题应显示 `猫茶抢救器 v0.4.1`。

## 后续计划

下一阶段可以再实现：

- 支持载入旧 JSON，即使本地缓存没了也能合并旧完整 JSON + 新尾巴。
- 更清楚的补丁预览。
- 更完整的跨窗口 / 无缓存锚点查找流程。
