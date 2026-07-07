# CatChat Rescuer Clean v0.4.2

CatChat Rescuer 是用于抢救超长 ChatGPT 对话的本地 Edge/Chrome 扩展。

当前版本把增量流程改成真正的 **state-first incremental scan**：先载入上一次完整导出的 `.rescue-state.json`，再由插件从当前窗口底部开始建立本轮扫描缓存，自动向上扫描，直到本轮实际抓到至少 3 条连续旧 tail anchors。

## 当前能力

- 保留完整导出 MD / JSON。
- 导出文件名包含日期。
- Markdown 增加 YAML front matter。
- Markdown 明确写入 `date`、`exported_at`、`timezone`。
- 如果没有可靠的原始单条消息时间戳，会标记 `message_timestamps_available: false`，不编造时间。
- 导出 MD / JSON 时会同时下载 `.rescue-state.json`。
- 单独按钮：`导出 State`。
- 增量按钮：`载入 State`。
- 增量按钮：`载入旧 JSON`。
- 增量按钮：`增量扫描`。
- 增量扫描只用本轮扫描缓存匹配旧 state 的 tail anchors，不再用旧本地缓存判断锚点。
- v0.4.2 要求至少连续匹配 3 条旧尾巴锚点；只匹配 1–2 条会继续扫描，不会导出。
- 载入旧 JSON 后，增量匹配成功会导出 incremental patch、combined full archive 和新的 rescue-state。
- 未载入旧 JSON 时，只导出 patch 和 patch-only rescue-state，不假装生成完整合并归档。

## 重要说明

v0.4.2 的正确顺序是：

1. 先点 `载入 State`，选择上一次完整导出的 `.rescue-state.json`。
2. 如果要生成真正完整合并归档，再点 `载入旧 JSON`，选择同一轮上一次完整导出的 `.json`。
3. 再点 `增量扫描`。
4. 插件会自动跳到底部，从底部向上抓取本轮扫描消息。
5. 找到至少 3 条连续旧尾巴锚点后停止扫描。
6. 有旧 JSON 时导出 patch、combined-full 和新的 rescue-state；没有旧 JSON 时只导出 patch 和 patch-only rescue-state。

这版不要求你只点 `抓当前屏`，因为新增消息可能有很多屏。

## 为什么要 3 条锚点

旧版本可能因为只撞上一条重复短消息，就误以为已经找到旧尾巴，导致“没找到稳定锚点也导出”。v0.4.2 仍然要求至少 3 条连续锚点，弱匹配会显示在状态栏里，但不会触发导出。

## 增量测试流程

推荐先用中等窗口测试。

1. 用 v0.4.2 打开同一个中等窗口。
2. 确认之前已经做过一次完整导出，并保存了 `.rescue-state.json`。
3. 继续在这个窗口新增多条消息。
4. 点 `载入 State`，选择上一次完整导出的 `.rescue-state.json`。
5. 如需 combined-full，点 `载入旧 JSON`，选择上一次完整导出的 `.json`。
6. 点 `增量扫描`。
7. 等插件从底部自动向上找旧尾巴锚点。

匹配成功后会下载：

```text
catchat-YYYY-MM-DD-v042-<conversation_id>-<timestamp>-incremental.patch.json
catchat-YYYY-MM-DD-v042-<conversation_id>-<timestamp>-incremental.patch.md
catchat-YYYY-MM-DD-v042-<conversation_id>-<timestamp>-incremental.combined-full.json
catchat-YYYY-MM-DD-v042-<conversation_id>-<timestamp>-incremental.combined-full.md
catchat-YYYY-MM-DD-v042-<conversation_id>-<timestamp>-incremental.rescue-state.json
```

如果没有载入旧 JSON，则不会生成 `combined-full`，只会额外下载：

```text
catchat-YYYY-MM-DD-v042-<conversation_id>-<timestamp>-incremental.patch-only.rescue-state.json
```

## 结果怎么用

- `.patch.md` / `.patch.json`：只看新增尾巴，适合快速检查增量是否切对。
- `.combined-full.md` / `.combined-full.json`：可以作为新的完整归档版本保存。
- `.rescue-state.json`：下一轮增量继续用的新 state。
- `.patch-only.rescue-state.json`：只描述本轮扫描结果，不代表旧完整归档。

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
catchat-YYYY-MM-DD-v042-<conversation_id>-<timestamp>.md
catchat-YYYY-MM-DD-v042-<conversation_id>-<timestamp>.rescue-state.json
```

点击 `导出 JSON` 时，会下载：

```text
catchat-YYYY-MM-DD-v042-<conversation_id>-<timestamp>.json
catchat-YYYY-MM-DD-v042-<conversation_id>-<timestamp>.rescue-state.json
```

点击 `导出 State` 时，只下载：

```text
catchat-YYYY-MM-DD-v042-<conversation_id>-<timestamp>.rescue-state.json
```

## 安装建议

1. 打开 `edge://extensions/`。
2. 删除或关闭旧版 CatChat Rescuer。
3. 关闭所有 ChatGPT 标签页。
4. 重新加载本仓库文件夹作为 unpacked extension。
5. 重新打开 ChatGPT。
6. 面板标题应显示 `猫茶抢救器 v0.4.2`。

## 后续计划

下一阶段可以再实现：

- 更清楚的补丁预览。
- 更完整的跨窗口 / 无缓存锚点查找流程。
