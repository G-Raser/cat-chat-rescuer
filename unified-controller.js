(() => {
  if (globalThis.__CCR_UNIFIED_CONTROLLER__) return;
  globalThis.__CCR_UNIFIED_CONTROLLER__ = true;
  globalThis.__CCR_THINKING_EXPORT_V2__ = true;

  const PANEL_ID = "catchat-rescuer-v030-panel";
  const BODY_ID = "ccr-unified-body";
  const THINKING_SECTION_ID = "ccr-thinking-section";
  const DISPLAYED_THINKING_TYPES = new Set(["thoughts", "reasoning_recap"]);
  const VERSION = chrome.runtime.getManifest().version;
  const COLLAPSE_KEY = "catchat-rescuer-panel-collapsed";
  const QUICK_COLLAPSE_KEY = "catchat-rescuer-quick-collapsed";
  const THINKING_COLLAPSE_KEY = "catchat-rescuer-thinking-collapsed";
  const USER_LABEL_KEY = "catchat-rescuer-export-label-user";
  const ASSISTANT_LABEL_KEY = "catchat-rescuer-export-label-assistant";
  const DEFAULT_USER_LABEL = "User";
  const DEFAULT_ASSISTANT_LABEL = "Assistant";

  let cachedConversation = null;
  let cachedNormalized = null;
  let readTimer = null;
  let readStartedAt = 0;
  let legacyParts = null;

  function conversationId() {
    const match = location.pathname.match(/\/c\/([^/?#]+)/);
    if (match) return match[1];
    return document.querySelector("[data-conversation-id]")?.getAttribute("data-conversation-id") || null;
  }

  function projectIdFromPath(pathname = location.pathname) {
    const parts = pathname.split("/").filter(Boolean);
    const index = parts.lastIndexOf("g");
    const value = parts[index + 1];
    return index >= 0 && typeof value === "string" && value.startsWith("g-p-") ? value : null;
  }

  function parseConversationReference(value) {
    const reference = String(value || "").trim();
    if (!reference) return null;
    try {
      const url = new URL(reference);
      if (!["chatgpt.com", "chat.openai.com"].includes(url.hostname)) throw new Error("不是 ChatGPT 对话链接");
      const parts = url.pathname.split("/").filter(Boolean);
      const cIndex = parts.lastIndexOf("c");
      const id = parts[cIndex + 1];
      if (cIndex < 0 || !id) throw new Error("链接里没有找到 /c/ 后面的 conversation ID");
      return { conversationId: id, projectId: projectIdFromPath(url.pathname), label: "链接对话" };
    } catch (error) {
      if (error?.message && !/Invalid URL/i.test(error.message) && /^https?:/i.test(reference)) throw error;
    }
    if (/^[A-Za-z0-9_-]{8,}$/.test(reference)) return { conversationId: reference, projectId: null, label: "指定对话" };
    throw new Error("无法识别这个对话链接或 conversation ID");
  }

  function resolveTarget() {
    const typed = String(document.getElementById("ccr-api-reference")?.value || "").trim();
    if (typed) return parseConversationReference(typed);
    const id = conversationId();
    if (!id) throw new Error("当前页面没有识别到 conversation ID");
    return { conversationId: id, projectId: projectIdFromPath(), label: "当前对话" };
  }

  function requestConversation(target) {
    if (!target?.conversationId) return Promise.reject(new Error("没有可用的 conversation ID"));
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({
        type: "CCR_API_READ",
        conversationId: target.conversationId,
        projectId: target.projectId || null
      }, (response) => {
        if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
        if (response?.ok && response.conversation) resolve(response.conversation);
        else reject(new Error(response?.error || "API 读取失败"));
      });
    });
  }

  function exportLabels() {
    return {
      user: localStorage.getItem(USER_LABEL_KEY)?.trim() || DEFAULT_USER_LABEL,
      assistant: localStorage.getItem(ASSISTANT_LABEL_KEY)?.trim() || DEFAULT_ASSISTANT_LABEL
    };
  }

  function saveExportLabel(key, value) {
    const normalized = String(value || "").trim();
    if (normalized) localStorage.setItem(key, normalized);
    else localStorage.removeItem(key);
  }

  function textFromValue(value) {
    if (typeof value === "string") return value;
    if (!value || typeof value !== "object") return "";
    for (const key of ["text", "content", "summary", "result", "code"]) {
      if (typeof value[key] === "string") return value[key];
    }
    return "";
  }

  function textFromContent(content) {
    if (!content || typeof content !== "object") return "";
    const pieces = [];
    if (Array.isArray(content.parts)) {
      for (const part of content.parts) {
        const text = textFromValue(part).trim();
        if (text) pieces.push(text);
      }
    }
    for (const key of ["text", "content", "summary", "result", "code"]) {
      const text = textFromValue(content[key]).trim();
      if (text) pieces.push(text);
    }
    return [...new Set(pieces)].join("\n\n").trim();
  }

  function currentPath(conversation) {
    const mapping = conversation?.mapping;
    let nodeId = conversation?.current_node;
    if (!mapping || !nodeId || !mapping[nodeId]) throw new Error("API JSON 缺少可用的 mapping/current_node");
    const reversed = [];
    const seen = new Set();
    while (nodeId != null) {
      if (seen.has(nodeId)) throw new Error("API 对话树出现循环");
      const node = mapping[nodeId];
      if (!node) throw new Error(`API 对话树缺少节点 ${nodeId}`);
      seen.add(nodeId);
      reversed.push(nodeId);
      nodeId = node.parent;
    }
    return reversed.reverse();
  }

  function parseThoughtEntries(content) {
    if (!Array.isArray(content?.thoughts)) return [];
    return content.thoughts.map((entry, index) => ({
      index,
      summary: typeof entry?.summary === "string" ? entry.summary.trim() : "",
      content: typeof entry?.content === "string" ? entry.content.trim() : "",
      finished: Boolean(entry?.finished),
      chunks: Array.isArray(entry?.chunks) ? entry.chunks : []
    })).filter((entry) => entry.summary || entry.content || entry.chunks.length);
  }

  function thinkingItem(nodeId, node, pathSet) {
    const message = node?.message;
    if (!message) return null;
    const type = message.content?.content_type || "unknown";
    if (!DISPLAYED_THINKING_TYPES.has(type)) return null;
    const metadata = message.metadata ?? {};
    const common = {
      nodeId,
      messageId: message.id ?? null,
      onCurrentPath: pathSet.has(nodeId),
      sourceType: type,
      createTime: message.create_time ?? null,
      turnExchangeId: metadata.turn_exchange_id ?? null,
      workingTurnId: metadata.working_turn_id ?? null,
      model: metadata.model_slug ?? metadata.resolved_model_slug ?? null,
      content: message.content,
      metadata
    };
    if (type === "thoughts") {
      const entries = parseThoughtEntries(message.content);
      const withBody = entries.find((entry) => entry.content);
      const firstSummary = entries.find((entry) => entry.summary);
      return {
        ...common,
        title: withBody?.summary || firstSummary?.summary || null,
        text: [...new Set(entries.map((entry) => entry.content).filter(Boolean))].join("\n\n").trim(),
        entries
      };
    }
    return {
      ...common,
      title: null,
      text: typeof message.content?.content === "string" ? message.content.content.trim() : "",
      entries: [],
      durationSec: Number.isFinite(metadata.finished_duration_sec) ? metadata.finished_duration_sec : null,
      recapType: metadata.reasoning_recap_type ?? null,
      reasoningStatus: metadata.reasoning_status ?? null
    };
  }

  function buildThinkingTurns(items) {
    const groups = new Map();
    for (const item of items) {
      const key = item.turnExchangeId || item.workingTurnId || `node:${item.nodeId}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(item);
    }
    const turns = [];
    for (const [turnId, group] of groups) {
      group.sort((a, b) => (a.createTime ?? 0) - (b.createTime ?? 0));
      const thoughtItems = group.filter((item) => item.sourceType === "thoughts");
      const recapItems = group.filter((item) => item.sourceType === "reasoning_recap");
      const entries = thoughtItems.flatMap((item) => item.entries || []);
      const withBody = entries.find((entry) => entry.content);
      const firstSummary = entries.find((entry) => entry.summary);
      const text = [...new Set(entries.map((entry) => entry.content).filter(Boolean))].join("\n\n").trim();
      const lastRecap = recapItems.at(-1) || null;
      turns.push({
        turnId,
        onCurrentPath: group.some((item) => item.onCurrentPath),
        createTime: group[0]?.createTime ?? null,
        title: withBody?.summary || firstSummary?.summary || null,
        text,
        summaryOnly: [...new Set(entries.filter((entry) => !entry.content && entry.summary).map((entry) => entry.summary))],
        recapText: lastRecap?.text || null,
        durationSec: lastRecap?.durationSec ?? null,
        model: group.find((item) => item.model)?.model ?? null,
        items: group
      });
    }
    return turns.sort((a, b) => (a.createTime ?? 0) - (b.createTime ?? 0));
  }

  function normalizeConversation(conversation) {
    const mapping = conversation?.mapping || {};
    const path = currentPath(conversation);
    const pathSet = new Set(path);
    const messages = [];
    for (const nodeId of path) {
      const node = mapping[nodeId];
      const message = node?.message;
      if (!message) continue;
      const role = message.author?.role;
      const type = message.content?.content_type || "unknown";
      if (!["user", "assistant"].includes(role)) continue;
      if (DISPLAYED_THINKING_TYPES.has(type)) continue;
      if (message.metadata?.is_visually_hidden_from_conversation) continue;
      const text = textFromContent(message.content);
      if (!text) continue;
      messages.push({ id: message.id || nodeId, nodeId, role, text, createTime: message.create_time ?? null, model: message.metadata?.model_slug ?? null, contentType: type });
    }

    const displayedThinking = [];
    for (const [nodeId, node] of Object.entries(mapping)) {
      const item = thinkingItem(nodeId, node, pathSet);
      if (item) displayedThinking.push(item);
    }
    displayedThinking.sort((a, b) => (a.createTime ?? 0) - (b.createTime ?? 0));
    const thinkingTurns = buildThinkingTurns(displayedThinking);
    const thinkingTurnsOnCurrentPath = thinkingTurns.filter((turn) => turn.onCurrentPath);
    const contentThinkingTurns = thinkingTurns.filter((turn) => Boolean(turn.text));
    const contentThinkingTurnsOnCurrentPath = thinkingTurnsOnCurrentPath.filter((turn) => Boolean(turn.text));

    return {
      title: conversation.title || document.title || "Untitled ChatGPT Conversation",
      conversationId: conversation.conversation_id ?? conversation.id ?? null,
      source: conversation.catchat_api_source ?? { mode: "unknown" },
      messages,
      displayedThinking,
      thinkingTurns,
      thinkingTurnsOnCurrentPath,
      contentThinkingTurns,
      contentThinkingTurnsOnCurrentPath
    };
  }

  function roleLabel(role) {
    const labels = exportLabels();
    return role === "user" ? labels.user : role === "assistant" ? labels.assistant : role;
  }

  function safeFilename(value) {
    return String(value || "chat").replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").replace(/\s+/g, " ").trim().slice(0, 100) || "chat";
  }

  function download(filename, content, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
  }

  function baseName() {
    const date = new Date().toISOString().slice(0, 10);
    return `catchat-api-${date}-${safeFilename(cachedNormalized?.title)}-${cachedNormalized?.conversationId || "unknown"}`;
  }

  function markdownFromNormalized(data) {
    const labels = exportLabels();
    let md = "---\n";
    md += `title: ${JSON.stringify(data.title)}\n`;
    md += `conversation_id: ${JSON.stringify(data.conversationId)}\n`;
    md += `source: ${JSON.stringify("chatgpt_conversation_api_experiment")}\n`;
    md += `api_mode: ${JSON.stringify(data.source?.mode || "unknown")}\n`;
    md += `user_label: ${JSON.stringify(labels.user)}\n`;
    md += `assistant_label: ${JSON.stringify(labels.assistant)}\n`;
    md += `message_count: ${data.messages.length}\n`;
    md += `thinking_turn_current_path_count: ${data.contentThinkingTurnsOnCurrentPath.length}\n`;
    md += `thinking_turn_tree_count: ${data.contentThinkingTurns.length}\n`;
    md += `thinking_raw_turn_count: ${data.thinkingTurns.length}\n`;
    md += "---\n\n";
    md += `# ${data.title}\n\n`;
    for (let i = 0; i < data.messages.length; i += 1) {
      const message = data.messages[i];
      const index = String(i + 1).padStart(4, "0");
      md += `## ${roleLabel(message.role)}｜${index}\n\n${message.text}\n\n`;
    }
    return md;
  }

  function scopeValue() {
    return document.getElementById("ccr-thinking-scope")?.value === "tree" ? "tree" : "current";
  }

  function scopeLabel(scope) {
    return scope === "tree" ? "整棵对话树" : "当前分支";
  }

  function contentThinkingForScope(data, scope) {
    return scope === "tree" ? data.contentThinkingTurns : data.contentThinkingTurnsOnCurrentPath;
  }

  function rawThinkingForScope(data, scope) {
    return scope === "tree" ? data.thinkingTurns : data.thinkingTurnsOnCurrentPath;
  }

  function displayThinkingTitle(turn, index) {
    return turn.title || `思考回合 ${index + 1}`;
  }

  function thinkingMarkdown(data, scope) {
    const turns = contentThinkingForScope(data, scope);
    let md = "---\n";
    md += `title: ${JSON.stringify(data.title)}\n`;
    md += `conversation_id: ${JSON.stringify(data.conversationId)}\n`;
    md += `source: ${JSON.stringify("chatgpt_displayed_thinking")}\n`;
    md += `scope: ${JSON.stringify(scope)}\n`;
    md += `scope_label: ${JSON.stringify(scopeLabel(scope))}\n`;
    md += `thinking_turn_count: ${turns.length}\n`;
    md += `api_mode: ${JSON.stringify(data.source?.mode || "unknown")}\n`;
    md += "---\n\n";
    md += `# ${data.title}｜思考轨迹\n\n`;
    md += `> 范围：${scopeLabel(scope)}｜共 ${turns.length} 个有正文的思考回合\n\n`;
    for (let i = 0; i < turns.length; i += 1) {
      const turn = turns[i];
      md += `## ${String(i + 1).padStart(4, "0")}｜${displayThinkingTitle(turn, i)}\n\n`;
      md += `${turn.text}\n\n`;
      if (turn.recapText) md += `- ${turn.recapText}\n`;
      if (turn.model) md += `- model: ${turn.model}\n`;
      if (Number.isFinite(turn.createTime)) md += `- time: ${new Date(turn.createTime * 1000).toISOString()}\n`;
      md += "\n";
    }
    return md;
  }

  function thinkingText(data, scope) {
    const turns = contentThinkingForScope(data, scope);
    const lines = [`${data.title}｜思考轨迹`, `范围：${scopeLabel(scope)}`, `思考回合：${turns.length}`, ""];
    for (let i = 0; i < turns.length; i += 1) {
      const turn = turns[i];
      lines.push(`[${String(i + 1).padStart(4, "0")}] ${displayThinkingTitle(turn, i)}`);
      lines.push(turn.text);
      lines.push("");
    }
    return lines.join("\n");
  }

  function rawThinkingMarkdown(data, scope) {
    const turns = rawThinkingForScope(data, scope);
    let md = `# ${data.title}｜完整思考轨迹\n\n> 范围：${scopeLabel(scope)}｜原始 ${turns.length} 回合\n\n`;
    for (let i = 0; i < turns.length; i += 1) {
      const turn = turns[i];
      const title = turn.title || turn.summaryOnly?.[0] || turn.recapText || `思考回合 ${i + 1}`;
      md += `## ${String(i + 1).padStart(4, "0")}｜${title}\n\n`;
      if (turn.text) md += `${turn.text}\n\n`;
      for (const summary of turn.summaryOnly || []) if (summary && summary !== title) md += `- 摘要：${summary}\n`;
      if (turn.recapText) md += `- ${turn.recapText}\n`;
      if (turn.model) md += `- model: ${turn.model}\n`;
      if (Number.isFinite(turn.createTime)) md += `- time: ${new Date(turn.createTime * 1000).toISOString()}\n`;
      md += "\n";
    }
    return md;
  }

  function rawThinkingText(data, scope) {
    const turns = rawThinkingForScope(data, scope);
    const lines = [`${data.title}｜完整思考轨迹`, `范围：${scopeLabel(scope)}`, `原始回合：${turns.length}`, ""];
    for (let i = 0; i < turns.length; i += 1) {
      const turn = turns[i];
      const title = turn.title || turn.summaryOnly?.[0] || turn.recapText || `思考回合 ${i + 1}`;
      lines.push(`[${String(i + 1).padStart(4, "0")}] ${title}`);
      if (turn.text) lines.push(turn.text);
      for (const summary of turn.summaryOnly || []) if (summary && summary !== title) lines.push(summary);
      if (turn.recapText) lines.push(turn.recapText);
      lines.push("");
    }
    return lines.join("\n");
  }

  function thinkingProbe(data, conversation) {
    const contentTypes = {};
    for (const node of Object.values(conversation?.mapping || {})) {
      const type = node?.message?.content?.content_type;
      if (type) contentTypes[type] = (contentTypes[type] || 0) + 1;
    }
    return {
      exportedAt: new Date().toISOString(),
      conversationId: data.conversationId,
      title: data.title,
      apiSource: data.source,
      contentTypes,
      currentPathContentTurnCount: data.contentThinkingTurnsOnCurrentPath.length,
      treeContentTurnCount: data.contentThinkingTurns.length,
      currentPathRawTurnCount: data.thinkingTurnsOnCurrentPath.length,
      treeRawTurnCount: data.thinkingTurns.length,
      turns: data.thinkingTurns,
      items: data.displayedThinking
    };
  }

  function setApiStatus(text) {
    const element = document.getElementById("ccr-api-status");
    if (element) element.textContent = text;
  }

  function setThinkingStatus(text) {
    const element = document.getElementById("ccr-thinking-status");
    if (element) element.textContent = text;
  }

  function stopReadTimer() {
    if (readTimer) clearInterval(readTimer);
    readTimer = null;
    readStartedAt = 0;
  }

  function startReadTimer(label) {
    stopReadTimer();
    readStartedAt = Date.now();
    setApiStatus(`⟳ ${label}读取中 · 0s`);
    readTimer = setInterval(() => {
      const seconds = Math.floor((Date.now() - readStartedAt) / 1000);
      setApiStatus(`⟳ ${label}读取中 · ${seconds}s`);
    }, 1000);
  }

  function setExportEnabled(enabled) {
    for (const id of ["ccr-api-md", "ccr-api-raw", "ccr-thinking-md", "ccr-thinking-txt", "ccr-thinking-raw-md", "ccr-thinking-raw-txt", "ccr-thinking-probe"]) {
      const button = document.getElementById(id);
      if (button) button.disabled = !enabled;
    }
  }

  function refreshThinkingStatus() {
    if (!cachedNormalized) return setThinkingStatus("先读取内容；随后可直接导出思考轨迹");
    const scope = scopeValue();
    const count = contentThinkingForScope(cachedNormalized, scope).length;
    setThinkingStatus(`${scopeLabel(scope)}｜${count} 个思考回合｜${cachedNormalized.source?.mode || "unknown"}`);
  }

  async function readContent() {
    let target;
    try {
      target = resolveTarget();
    } catch (error) {
      setApiStatus(error?.message || String(error));
      return;
    }
    cachedConversation = null;
    cachedNormalized = null;
    setExportEnabled(false);
    setThinkingStatus("正在等待读取内容…");
    startReadTimer(`${target.label} `);
    try {
      cachedConversation = await requestConversation(target);
      cachedNormalized = normalizeConversation(cachedConversation);
      stopReadTimer();
      const mode = cachedNormalized.source?.mode || "unknown";
      setApiStatus(`已读｜正文 ${cachedNormalized.messages.length}｜思考 当前 ${cachedNormalized.contentThinkingTurnsOnCurrentPath.length} / 全树 ${cachedNormalized.contentThinkingTurns.length}｜${mode}`);
      setExportEnabled(true);
      refreshThinkingStatus();
    } catch (error) {
      stopReadTimer();
      cachedConversation = null;
      cachedNormalized = null;
      setApiStatus(`读取失败：${error?.message || error}`);
      setThinkingStatus("读取失败，暂无可导出的思考轨迹");
      setExportEnabled(false);
    }
  }

  function exportApiMarkdown() {
    if (!cachedNormalized) return;
    download(`${baseName()}.md`, markdownFromNormalized(cachedNormalized), "text/markdown;charset=utf-8");
    setApiStatus(`可读 MD 已导出｜正文 ${cachedNormalized.messages.length} 条`);
  }

  function exportRawJson() {
    if (!cachedConversation) return;
    download(`${baseName()}.raw.json`, JSON.stringify(cachedConversation, null, 2), "application/json;charset=utf-8");
    setApiStatus("Raw JSON 已导出");
  }

  function exportThinkingMarkdown() {
    if (!cachedNormalized) return;
    const scope = scopeValue();
    download(`${baseName()}-${scope === "tree" ? "thinking-tree" : "thinking-current"}.md`, thinkingMarkdown(cachedNormalized, scope), "text/markdown;charset=utf-8");
    setThinkingStatus(`思考 MD 已导出｜${scopeLabel(scope)}｜${contentThinkingForScope(cachedNormalized, scope).length} 回合`);
  }

  function exportThinkingText() {
    if (!cachedNormalized) return;
    const scope = scopeValue();
    download(`${baseName()}-${scope === "tree" ? "thinking-tree" : "thinking-current"}.txt`, thinkingText(cachedNormalized, scope), "text/plain;charset=utf-8");
    setThinkingStatus(`总文本 TXT 已导出｜${scopeLabel(scope)}｜${contentThinkingForScope(cachedNormalized, scope).length} 回合`);
  }

  function exportRawThinkingMarkdown() {
    if (!cachedNormalized) return;
    const scope = scopeValue();
    download(`${baseName()}-${scope === "tree" ? "thinking-tree-full" : "thinking-current-full"}.md`, rawThinkingMarkdown(cachedNormalized, scope), "text/markdown;charset=utf-8");
  }

  function exportRawThinkingText() {
    if (!cachedNormalized) return;
    const scope = scopeValue();
    download(`${baseName()}-${scope === "tree" ? "thinking-tree-full" : "thinking-current-full"}.txt`, rawThinkingText(cachedNormalized, scope), "text/plain;charset=utf-8");
  }

  function exportThinkingProbe() {
    if (!cachedNormalized || !cachedConversation) return;
    download(`${baseName()}.thinking-probe.json`, JSON.stringify(thinkingProbe(cachedNormalized, cachedConversation), null, 2), "application/json;charset=utf-8");
  }

  function setCollapsed(panel, collapsed) {
    panel.classList.toggle("ccr-collapsed", collapsed);
    localStorage.setItem(COLLAPSE_KEY, collapsed ? "1" : "0");
    const button = panel.querySelector("#ccr-hide");
    if (button) {
      button.textContent = collapsed ? "+" : "−";
      button.title = collapsed ? "展开猫茶抢救器" : "收起猫茶抢救器";
    }
  }

  function installFoldable(section, key) {
    if (!section || section.dataset.ccrFoldable === "1") return;
    const heading = section.querySelector(":scope > .ccr-section-heading");
    if (!heading) return;
    section.dataset.ccrFoldable = "1";
    section.classList.add("ccr-foldable");
    const toggle = document.createElement("span");
    toggle.className = "ccr-section-toggle";
    heading.appendChild(toggle);
    const apply = (collapsed) => {
      section.classList.toggle("ccr-section-collapsed", collapsed);
      toggle.textContent = collapsed ? "+" : "−";
    };
    apply(localStorage.getItem(key) === "1");
    heading.addEventListener("click", (event) => {
      if (event.target.closest("input, select, button, a")) return;
      const collapsed = !section.classList.contains("ccr-section-collapsed");
      localStorage.setItem(key, collapsed ? "1" : "0");
      apply(collapsed);
    });
  }

  function injectStyles() {
    if (document.getElementById("ccr-unified-style")) return;
    const style = document.createElement("style");
    style.id = "ccr-unified-style";
    style.textContent = `
      #${PANEL_ID} .ccr-unified-reference input{width:100%!important;box-sizing:border-box!important}
      #${PANEL_ID} .ccr-thinking{padding:10px!important;border-radius:13px!important;background:rgba(255,255,255,.045)!important;border:1px solid rgba(255,255,255,.07)!important}
      #${PANEL_ID} .ccr-thinking-controls label{display:grid!important;gap:4px!important;color:rgba(247,243,251,.62)!important;font-size:10px!important}
      #${PANEL_ID} .ccr-thinking select{width:100%!important;box-sizing:border-box!important;border:1px solid rgba(255,255,255,.10)!important;border-radius:9px!important;padding:7px 9px!important;background:rgba(0,0,0,.18)!important;color:#faf8fc!important;font-size:12px!important}
      #${PANEL_ID} .ccr-thinking-export-row,#${PANEL_ID} .ccr-thinking-dev-grid{display:grid!important;grid-template-columns:1fr 1fr!important;gap:6px!important;margin-top:7px!important}
      #${PANEL_ID} .ccr-thinking-dev-grid button:last-child{grid-column:1/-1!important}
      #${PANEL_ID} .ccr-thinking-status{margin-top:8px!important;padding:7px 8px!important;border-radius:9px!important;background:rgba(0,0,0,.14)!important;color:rgba(247,243,251,.72)!important;font-size:11px!important}
      #${PANEL_ID} .ccr-thinking-dev{margin-top:8px!important;border-top:1px solid rgba(255,255,255,.07)!important;padding-top:6px!important}
      #${PANEL_ID} .ccr-thinking-dev>summary{cursor:pointer!important;list-style:none!important;color:rgba(247,243,251,.60)!important;font-size:10px!important;font-weight:650!important}
      #${PANEL_ID} .ccr-foldable>.ccr-section-heading{cursor:pointer!important;user-select:none!important}
      #${PANEL_ID} .ccr-foldable.ccr-section-collapsed>:not(.ccr-section-heading){display:none!important}
      #${PANEL_ID} .ccr-section-toggle{margin-left:auto!important;min-width:18px!important;text-align:center!important;color:rgba(247,243,251,.62)!important;font-size:15px!important;font-weight:700!important}
    `;
    document.head.appendChild(style);
  }

  function captureLegacyParts(panel) {
    if (legacyParts) return legacyParts;
    legacyParts = {
      count: panel.querySelector(".ccr-count"),
      timers: panel.querySelector(".ccr-timers"),
      buttons: panel.querySelector(".ccr-buttons"),
      status: panel.querySelector("#ccr-status")
    };
    return legacyParts;
  }

  function makeThinkingSection() {
    const thinking = document.createElement("section");
    thinking.id = THINKING_SECTION_ID;
    thinking.dataset.ccrUnifiedThinking = "1";
    thinking.className = "ccr-thinking";
    thinking.innerHTML = `
      <div class="ccr-section-heading"><div><strong>思考轨迹</strong><small>使用上方已读取内容；只计有正文的 thoughts</small></div></div>
      <div class="ccr-thinking-controls"><label><span>导出范围</span><select id="ccr-thinking-scope"><option value="current">当前分支</option><option value="tree">整棵对话树</option></select></label></div>
      <div class="ccr-thinking-export-row"><button id="ccr-thinking-md" disabled>思考轨迹 MD</button><button id="ccr-thinking-txt" disabled>总文本 TXT</button></div>
      <div id="ccr-thinking-status" class="ccr-thinking-status">先读取内容；随后可直接导出思考轨迹</div>
      <details class="ccr-thinking-dev"><summary>开发诊断 / 完整原始轨迹</summary><div class="ccr-thinking-dev-grid"><button id="ccr-thinking-raw-md" disabled>完整 MD</button><button id="ccr-thinking-raw-txt" disabled>完整 TXT</button><button id="ccr-thinking-probe" disabled>探针 JSON</button></div></details>`;
    thinking.querySelector("#ccr-thinking-md").onclick = exportThinkingMarkdown;
    thinking.querySelector("#ccr-thinking-txt").onclick = exportThinkingText;
    thinking.querySelector("#ccr-thinking-raw-md").onclick = exportRawThinkingMarkdown;
    thinking.querySelector("#ccr-thinking-raw-txt").onclick = exportRawThinkingText;
    thinking.querySelector("#ccr-thinking-probe").onclick = exportThinkingProbe;
    thinking.querySelector("#ccr-thinking-scope").onchange = refreshThinkingStatus;
    installFoldable(thinking, THINKING_COLLAPSE_KEY);
    return thinking;
  }

  function buildUnifiedUi(panel) {
    if (panel.dataset.ccrUnifiedUi === "1" && document.getElementById(BODY_ID)) return;
    const parts = captureLegacyParts(panel);
    if (!parts.buttons) return;
    injectStyles();
    panel.dataset.ccrUnifiedUi = "1";
    panel.dataset.ccrModernUi = "1";
    panel.classList.add("ccr-modern");

    const titleText = panel.querySelector(".ccr-title span");
    if (titleText) {
      titleText.textContent = "🐾 猫茶抢救器 · 实验";
      titleText.onclick = () => setCollapsed(panel, !panel.classList.contains("ccr-collapsed"));
    }
    const hide = panel.querySelector("#ccr-hide");
    if (hide) hide.onclick = () => setCollapsed(panel, !panel.classList.contains("ccr-collapsed"));

    for (const old of panel.querySelectorAll(".ccr-body")) old.remove();
    const body = document.createElement("div");
    body.id = BODY_ID;
    body.className = "ccr-body";

    const quick = document.createElement("section");
    quick.className = "ccr-quick";
    quick.innerHTML = `
      <div class="ccr-section-heading"><div><strong>读取内容</strong><small>API 直读一次，后续导出共用缓存</small></div><span class="ccr-badge">${VERSION}</span></div>
      <div class="ccr-unified-reference"><input id="ccr-api-reference" type="text" inputmode="url" autocomplete="off" spellcheck="false" placeholder="留空读取当前对话；或粘贴 /c/… 链接 / conversation ID"></div>
      <button id="ccr-api-read" class="ccr-primary" type="button">读取内容</button>
      <div class="ccr-export-row"><button id="ccr-api-md" disabled>可读 MD</button><button id="ccr-api-raw" disabled>Raw JSON</button></div>
      <div id="ccr-api-status" class="ccr-api-status">尚未读取</div>
      <details class="ccr-label-settings"><summary>导出称呼</summary><div class="ccr-label-grid"><label><span>用户</span><input id="ccr-label-user" maxlength="40"></label><label><span>助手</span><input id="ccr-label-assistant" maxlength="40"></label><button id="ccr-label-reset">恢复 User / Assistant</button></div></details>`;
    quick.querySelector("#ccr-api-read").onclick = readContent;
    quick.querySelector("#ccr-api-md").onclick = exportApiMarkdown;
    quick.querySelector("#ccr-api-raw").onclick = exportRawJson;
    quick.querySelector("#ccr-api-reference").addEventListener("keydown", (event) => { if (event.key === "Enter") readContent(); });
    const userInput = quick.querySelector("#ccr-label-user");
    const assistantInput = quick.querySelector("#ccr-label-assistant");
    const refreshLabels = () => {
      const labels = exportLabels();
      userInput.value = labels.user;
      assistantInput.value = labels.assistant;
    };
    refreshLabels();
    userInput.onchange = () => { saveExportLabel(USER_LABEL_KEY, userInput.value); refreshLabels(); };
    assistantInput.onchange = () => { saveExportLabel(ASSISTANT_LABEL_KEY, assistantInput.value); refreshLabels(); };
    quick.querySelector("#ccr-label-reset").onclick = () => {
      localStorage.removeItem(USER_LABEL_KEY);
      localStorage.removeItem(ASSISTANT_LABEL_KEY);
      refreshLabels();
    };
    installFoldable(quick, QUICK_COLLAPSE_KEY);

    const thinking = makeThinkingSection();
    const legacy = document.createElement("details");
    legacy.className = "ccr-legacy";
    const summary = document.createElement("summary");
    summary.textContent = "传统 DOM / 增量抢救工具";
    legacy.appendChild(summary);
    for (const el of [parts.count, parts.timers, parts.buttons, parts.status]) if (el) legacy.appendChild(el);

    body.append(quick, thinking, legacy);
    panel.appendChild(body);
    setExportEnabled(Boolean(cachedNormalized));
    refreshThinkingStatus();
    setCollapsed(panel, localStorage.getItem(COLLAPSE_KEY) !== "0");
  }

  function repairThinkingSection(panel) {
    const body = document.getElementById(BODY_ID);
    if (!body) return;
    const current = document.getElementById(THINKING_SECTION_ID);
    if (current?.dataset?.ccrUnifiedThinking === "1") return;
    current?.remove();
    const legacy = body.querySelector(".ccr-legacy");
    const replacement = makeThinkingSection();
    if (legacy) legacy.before(replacement); else body.appendChild(replacement);
    setExportEnabled(Boolean(cachedNormalized));
    refreshThinkingStatus();
  }

  const timer = setInterval(() => {
    const panel = document.getElementById(PANEL_ID);
    if (!panel) return;
    clearInterval(timer);
    buildUnifiedUi(panel);
  }, 200);

  const observer = new MutationObserver(() => {
    const panel = document.getElementById(PANEL_ID);
    if (!panel) return;
    if (!document.getElementById(BODY_ID)) buildUnifiedUi(panel);
    else repairThinkingSection(panel);
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
})();
