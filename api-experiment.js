(() => {
  const PANEL_ID = "catchat-rescuer-v030-panel";
  const DISPLAYED_THINKING_TYPES = new Set(["thoughts", "reasoning_recap"]);
  const COLLAPSE_KEY = "catchat-rescuer-panel-collapsed";
  let cachedConversation = null;
  let cachedNormalized = null;

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
    if (!reference) throw new Error("请粘贴对话链接或 conversation ID");
    try {
      const url = new URL(reference);
      if (!["chatgpt.com", "chat.openai.com"].includes(url.hostname)) throw new Error("不是 ChatGPT 对话链接");
      const parts = url.pathname.split("/").filter(Boolean);
      const cIndex = parts.lastIndexOf("c");
      const id = parts[cIndex + 1];
      if (cIndex < 0 || !id) throw new Error("链接里没有找到 /c/ 后面的 conversation ID");
      return { conversationId: id, projectId: projectIdFromPath(url.pathname) };
    } catch (error) {
      if (error?.message && !/Invalid URL/i.test(error.message) && /^https?:/i.test(reference)) throw error;
    }
    if (/^[A-Za-z0-9_-]{8,}$/.test(reference)) return { conversationId: reference, projectId: null };
    throw new Error("无法识别这个对话链接或 conversation ID");
  }

  function requestConversation(targetId, targetProjectId = null) {
    if (!targetId) return Promise.reject(new Error("没有可用的 conversation ID"));
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({
        type: "CCR_API_READ",
        conversationId: targetId,
        projectId: targetProjectId
      }, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        if (response?.ok && response.conversation) resolve(response.conversation);
        else reject(new Error(response?.error || "API 读取失败"));
      });
    });
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
    for (const key of ["text", "summary", "result", "code"]) {
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
      messages.push({
        id: message.id || nodeId,
        nodeId,
        role,
        text,
        createTime: message.create_time ?? null,
        model: message.metadata?.model_slug ?? null,
        contentType: type
      });
    }

    const displayedThinking = [];
    for (const [nodeId, node] of Object.entries(mapping)) {
      const message = node?.message;
      if (!message) continue;
      const type = message.content?.content_type || "unknown";
      if (!DISPLAYED_THINKING_TYPES.has(type)) continue;
      displayedThinking.push({
        nodeId,
        messageId: message.id ?? null,
        parent: node.parent ?? null,
        children: Array.isArray(node.children) ? node.children : [],
        onCurrentPath: pathSet.has(nodeId),
        sourceType: type,
        title:
          message.content?.title ??
          message.content?.summary_title ??
          message.metadata?.title ??
          message.metadata?.reasoning_title ??
          null,
        text: textFromContent(message.content),
        createTime: message.create_time ?? null,
        visuallyHidden: Boolean(message.metadata?.is_visually_hidden_from_conversation),
        content: message.content,
        metadata: message.metadata ?? {}
      });
    }

    return {
      title: conversation.title || document.title || "Untitled ChatGPT Conversation",
      conversationId: conversation.conversation_id ?? conversation.id ?? null,
      createTime: conversation.create_time ?? null,
      updateTime: conversation.update_time ?? null,
      source: conversation.catchat_api_source ?? { mode: "unknown" },
      messages,
      displayedThinking
    };
  }

  function roleLabel(role) {
    return role === "user" ? "主人" : role === "assistant" ? "猫猫" : role;
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

  function baseName() {
    const date = new Date().toISOString().slice(0, 10);
    return `catchat-api-${date}-${safeFilename(cachedNormalized?.title)}-${cachedNormalized?.conversationId || "unknown"}`;
  }

  function markdownFromNormalized(data) {
    let md = "---\n";
    md += `title: ${JSON.stringify(data.title)}\n`;
    md += `conversation_id: ${JSON.stringify(data.conversationId)}\n`;
    md += `source: ${JSON.stringify("chatgpt_conversation_api_experiment")}\n`;
    md += `api_mode: ${JSON.stringify(data.source?.mode || "unknown")}\n`;
    md += `message_count: ${data.messages.length}\n`;
    md += `displayed_thinking_count: ${data.displayedThinking.length}\n`;
    md += "---\n\n";
    md += `# ${data.title}\n\n`;
    for (let i = 0; i < data.messages.length; i += 1) {
      const message = data.messages[i];
      const index = String(i + 1).padStart(4, "0");
      md += `## ${roleLabel(message.role)}｜${index}\n\n${message.text}\n\n`;
    }
    return md;
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
      count: data.displayedThinking.length,
      items: data.displayedThinking
    };
  }

  function setApiStatus(text) {
    const element = document.getElementById("ccr-api-status");
    if (element) element.textContent = text;
  }

  function setExportEnabled(enabled) {
    for (const id of ["ccr-api-md", "ccr-api-raw", "ccr-api-thinking"]) {
      const button = document.getElementById(id);
      if (button) button.disabled = !enabled;
    }
  }

  async function performRead(targetId, targetProjectId, label) {
    setApiStatus(`${label}读取中…`);
    setExportEnabled(false);
    try {
      cachedConversation = await requestConversation(targetId, targetProjectId);
      cachedNormalized = normalizeConversation(cachedConversation);
      const mode = cachedNormalized.source?.mode || "unknown";
      setApiStatus(`已读｜正文 ${cachedNormalized.messages.length}｜思考摘要 ${cachedNormalized.displayedThinking.length}｜${mode}`);
      setExportEnabled(true);
    } catch (error) {
      cachedConversation = null;
      cachedNormalized = null;
      setApiStatus(`读取失败：${error?.message || error}`);
    }
  }

  async function readCurrentApi() {
    const id = conversationId();
    if (!id) {
      setApiStatus("当前页面没有识别到 conversation ID");
      return;
    }
    await performRead(id, projectIdFromPath(), "当前对话 ");
  }

  async function readReferenceApi() {
    const input = document.getElementById("ccr-api-reference");
    try {
      const parsed = parseConversationReference(input?.value);
      await performRead(parsed.conversationId, parsed.projectId, "链接对话 ");
    } catch (error) {
      setApiStatus(error?.message || String(error));
    }
  }

  function exportApiMarkdown() {
    if (!cachedNormalized) return;
    download(`${baseName()}.md`, markdownFromNormalized(cachedNormalized), "text/markdown;charset=utf-8");
    setApiStatus(`API MD 已导出｜正文 ${cachedNormalized.messages.length} 条`);
  }

  function exportRawJson() {
    if (!cachedConversation) return;
    download(`${baseName()}.raw.json`, JSON.stringify(cachedConversation, null, 2), "application/json;charset=utf-8");
    setApiStatus("Raw conversation JSON 已导出到本机");
  }

  function exportThinkingProbe() {
    if (!cachedNormalized || !cachedConversation) return;
    const probe = thinkingProbe(cachedNormalized, cachedConversation);
    download(`${baseName()}.thinking-probe.json`, JSON.stringify(probe, null, 2), "application/json;charset=utf-8");
    setApiStatus(`思考探针已导出｜${probe.count} 条 thoughts/reasoning_recap`);
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

  function attachUi(panel) {
    if (panel.dataset.ccrModernUi === "1") return;
    const originalButtons = panel.querySelector(".ccr-buttons");
    if (!originalButtons) return;
    panel.dataset.ccrModernUi = "1";
    panel.classList.add("ccr-modern");

    const title = panel.querySelector(".ccr-title");
    const titleText = title?.querySelector("span");
    if (titleText) titleText.textContent = "🐾 猫茶抢救器 · 实验";
    const collapseButton = panel.querySelector("#ccr-hide");
    if (collapseButton) collapseButton.onclick = () => setCollapsed(panel, !panel.classList.contains("ccr-collapsed"));
    if (titleText) {
      titleText.classList.add("ccr-title-toggle");
      titleText.onclick = () => setCollapsed(panel, !panel.classList.contains("ccr-collapsed"));
    }

    const count = panel.querySelector(".ccr-count");
    const timers = panel.querySelector(".ccr-timers");
    const legacyStatus = panel.querySelector("#ccr-status");

    const body = document.createElement("div");
    body.className = "ccr-body";

    const quick = document.createElement("section");
    quick.className = "ccr-quick";
    quick.innerHTML = `
      <div class="ccr-section-heading">
        <div><strong>快速读取</strong><small>API 直读，不用滚动页面</small></div>
        <span class="ccr-badge">0.4.3</span>
      </div>
      <button id="ccr-api-read" class="ccr-primary" type="button">读取当前对话</button>
      <div class="ccr-reference-row">
        <input id="ccr-api-reference" type="text" inputmode="url" autocomplete="off" spellcheck="false" placeholder="粘贴 /c/… 链接或 conversation ID">
        <button id="ccr-api-read-link" type="button">读取</button>
      </div>
      <div class="ccr-export-row">
        <button id="ccr-api-md" type="button" disabled>可读 MD</button>
        <button id="ccr-api-raw" type="button" disabled>Raw JSON</button>
        <button id="ccr-api-thinking" type="button" disabled>思考探针</button>
      </div>
      <div id="ccr-api-status" class="ccr-api-status">API 实验层待命</div>
    `;

    const legacy = document.createElement("details");
    legacy.className = "ccr-legacy";
    const summary = document.createElement("summary");
    summary.textContent = "传统 DOM / 增量抢救工具";
    legacy.appendChild(summary);
    for (const element of [count, timers, originalButtons, legacyStatus]) {
      if (element) legacy.appendChild(element);
    }

    body.append(quick, legacy);
    panel.appendChild(body);

    quick.querySelector("#ccr-api-read").onclick = readCurrentApi;
    quick.querySelector("#ccr-api-read-link").onclick = readReferenceApi;
    quick.querySelector("#ccr-api-md").onclick = exportApiMarkdown;
    quick.querySelector("#ccr-api-raw").onclick = exportRawJson;
    quick.querySelector("#ccr-api-thinking").onclick = exportThinkingProbe;
    quick.querySelector("#ccr-api-reference").addEventListener("keydown", (event) => {
      if (event.key === "Enter") readReferenceApi();
    });

    const collapsed = localStorage.getItem(COLLAPSE_KEY) !== "0";
    setCollapsed(panel, collapsed);
  }

  const timer = setInterval(() => {
    const panel = document.getElementById(PANEL_ID);
    if (!panel) return;
    clearInterval(timer);
    attachUi(panel);
  }, 300);
})();
