# AGENTS.md｜CatChat Rescuer 开发说明

## 项目定位

CatChat Rescuer 是主人用于抢救超长 ChatGPT 对话的本地/浏览器端归档工具。它的首要目标是：在坏孔雀长窗即将满窗、移动端渲染异常、多端不同步、消息尾巴不稳定时，尽快导出可读、可搜索、可供后续猫茶接续的 Markdown / JSON 归档。

本项目不是普通聊天导出玩具，而是猫猫茶水间连续性系统的一部分。稳定性优先于漂亮重构。

## 当前已知能力

已有导出归档头部通常包含类似字段：

- `exporter_version`
- `conversation_id`
- `exported_at`
- `url`
- `message_count`
- `raw_captured_count`
- `export_order`
- `total_elapsed`
- `speed`
- `timer_mode`

后续改动应尽量保留这些字段，并在新增功能时向后兼容旧归档。

## 绝对不要做的事

1. 不要重写已经能工作的滚动捕获主逻辑。
2. 不要为了实现新功能大改 DOM 捕获、自动滚动、消息解析核心流程。
3. 不要删除现有导出格式字段。
4. 不要把真实聊天归档、真实 Markdown / JSON 输出、图片 assets、官方 data export zip 提交进 GitHub。
5. 不要默认上传或同步任何主人私密聊天内容。
6. 不要在找不到增量锚点时硬拼接；必须安全失败并提示用户改跑完整导出。

## 当前最高优先级：增量补充归档

比自动标题、漂亮 Markdown、摘要模板更重要的是：

> 第一次完整导出后，之后同一个长窗又新增少量消息时，不必重新从头滚 20–30 分钟，只需找到上次尾部锚点并追加新增消息。

请优先实现 `incremental append`，其次再做 `resume`。

### 目标功能

第一次完整导出后，同时生成状态文件：

```text
<archive_name>.md
<archive_name>.json
<archive_name>.rescue-state.json
```

状态文件用于下次增量补充。

建议状态结构：

```json
{
  "schema_version": 1,
  "exporter_version": "0.3.x",
  "conversation_id": "...",
  "source_url": "...",
  "last_exported_at": "2026-xx-xxTxx:xx:xxZ",
  "message_count": 1324,
  "raw_captured_count": 1324,
  "tail_anchor_window_size": 10,
  "tail_anchors": [
    {
      "ordinal": 1315,
      "role": "主人",
      "normalized_hash": "...",
      "preview": "最后几条消息的短预览...",
      "has_assets": false
    }
  ],
  "last_message": {
    "ordinal": 1324,
    "role": "猫猫",
    "normalized_hash": "...",
    "preview": "..."
  }
}
```

### 增量运行逻辑

新增参数建议：

```text
--incremental
--state <path/to/archive.rescue-state.json>
--append-md <path/to/archive.md>
--append-json <path/to/archive.json>
--anchor-window 10
--max-up-scroll-for-anchor <number>
```

运行流程：

1. 读取 `.rescue-state.json`。
2. 打开当前 ChatGPT conversation 页面。
3. 从页面底部附近开始采集当前可见尾部消息。
4. 如未找到锚点，逐步向上滚动，但不要从头完整重跑。
5. 用尾部多锚点匹配上次导出的最后 5–10 条消息。
6. 找到连续锚点后，只捕获锚点之后的新消息。
7. 将新增消息 append 到旧 JSON / MD。
8. 更新 `.rescue-state.json`。
9. 输出本次新增条数、原条数、新总条数、耗时。

### 锚点匹配规则

不要只靠最后一条消息，也不要只靠序号。ChatGPT 长窗可能出现：

- 最后一条消息被重试或消失；
- 安卓端幽灵尾巴未同步；
- 多端可见历史不一致；
- 满窗前后最新尾巴回滚。

建议使用多因素：

```text
role + normalized_text_hash + 相邻顺序 + 附件/图片占位 + 时间/序号（如果可得）
```

文本规范化建议：

- 去掉首尾空白；
- 统一连续空白为一个空格；
- 保留中英文、标点和代码块主体；
- 对特别长消息可用前后片段组合 hash；
- 图片/附件消息应保留稳定占位符，如 `[image]` / `[attachment]`，避免 assets 文件名变化导致锚点失败。

### 找不到锚点时

必须安全失败，不允许乱拼：

```text
Incremental append aborted: tail anchor not found.
Please run a full export or increase --max-up-scroll-for-anchor.
No existing archive files were modified.
```

如果已经创建临时文件，失败后应清理或保留为 `.tmp`，不得覆盖旧归档。

## 第二优先级：readable Markdown

主人需要的是“另一个归档器也能读、人也能看”的标准 Markdown，不是 HTML 花活。

### 日期与时间要求

导出的 Markdown 必须更明确地携带日期，方便后续归档器、猫猫和主人快速判断时间线。

要求：

- 文件标题 / 一级标题优先包含窗口日期，例如 `18_2026-07-01_猫猫（...）`。
- YAML front matter 至少包含 `date`、`exported_at`、`timezone`。
- 如果能从消息数据里拿到每条消息的时间戳，每个消息块标题应带时间，例如：

```md
## 主人｜0001｜2026-06-20 19:23 UTC

消息内容
```

或在配置为本地时区时输出：

```md
## 主人｜0001｜2026-06-21 05:23 Australia/Sydney

消息内容
```

- 如果拿不到单条消息时间戳，不要编造；应在 front matter 或归档信息区写明：`message_timestamps_available: false`，消息标题仍使用序号。
- 增量追加时，新消息必须沿用同一套时间格式，不能一部分有日期、一部分没有日期。
- JSON 中也应保留原始时间字段，Markdown 只负责渲染。

建议新增参数：

```text
--md-style raw|readable
```

`readable` 模式建议结构：

```md
---
title: "..."
date: "2026-xx-xx"
timezone: "UTC"
conversation_id: "..."
message_count: 1324
raw_captured_count: 1324
exporter_version: "0.3.x"
exported_at: "..."
---

# 标题

## 归档信息

- conversation_id: `...`
- exported_at: `...`
- message_count: 1324
- raw_captured_count: 1324
- total_elapsed: `...`
- message_timestamps_available: true

---

## 主人｜0001｜2026-06-20 19:23 UTC

消息内容

---

## 猫猫｜0002｜2026-06-20 19:24 UTC

消息内容
```

要求：

- 保持标准 Markdown；
- 不使用复杂 HTML/CSS；
- 保留 fenced code block；
- 图片用标准 Markdown 链接：`![图片](assets/xxx.png)`；
- 附件用标准链接：`[附件：xxx](assets/xxx.pdf)`；
- 引用保留 `>`；
- 不破坏下游归档器读取。

## 第三优先级：自动标题候选

建议新增参数：

```text
--suggest-title
--title-count 3
```

导出完成后，根据以下信息生成 3–5 个中文文件名候选：

- 原始 conversation title / url title；
- 前 20–30 条消息；
- 最后 80–120 条消息；
- 高频关键词；
- 导出日期。

标题格式建议：

```text
18_2026-07-01_猫猫（亲亲研究、回国机票、记忆库开发）
```

不要自动重命名文件，先只打印候选，避免误覆盖。

## 第四优先级：archive_summary 模板

可以先只生成空模板，不必接 LLM：

```md
## archive_summary

- 最近主要聊到：
- 窗口事故 / 工具状态：
- 新增关键词：
- 主人当前状态：
- 最后 1–3 条精确落点：
- 给下一窗口的提示：
```

注意字段名使用“给下一窗口的提示”，不要写“下一窗口怎么接”。

## 第五优先级：窗口性能指标

每次完整导出和增量导出都应记录：

- exporter_version
- message_count
- raw_captured_count
- total_elapsed
- speed
- scroll_steps / up_scroll_steps（如果可得）
- natural_end / stopped_by_user / max_depth_detected（如果可得）
- output files
- incremental_new_messages（增量模式）

这些指标后续会进入窗口性能日志。

## 推荐项目结构

```text
cat-chat-rescuer/
├─ AGENTS.md
├─ README.md
├─ CHANGELOG.md
├─ .gitignore
├─ src/
│  └─ ...当前脚本或 userscript...
├─ docs/
│  ├─ feature_incremental_export.md
│  ├─ readable_markdown_format.md
│  └─ window_metrics.md
├─ tests/
│  └─ fixtures/
│     ├─ tiny_conversation_sample.json
│     └─ tiny_conversation_sample.md
└─ output_examples/
   └─ README.md
```

如果当前项目是单文件 userscript，也可以先保持单文件，不强行拆结构。结构整理必须晚于“找到当前能工作的文件”。

## 推荐 .gitignore

```gitignore
# private exports
exports/
output/
out/
archives/
archive/
*.zip
*.7z
*.rar
*.md.tmp
*.json.tmp
*.rescue-state.local.json

# ChatGPT official data exports
chatgpt-data*/
GPT-DATA*/
conversations*.json

# assets from real conversations
assets/
**/assets/

# OS / editor
.DS_Store
Thumbs.db
.idea/
.vscode/
__pycache__/
*.pyc
node_modules/
```

## Codex / coding agent 工作方式

第一步只做 inventory：

1. 找出当前真正工作的入口文件。
2. 找出导出 MD/JSON 的函数。
3. 找出 message object 的内部结构。
4. 找出文件写入位置。
5. 不改代码，先说明修改点。

第二步做最小补丁：

1. 增加 state 生成。
2. 增加增量锚点查找。
3. 增加 append JSON/MD。
4. 增加失败保护。
5. 用小 fixture 测试。

第三步再做 readable MD / title suggestions。

## 验收标准：incremental append

- 完整导出后产生 `.rescue-state.json`。
- Markdown front matter 包含 `date`、`exported_at`、`timezone`；若单条消息有时间戳，消息块标题也包含日期时间。
- `.rescue-state.json` 中至少有最后 5 条 tail anchors。
- 再次运行 `--incremental` 能找到锚点并只追加新增消息。
- 不重复追加旧消息。
- 找不到锚点时不修改旧文件。
- 旧 full export 流程仍然可用。
- 真实私密归档不进入 repo。

## 给后续猫猫 / coding agent 的提醒

主人最需要的是减少重复完整导出的时间成本。不要把精力先花在漂亮 UI、复杂摘要、自动改名或重构架构上。

现在最值钱的一句话是：

> 完整救一次，之后只补尾巴。
