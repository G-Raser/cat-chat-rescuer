(() => {
  if (globalThis.CCRApiData) return;
  const TYPES = new Set(["thoughts", "reasoning_recap"]);
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
  function pathToNode(conversation, targetId) {
    const mapping = conversation?.mapping;
    let id = targetId;
    if (!mapping || !id || !mapping[id]) throw new Error("API JSON 缺少 mapping/目标节点");
    const rev = [], seen = new Set();
    while (id != null) {
      if (seen.has(id)) throw new Error("API 对话树出现循环");
      const node = mapping[id];
      if (!node) throw new Error(`API 对话树缺少节点 ${id}`);
      seen.add(id); rev.push(id); id = node.parent;
    }
    return rev.reverse();
  }
  function currentPath(conversation) { return pathToNode(conversation, conversation?.current_node); }
  function visibleMessage(nodeId, node) {
    const message = node?.message;
    if (!message) return null;
    const role = message.author?.role, type = message.content?.content_type || "unknown";
    if (!["user", "assistant"].includes(role) || TYPES.has(type) || message.metadata?.is_visually_hidden_from_conversation) return null;
    const text = textContent(message.content);
    return text ? { nodeId, role, text, contentType: type, createTime: message.create_time ?? null } : null;
  }
  function visibleMessagesForPath(conversation, path) {
    const mapping = conversation?.mapping || {};
    return path.map((nodeId) => visibleMessage(nodeId, mapping[nodeId])).filter(Boolean);
  }
  function shortPreview(value, max = 38) {
    const text = String(value || "").replace(/\s+/g, " ").trim();
    return text.length > max ? `${text.slice(0, max - 1)}…` : text;
  }
  function timeValue(value) {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  function conversationBranches(conversation, currentPathIds) {
    const mapping = conversation?.mapping || {}, currentNode = conversation?.current_node;
    const currentMessages = visibleMessagesForPath(conversation, currentPathIds);
    const currentKey = currentMessages.map((m) => m.nodeId).join("|");
    const leaves = Object.entries(mapping).filter(([, node]) => {
      const children = Array.isArray(node?.children) ? node.children.filter((id) => mapping[id]) : [];
      return children.length === 0;
    }).map(([nodeId]) => nodeId);
    const candidates = currentNode ? [currentNode, ...leaves.filter((id) => id !== currentNode)] : leaves;
    const seen = new Set(), branches = [];
    for (const nodeId of candidates) {
      let path;
      try { path = pathToNode(conversation, nodeId); } catch { continue; }
      const messages = visibleMessagesForPath(conversation, path);
      if (!messages.length) continue;
      const key = messages.map((m) => m.nodeId).join("|");
      if (!key || seen.has(key)) continue;
      seen.add(key);
      let divergenceIndex = 0;
      while (divergenceIndex < messages.length && divergenceIndex < currentMessages.length && messages[divergenceIndex].nodeId === currentMessages[divergenceIndex].nodeId) divergenceIndex += 1;
      const divergence = messages[divergenceIndex] || null, last = messages.at(-1) || null;
      branches.push({
        id: nodeId,
        current: key === currentKey,
        messages,
        messageCount: messages.length,
        divergenceIndex,
        divergencePreview: shortPreview(divergence?.text),
        lastPreview: shortPreview(last?.text),
        firstTime: messages[0]?.createTime ?? null,
        lastTime: last?.createTime ?? null
      });
    }
    return branches.sort((x, y) => Number(y.current) - Number(x.current) || timeValue(y.lastTime) - timeValue(x.lastTime));
  }
  function thoughtEntries(content) {
    if (!Array.isArray(content?.thoughts)) return [];
    return content.thoughts.map((e) => ({ summary: typeof e?.summary === "string" ? e.summary.trim() : "", content: typeof e?.content === "string" ? e.content.trim() : "" })).filter((e) => e.summary || e.content);
  }
  function thinkingItem(nodeId, node, pathSet) {
    const message = node?.message;
    if (!message) return null;
    const type = message.content?.content_type || "unknown";
    if (!TYPES.has(type)) return null;
    const m = message.metadata || {};
    const base = { nodeId, onCurrentPath: pathSet.has(nodeId), sourceType: type, createTime: message.create_time ?? null, turnExchangeId: m.turn_exchange_id ?? null, workingTurnId: m.working_turn_id ?? null, model: m.model_slug ?? m.resolved_model_slug ?? null, content: message.content, metadata: m };
    if (type === "thoughts") {
      const entries = thoughtEntries(message.content), withBody = entries.find((e) => e.content), first = entries.find((e) => e.summary);
      return { ...base, title: withBody?.summary || first?.summary || null, text: [...new Set(entries.map((e) => e.content).filter(Boolean))].join("\n\n").trim(), entries };
    }
    return { ...base, title: null, text: typeof message.content?.content === "string" ? message.content.content.trim() : "", entries: [], durationSec: Number.isFinite(m.finished_duration_sec) ? m.finished_duration_sec : null, recapType: m.reasoning_recap_type ?? null };
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
      const thoughts = group.filter((x) => x.sourceType === "thoughts"), recaps = group.filter((x) => x.sourceType === "reasoning_recap"), entries = thoughts.flatMap((x) => x.entries || []), withBody = entries.find((e) => e.content), first = entries.find((e) => e.summary), recap = recaps.at(-1) || null;
      turns.push({ turnId, onCurrentPath: group.some((x) => x.onCurrentPath), createTime: group[0]?.createTime ?? null, title: withBody?.summary || first?.summary || null, text: [...new Set(entries.map((e) => e.content).filter(Boolean))].join("\n\n").trim(), summaryOnly: [...new Set(entries.filter((e) => !e.content && e.summary).map((e) => e.summary))], recapText: recap?.text || null, durationSec: recap?.durationSec ?? null, model: group.find((x) => x.model)?.model ?? null, items: group });
    }
    return turns.sort((a, b) => (a.createTime ?? 0) - (b.createTime ?? 0));
  }
  function normalize(conversation) {
    const mapping = conversation?.mapping || {}, path = currentPath(conversation), pathSet = new Set(path), messages = visibleMessagesForPath(conversation, path);
    const items = [];
    for (const [nodeId, node] of Object.entries(mapping)) { const item = thinkingItem(nodeId, node, pathSet); if (item) items.push(item); }
    items.sort((a, b) => (a.createTime ?? 0) - (b.createTime ?? 0));
    const turns = buildTurns(items), currentTurns = turns.filter((t) => t.onCurrentPath);
    const source = conversation.catchat_api_source ?? { mode: "unknown" }, branches = conversationBranches(conversation, path);
    return { title: conversation.title || document.title || "Untitled ChatGPT Conversation", conversationId: conversation.conversation_id ?? conversation.id ?? null, source, messages, branches, branchTreeComplete: source?.branch_tree_complete !== false && source?.mode !== "paginated_current_path", displayedThinking: items, thinkingTurns: turns, thinkingTurnsOnCurrentPath: currentTurns, contentThinkingTurns: turns.filter((t) => Boolean(t.text)), contentThinkingTurnsOnCurrentPath: currentTurns.filter((t) => Boolean(t.text)) };
  }
  function safeFilename(v) { return String(v || "chat").replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").replace(/\s+/g, " ").trim().slice(0, 100) || "chat"; }
  function timestampIso(value) {
    if (value == null || value === "") return null;
    const n = Number(value);
    const ms = Number.isFinite(n) ? (Math.abs(n) < 1e12 ? n * 1000 : n) : Date.parse(value);
    if (!Number.isFinite(ms)) return null;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  function conversationMarkdown(data, labels, options = {}) {
    const includeTimestamps = options.includeTimestamps !== false;
    let md = `---\ntitle: ${JSON.stringify(data.title)}\nconversation_id: ${JSON.stringify(data.conversationId)}\nsource: "chatgpt_conversation_api"\napi_mode: ${JSON.stringify(data.source?.mode || "unknown")}\nuser_label: ${JSON.stringify(labels.user)}\nassistant_label: ${JSON.stringify(labels.assistant)}\nmessage_count: ${data.messages.length}\nthinking_turn_current_path_count: ${data.contentThinkingTurnsOnCurrentPath.length}\nthinking_turn_tree_count: ${data.contentThinkingTurns.length}\ntimestamps_included: ${includeTimestamps}\n---\n\n# ${data.title}\n\n`;
    data.messages.forEach((m, i) => {
      md += `## ${m.role === "user" ? labels.user : labels.assistant}｜${String(i + 1).padStart(4, "0")}\n\n`;
      const ts = includeTimestamps ? timestampIso(m.createTime) : null;
      if (ts) md += `> time: ${ts}\n\n`;
      md += `${m.text}\n\n`;
    });
    return md;
  }
  function branchMarkdown(data, branch, labels, options = {}) {
    const includeTimestamps = options.includeTimestamps !== false, messages = branch?.messages || [];
    let md = `---\ntitle: ${JSON.stringify(data.title)}\nconversation_id: ${JSON.stringify(data.conversationId)}\nsource: "chatgpt_conversation_api"\napi_mode: ${JSON.stringify(data.source?.mode || "unknown")}\nbranch_node: ${JSON.stringify(branch?.id || null)}\nbranch_current: ${Boolean(branch?.current)}\nmessage_count: ${messages.length}\nuser_label: ${JSON.stringify(labels.user)}\nassistant_label: ${JSON.stringify(labels.assistant)}\ntimestamps_included: ${includeTimestamps}\n---\n\n# ${data.title}\n\n`;
    messages.forEach((m, i) => {
      md += `## ${m.role === "user" ? labels.user : labels.assistant}｜${String(i + 1).padStart(4, "0")}\n\n`;
      const ts = includeTimestamps ? timestampIso(m.createTime) : null;
      if (ts) md += `> time: ${ts}\n\n`;
      md += `${m.text}\n\n`;
    });
    return md;
  }
  function scopeTurns(data, scope, full = false) { if (full) return scope === "tree" ? data.thinkingTurns : data.thinkingTurnsOnCurrentPath; return scope === "tree" ? data.contentThinkingTurns : data.contentThinkingTurnsOnCurrentPath; }
  function thinkingMarkdown(data, scope, full = false, options = {}) {
    const turns = scopeTurns(data, scope, full), label = scope === "tree" ? "整棵对话树" : "当前分支", includeTimestamps = options.includeTimestamps !== false;
    let md = `# ${data.title}｜${full ? "完整" : ""}思考轨迹\n\n> 范围：${label}｜${full ? "原始 " : ""}${turns.length} 回合｜时间戳：${includeTimestamps ? "是" : "否"}\n\n`;
    turns.forEach((t, i) => {
      const title = t.title || t.summaryOnly?.[0] || t.recapText || `思考回合 ${i + 1}`;
      md += `## ${String(i + 1).padStart(4, "0")}｜${title}\n\n`;
      const ts = includeTimestamps ? timestampIso(t.createTime) : null;
      if (t.text) md += `${t.text}\n\n`;
      if (full) for (const s of t.summaryOnly || []) if (s && s !== title) md += `- 摘要：${s}\n`;
      if (t.text && t.recapText) md += `- ${t.recapText}\n`;
      if (t.text && t.model) md += `- model: ${t.model}\n`;
      if (ts) md += `- time: ${ts}\n`;
      md += "\n";
    });
    return md;
  }
  function thinkingText(data, scope, full = false, options = {}) {
    const turns = scopeTurns(data, scope, full), label = scope === "tree" ? "整棵对话树" : "当前分支", includeTimestamps = options.includeTimestamps !== false, lines = [`${data.title}｜${full ? "完整" : ""}思考轨迹`, `范围：${label}`, `${full ? "原始" : "思考"}回合：${turns.length}`, `时间戳：${includeTimestamps ? "是" : "否"}`, ""];
    turns.forEach((t, i) => {
      const title = t.title || t.summaryOnly?.[0] || t.recapText || `思考回合 ${i + 1}`;
      lines.push(`[${String(i + 1).padStart(4, "0")}] ${title}`);
      const ts = includeTimestamps ? timestampIso(t.createTime) : null;
      if (t.text) lines.push(t.text);
      if (full) for (const s of t.summaryOnly || []) if (s && s !== title) lines.push(s);
      if (full && t.recapText) lines.push(t.recapText);
      if (ts) lines.push(`time: ${ts}`);
      lines.push("");
    });
    return lines.join("\n");
  }
  globalThis.CCRApiData = { normalize, safeFilename, timestampIso, conversationMarkdown, branchMarkdown, scopeTurns, thinkingMarkdown, thinkingText };
})();
