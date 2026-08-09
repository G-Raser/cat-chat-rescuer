async function readConversationFromPage(conversationId, projectId = null) {
  async function readSession() {
    const response = await fetch("/api/auth/session", { credentials: "include", cache: "no-store" });
    if (!response.ok) throw new Error(`session HTTP ${response.status}`);
    const session = await response.json();
    return { accessToken: session?.accessToken ?? null, accountId: session?.account?.id ?? session?.user?.account_id ?? session?.user?.accountId ?? null };
  }
  function headersFor(session, scopedProjectId = null) {
    const headers = { Accept: "application/json" };
    if (session.accessToken) headers.Authorization = `Bearer ${session.accessToken}`;
    if (session.accountId) headers["ChatGPT-Account-Id"] = session.accountId;
    if (scopedProjectId) headers["chatgpt-project-id"] = scopedProjectId;
    return headers;
  }
  async function fetchJson(url, headers) {
    const response = await fetch(url, { method: "GET", credentials: "include", cache: "no-store", headers });
    const text = await response.text();
    if (!response.ok) throw new Error(`${response.status} ${text.slice(0, 240)}`.trim());
    return JSON.parse(text);
  }
  function buildPathConversation(metadata, pages) {
    const messages = [], seen = new Set();
    for (const page of pages) for (const message of Array.isArray(page) ? page : []) {
      if (!message?.id || seen.has(message.id)) continue;
      seen.add(message.id); messages.push(message);
    }
    const rootId = `api-rescue-root:${conversationId}`;
    const mapping = { [rootId]: { id: rootId, parent: null, children: messages[0]?.id ? [messages[0].id] : [], message: null } };
    messages.forEach((message, index) => { mapping[message.id] = { id: message.id, parent: index === 0 ? rootId : messages[index - 1].id, children: index + 1 < messages.length ? [messages[index + 1].id] : [], message }; });
    const { messages: _messages, page_info: _pageInfo, mapping: _mapping, current_node: _currentNode, ...rest } = metadata || {};
    return { ...rest, conversation_id: rest.conversation_id ?? rest.id ?? conversationId, mapping, current_node: messages.at(-1)?.id ?? rootId, catchat_api_source: { mode: "paginated_current_path", branch_tree_complete: false, current_path_complete: true, page_count: pages.length, message_count: messages.length } };
  }
  async function readPaginated(headers) {
    const encoded = encodeURIComponent(conversationId);
    let first = null, pageSize = null, lastError = null;
    for (const size of [8, 4, 1]) {
      try { const candidate = await fetchJson(`/backend-api/conversations/${encoded}?num_turns=${size}`, headers); if (Array.isArray(candidate?.messages)) { first = candidate; pageSize = size; break; } } catch (error) { lastError = error; }
    }
    if (!first) throw lastError || new Error("pagination entry failed");
    const pages = [first.messages];
    let cursor = first.page_info?.start_cursor ?? null, hasPrevious = Boolean(first.page_info?.has_previous_page), guard = 0;
    const seenCursors = new Set();
    while (hasPrevious && cursor && !seenCursors.has(cursor) && guard < 1000) {
      guard += 1; seenCursors.add(cursor);
      const page = await fetchJson(`/backend-api/conversations/${encoded}/messages?before=${encodeURIComponent(cursor)}&num_turns=${pageSize}`, headers);
      if (!Array.isArray(page?.messages)) break;
      pages.unshift(page.messages); cursor = page.page_info?.start_cursor ?? null; hasPrevious = Boolean(page.page_info?.has_previous_page);
    }
    return buildPathConversation(first, pages);
  }
  const session = await readSession(), headerCandidates = [];
  if (projectId) headerCandidates.push(headersFor(session, projectId));
  headerCandidates.push(headersFor(session));
  let lastError = null;
  for (const headers of headerCandidates) {
    try { const conversation = await fetchJson(`/backend-api/conversation/${encodeURIComponent(conversationId)}`, headers); conversation.catchat_api_source = { mode: projectId && headers["chatgpt-project-id"] ? "full_project" : "full", branch_tree_complete: true, current_path_complete: true }; return conversation; } catch (error) { lastError = error; }
  }
  for (const headers of headerCandidates) { try { return await readPaginated(headers); } catch (error) { lastError = error; } }
  throw lastError || new Error("ChatGPT conversation API did not return usable data");
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== "CCR_API_READ") return false;
  const tabId = sender.tab?.id;
  if (!tabId || !message.conversationId) { sendResponse({ ok: false, error: "无法识别来源标签或 conversation ID" }); return false; }
  chrome.scripting.executeScript({ target: { tabId }, world: "MAIN", func: readConversationFromPage, args: [message.conversationId, message.projectId || null] })
    .then((results) => { const conversation = results?.[0]?.result; if (!conversation) throw new Error("页面没有返回 conversation JSON"); sendResponse({ ok: true, conversation }); })
    .catch((error) => sendResponse({ ok: false, error: error?.message || String(error) }));
  return true;
});
