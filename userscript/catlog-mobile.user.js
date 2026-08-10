// ==UserScript==
// @name         尾痕 | CatLog Mobile
// @namespace    https://github.com/G-Raser/cat-chat-rescuer
// @version      0.1.0
// @description  Lightweight mobile userscript for exporting the current ChatGPT conversation, displayed thinking traces, or raw JSON.
// @match        https://chatgpt.com/*
// @match        https://chat.openai.com/*
// @grant        unsafeWindow
// @downloadURL  https://raw.githubusercontent.com/G-Raser/cat-chat-rescuer/main/userscript/catlog-mobile.user.js
// @updateURL    https://raw.githubusercontent.com/G-Raser/cat-chat-rescuer/main/userscript/catlog-mobile.user.js
// @run-at       document-idle
// ==/UserScript==

(() => {
  "use strict";
  if (globalThis.__CATLOG_MOBILE__) return;
  globalThis.__CATLOG_MOBILE__ = true;

  const TYPES = new Set(["thoughts", "reasoning_recap"]);
  const pageWindow = typeof unsafeWindow !== "undefined" ? unsafeWindow : window;
  const pageFetch = pageWindow.fetch.bind(pageWindow);
  let raw = null, data = null, timer = null, started = 0;

  const currentId = () => location.pathname.match(/\/c\/([^/?#]+)/)?.[1]
    || document.querySelector("[data-conversation-id]")?.getAttribute("data-conversation-id")
    || null;
  const projectId = (path = location.pathname) => {
    const parts = path.split("/").filter(Boolean), i = parts.lastIndexOf("g"), value = parts[i + 1];
    return i >= 0 && value?.startsWith("g-p-") ? value : null;
  };

  async function fetchJson(url, headers = {}) {
    const res = await pageFetch(url, { method: "GET", credentials: "include", cache: "no-store", headers });
    const text = await res.text();
    if (!res.ok) throw new Error(`${res.status} ${text.slice(0, 220)}`.trim());
    try { return JSON.parse(text); }
    catch { throw new Error(`返回内容不是 JSON：${text.slice(0, 100)}`); }
  }

  async function readSession() {
    const session = await fetchJson("/api/auth/session");
    return {
      accessToken: session?.accessToken ?? null,
      accountId: session?.account?.id ?? session?.user?.account_id ?? session?.user?.accountId ?? null
    };
  }

  function headersFor(session, pid = null) {
    const headers = { Accept: "application/json" };
    if (session.accessToken) headers.Authorization = `Bearer ${session.accessToken}`;
    if (session.accountId) headers["ChatGPT-Account-Id"] = session.accountId;
    if (pid) headers["chatgpt-project-id"] = pid;
    return headers;
  }

  function buildPathConversation(cid, metadata, pages) {
    const messages = [], seen = new Set();
    for (const page of pages) for (const message of Array.isArray(page) ? page : []) {
      if (!message?.id || seen.has(message.id)) continue;
      seen.add(message.id); messages.push(message);
    }
    const rootId = `catlog-mobile-root:${cid}`;
    const mapping = { [rootId]: { id: rootId, parent: null, children: messages[0]?.id ? [messages[0].id] : [], message: null } };
    messages.forEach((message, i) => {
      mapping[message.id] = { id: message.id, parent: i ? messages[i - 1].id : rootId, children: i + 1 < messages.length ? [messages[i + 1].id] : [], message };
    });
    const { messages: _m, page_info: _p, mapping: _map, current_node: _c, ...rest } = metadata || {};
    return {
      ...rest,
      conversation_id: rest.conversation_id ?? rest.id ?? cid,
      mapping,
      current_node: messages.at(-1)?.id ?? rootId,
      catchat_api_source: { mode: "paginated_current_path", branch_tree_complete: false, current_path_complete: true, page_count: pages.length, message_count: messages.length }
    };
  }

  async function readPaginated(cid, headers) {
    const encoded = encodeURIComponent(cid);
    let first = null, pageSize = null, lastError = null;
    for (const size of [8, 4, 1]) {
      try {
        const candidate = await fetchJson(`/backend-api/conversations/${encoded}?num_turns=${size}`, headers);
        if (Array.isArray(candidate?.messages)) { first = candidate; pageSize = size; break; }
      } catch (e) { lastError = e; }
    }
    if (!first) throw lastError || new Error("分页入口读取失败");
    const pages = [first.messages], seenCursors = new Set();
    let cursor = first.page_info?.start_cursor ?? null;
    let hasPrevious = Boolean(first.page_info?.has_previous_page), guard = 0;
    while (hasPrevious && cursor && !seenCursors.has(cursor) && guard < 1000) {
      guard += 1; seenCursors.add(cursor);
      const page = await fetchJson(`/backend-api/conversations/${encoded}/messages?before=${encodeURIComponent(cursor)}&num_turns=${pageSize}`, headers);
      if (!Array.isArray(page?.messages)) break;
      pages.unshift(page.messages);
      cursor = page.page_info?.start_cursor ?? null;
      hasPrevious = Boolean(page.page_info?.has_previous_page);
    }
    return buildPathConversation(cid, first, pages);
  }

  async function readConversation() {
    const cid = currentId();
    if (!cid) throw new Error("当前页面没有识别到 conversation ID；请先打开具体对话。");
    const pid = projectId(), session = await readSession(), candidates = [];
    if (pid) candidates.push(headersFor(session, pid));
    candidates.push(headersFor(session));
    let lastError = null;
    for (const headers of candidates) {
      try {
        const conversation = await fetchJson(`/backend-api/conversation/${encodeURIComponent(cid)}`, headers);
        conversation.catchat_api_source = { mode: pid && headers["chatgpt-project-id"] ? "full_project" : "full", branch_tree_complete: true, current_path_complete: true };
        return conversation;
      } catch (e) { lastError = e; }
    }
    for (const headers of candidates) {
      try { return await readPaginated(cid, headers); }
      catch (e) { lastError = e; }
    }
    throw lastError || new Error("ChatGPT conversation API 没有返回可用数据");
  }

  function textValue(v) {
    if (typeof v === "string") return v;
    if (!v || typeof v !== "object") return "";
    for (const k of ["text", "content", "summary", "result", "code"]) if (typeof v[k] === "string") return v[k];
    return "";
  }
  function textContent(c) {
    if (!c || typeof c !== "object") return "";
    const out = [];
    if (Array.isArray(c.parts)) for (const part of c.parts) { const t = textValue(part).trim(); if (t) out.push(t); }
    for (const k of ["text", "content", "summary", "result", "code"]) { const t = textValue(c[k]).trim(); if (t) out.push(t); }
    return [...new Set(out)].join("\n\n").trim();
  }
  function currentPath(conversation) {
    const mapping = conversation?.mapping; let id = conversation?.current_node;
    if (!mapping || !id || !mapping[id]) throw new Error("API JSON 缺少 mapping/current_node");
    const rev = [], seen = new Set();
    while (id != null) {
      if (seen.has(id)) throw new Error("API 对话树出现循环");
      const node = mapping[id]; if (!node) throw new Error(`API 对话树缺少节点 ${id}`);
      seen.add(id); rev.push(id); id = node.parent;
    }
    return rev.reverse();
  }
  function thoughtEntries(content) {
    if (!Array.isArray(content?.thoughts)) return [];
    return content.thoughts.map(e => ({ summary: typeof e?.summary === "string" ? e.summary.trim() : "", content: typeof e?.content === "string" ? e.content.trim() : "" })).filter(e => e.summary || e.content);
  }
  function thinkingItem(nodeId, node, pathSet) {
    const message = node?.message; if (!message) return null;
    const sourceType = message.content?.content_type || "unknown"; if (!TYPES.has(sourceType)) return null;
    const m = message.metadata || {};
    const base = { nodeId, onCurrentPath: pathSet.has(nodeId), sourceType, createTime: message.create_time ?? null, turnExchangeId: m.turn_exchange_id ?? null, workingTurnId: m.working_turn_id ?? null, model: m.model_slug ?? m.resolved_model_slug ?? null };
    if (sourceType === "thoughts") {
      const entries = thoughtEntries(message.content), withBody = entries.find(e => e.content), first = entries.find(e => e.summary);
      return { ...base, title: withBody?.summary || first?.summary || null, text: [...new Set(entries.map(e => e.content).filter(Boolean))].join("\n\n").trim(), entries };
    }
    return { ...base, title: null, text: typeof message.content?.content === "string" ? message.content.content.trim() : "", entries: [], durationSec: Number.isFinite(m.finished_duration_sec) ? m.finished_duration_sec : null, recapType: m.reasoning_recap_type ?? null };
  }
  function buildTurns(items) {
    const groups = new Map();
    for (const item of items) {
      const key = item.turnExchangeId || item.workingTurnId || `node:${item.nodeId}`;
      if (!groups.has(key)) groups.set(key, []); groups.get(key).push(item);
    }
    const turns = [];
    for (const [turnId, group] of groups) {
      group.sort((a, b) => (a.createTime ?? 0) - (b.createTime ?? 0));
      const thoughts = group.filter(x => x.sourceType === "thoughts"), recaps = group.filter(x => x.sourceType === "reasoning_recap"), entries = thoughts.flatMap(x => x.entries || []), withBody = entries.find(e => e.content), first = entries.find(e => e.summary), recap = recaps.at(-1) || null;
      turns.push({ turnId, onCurrentPath: group.some(x => x.onCurrentPath), createTime: group[0]?.createTime ?? null, title: withBody?.summary || first?.summary || null, text: [...new Set(entries.map(e => e.content).filter(Boolean))].join("\n\n").trim(), summaryOnly: [...new Set(entries.filter(e => !e.content && e.summary).map(e => e.summary))], recapText: recap?.text || null, durationSec: recap?.durationSec ?? null, model: group.find(x => x.model)?.model ?? null });
    }
    return turns.sort((a, b) => (a.createTime ?? 0) - (b.createTime ?? 0));
  }
  function normalize(conversation) {
    const mapping = conversation?.mapping || {}, path = currentPath(conversation), pathSet = new Set(path), messages = [];
    for (const nodeId of path) {
      const message = mapping[nodeId]?.message; if (!message) continue;
      const role = message.author?.role, type = message.content?.content_type || "unknown";
      if (!["user", "assistant"].includes(role) || TYPES.has(type) || message.metadata?.is_visually_hidden_from_conversation) continue;
      const text = textContent(message.content);
      if (text) messages.push({ role, text, createTime: message.create_time ?? null });
    }
    const items = [];
    for (const [nodeId, node] of Object.entries(mapping)) { const item = thinkingItem(nodeId, node, pathSet); if (item) items.push(item); }
    items.sort((a, b) => (a.createTime ?? 0) - (b.createTime ?? 0));
    const turns = buildTurns(items), currentTurns = turns.filter(t => t.onCurrentPath);
    return {
      title: conversation.title || document.title || "Untitled ChatGPT Conversation",
      conversationId: conversation.conversation_id ?? conversation.id ?? null,
      source: conversation.catchat_api_source ?? { mode: "unknown" },
      messages,
      contentThinkingTurns: turns.filter(t => Boolean(t.text)),
      contentThinkingTurnsOnCurrentPath: currentTurns.filter(t => Boolean(t.text))
    };
  }
  const safeFilename = v => String(v || "chat").replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").replace(/\s+/g, " ").trim().slice(0, 100) || "chat";
  function timestampIso(value) {
    if (value == null || value === "") return null;
    const n = Number(value), ms = Number.isFinite(n) ? (Math.abs(n) < 1e12 ? n * 1000 : n) : Date.parse(value);
    if (!Number.isFinite(ms)) return null;
    const d = new Date(ms); return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  function conversationMarkdown(d, includeTimestamps = true, labels = { user: "User", assistant: "Assistant" }) {
    let md = `---\ntitle: ${JSON.stringify(d.title)}\nconversation_id: ${JSON.stringify(d.conversationId)}\nsource: "chatgpt_conversation_api"\napi_mode: ${JSON.stringify(d.source?.mode || "unknown")}\nuser_label: ${JSON.stringify(labels.user)}\nassistant_label: ${JSON.stringify(labels.assistant)}\nmessage_count: ${d.messages.length}\nthinking_turn_current_path_count: ${d.contentThinkingTurnsOnCurrentPath.length}\ntimestamps_included: ${includeTimestamps}\n---\n\n# ${d.title}\n\n`;
    d.messages.forEach((m, i) => {
      md += `## ${m.role === "user" ? labels.user : labels.assistant}｜${String(i + 1).padStart(4, "0")}\n\n`;
      const ts = includeTimestamps ? timestampIso(m.createTime) : null; if (ts) md += `> time: ${ts}\n\n`;
      md += `${m.text}\n\n`;
    });
    return md;
  }
  function thinkingMarkdown(d, includeTimestamps = true) {
    const turns = d.contentThinkingTurnsOnCurrentPath;
    let md = `# ${d.title}｜思考轨迹\n\n> 范围：当前分支｜${turns.length} 回合｜时间戳：${includeTimestamps ? "是" : "否"}\n\n`;
    turns.forEach((t, i) => {
      const title = t.title || t.summaryOnly?.[0] || t.recapText || `思考回合 ${i + 1}`;
      md += `## ${String(i + 1).padStart(4, "0")}｜${title}\n\n`;
      if (t.text) md += `${t.text}\n\n`;
      if (t.text && t.recapText) md += `- ${t.recapText}\n`;
      else if (t.text && Number.isFinite(t.durationSec)) md += `- Worked for ${t.durationSec}s\n`;
      if (t.text && t.model) md += `- model: ${t.model}\n`;
      const ts = includeTimestamps ? timestampIso(t.createTime) : null; if (ts) md += `- time: ${ts}\n`;
      md += "\n";
    });
    return md;
  }
  const USER_LABEL_KEY = "catlog-mobile-user-label";
  const ASSISTANT_LABEL_KEY = "catlog-mobile-assistant-label";
  function exportLabels() {
    return {
      user: localStorage.getItem(USER_LABEL_KEY)?.trim() || "User",
      assistant: localStorage.getItem(ASSISTANT_LABEL_KEY)?.trim() || "Assistant"
    };
  }
  function base() { return `catlog-mobile-${new Date().toISOString().slice(0, 10)}-${safeFilename(data?.title)}-${data?.conversationId || "unknown"}`; }
  function download(name, content, type) {
    const url = URL.createObjectURL(new Blob([content], { type })), a = document.createElement("a");
    a.href = url; a.download = name; a.style.display = "none"; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 10000);
  }
  function status(text, error = false) { const el = document.getElementById("catlog-mobile-status"); if (el) { el.textContent = text; el.style.color = error ? "#ffb3b3" : "#d7cced"; } }
  function enable(on) { for (const id of ["catlog-mobile-chat-md", "catlog-mobile-thinking-md", "catlog-mobile-raw"]) { const el = document.getElementById(id); if (el) el.disabled = !on; } }
  function stopTimer() { if (timer) clearInterval(timer); timer = null; }
  function startTimer() { stopTimer(); started = Date.now(); timer = setInterval(() => status(`读取中 · ${Math.floor((Date.now() - started) / 1000)}s`), 1000); }
  async function read() {
    raw = data = null; enable(false); startTimer(); status("读取中 · 0s");
    try {
      raw = await readConversation(); data = normalize(raw); stopTimer();
      status(`已读｜正文 ${data.messages.length}｜思考 ${data.contentThinkingTurnsOnCurrentPath.length}｜${data.source?.mode || "unknown"}`); enable(true);
    } catch (e) { stopTimer(); raw = data = null; enable(false); status(`读取失败：${e?.message || e}`, true); }
  }

  function mount() {
    if (document.getElementById("catlog-mobile-launcher")) return;
    const style = document.createElement("style");
    style.textContent = `
#catlog-mobile-launcher{
  position:fixed;right:-8px;bottom:calc(max(18px,env(safe-area-inset-bottom)) + 108px);
  z-index:2147483647;width:38px;height:62px;border:1px solid rgba(205,185,255,.45);
  border-radius:12px 0 0 12px;padding:0 10px 0 5px;color:#f7f3fb;
  background:rgba(27,22,38,.92);box-shadow:0 8px 24px rgba(0,0,0,.32);
  font:650 12px/1.05 system-ui,sans-serif;writing-mode:vertical-rl;letter-spacing:1px
}
#catlog-mobile-panel{
  position:fixed;right:8px;top:50%;transform:translateY(-50%);z-index:2147483647;
  width:min(286px,calc(100vw - 42px));max-height:min(72dvh,560px);overflow:auto;
  padding:12px;border:1px solid rgba(205,185,255,.28);border-radius:15px;color:#f7f3fb;
  background:rgba(20,16,29,.96);box-shadow:0 18px 48px rgba(0,0,0,.45);
  backdrop-filter:blur(16px);font:13px/1.4 system-ui,sans-serif
}
#catlog-mobile-panel[hidden]{display:none!important}
#catlog-mobile-panel *{box-sizing:border-box}
.catlog-mobile-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:9px}
.catlog-mobile-title{font-weight:750}.catlog-mobile-version{color:#aa9fba;font-size:10px}
.catlog-mobile-grid{display:grid;grid-template-columns:1fr 1fr;gap:7px}.catlog-mobile-grid .wide{grid-column:1/-1}
#catlog-mobile-panel button{min-height:38px;border:1px solid rgba(255,255,255,.12);border-radius:9px;padding:8px 9px;color:#f7f3fb;background:rgba(255,255,255,.06);font:inherit}
#catlog-mobile-panel button:disabled{opacity:.4}
#catlog-mobile-read{background:rgba(151,116,218,.22)!important;border-color:rgba(194,166,255,.34)!important}
.catlog-mobile-option{display:flex;align-items:center;gap:7px;margin:9px 0 2px;color:#cfc5dc;font-size:12px}
.catlog-mobile-labels{margin-top:8px;border-top:1px solid rgba(255,255,255,.08);padding-top:7px}
.catlog-mobile-labels summary{cursor:pointer;color:#cfc5dc;font-size:12px}
.catlog-mobile-label-grid{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-top:7px}
.catlog-mobile-label-grid label{display:grid;gap:4px;color:#aaa0b8;font-size:10px}
.catlog-mobile-label-grid input{width:100%;min-width:0;border:1px solid rgba(255,255,255,.12);border-radius:8px;padding:7px 8px;background:rgba(0,0,0,.18);color:#f7f3fb;font:12px/1.2 system-ui,sans-serif}
.catlog-mobile-label-grid button{grid-column:1/-1;min-height:34px!important;font-size:11px!important}
#catlog-mobile-status{min-height:36px;margin-top:9px;padding:7px 8px;border-radius:9px;background:rgba(0,0,0,.18);color:#d7cced;overflow-wrap:anywhere;font-size:11px}`
    document.documentElement.appendChild(style);
    const launcher = document.createElement("button"); launcher.id = "catlog-mobile-launcher"; launcher.type = "button"; launcher.textContent = "尾痕"; document.documentElement.appendChild(launcher);
    const panel = document.createElement("section"); panel.id = "catlog-mobile-panel"; panel.hidden = true;
    panel.innerHTML = `<div class="catlog-mobile-head"><div><div class="catlog-mobile-title">尾痕 | CatLog Mobile</div><div class="catlog-mobile-version">0.1.0 · 当前对话</div></div><button id="catlog-mobile-close" type="button">×</button></div><div class="catlog-mobile-grid"><button class="wide" id="catlog-mobile-read" type="button">读取当前对话</button><button id="catlog-mobile-chat-md" type="button" disabled>聊天 MD</button><button id="catlog-mobile-thinking-md" type="button" disabled>思考 MD</button><button class="wide" id="catlog-mobile-raw" type="button" disabled>Raw JSON</button></div><label class="catlog-mobile-option"><input id="catlog-mobile-timestamps" type="checkbox" checked><span>导出时间戳</span></label><details class="catlog-mobile-labels"><summary>导出称呼</summary><div class="catlog-mobile-label-grid"><label><span>人类名</span><input id="catlog-mobile-user-label" maxlength="40" placeholder="User"></label><label><span>AI名</span><input id="catlog-mobile-assistant-label" maxlength="40" placeholder="Assistant"></label><button id="catlog-mobile-label-reset" type="button">恢复 User / Assistant</button></div></details><div id="catlog-mobile-status">尚未读取</div>`;
    document.documentElement.appendChild(panel);
    launcher.onclick = () => { panel.hidden = !panel.hidden; };
    panel.querySelector("#catlog-mobile-close").onclick = () => { panel.hidden = true; };
    panel.querySelector("#catlog-mobile-read").onclick = read;
    const userLabelInput = panel.querySelector("#catlog-mobile-user-label");
    const assistantLabelInput = panel.querySelector("#catlog-mobile-assistant-label");
    const syncLabels = () => {
      userLabelInput.value = localStorage.getItem(USER_LABEL_KEY)?.trim() || "";
      assistantLabelInput.value = localStorage.getItem(ASSISTANT_LABEL_KEY)?.trim() || "";
    };
    syncLabels();
    userLabelInput.onchange = () => {
      const value = userLabelInput.value.trim();
      value ? localStorage.setItem(USER_LABEL_KEY, value) : localStorage.removeItem(USER_LABEL_KEY);
      syncLabels();
    };
    assistantLabelInput.onchange = () => {
      const value = assistantLabelInput.value.trim();
      value ? localStorage.setItem(ASSISTANT_LABEL_KEY, value) : localStorage.removeItem(ASSISTANT_LABEL_KEY);
      syncLabels();
    };
    panel.querySelector("#catlog-mobile-label-reset").onclick = () => {
      localStorage.removeItem(USER_LABEL_KEY);
      localStorage.removeItem(ASSISTANT_LABEL_KEY);
      syncLabels();
    };
    panel.querySelector("#catlog-mobile-chat-md").onclick = () => data && download(`${base()}.md`, conversationMarkdown(data, panel.querySelector("#catlog-mobile-timestamps").checked, exportLabels()), "text/markdown;charset=utf-8");
    panel.querySelector("#catlog-mobile-thinking-md").onclick = () => data && download(`${base()}-thinking-current.md`, thinkingMarkdown(data, panel.querySelector("#catlog-mobile-timestamps").checked), "text/markdown;charset=utf-8");
    panel.querySelector("#catlog-mobile-raw").onclick = () => raw && download(`${base()}.raw.json`, JSON.stringify(raw, null, 2), "application/json;charset=utf-8");
  }

  mount();
  new MutationObserver(() => { if (!document.getElementById("catlog-mobile-launcher")) mount(); }).observe(document.documentElement, { childList: true, subtree: true });
})();
