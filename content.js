(() => {
  const VERSION = "0.3.7-state-export";
  const STATE_SCHEMA_VERSION = 1;
  const PANEL_ID = "catchat-rescuer-v030-panel";
  const LEGACY_PANEL_ID = "catchat-rescuer-panel";
  const GLOBAL_KEY = "__catChatRescuer_v030_loaded";
  // Keep the v0.3.6 DB name for backward-compatible local cache loading.
  const DB_NAME = "CatChatRescuerDB_v0_3_6_syntax_hotfix";
  const STORE = "conversations";

  // Remove old visible panel from v0.2.x lineage. Old timers may still exist,
  // but without the old panel they cannot keep flickering text.
  document.getElementById(LEGACY_PANEL_ID)?.remove();

  if (window[GLOBAL_KEY]) {
    const p = document.getElementById(PANEL_ID);
    if (p) {
      p.style.display = "block";
      p.style.visibility = "visible";
      p.style.opacity = "1";
      p.style.zIndex = "2147483647";
      return;
    }
  }
  window[GLOBAL_KEY] = true;

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const state = {
    id: getConversationId(),
    title: getTitle(),
    url: location.href,
    map: new Map(),
    order: [],
    captureSeq: 0,
    scrollWatch: false,
    autoScrolling: false,
    speedMode: "normal",
    exportOrder: "oldestFirst",
    status: "v0.3.7：已支持 State 与日期元数据。",
    captureStartedAtMs: null,
    totalElapsedMs: 0,
    timerRunning: false,
    timerRunStartedAtMs: null,
    autoStartedAtMs: null,
    lastAutoDurationMs: 0,
    autoStep: 0,
    lastTopDistance: null,
    lastScrollDirection: "unknown",
    lastAutoEnded: true
  };

  let scrollTimer = null;
  let grabLock = false;
  let panelTimer = null;
  let listenersInstalled = false;
  let suppressScrollGrabUntilMs = 0;
  let lastRendered = {};

  function safeText(s) {
    return (s || "").replace(/\u00a0/g, " ").trim();
  }

  function hashText(s) {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = Math.imul(31, h) + s.charCodeAt(i) | 0;
    return (h >>> 0).toString(36);
  }

  function getConversationId() {
    const m = location.pathname.match(/\/c\/([^/?#]+)/);
    if (m) return m[1];
    const fromDom = document.querySelector("[data-conversation-id]")?.getAttribute("data-conversation-id");
    return fromDom || `unknown-${hashText(location.href)}`;
  }

  function getTitle() {
    const t = safeText(document.title).replace(/^ChatGPT\s*[-–—]\s*/i, "");
    return t || "Untitled ChatGPT Conversation";
  }

  function nowMs() {
    return Date.now();
  }

  function fmtDuration(ms) {
    if (!ms || ms < 0) return "00:00";
    const total = Math.floor(ms / 1000);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    const pad = (n) => String(n).padStart(2, "0");
    return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
  }

  function startTotalTimer(reset = false) {
    if (reset) {
      state.captureStartedAtMs = nowMs();
      state.totalElapsedMs = 0;
      state.timerRunStartedAtMs = null;
      state.timerRunning = false;
      state.lastAutoDurationMs = 0;
      state.autoStep = 0;
    }
    if (!state.captureStartedAtMs) state.captureStartedAtMs = nowMs();
    if (!state.timerRunning) {
      state.timerRunning = true;
      state.timerRunStartedAtMs = nowMs();
    }
  }

  function stopTotalTimer() {
    if (state.timerRunning && state.timerRunStartedAtMs) {
      state.totalElapsedMs += nowMs() - state.timerRunStartedAtMs;
    }
    state.timerRunning = false;
    state.timerRunStartedAtMs = null;
  }

  function totalElapsedMs() {
    if (state.timerRunning && state.timerRunStartedAtMs) {
      return state.totalElapsedMs + (nowMs() - state.timerRunStartedAtMs);
    }
    return state.totalElapsedMs || 0;
  }

  function speedConfig() {
    const table = {
      slow: { label: "慢速", factor: 0.32, minStep: 220, delay: 1800 },
      normal: { label: "普通", factor: 0.50, minStep: 320, delay: 1200 },
      fast: { label: "快速", factor: 0.75, minStep: 520, delay: 800 },
      turbo: { label: "暴躁", factor: 0.95, minStep: 760, delay: 450 }
    };
    return table[state.speedMode] || table.normal;
  }

  function cycleSpeed() {
    const order = ["slow", "normal", "fast", "turbo"];
    const i = order.indexOf(state.speedMode);
    state.speedMode = order[(i + 1) % order.length];
    const cfg = speedConfig();
    state.status = `速度：${cfg.label}｜${Math.round(cfg.factor * 100)}% 屏/步｜${cfg.delay}ms`;
    updatePanel();
  }

  function exportOrderLabel() {
    return state.exportOrder === "captureOrder" ? "捕获序" : "时间正序";
  }

  function toggleExportOrder() {
    state.exportOrder = state.exportOrder === "oldestFirst" ? "captureOrder" : "oldestFirst";
    state.status = `导出顺序：${exportOrderLabel()}`;
    updatePanel();
  }

  function orderedMessages() {
    if (state.exportOrder === "captureOrder") {
      return [...state.map.values()].sort((a, b) => (a.captureSeq || 0) - (b.captureSeq || 0));
    }
    const seen = new Set();
    const out = [];
    for (const id of state.order) {
      if (state.map.has(id) && !seen.has(id)) {
        out.push(state.map.get(id));
        seen.add(id);
      }
    }
    for (const m of [...state.map.values()].sort((a, b) => (a.captureSeq || 0) - (b.captureSeq || 0))) {
      if (!seen.has(m.id)) {
        out.push(m);
        seen.add(m.id);
      }
    }
    return out;
  }

  function openDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "id" });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function saveRecord() {
    const db = await openDB();
    const messages = [...state.map.values()];
    const record = {
      id: state.id,
      exporterVersion: VERSION,
      title: state.title,
      url: state.url,
      updatedAt: new Date().toISOString(),
      messageCount: messages.length,
      order: state.order,
      captureSeq: state.captureSeq,
      exportOrder: state.exportOrder,
      captureStartedAtMs: state.captureStartedAtMs,
      totalElapsedMs: totalElapsedMs(),
      timerRunning: state.timerRunning,
      speedMode: state.speedMode,
      lastAutoEnded: state.lastAutoEnded,
      messages
    };
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(record);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  }

  async function loadRecord() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(state.id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }

  async function deleteRecord() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(state.id);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  }

  function scrollableCandidates() {
    const els = [...document.querySelectorAll("main, div")]
      .filter((el) => {
        if (el.closest(`#${PANEL_ID}`)) return false;
        if (el.id === LEGACY_PANEL_ID) return false;
        const st = getComputedStyle(el);
        return el.scrollHeight > el.clientHeight + 500 && ["auto", "scroll"].includes(st.overflowY);
      })
      .sort((a, b) => (b.scrollHeight - b.clientHeight) - (a.scrollHeight - a.clientHeight))
      .slice(0, 8);
    const doc = document.scrollingElement || document.documentElement;
    if (doc && !els.includes(doc)) els.push(doc);
    return els;
  }

  function topDistance() {
    const doc = document.scrollingElement || document.documentElement;
    const candidates = scrollableCandidates();
    const vals = [window.scrollY || 0, doc?.scrollTop || 0, ...candidates.map(el => el.scrollTop || 0)];
    return Math.max(...vals.map(v => Math.round(v)));
  }

  function updateScrollDirection() {
    const current = topDistance();
    if (state.lastTopDistance !== null) {
      if (current < state.lastTopDistance - 2) state.lastScrollDirection = "up";
      else if (current > state.lastTopDistance + 2) state.lastScrollDirection = "down";
    }
    state.lastTopDistance = current;
  }

  function posSnapshot() {
    const doc = document.scrollingElement || document.documentElement;
    const c = scrollableCandidates();
    const parts = [`win:${Math.round(window.scrollY || 0)}`, `doc:${Math.round(doc ? doc.scrollTop : 0)}`];
    for (let i = 0; i < Math.min(3, c.length); i++) parts.push(`${i}:${Math.round(c[i].scrollTop || 0)}`);
    return parts.join("|");
  }

  function scrollUpOneStep() {
    const candidates = scrollableCandidates();
    const scroller = candidates[0] || document.scrollingElement || document.documentElement;
    const cfg = speedConfig();
    const step = Math.max(cfg.minStep, Math.floor((scroller?.clientHeight || window.innerHeight) * cfg.factor));
    if (scroller) scroller.scrollTop = Math.max(0, (scroller.scrollTop || 0) - step);
    const doc = document.scrollingElement || document.documentElement;
    if (doc && doc !== scroller) doc.scrollTop = Math.max(0, (doc.scrollTop || 0) - step);
    window.scrollBy(0, -step);
    return step;
  }

  function extractMessagesFromDOM() {
    const nodes = [...document.querySelectorAll("[data-message-author-role]")];
    const out = [];
    for (const node of nodes) {
      if (node.closest(`#${PANEL_ID}`)) continue;
      if (node.closest(`#${LEGACY_PANEL_ID}`)) continue;
      const role = node.getAttribute("data-message-author-role") || "unknown";
      const text = safeText(node.innerText);
      if (!text) continue;
      const parent = node.closest("[data-message-id]");
      const id = parent?.getAttribute("data-message-id") || `${role}-${hashText(text)}`;
      out.push({ id, role, text, capturedAt: new Date().toISOString() });
    }
    return out;
  }

  function insertBefore(order, id, anchorId) {
    if (order.includes(id)) return order;
    const idx = order.indexOf(anchorId);
    if (idx < 0) return [id, ...order];
    order.splice(idx, 0, id);
    return order;
  }

  function insertAfter(order, id, anchorId) {
    if (order.includes(id)) return order;
    const idx = order.indexOf(anchorId);
    if (idx < 0) {
      order.push(id);
      return order;
    }
    order.splice(idx + 1, 0, id);
    return order;
  }

  function mergeVisibleBatch(batch) {
    const batchIds = batch.map(m => m.id);
    let added = 0;

    for (const m of batch) {
      if (!state.map.has(m.id)) {
        state.captureSeq += 1;
        state.map.set(m.id, { ...m, captureSeq: state.captureSeq });
        added++;
      }
    }

    if (batchIds.length === 0) return added;
    if (state.order.length === 0) {
      state.order = [...batchIds];
      return added;
    }

    const hasAnchor = batchIds.some(id => state.order.includes(id));
    if (!hasAnchor) {
      if (state.lastScrollDirection === "up") state.order = [...batchIds, ...state.order];
      else state.order = [...state.order, ...batchIds];
      state.order = [...new Set(state.order)];
      return added;
    }

    let order = state.order.slice();
    let prevKnown = null;
    for (let i = 0; i < batchIds.length; i++) {
      const id = batchIds[i];
      if (order.includes(id)) {
        prevKnown = id;
        continue;
      }
      if (prevKnown && order.includes(prevKnown)) {
        order = insertAfter(order, id, prevKnown);
        prevKnown = id;
        continue;
      }
      const nextKnown = batchIds.slice(i + 1).find(x => order.includes(x));
      if (nextKnown) order = insertBefore(order, id, nextKnown);
      else if (state.lastScrollDirection === "up") order.unshift(id);
      else order.push(id);
      prevKnown = id;
    }

    state.order = [...new Set(order)];
    return added;
  }

  async function grabVisible(reason = "manual") {
    if (grabLock) return 0;
    if (reason !== "export") startTotalTimer(false);
    grabLock = true;

    if (reason !== "scroll") {
      state.status = reason === "auto" ? "自动上滚捕获中…" : "正在抓当前屏…";
      updatePanel();
    }

    await sleep(40);
    updateScrollDirection();
    const batch = extractMessagesFromDOM();
    const added = mergeVisibleBatch(batch);
    if (added > 0) await saveRecord().catch(console.error);

    if (reason === "scroll") {
      if (added > 0) state.status = `手滑捕获：新增 ${added} 条｜累计 ${state.map.size}`;
    } else if (reason === "auto") {
      state.status = `自动捕获：新增 ${added} 条｜累计 ${state.map.size}`;
    } else {
      state.status = `本次新增 ${added} 条｜累计 ${state.map.size}`;
    }

    updatePanel();
    grabLock = false;
    return added;
  }

  function scheduleScrollGrab() {
    if (nowMs() < suppressScrollGrabUntilMs) return;
    if (!state.scrollWatch || state.autoScrolling) return;
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(() => grabVisible("scroll").catch(console.error), 1000);
  }

  function installListeners() {
    if (listenersInstalled) return;
    listenersInstalled = true;
    window.addEventListener("scroll", scheduleScrollGrab, { passive: true, capture: true });
    document.addEventListener("scroll", scheduleScrollGrab, { passive: true, capture: true });
    document.addEventListener("wheel", scheduleScrollGrab, { passive: true, capture: true });
    document.addEventListener("touchmove", scheduleScrollGrab, { passive: true, capture: true });
    document.addEventListener("keyup", (e) => {
      if (["PageUp", "PageDown", "Home", "End", "ArrowUp", "ArrowDown", " "].includes(e.key)) scheduleScrollGrab();
    }, { passive: true, capture: true });
  }

  function toggleScrollWatch() {
    state.scrollWatch = !state.scrollWatch;
    state.status = state.scrollWatch ? "监听已开：手滑后自动抓" : "监听已关：只在点按钮时抓";
    updatePanel();
  }

  async function autoScrollUp() {
    if (state.autoScrolling) return;
    // A new automatic run starts a fresh timer session.
    startTotalTimer(true);
    state.autoScrolling = true;
    state.lastAutoEnded = false;
    state.autoStartedAtMs = nowMs();
    state.lastAutoDurationMs = 0;
    state.autoStep = 0;
    updatePanel();

    let noMovement = 0;
    const maxSteps = 3000;

    for (let i = 1; i <= maxSteps && state.autoScrolling; i++) {
      state.autoStep = i;
      const before = posSnapshot();
      const beforeTop = topDistance();
      const added = await grabVisible("auto");

      scrollUpOneStep();
      state.status = `上滚中：第 ${i} 步｜新增 ${added}｜累计 ${state.map.size}`;
      updatePanel();

      await sleep(speedConfig().delay);

      const after = posSnapshot();
      const afterTop = topDistance();

      if (after === before || Math.abs(afterTop - beforeTop) < 2) noMovement += 1;
      else noMovement = 0;

      if (afterTop <= 5 && noMovement >= 3) break;
      if (noMovement >= 12) {
        state.status = "连续多次滚不动，已停止；可手动滚一下再继续";
        break;
      }
    }

    await grabVisible("auto");
    await saveRecord().catch(console.error);
    state.autoScrolling = false;
    if (state.autoStartedAtMs) state.lastAutoDurationMs = nowMs() - state.autoStartedAtMs;
    state.autoStartedAtMs = null;
    state.lastAutoEnded = true;
    stopTotalTimer();
    state.status = `上滚结束｜用时 ${fmtDuration(totalElapsedMs())}｜累计 ${state.map.size}`;
    updatePanel(true);
    saveRecord().catch(console.error);
  }

  function stopAuto() {
    state.autoScrolling = false;
    if (state.autoStartedAtMs) state.lastAutoDurationMs = nowMs() - state.autoStartedAtMs;
    state.autoStartedAtMs = null;
    stopTotalTimer();
    state.lastAutoEnded = true;
    state.status = `已停止并暂停计时｜用时 ${fmtDuration(totalElapsedMs())}`;
    updatePanel(true);
    saveRecord().catch(console.error);
  }

  function pauseTimer() {
    stopTotalTimer();
    if (state.autoStartedAtMs) state.lastAutoDurationMs = nowMs() - state.autoStartedAtMs;
    state.status = `计时已暂停｜用时 ${fmtDuration(totalElapsedMs())}`;
    updatePanel(true);
    saveRecord().catch(console.error);
  }

  function resetTimer() {
    state.autoScrolling = false;
    state.captureStartedAtMs = null;
    state.totalElapsedMs = 0;
    state.timerRunning = false;
    state.timerRunStartedAtMs = null;
    state.autoStartedAtMs = null;
    state.lastAutoDurationMs = 0;
    state.autoStep = 0;
    state.autoScrolling = false;
    state.lastAutoEnded = true;
    state.status = "计时已归零；下一次抓取/上滚后重新开始";
    updatePanel(true);
    saveRecord().catch(console.error);
  }

  async function clearCurrent() {
    if (!confirm("只清空【插件已捕获的本页缓存】，不会删除 ChatGPT 云端聊天记录。确定清空吗？")) return;

    stopTotalTimer();
    state.autoScrolling = false;
    state.map.clear();
    state.order = [];
    state.captureSeq = 0;
    state.captureStartedAtMs = null;
    state.totalElapsedMs = 0;
    state.timerRunning = false;
    state.timerRunStartedAtMs = null;
    state.autoStartedAtMs = null;
    state.lastAutoDurationMs = 0;
    state.autoStep = 0;
    state.lastTopDistance = null;
    state.lastScrollDirection = "unknown";

    // Prevent immediate scroll watcher re-capturing visible DOM right after clear.
    suppressScrollGrabUntilMs = nowMs() + 3000;

    await deleteRecord().catch(console.error);
    state.status = "已清空插件捕获缓存；3秒内不会自动重抓";
    updatePanel(true);
  }

  function escapeMd(s) {
    return (s || "").replace(/\r\n/g, "\n");
  }

  function yamlString(s) {
    return JSON.stringify(String(s ?? ""));
  }

  function isoDate(iso) {
    return String(iso || new Date().toISOString()).slice(0, 10);
  }

  function isoForFilename(iso) {
    return String(iso || new Date().toISOString()).replace(/[:.]/g, "-");
  }

  function baseExportName(exportedAt) {
    return `catchat-${isoDate(exportedAt)}-v037-${state.id}-${isoForFilename(exportedAt)}`;
  }

  function normalizeForAnchor(text) {
    return safeText(text).replace(/\s+/g, " ");
  }

  function previewText(text, max = 120) {
    const normalized = normalizeForAnchor(text);
    if (normalized.length <= max) return normalized;
    return `${normalized.slice(0, max - 1)}…`;
  }

  function messageAnchor(message, ordinal) {
    const normalized = normalizeForAnchor(message.text || "");
    return {
      ordinal,
      role: message.role || "unknown",
      id: message.id || null,
      normalized_hash: hashText(`${message.role || "unknown"}\n${normalized}`),
      preview: previewText(message.text || ""),
      text_length: normalized.length,
      has_assets: false,
      captured_at: message.capturedAt || null
    };
  }

  function buildRescueState(messages, exportedAt, outputFiles = {}) {
    const anchorWindowSize = Math.min(10, messages.length);
    const start = Math.max(0, messages.length - anchorWindowSize);
    const tailAnchors = messages.slice(start).map((message, i) => messageAnchor(message, start + i + 1));
    const last = messages.length > 0 ? messageAnchor(messages[messages.length - 1], messages.length) : null;
    return {
      schema_version: STATE_SCHEMA_VERSION,
      exporter_version: VERSION,
      conversation_id: state.id,
      source_url: state.url,
      title: state.title,
      created_at: exportedAt,
      last_exported_at: exportedAt,
      timezone: "UTC",
      message_count: messages.length,
      raw_captured_count: state.map.size,
      export_order: state.exportOrder,
      export_order_label: exportOrderLabel(),
      total_elapsed: fmtDuration(totalElapsedMs()),
      speed: speedConfig().label,
      tail_anchor_window_size: anchorWindowSize,
      tail_anchors: tailAnchors,
      last_message: last,
      message_timestamps_available: false,
      message_capture_timestamps_available: true,
      output_files: outputFiles,
      notes: "Message-level original timestamps are not available from the current DOM capture. captured_at is plugin capture time, not the original ChatGPT message time."
    };
  }

  function downloadRescueState(messages, exportedAt, baseName, outputFiles = {}) {
    const rescueState = buildRescueState(messages, exportedAt, outputFiles);
    download(`${baseName}.rescue-state.json`, JSON.stringify(rescueState, null, 2), "application/json;charset=utf-8");
    return rescueState;
  }

  function download(filename, content, type) {
    const blob = new Blob([content], { type });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 3000);
  }

  async function exportJSON() {
    await grabVisible("export");
    const exportedAt = new Date().toISOString();
    const baseName = baseExportName(exportedAt);
    const rawMessages = orderedMessages();
    const messages = rawMessages.map((m, i) => ({ index: i + 1, ...m }));
    const jsonFilename = `${baseName}.json`;
    const stateFilename = `${baseName}.rescue-state.json`;
    const data = {
      exporterVersion: VERSION,
      exportedAt,
      date: isoDate(exportedAt),
      timezone: "UTC",
      conversationId: state.id,
      title: state.title,
      url: state.url,
      messageCount: messages.length,
      rawCapturedCount: state.map.size,
      exportOrder: state.exportOrder,
      exportOrderLabel: exportOrderLabel(),
      totalElapsed: fmtDuration(totalElapsedMs()),
      lastAutoDuration: fmtDuration(state.lastAutoDurationMs),
      speedMode: state.speedMode,
      speedLabel: speedConfig().label,
      timerMode: "new auto-scroll run resets total timer; stop/natural end pauses timer",
      messageTimestampsAvailable: false,
      messageCaptureTimestampsAvailable: true,
      rescueStateFile: stateFilename,
      messages
    };
    download(jsonFilename, JSON.stringify(data, null, 2), "application/json;charset=utf-8");
    downloadRescueState(rawMessages, exportedAt, baseName, { json: jsonFilename, rescue_state: stateFilename });
    state.status = `已导出 JSON + State｜${messages.length} 条`;
    updatePanel(true);
  }

  async function exportMarkdown() {
    await grabVisible("export");
    const exportedAt = new Date().toISOString();
    const baseName = baseExportName(exportedAt);
    const messages = orderedMessages();
    const mdFilename = `${baseName}.md`;
    const stateFilename = `${baseName}.rescue-state.json`;
    let md = "---\n";
    md += `title: ${yamlString(state.title)}\n`;
    md += `date: ${yamlString(isoDate(exportedAt))}\n`;
    md += `timezone: ${yamlString("UTC")}\n`;
    md += `exported_at: ${yamlString(exportedAt)}\n`;
    md += `conversation_id: ${yamlString(state.id)}\n`;
    md += `url: ${yamlString(state.url)}\n`;
    md += `message_count: ${messages.length}\n`;
    md += `raw_captured_count: ${state.map.size}\n`;
    md += `export_order: ${yamlString(exportOrderLabel())}\n`;
    md += `total_elapsed: ${yamlString(fmtDuration(totalElapsedMs()))}\n`;
    md += `speed: ${yamlString(speedConfig().label)}\n`;
    md += `exporter_version: ${yamlString(VERSION)}\n`;
    md += "message_timestamps_available: false\n";
    md += "message_capture_timestamps_available: true\n";
    md += `rescue_state_file: ${yamlString(stateFilename)}\n`;
    md += "---\n\n";
    md += `# ${escapeMd(state.title)}\n\n`;
    md += `- exporter_version: ${VERSION}\n`;
    md += `- date: ${isoDate(exportedAt)}\n`;
    md += `- timezone: UTC\n`;
    md += `- conversation_id: \`${state.id}\`\n`;
    md += `- exported_at: ${exportedAt}\n`;
    md += `- url: ${state.url}\n`;
    md += `- message_count: ${messages.length}\n`;
    md += `- raw_captured_count: ${state.map.size}\n`;
    md += `- export_order: ${exportOrderLabel()}\n`;
    md += `- total_elapsed: ${fmtDuration(totalElapsedMs())}\n`;
    md += `- speed: ${speedConfig().label}\n`;
    md += `- timer_mode: new auto-scroll run resets total timer; stop/natural end pauses timer\n`;
    md += `- message_timestamps_available: false\n`;
    md += `- message_capture_timestamps_available: true\n`;
    md += `- rescue_state_file: \`${stateFilename}\`\n\n`;
    md += `> Note: message block headers use sequence numbers only. Original ChatGPT message timestamps are not available from the current DOM capture; capturedAt remains available in JSON and rescue-state anchors.\n\n`;
    for (let i = 0; i < messages.length; i++) {
      const m = messages[i];
      const who = m.role === "user" ? "主人" : (m.role === "assistant" ? "猫猫" : m.role);
      const index = String(i + 1).padStart(4, "0");
      md += `## ${who}｜${index}\n\n${escapeMd(m.text)}\n\n`;
    }
    download(mdFilename, md, "text/markdown;charset=utf-8");
    downloadRescueState(messages, exportedAt, baseName, { markdown: mdFilename, rescue_state: stateFilename });
    state.status = `已导出 MD + State｜${messages.length} 条`;
    updatePanel(true);
  }

  async function exportStateOnly() {
    await grabVisible("export");
    const exportedAt = new Date().toISOString();
    const baseName = baseExportName(exportedAt);
    const messages = orderedMessages();
    downloadRescueState(messages, exportedAt, baseName, { rescue_state: `${baseName}.rescue-state.json` });
    state.status = `已导出 State｜${messages.length} 条｜锚点 ${Math.min(10, messages.length)} 条`;
    updatePanel(true);
  }

  function makePanel() {
    document.getElementById(LEGACY_PANEL_ID)?.remove();
    document.getElementById(PANEL_ID)?.remove();

    const panel = document.createElement("div");
    panel.id = PANEL_ID;
    panel.innerHTML = `
      <div class="ccr-title">
        <span>猫茶抢救器 v0.3.7</span>
        <button id="ccr-hide" title="Hide">×</button>
      </div>
      <div class="ccr-count">已捕获：<span id="ccr-count">0</span></div>
      <div class="ccr-timers">
        <div>总用时：<span id="ccr-total">00:00</span></div>
        <div>本轮上滚：<span id="ccr-auto-time">00:00</span>｜步数：<span id="ccr-step">0</span></div>
      </div>
      <div class="ccr-buttons">
        <button id="ccr-grab">抓当前屏</button>
        <button id="ccr-watch">监听：关</button>
        <button id="ccr-speed">速度：普通</button>
        <button id="ccr-auto">温和上滚</button>
        <button id="ccr-stop">停止上滚</button>
        <button id="ccr-pause-timer">暂停计时</button>
        <button id="ccr-order">顺序：时间正序</button>
        <button id="ccr-json">导出 JSON</button>
        <button id="ccr-md">导出 MD</button>
        <button id="ccr-state">导出 State</button>
        <button id="ccr-reset">重置计时</button>
        <button id="ccr-clear">清空插件缓存</button>
      </div>
      <div class="ccr-status" id="ccr-status">v0.3.7：已支持 State 与日期元数据。</div>
    `;
    document.body.appendChild(panel);

    panel.querySelector("#ccr-hide").onclick = () => { panel.style.display = "none"; };
    panel.querySelector("#ccr-grab").onclick = () => grabVisible("manual");
    panel.querySelector("#ccr-watch").onclick = () => toggleScrollWatch();
    panel.querySelector("#ccr-speed").onclick = () => cycleSpeed();
    panel.querySelector("#ccr-auto").onclick = () => autoScrollUp();
    panel.querySelector("#ccr-stop").onclick = () => stopAuto();
    panel.querySelector("#ccr-pause-timer").onclick = () => pauseTimer();
    panel.querySelector("#ccr-order").onclick = () => toggleExportOrder();
    panel.querySelector("#ccr-json").onclick = () => exportJSON();
    panel.querySelector("#ccr-md").onclick = () => exportMarkdown();
    panel.querySelector("#ccr-state").onclick = () => exportStateOnly();
    panel.querySelector("#ccr-reset").onclick = () => resetTimer();
    panel.querySelector("#ccr-clear").onclick = () => clearCurrent();
  }

  function setText(id, value, force = false) {
    const el = document.getElementById(id);
    if (!el) return;
    if (force || lastRendered[id] !== value) {
      el.textContent = value;
      lastRendered[id] = value;
    }
  }

  function updatePanel(force = false) {
    setText("ccr-count", String(state.map.size), force);
    setText("ccr-status", state.status, force);

    const total = fmtDuration(totalElapsedMs());
    const autoRunning = state.autoStartedAtMs ? nowMs() - state.autoStartedAtMs : state.lastAutoDurationMs;
    setText("ccr-total", total, force);
    setText("ccr-auto-time", fmtDuration(autoRunning), force);
    setText("ccr-step", String(state.autoStep || 0), force);
    setText("ccr-watch", state.scrollWatch ? "监听：开" : "监听：关", force);
    setText("ccr-speed", `速度：${speedConfig().label}`, force);
    setText("ccr-auto", state.autoScrolling ? "滚动中…" : "温和上滚", force);
    setText("ccr-stop", state.autoScrolling ? "停止上滚" : "停止/暂停", force);
    setText("ccr-order", `顺序：${exportOrderLabel()}`, force);
  }

  function startPanelTimer() {
    if (panelTimer) clearInterval(panelTimer);
    panelTimer = setInterval(() => updatePanel(false), 1000);
  }

  async function init() {
    makePanel();
    installListeners();

    const old = await loadRecord().catch(() => null);
    if (old?.messages?.length) {
      for (const m of old.messages) state.map.set(m.id, m);
      state.order = Array.isArray(old.order) ? old.order : [...state.map.keys()];
      state.captureSeq = old.captureSeq || state.map.size || 0;
      state.exportOrder = old.exportOrder || "oldestFirst";
      state.captureStartedAtMs = old.captureStartedAtMs || null;
      state.totalElapsedMs = old.totalElapsedMs || 0;
      state.timerRunning = false;
      state.timerRunStartedAtMs = null;
      state.speedMode = old.speedMode || "normal";
      state.lastAutoEnded = old.lastAutoEnded ?? true;
      state.status = "已载入本地缓存；监听仍默认关";
    }

    startPanelTimer();
    updatePanel(true);
    console.log("[CatChat Rescuer v0.3.7] state export loaded.");
  }

  init();
})();
