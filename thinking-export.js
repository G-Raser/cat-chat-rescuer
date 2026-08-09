(() => {
  const PANEL_ID = "catchat-rescuer-v030-panel";
  const THINKING_SECTION_ID = "ccr-thinking-section";
  const DISPLAYED_THINKING_TYPES = new Set(["thoughts", "reasoning_recap"]);
  let lastTarget = null;
  let cache = null;

  function projectIdFromPath(pathname = location.pathname) {
    const parts = pathname.split("/").filter(Boolean);
    const index = parts.lastIndexOf("g");
    const value = parts[index + 1];
    return index >= 0 && typeof value === "string" && value.startsWith("g-p-") ? value : null;
  }

  function currentConversationId() {
    const match = location.pathname.match(/\/c\/([^/?#]+)/);
    if (match) return match[1];
    return document.querySelector("[data-conversation-id]")?.getAttribute("data-conversation-id") || null;
  }

  function parseConversationReference(value) {
    const reference = String(value || "").trim();
    if (!reference) throw new Error("请粘贴对话链接或 conversation ID");
    try {
      const url = new URL(reference);
      if (!["chatgpt.com", "chat.openai.com"].includes(url.hostname)) throw new Error("不是 ChatGPT 对话链接");
      const parts = url.pathname.split("/").filter(Boolean);
      const cIndex = parts.lastIndexOf("c");
      const id = parts[cIndex + 1];
      if (cIndex < 0 || !id) throw new Error("链接里没有找到 conversation ID");
      return { conversationId: id, projectId: projectIdFromPath(url.pathname) };
    } catch (error) {
      if (error?.message && !/Invalid URL/i.test(error.message) && /^https?:/i.test(reference)) throw error;
    }
    if (/^[A-Za-z0-9_-]{8,}$/.test(reference)) return { conversationId: reference, projectId: null };
    throw new Error("无法识别这个对话链接或 conversation ID");
  }

  function currentTarget() {
    if (lastTarget?.conversationId) return lastTarget;
    const id = currentConversationId();
    return id ? { conversationId: id, projectId: projectIdFromPath() } : null;
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
      parent: node.parent ?? null,
      children: Array.isArray(node.children) ? node.children : [],
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
        text: [...new Set(entries.map((entry) => entry.content).filter(Boolean))].join("\n\n"),
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

  function buildTurns(items) {
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
      const title = withBody?.summary || firstSummary?.summary || null;
      const text = [...new Set(entries.map((entry) => entry.content).filter(Boolean))].join("\n\n");
      const summaryOnly = [...new Set(entries.filter((entry) => !entry.content && entry.summary).map((entry) => entry.summary))];
      const lastRecap = recapItems.at(-1) || null;
      turns.push({
        turnId,
        onCurrentPath: group.some((item) => item.onCurrentPath),
        createTime: group[0]?.createTime ?? null,
        title,
        text,
        summaryOnly,
        recapText: lastRecap?.text || null,
        durationSec: lastRecap?.durationSec ?? null,
        model: group.find((item) => item.model)?.model ?? null,
        sourceTypes: [...new Set(group.map((item) => item.sourceType))],
        items: group
      });
    }
    return turns.sort((a, b) => (a.createTime ?? 0) - (b.createTime ?? 0));
  }

  function normalizeThinking(conversation) {
    const mapping = conversation?.mapping || {};
    const pathSet = new Set(currentPath(conversation));
    const items = [];
    for (const [nodeId, node] of Object.entries(mapping)) {
      const item = thinkingItem(nodeId, node, pathSet);
      if (item) items.push(item);
    }
    items.sort((a, b) => (a.createTime ?? 0) - (b.createTime ?? 0));
    const turns = buildTurns(items);
    return {
      title: conversation.title || document.title || "Untitled ChatGPT Conversation",
      conversationId: conversation.conversation_id ?? conversation.id ?? null,
      source: conversation.catchat_api_source ?? { mode: "unknown" },
      items,
      turns,
      currentTurns: turns.filter((turn) => turn.onCurrentPath)
    };
  }

  function safeFilename(value) {
    return String(value || "chat")
      .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 100) || "chat";
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

  function scopeValue() {
    return document.getElementById("ccr-thinking-scope")?.value === "tree" ? "tree" : "current";
  }

  function scopeLabel(scope) {
    return scope === "tree" ? "整棵对话树" : "当前分支";
  }

  function turnsForScope(data, scope) {
    return scope === "tree" ? data.turns : data.currentTurns;
  }

  function displayTitle(turn, index) {
    return turn.title || turn.summaryOnly?.[0] || turn.recapText || `思考回合 ${index + 1}`;
  }

  function extraSummaries(turn) {
    const title = turn.title || turn.summaryOnly?.[0] || "";
    return (turn.summaryOnly || []).filter((summary) => summary && summary !== title);
  }

  function thinkingMarkdown(data, scope) {
    const turns = turnsForScope(data, scope);
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
    md += `> 范围：${scopeLabel(scope)}｜共 ${turns.length} 个思考回合\n\n`;
    for (let i = 0; i < turns.length; i++) {
      const turn = turns[i];
      const index = String(i + 1).padStart(4, "0");
      md += `## ${index}｜${displayTitle(turn, i)}\n\n`;
      if (turn.text) md += `${turn.text}\n\n`;
      for (const summary of extraSummaries(turn)) md += `- 摘要：${summary}\n`;
      if (turn.recapText) md += `- ${turn.recapText}\n`;
      if (turn.model) md += `- model: ${turn.model}\n`;
      if (Number.isFinite(turn.createTime)) md += `- time: ${new Date(turn.createTime * 1000).toISOString()}\n`;
      md += "\n";
    }
    return md;
  }

  function thinkingText(data, scope) {
    const turns = turnsForScope(data, scope);
    const lines = [
      `${data.title}｜思考轨迹`,
      `范围：${scopeLabel(scope)}`,
      `思考回合：${turns.length}`,
      ""
    ];
    for (let i = 0; i < turns.length; i++) {
      const turn = turns[i];
      lines.push(`[${String(i + 1).padStart(4, "0")}] ${displayTitle(turn, i)}`);
      if (turn.text) lines.push(turn.text);
      for (const summary of extraSummaries(turn)) lines.push(summary);
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
      displayedThinkingTypes: [...DISPLAYED_THINKING_TYPES],
      currentPathTurnCount: data.currentTurns.length,
      treeTurnCount: data.turns.length,
      turns: data.turns,
      items: data.items
    };
  }

  function setStatus(text) {
    const element = document.getElementById("ccr-thinking-status");
    if (element) element.textContent = text;
  }

  function updateCountStatus() {
    if (!cache?.data) return setStatus("读取对话后可导出；默认使用当前分支");
    const scope = scopeValue();
    const turns = turnsForScope(cache.data, scope);
    setStatus(`${scopeLabel(scope)}｜${turns.length} 个思考回合｜${cache.data.source?.mode || "unknown"}`);
  }

  async function loadThinking() {
    const target = currentTarget();
    if (!target) throw new Error("没有可用的 conversation ID");
    const key = `${target.conversationId}|${target.projectId || ""}`;
    if (cache?.key === key && cache.data && cache.conversation) return cache;
    setStatus("正在读取思考轨迹…");
    const conversation = await requestConversation(target);
    const data = normalizeThinking(conversation);
    cache = { key, conversation, data };
    updateCountStatus();
    return cache;
  }

  async function exportThinkingMarkdown() {
    try {
      const loaded = await loadThinking();
      const scope = scopeValue();
      const suffix = scope === "tree" ? "thinking-tree" : "thinking-current";
      download(`catchat-${safeFilename(loaded.data.title)}-${suffix}.md`, thinkingMarkdown(loaded.data, scope), "text/markdown;charset=utf-8");
      setStatus(`已导出思考 MD｜${scopeLabel(scope)}｜${turnsForScope(loaded.data, scope).length} 回合`);
    } catch (error) {
      setStatus(`导出失败：${error?.message || error}`);
    }
  }

  async function exportThinkingText() {
    try {
      const loaded = await loadThinking();
      const scope = scopeValue();
      const suffix = scope === "tree" ? "thinking-tree" : "thinking-current";
      download(`catchat-${safeFilename(loaded.data.title)}-${suffix}.txt`, thinkingText(loaded.data, scope), "text/plain;charset=utf-8");
      setStatus(`已导出总文本 TXT｜${scopeLabel(scope)}｜${turnsForScope(loaded.data, scope).length} 回合`);
    } catch (error) {
      setStatus(`导出失败：${error?.message || error}`);
    }
  }

  async function exportProbe() {
    try {
      const loaded = await loadThinking();
      download(`catchat-${safeFilename(loaded.data.title)}.thinking-probe.json`, JSON.stringify(thinkingProbe(loaded.data, loaded.conversation), null, 2), "application/json;charset=utf-8");
      setStatus(`探针 JSON 已导出｜当前 ${loaded.data.currentTurns.length} / 全树 ${loaded.data.turns.length}`);
    } catch (error) {
      setStatus(`导出失败：${error?.message || error}`);
    }
  }

  function rememberCurrentTarget() {
    const id = currentConversationId();
    if (id) lastTarget = { conversationId: id, projectId: projectIdFromPath() };
    cache = null;
  }

  function rememberReferenceTarget() {
    const input = document.getElementById("ccr-api-reference");
    try {
      lastTarget = parseConversationReference(input?.value);
      cache = null;
    } catch (_) {}
  }

  function injectStyles() {
    if (document.getElementById("ccr-thinking-style")) return;
    const style = document.createElement("style");
    style.id = "ccr-thinking-style";
    style.textContent = `
      #${PANEL_ID} #ccr-api-thinking { display:none !important; }
      #${PANEL_ID} .ccr-export-row { grid-template-columns:repeat(2,1fr) !important; }
      #${PANEL_ID} .ccr-thinking {
        padding:10px !important;
        border-radius:13px !important;
        background:rgba(255,255,255,.045) !important;
        border:1px solid rgba(255,255,255,.07) !important;
      }
      #${PANEL_ID} .ccr-thinking-controls { display:grid !important; gap:7px !important; }
      #${PANEL_ID} .ccr-thinking-controls label { display:grid !important; gap:4px !important; color:rgba(247,243,251,.62) !important; font-size:10px !important; }
      #${PANEL_ID} .ccr-thinking select {
        width:100% !important; box-sizing:border-box !important; border:1px solid rgba(255,255,255,.10) !important;
        border-radius:9px !important; padding:7px 9px !important; background:rgba(0,0,0,.18) !important;
        color:#faf8fc !important; font-size:12px !important; outline:none !important;
      }
      #${PANEL_ID} .ccr-thinking-export-row { display:grid !important; grid-template-columns:1fr 1fr !important; gap:6px !important; margin-top:7px !important; }
      #${PANEL_ID} .ccr-thinking-status {
        margin-top:8px !important; padding:7px 8px !important; border-radius:9px !important;
        background:rgba(0,0,0,.14) !important; color:rgba(247,243,251,.72) !important;
        line-height:1.35 !important; font-size:11px !important; overflow-wrap:anywhere !important;
      }
      #${PANEL_ID} .ccr-thinking-dev { margin-top:8px !important; border-top:1px solid rgba(255,255,255,.07) !important; padding-top:6px !important; }
      #${PANEL_ID} .ccr-thinking-dev > summary { cursor:pointer !important; list-style:none !important; color:rgba(247,243,251,.60) !important; font-size:10px !important; font-weight:650 !important; }
      #${PANEL_ID} .ccr-thinking-dev > summary::-webkit-details-marker { display:none !important; }
      #${PANEL_ID} .ccr-thinking-dev button { width:100% !important; margin-top:7px !important; background:rgba(255,255,255,.10) !important; color:rgba(247,243,251,.82) !important; }
    `;
    document.head.appendChild(style);
  }

  function attach(panel) {
    if (document.getElementById(THINKING_SECTION_ID)) return;
    injectStyles();
    panel.querySelector(".ccr-badge") && (panel.querySelector(".ccr-badge").textContent = "0.4.4");
    const legacy = panel.querySelector(".ccr-legacy");
    const section = document.createElement("section");
    section.id = THINKING_SECTION_ID;
    section.className = "ccr-thinking";
    section.innerHTML = `
      <div class="ccr-section-heading">
        <div><strong>思考轨迹</strong><small>还原 thoughts / reasoning_recap</small></div>
      </div>
      <div class="ccr-thinking-controls">
        <label><span>导出范围</span><select id="ccr-thinking-scope"><option value="current">当前分支</option><option value="tree">整棵对话树</option></select></label>
      </div>
      <div class="ccr-thinking-export-row">
        <button id="ccr-thinking-md" type="button">思考轨迹 MD</button>
        <button id="ccr-thinking-txt" type="button">总文本 TXT</button>
      </div>
      <div id="ccr-thinking-status" class="ccr-thinking-status">读取对话后可导出；默认使用当前分支</div>
      <details class="ccr-thinking-dev"><summary>开发诊断</summary><button id="ccr-thinking-probe" type="button">探针 JSON</button></details>
    `;
    if (legacy) legacy.before(section);
    else panel.querySelector(".ccr-body")?.appendChild(section);

    section.querySelector("#ccr-thinking-md").onclick = exportThinkingMarkdown;
    section.querySelector("#ccr-thinking-txt").onclick = exportThinkingText;
    section.querySelector("#ccr-thinking-probe").onclick = exportProbe;
    section.querySelector("#ccr-thinking-scope").onchange = updateCountStatus;

    panel.addEventListener("click", (event) => {
      if (event.target.closest("#ccr-api-read")) rememberCurrentTarget();
      if (event.target.closest("#ccr-api-read-link")) rememberReferenceTarget();
    }, true);
    panel.querySelector("#ccr-api-reference")?.addEventListener("keydown", (event) => {
      if (event.key === "Enter") rememberReferenceTarget();
    }, true);
    rememberCurrentTarget();
  }

  const timer = setInterval(() => {
    const panel = document.getElementById(PANEL_ID);
    if (!panel?.dataset?.ccrModernUi) return;
    clearInterval(timer);
    attach(panel);
  }, 300);
})();
