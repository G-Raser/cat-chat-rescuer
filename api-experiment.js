(() => {
  const PANEL_ID = "catchat-rescuer-v030-panel";
  const REQUEST = "catchat-rescuer:api-request";
  const RESPONSE = "catchat-rescuer:api-response";
  const DISPLAYED_THINKING_TYPES = new Set(["thoughts", "reasoning_recap"]);
  let cachedConversation = null;
  let cachedNormalized = null;
  let bridgeReady = false;

  function injectBridge() {
    if (bridgeReady || document.getElementById("catchat-rescuer-api-bridge")) return;
    const script = document.createElement("script");
    script.id = "catchat-rescuer-api-bridge";
    script.src = chrome.runtime.getURL("page-api.js");
    script.onload = () => {
      bridgeReady = true;
      script.remove();
    };
    script.onerror = () => setApiStatus("API bridge 加载失败");
    (document.head || document.documentElement).appendChild(script);
  }

  function conversationId() {
    const match = location.pathname.match(/\/c\/([^/?#]+)/);
    if (match) return match[1];
    return document.querySelector("[data-conversation-id]")?.getAttribute("data-conversation-id") || null;
  }

  function projectId() {
    const parts = location.pathname.split("/").filter(Boolean);
    const index = parts.lastIndexOf("g");
    const value = parts[index + 1];
    return index >= 0 && typeof value === "string" && value.startsWith("g-p-") ? value : null;
  }

  function requestConversation() {
    injectBridge();
    const id = conversationId();
    if (!id) return Promise.reject(new Error("当前页面没有识别到 conversation ID"));
    const requestId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        window.removeEventListener("message", onMessage);
        reject(new Error("API 读取超时"));
      }, 120000);
      function onMessage(event) {
        if (event.source !== window || event.origin !== location.origin) return;
        const data = event.data;
        if (!data || data.source !== RESPONSE || data.id !== requestId) return;
        clearTimeout(timer);
        window.removeEventListener("message", onMessage);
        if (data.ok) resolve(data.conversation);
        else reject(new Error(data.error || "API 读取失败"));
      }
      window.addEventListener("message", onMessage);
      const send = () => window.postMessage({
        source: REQUEST,
        id: requestId,
        conversationId: id,
        projectId: projectId()
      }, location.origin);
      if (bridgeReady) send();
      else setTimeout(send, 120);
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
      if (!new Set(["user", "assistant"]).has(role)) continue;
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

    const thinking = [];
    for (const [nodeId, node] of Object.entries(mapping)) {
      const message = node?.message;
      if (!message) continue;
      const type = message.content?.content_type || "unknown";
      if (!DISPLAYED_THINKING_TYPES.has(type)) continue;
      const title =
        message.content?.title ??
        message.content?.summary_title ??
        message.metadata?.title ??
        message.metadata?.reasoning_title ??
        null;
      thinking.push({
        nodeId,
        messageId: message.id ?? null,
        parent: node.parent ?? null,
        children: Array.isArray(node.children) ? node.children : [],
        onCurrentPath: pathSet.has(nodeId),
        sourceType: type,
        title,
        text: textFromContent(message.content),
        createTime: message.create_time ?? null,
        visuallyHidden: Boolean(message.metadata?.is_visually_hidden_from_conversation),
        content: message.content,
        metadata: message.metadata ?? {}
      });
    }

    return {
      title: conversation.title || document.title || "Untitled ChatGPT Conversation",
      conversationId: conversation.conversation_id ?? conversation.id ?? conversationId(),
      createTime: conversation.create_time ?? null,
      updateTime: conversation.update_time ?? null,
      source: conversation.catchat_api_source ?? { mode: "unknown" },
      messages,
      displayedThinking: thinking
    };
  }

  function roleLabel(role) {
    return role === "user" ? "主人" : role === "assistant" ? "猫猫" : role;
  }

  function isoTime(seconds) {
    if (typeof seconds !== "number" || !Number.isFinite(seconds)) return null;
    const date = new Date(seconds * 1000);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
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

  async function readApi() {
    setApiStatus("API 原文读取中…");
    setExportEnabled(false);
    try {
      cachedConversation = await requestConversation();
      cachedNormalized = normalizeConversation(cachedConversation);
      const mode = cachedNormalized.source?.mode || "unknown";
      const thoughts = cachedNormalized.displayedThinking.length;
      setApiStatus(`API 已读｜正文 ${cachedNormalized.messages.length} 条｜思考摘要 ${thoughts} 条｜${mode}`);
      setExportEnabled(true);
    } catch (error) {
      cachedConversation = null;
      cachedNormalized = null;
      setApiStatus(`API 失败：${error?.message || error}`);
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
    setApiStatus("Raw conversation JSON 已导出");
  }

  function exportThinkingProbe() {
    if (!cachedNormalized || !cachedConversation) return;
    const probe = thinkingProbe(cachedNormalized, cachedConversation);
    download(`${baseName()}.thinking-probe.json`, JSON.stringify(probe, null, 2), "application/json;charset=utf-8");
    setApiStatus(`思考探针已导出｜${probe.count} 条 thoughts/reasoning_recap`);
  }

  function attachUi(panel) {
    if (document.getElementById("ccr-api-read")) return;
    const buttons = panel.querySelector(".ccr-buttons");
    if (!buttons) return;
    const read = document.createElement("button");
    read.id = "ccr-api-read";
    read.textContent = "🐾 API读取";
    const md = document.createElement("button");
    md.id = "ccr-api-md";
    md.textContent = "API MD";
    const raw = document.createElement("button");
    raw.id = "ccr-api-raw";
    raw.textContent = "Raw JSON";
    const thinking = document.createElement("button");
    thinking.id = "ccr-api-thinking";
    thinking.textContent = "思考探针";
    md.disabled = true;
    raw.disabled = true;
    thinking.disabled = true;
    buttons.append(read, md, raw, thinking);
    const status = document.createElement("div");
    status.id = "ccr-api-status";
    status.className = "ccr-status";
    status.textContent = "🐾 API 实验层待命｜现有 v0.4.2 DOM/增量功能保持原样";
    panel.appendChild(status);
    read.onclick = readApi;
    md.onclick = exportApiMarkdown;
    raw.onclick = exportRawJson;
    thinking.onclick = exportThinkingProbe;
    injectBridge();
  }

  const timer = setInterval(() => {
    const panel = document.getElementById(PANEL_ID);
    if (!panel) return;
    clearInterval(timer);
    attachUi(panel);
  }, 300);
})();