(() => {
  if (globalThis.__CCR_INLINE_THINKING_EXPORT__) return;
  globalThis.__CCR_INLINE_THINKING_EXPORT__ = true;
  const FLAG_KEY = "catchat-rescuer-conversation-inline-thinking";
  const PANEL_ID = "catchat-rescuer-v030-panel";
  const api = globalThis.CCRApiData;
  if (!api) return;

  function textValue(v) {
    if (typeof v === "string") return v;
    if (!v || typeof v !== "object") return "";
    for (const k of ["text", "content", "summary", "result", "code"]) if (typeof v[k] === "string") return v[k];
    return "";
  }

  function textContent(c) {
    if (!c || typeof c !== "object") return "";
    const out = [];
    if (Array.isArray(c.parts)) for (const p of c.parts) { const t = textValue(p).trim(); if (t) out.push(t); }
    for (const k of ["text", "content", "summary", "result", "code"]) { const t = textValue(c[k]).trim(); if (t) out.push(t); }
    return [...new Set(out)].join("\n\n").trim();
  }

  function currentPathIds(conversation) {
    const mapping = conversation?.mapping;
    let id = conversation?.current_node;
    if (!mapping || !id || !mapping[id]) return [];
    const rev = [], seen = new Set();
    while (id != null && mapping[id] && !seen.has(id)) {
      seen.add(id);
      rev.push(id);
      id = mapping[id].parent;
    }
    return rev.reverse();
  }

  function buildTimeline(conversation, data) {
    const path = currentPathIds(conversation);
    const turnByNode = new Map();
    for (const turn of data.contentThinkingTurnsOnCurrentPath || []) {
      if (!turn?.text) continue;
      for (const item of turn.items || []) if (item?.nodeId) turnByNode.set(item.nodeId, turn);
    }
    const addedTurns = new Set();
    const timeline = [];
    let messageIndex = 0;
    for (const nodeId of path) {
      const thoughtTurn = turnByNode.get(nodeId);
      if (thoughtTurn && !addedTurns.has(thoughtTurn.turnId)) {
        addedTurns.add(thoughtTurn.turnId);
        timeline.push({ type: "thinking", value: thoughtTurn });
      }
      const message = conversation?.mapping?.[nodeId]?.message;
      if (!message) continue;
      const role = message.author?.role;
      const contentType = message.content?.content_type || "unknown";
      if (!["user", "assistant"].includes(role)) continue;
      if (["thoughts", "reasoning_recap"].includes(contentType)) continue;
      if (message.metadata?.is_visually_hidden_from_conversation) continue;
      if (!textContent(message.content)) continue;
      const normalizedMessage = data.messages?.[messageIndex++];
      if (normalizedMessage) timeline.push({ type: "message", value: normalizedMessage });
    }
    return timeline;
  }

  function fallbackTimeline(data) {
    const events = [];
    let seq = 0;
    for (const m of data.messages || []) events.push({ type: "message", value: m, seq: seq++ });
    for (const t of data.contentThinkingTurnsOnCurrentPath || []) events.push({ type: "thinking", value: t, seq: seq++ });
    const time = (entry) => {
      const iso = api.timestampIso(entry.value?.createTime);
      return iso ? Date.parse(iso) : Number.POSITIVE_INFINITY;
    };
    const rank = (entry) => entry.type === "thinking" ? 1 : (entry.value?.role === "assistant" ? 2 : 0);
    return events.sort((a, b) => time(a) - time(b) || rank(a) - rank(b) || a.seq - b.seq);
  }

  function mixedMarkdown(data, labels, options = {}) {
    const includeTimestamps = options.includeTimestamps !== false;
    const timeline = data.conversationTimeline?.length ? data.conversationTimeline : fallbackTimeline(data);
    let md = `---\ntitle: ${JSON.stringify(data.title)}\nconversation_id: ${JSON.stringify(data.conversationId)}\nsource: "chatgpt_conversation_api"\napi_mode: ${JSON.stringify(data.source?.mode || "unknown")}\nuser_label: ${JSON.stringify(labels.user)}\nassistant_label: ${JSON.stringify(labels.assistant)}\nmessage_count: ${data.messages.length}\nthinking_turn_current_path_count: ${data.contentThinkingTurnsOnCurrentPath.length}\nthinking_turn_tree_count: ${data.contentThinkingTurns.length}\nthinking_included: true\ntimestamps_included: ${includeTimestamps}\n---\n\n# ${data.title}\n\n`;
    let messageIndex = 0, thinkingIndex = 0;
    for (const entry of timeline) {
      if (entry.type === "message") {
        const m = entry.value;
        messageIndex += 1;
        md += `## ${m.role === "user" ? labels.user : labels.assistant}｜${String(messageIndex).padStart(4, "0")}\n\n`;
        const ts = includeTimestamps ? api.timestampIso(m.createTime) : null;
        if (ts) md += `> time: ${ts}\n\n`;
        md += `${m.text}\n\n`;
        continue;
      }
      const t = entry.value;
      if (!t?.text) continue;
      thinkingIndex += 1;
      const title = t.title || `思考回合 ${thinkingIndex}`;
      md += `### 思考｜${String(thinkingIndex).padStart(4, "0")}｜${title}\n\n${t.text}\n\n`;
      if (t.recapText) md += `- ${t.recapText}\n`;
      if (t.model) md += `- model: ${t.model}\n`;
      const ts = includeTimestamps ? api.timestampIso(t.createTime) : null;
      if (ts) md += `- time: ${ts}\n`;
      md += "\n";
    }
    return md;
  }

  const originalNormalize = api.normalize.bind(api);
  api.normalize = (conversation) => {
    const data = originalNormalize(conversation);
    try { data.conversationTimeline = buildTimeline(conversation, data); }
    catch (e) { console.warn("[CatLog] inline thinking timeline fallback", e); }
    return data;
  };

  const originalConversationMarkdown = api.conversationMarkdown.bind(api);
  api.conversationMarkdown = (data, labels, options = {}) => {
    const includeThinking = options.includeThinking ?? (localStorage.getItem(FLAG_KEY) === "1");
    return includeThinking ? mixedMarkdown(data, labels, options) : originalConversationMarkdown(data, labels, options);
  };

  function mountOption() {
    const row = document.querySelector(`#${PANEL_ID} .ccr-quick .ccr-export-options`);
    if (!row) return false;
    if (document.getElementById("ccr-conversation-inline-thinking")) return true;
    const label = document.createElement("label");
    label.className = "ccr-check";
    label.title = "把当前分支中有正文的已展示思考轨迹插入可读聊天 Markdown";
    label.innerHTML = `<input id="ccr-conversation-inline-thinking" type="checkbox"><span>包含思考轨迹</span>`;
    const checkbox = label.querySelector("input");
    checkbox.checked = localStorage.getItem(FLAG_KEY) === "1";
    checkbox.onchange = () => localStorage.setItem(FLAG_KEY, checkbox.checked ? "1" : "0");
    row.appendChild(label);
    return true;
  }

  if (!mountOption()) {
    const timer = setInterval(() => { if (mountOption()) clearInterval(timer); }, 250);
    setTimeout(() => clearInterval(timer), 15000);
  }
})();
