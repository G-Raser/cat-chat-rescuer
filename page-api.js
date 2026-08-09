(() => {
  const REQUEST = "catchat-rescuer:api-request";
  const RESPONSE = "catchat-rescuer:api-response";

  function post(id, payload) {
    window.postMessage({ source: RESPONSE, id, ...payload }, location.origin);
  }

  async function readSession() {
    const response = await fetch("/api/auth/session", {
      credentials: "include",
      cache: "no-store"
    });
    if (!response.ok) throw new Error(`session HTTP ${response.status}`);
    const session = await response.json();
    return {
      accessToken: session?.accessToken ?? null,
      accountId: session?.account?.id ?? session?.user?.account_id ?? session?.user?.accountId ?? null
    };
  }

  function headersFor(session, projectId = null) {
    const headers = { Accept: "application/json" };
    if (session.accessToken) headers.Authorization = `Bearer ${session.accessToken}`;
    if (session.accountId) headers["ChatGPT-Account-Id"] = session.accountId;
    if (projectId) headers["chatgpt-project-id"] = projectId;
    return headers;
  }

  async function fetchJson(url, headers) {
    const response = await fetch(url, {
      method: "GET",
      credentials: "include",
      cache: "no-store",
      headers
    });
    const text = await response.text();
    if (!response.ok) throw new Error(`${response.status} ${text.slice(0, 240)}`.trim());
    return JSON.parse(text);
  }

  function buildPathConversation(metadata, pages, conversationId) {
    const messages = [];
    const seen = new Set();
    for (const page of pages) {
      for (const message of Array.isArray(page) ? page : []) {
        if (!message?.id || seen.has(message.id)) continue;
        seen.add(message.id);
        messages.push(message);
      }
    }
    const rootId = `api-rescue-root:${conversationId}`;
    const mapping = {
      [rootId]: { id: rootId, parent: null, children: messages[0]?.id ? [messages[0].id] : [], message: null }
    };
    messages.forEach((message, index) => {
      mapping[message.id] = {
        id: message.id,
        parent: index === 0 ? rootId : messages[index - 1].id,
        children: index + 1 < messages.length ? [messages[index + 1].id] : [],
        message
      };
    });
    const { messages: _m, page_info: _p, mapping: _map, current_node: _current, ...rest } = metadata || {};
    return {
      ...rest,
      conversation_id: rest.conversation_id ?? rest.id ?? conversationId,
      mapping,
      current_node: messages.at(-1)?.id ?? rootId,
      catchat_api_source: {
        mode: "paginated_current_path",
        branch_tree_complete: false,
        current_path_complete: true,
        page_count: pages.length,
        message_count: messages.length
      }
    };
  }

  async function readPaginated(conversationId, headers) {
    const encoded = encodeURIComponent(conversationId);
    let first = null;
    let pageSize = null;
    let lastError = null;
    for (const size of [8, 4, 1]) {
      try {
        first = await fetchJson(`/backend-api/conversations/${encoded}?num_turns=${size}`, headers);
        if (Array.isArray(first?.messages)) {
          pageSize = size;
          break;
        }
      } catch (error) {
        lastError = error;
      }
    }
    if (!first || !Array.isArray(first.messages)) throw lastError || new Error("pagination entry failed");
    const pages = [first.messages];
    let cursor = first.page_info?.start_cursor ?? null;
    let hasPrevious = Boolean(first.page_info?.has_previous_page);
    const seenCursors = new Set();
    let guard = 0;
    while (hasPrevious && cursor && !seenCursors.has(cursor) && guard < 1000) {
      guard += 1;
      seenCursors.add(cursor);
      const page = await fetchJson(
        `/backend-api/conversations/${encoded}/messages?before=${encodeURIComponent(cursor)}&num_turns=${pageSize}`,
        headers
      );
      if (!Array.isArray(page?.messages)) break;
      pages.unshift(page.messages);
      cursor = page.page_info?.start_cursor ?? null;
      hasPrevious = Boolean(page.page_info?.has_previous_page);
    }
    return buildPathConversation(first, pages, conversationId);
  }

  async function readConversation(conversationId, projectId) {
    const session = await readSession();
    const candidates = [];
    if (projectId) candidates.push(headersFor(session, projectId));
    candidates.push(headersFor(session));
    let lastError = null;
    for (const headers of candidates) {
      try {
        const data = await fetchJson(`/backend-api/conversation/${encodeURIComponent(conversationId)}`, headers);
        data.catchat_api_source = {
          mode: projectId && headers["chatgpt-project-id"] ? "full_project" : "full",
          branch_tree_complete: true,
          current_path_complete: true
        };
        return data;
      } catch (error) {
        lastError = error;
      }
    }
    for (const headers of candidates) {
      try {
        return await readPaginated(conversationId, headers);
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError || new Error("ChatGPT conversation API did not return usable data");
  }

  window.addEventListener("message", async (event) => {
    if (event.source !== window || event.origin !== location.origin) return;
    const data = event.data;
    if (!data || data.source !== REQUEST || !data.id) return;
    try {
      const conversation = await readConversation(data.conversationId, data.projectId || null);
      post(data.id, { ok: true, conversation });
    } catch (error) {
      post(data.id, { ok: false, error: error?.message || String(error) });
    }
  });
})();