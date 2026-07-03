请接手 CatChat Rescuer 项目，只做小步安全改良，不要重写已经能工作的捕获主逻辑。

当前最高优先级：实现“增量补充归档 / incremental append”。

背景：
CatChat Rescuer 用来导出超长 ChatGPT 对话。现在完整导出长窗经常需要 20–30 分钟。第一次完整导出后，如果同一个窗口后续只新增几十条消息，希望再次运行时能从底部附近找到上次导出的尾部锚点，只追加新增消息，而不是重新从头滚完整窗口。

请先阅读仓库里的 AGENTS.md，再做代码 inventory。

请按以下顺序工作：

1. 找到当前真正工作的入口文件和导出逻辑。
2. 不改代码，先总结：消息数据结构、MD/JSON 写入位置、能否拿到 conversation_id、是否有 message id。
3. 实现完整导出后生成 `<archive>.rescue-state.json`。
4. state 中保存 conversation_id、message_count、最后 5–10 条消息的 role、preview、normalized_hash。
5. 增加 `--incremental --state <file>` 或等价 UI / 参数。
6. 增量模式从底部附近采集消息，向上寻找 tail anchors。
7. 找到锚点后，只把锚点后的新消息 append 到旧 MD/JSON。
8. 找不到锚点时安全失败，不修改旧文件。
9. 保留旧完整导出流程不变。
10. 加一个极小 fake fixture 测试，不要提交真实聊天归档。

后续可选功能：
- `--md-style readable`：输出结构更清晰但仍标准的 Markdown。
- readable Markdown 必须带日期：front matter 包含 `date/exported_at/timezone`；如果每条消息有时间戳，消息标题写成 `## 主人｜0001｜2026-06-20 19:23 UTC`；如果拿不到时间戳，明确写 `message_timestamps_available: false`，不要编造。
- `--suggest-title`：导出后打印中文标题候选，不自动改名。
- archive_summary 模板：在 MD 顶部留空模板。

禁止：
- 不要把真实导出归档、真实 assets、官方 data export zip 提交到 repo。
- 不要大重构滚动捕获主逻辑。
- 不要找不到锚点时硬拼接。
