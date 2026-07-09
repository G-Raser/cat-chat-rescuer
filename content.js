(() => {
  const VERSION = "0.4.2-session-incremental-scan";
  const STATE_SCHEMA_VERSION = 1;
  const MIN_SAFE_ANCHOR_MATCH = 3;
  const MAX_INCREMENTAL_SCAN_STEPS = 900;
  const PANEL_ID = "catchat-rescuer-v030-panel";
  const LEGACY_PANEL_ID = "catchat-rescuer-panel";
  const GLOBAL_KEY = "__catChatRescuer_v030_loaded";
  const DB_NAME = "CatChatRescuerDB_v0_3_6_syntax_hotfix";
  const STORE = "conversations";
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
    status: "v0.4.2：增量扫描只用本轮扫描缓存；合并完整归档需载入旧 JSON",
    captureStartedAtMs: null,
    totalElapsedMs: 0,
    timerRunning: false,
    timerRunStartedAtMs: null,
    autoStartedAtMs: null,
    lastAutoDurationMs: 0,
    autoStep: 0,
    lastTopDistance: null,
    lastScrollDirection: "unknown",
    lastAutoEnded: true,
    previousRescueState: null,
    previousRescueStateName: "",
    previousFullJson: null,
    previousFullJsonName: "",
    countMode: "full",
    incrementalScanCount: 0,
    lastWeakMatch: null
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
    if (state.timerRunning && state.timerRunStartedAtMs) state.totalElapsedMs += nowMs() - state.timerRunStartedAtMs;
    state.timerRunning = false;
    state.timerRunStartedAtMs = null;
  }
  function totalElapsedMs() {
    if (state.timerRunning && state.timerRunStartedAtMs) return state.totalElapsedMs + (nowMs() - state.timerRunStartedAtMs);
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
    if (state.exportOrder === "captureOrder") return [...state.map.values()].sort((a, b) => (a.captureSeq || 0) - (b.captureSeq || 0));
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
  function scrollToBottom() {
    const candidates = scrollableCandidates();
    for (const el of candidates) el.scrollTop = el.scrollHeight;
    const doc = document.scrollingElement || document.documentElement;
    if (doc) doc.scrollTop = doc.scrollHeight;
    window.scrollTo(0, document.body.scrollHeight || document.documentElement.scrollHeight || 99999999);
    state.lastTopDistance = null;
    state.lastScrollDirection = "down";
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
  function createScanSession() {
    return {
      map: new Map(),
      order: [],
      captureSeq: 0,
      startedAt: new Date().toISOString(),
      direction: "up"
    };
  }
  function mergeBatchIntoScanSession(scanSession, batch, direction = "up") {
    scanSession.direction = direction;
    const batchIds = batch.map(m => m.id);
    let added = 0;
    for (const m of batch) {
      if (!scanSession.map.has(m.id)) {
        scanSession.captureSeq += 1;
        scanSession.map.set(m.id, { ...m, captureSeq: scanSession.captureSeq });
        added++;
      }
    }
    if (batchIds.length === 0) return added;
    if (scanSession.order.length === 0) {
      scanSession.order = [...batchIds];
      return added;
    }
    const hasAnchor = batchIds.some(id => scanSession.order.includes(id));
    if (!hasAnchor) {
      if (direction === "up") scanSession.order = [...batchIds, ...scanSession.order];
      else scanSession.order = [...scanSession.order, ...batchIds];
      scanSession.order = [...new Set(scanSession.order)];
      return added;
    }
    let order = scanSession.order.slice();
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
      else if (direction === "up") order.unshift(id);
      else order.push(id);
      prevKnown = id;
    }
    scanSession.order = [...new Set(order)];
    return added;
  }
  function scanSessionMessages(scanSession) {
    const seen = new Set();
    const out = [];
    for (const id of scanSession.order) {
      if (scanSession.map.has(id) && !seen.has(id)) {
        out.push(scanSession.map.get(id));
        seen.add(id);
      }
    }
    for (const m of [...scanSession.map.values()].sort((a, b) => (a.captureSeq || 0) - (b.captureSeq || 0))) {
      if (!seen.has(m.id)) {
        out.push(m);
        seen.add(m.id);
      }
    }
    return out;
  }
  function findTailAnchorMatchInScanSession(scanSession, previousState) {
    return findTailAnchorMatch(scanSessionMessages(scanSession), previousState);
  }
  async function grabVisible(reason = "manual") {
    if (grabLock) return 0;
    state.countMode = "full";
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
    } else if (reason === "auto") state.status = `自动捕获：新增 ${added} 条｜累计 ${state.map.size}`;
    else state.status = `本次新增 ${added} 条｜累计 ${state.map.size}`;
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
    state.countMode = "full";
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
      if (noMovement >= 12) break;
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
    state.countMode = "full";
    state.incrementalScanCount = 0;
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
    state.previousFullJson = null;
    state.previousFullJsonName = "";
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
    return `catchat-${isoDate(exportedAt)}-v042-${state.id}-${isoForFilename(exportedAt)}`;
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
  function sameAnchor(saved, current) {
    return !!saved && !!current && saved.role === current.role && saved.normalized_hash === current.normalized_hash;
  }
  function findTailAnchorMatch(messages, rescueState) {
    const savedAnchors = Array.isArray(rescueState?.tail_anchors) ? rescueState.tail_anchors : [];
    state.lastWeakMatch = null;
    if (savedAnchors.length < MIN_SAFE_ANCHOR_MATCH || messages.length < MIN_SAFE_ANCHOR_MATCH) return null;
    const currentAnchors = messages.map((m, i) => messageAnchor(m, i + 1));
    const maxSize = Math.min(savedAnchors.length, currentAnchors.length);
    for (let size = maxSize; size >= MIN_SAFE_ANCHOR_MATCH; size--) {
      const savedWindow = savedAnchors.slice(savedAnchors.length - size);
      for (let start = currentAnchors.length - size; start >= 0; start--) {
        let ok = true;
        for (let i = 0; i < size; i++) {
          if (!sameAnchor(savedWindow[i], currentAnchors[start + i])) {
            ok = false;
            break;
          }
        }
        if (ok) {
          return {
            window_size: size,
            min_required_window_size: MIN_SAFE_ANCHOR_MATCH,
            match_start_index: start,
            match_end_index: start + size - 1,
            match_start_ordinal: start + 1,
            match_end_ordinal: start + size,
            saved_last_ordinal: savedAnchors[savedAnchors.length - 1]?.ordinal || null,
            current_anchor: currentAnchors[start + size - 1],
            saved_anchor: savedWindow[size - 1]
          };
        }
      }
    }
    for (let size = Math.min(MIN_SAFE_ANCHOR_MATCH - 1, maxSize); size >= 1; size--) {
      const savedWindow = savedAnchors.slice(savedAnchors.length - size);
      for (let start = currentAnchors.length - size; start >= 0; start--) {
        let ok = true;
        for (let i = 0; i < size; i++) {
          if (!sameAnchor(savedWindow[i], currentAnchors[start + i])) {
            ok = false;
            break;
          }
        }
        if (ok) {
          state.lastWeakMatch = { window_size: size, start, end: start + size - 1 };
          return null;
        }
      }
    }
    return null;
  }
  function buildRescueState(messages, exportedAt, outputFiles = {}, extra = {}) {
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
      min_safe_anchor_match: MIN_SAFE_ANCHOR_MATCH,
      message_timestamps_available: false,
      message_capture_timestamps_available: true,
      output_files: outputFiles,
      notes: "Message-level original timestamps are not available from the current DOM capture. captured_at is plugin capture time, not the original ChatGPT message time.",
      ...extra
    };
  }
  function download(filename, content, type) {
    const blob = new Blob([content], { type });
    const a = document.createElement("a");
    const url = URL.createObjectURL(blob);
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
  }
  async function downloadQueued(filename, content, type) {
    download(filename, content, type);
    await sleep(800);
  }
  async function downloadRescueState(messages, exportedAt, baseName, outputFiles = {}, extra = {}) {
    const rescueState = buildRescueState(messages, exportedAt, outputFiles, extra);
    await downloadQueued(`${baseName}.rescue-state.json`, JSON.stringify(rescueState, null, 2), "application/json;charset=utf-8");
    return rescueState;
  }
  function roleLabel(role) {
    return role === "user" ? "主人" : (role === "assistant" ? "猫猫" : role);
  }
  function buildFullJsonData(messages, exportedAt, extra = {}) {
    return {
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
      ...extra,
      messages: messages.map((m, i) => ({ ...m, index: i + 1 }))
    };
  }
  function buildFullMarkdown(messages, exportedAt, rescueStateFilename, extra = {}) {
    const rawCapturedCount = extra.raw_captured_count ?? extra.rawCapturedCount ?? state.map.size;
    let md = "---\n";
    md += `title: ${yamlString(state.title)}\n`;
    md += `date: ${yamlString(isoDate(exportedAt))}\n`;
    md += `timezone: ${yamlString("UTC")}\n`;
    md += `exported_at: ${yamlString(exportedAt)}\n`;
    md += `conversation_id: ${yamlString(state.id)}\n`;
    md += `url: ${yamlString(state.url)}\n`;
    md += `message_count: ${messages.length}\n`;
    md += `raw_captured_count: ${rawCapturedCount}\n`;
    md += `export_order: ${yamlString(exportOrderLabel())}\n`;
    md += `total_elapsed: ${yamlString(fmtDuration(totalElapsedMs()))}\n`;
    md += `speed: ${yamlString(speedConfig().label)}\n`;
    md += `exporter_version: ${yamlString(VERSION)}\n`;
    md += "message_timestamps_available: false\n";
    md += "message_capture_timestamps_available: true\n";
    md += `rescue_state_file: ${yamlString(rescueStateFilename)}\n`;
    for (const [key, value] of Object.entries(extra)) md += `${key}: ${yamlString(value)}\n`;
    md += "---\n\n";
    md += `# ${escapeMd(state.title)}\n\n`;
    md += `- exporter_version: ${VERSION}\n`;
    md += `- date: ${isoDate(exportedAt)}\n`;
    md += `- timezone: UTC\n`;
    md += `- conversation_id: \`${state.id}\`\n`;
    md += `- exported_at: ${exportedAt}\n`;
    md += `- url: ${state.url}\n`;
    md += `- message_count: ${messages.length}\n`;
    md += `- raw_captured_count: ${rawCapturedCount}\n`;
    md += `- export_order: ${exportOrderLabel()}\n`;
    md += `- total_elapsed: ${fmtDuration(totalElapsedMs())}\n`;
    md += `- speed: ${speedConfig().label}\n`;
    md += `- message_timestamps_available: false\n`;
    md += `- message_capture_timestamps_available: true\n`;
    md += `- rescue_state_file: \`${rescueStateFilename}\`\n\n`;
    md += `> Note: message block headers use sequence numbers only. Original ChatGPT message timestamps are not available from the current DOM capture; capturedAt remains available in JSON and rescue-state anchors.\n\n`;
    for (let i = 0; i < messages.length; i++) {
      const m = messages[i];
      const index = String(i + 1).padStart(4, "0");
      md += `## ${roleLabel(m.role)}｜${index}\n\n${escapeMd(m.text)}\n\n`;
    }
    return md;
  }
  async function exportJSON() {
    await grabVisible("export");
    const exportedAt = new Date().toISOString();
    const baseName = baseExportName(exportedAt);
    const rawMessages = orderedMessages();
    const jsonFilename = `${baseName}.json`;
    const stateFilename = `${baseName}.rescue-state.json`;
    const data = buildFullJsonData(rawMessages, exportedAt, { rescueStateFile: stateFilename });
    state.status = `正在导出 JSON…｜${rawMessages.length} 条`;
    updatePanel(true);
    await downloadQueued(jsonFilename, JSON.stringify(data, null, 2), "application/json;charset=utf-8");
    state.status = "JSON 已发送下载，正在导出 State…";
    updatePanel(true);
    await downloadRescueState(rawMessages, exportedAt, baseName, { json: jsonFilename, rescue_state: stateFilename });
    state.status = `已导出 JSON + State｜${rawMessages.length} 条`;
    updatePanel(true);
  }
  async function exportMarkdown() {
    await grabVisible("export");
    const exportedAt = new Date().toISOString();
    const baseName = baseExportName(exportedAt);
    const messages = orderedMessages();
    const mdFilename = `${baseName}.md`;
    const stateFilename = `${baseName}.rescue-state.json`;
    const md = buildFullMarkdown(messages, exportedAt, stateFilename);
    state.status = `正在导出 MD…｜${messages.length} 条`;
    updatePanel(true);
    await downloadQueued(mdFilename, md, "text/markdown;charset=utf-8");
    state.status = "MD 已发送下载，正在导出 State…";
    updatePanel(true);
    await downloadRescueState(messages, exportedAt, baseName, { markdown: mdFilename, rescue_state: stateFilename });
    state.status = `已导出 MD + State｜${messages.length} 条`;
    updatePanel(true);
  }
  async function exportStateOnly() {
    await grabVisible("export");
    const exportedAt = new Date().toISOString();
    const baseName = baseExportName(exportedAt);
    const messages = orderedMessages();
    await downloadRescueState(messages, exportedAt, baseName, { rescue_state: `${baseName}.rescue-state.json` });
    state.status = `已导出 State｜${messages.length} 条｜锚点 ${Math.min(10, messages.length)} 条`;
    updatePanel(true);
  }
  function readFileText(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(reader.error || new Error("File read failed"));
      reader.readAsText(file, "utf-8");
    });
  }
  async function loadStateFile(file) {
    if (!file) return;
    try {
      const text = await readFileText(file);
      const parsed = JSON.parse(text);
      if (!Array.isArray(parsed.tail_anchors)) throw new Error("Missing tail_anchors");
      if (parsed.tail_anchors.length < MIN_SAFE_ANCHOR_MATCH) throw new Error(`tail_anchors 少于 ${MIN_SAFE_ANCHOR_MATCH} 条，不适合安全增量`);
      if (parsed.conversation_id && parsed.conversation_id !== state.id) {
        const ok = confirm(`State conversation_id 与当前窗口不同。\nState: ${parsed.conversation_id}\nCurrent: ${state.id}\n仍然载入吗？`);
        if (!ok) return;
      }
      state.previousRescueState = parsed;
      state.previousRescueStateName = file.name;
      state.status = `已载入 State：${file.name}｜旧消息 ${parsed.message_count ?? "?"}｜锚点 ${parsed.tail_anchors.length}｜稳定匹配需≥${MIN_SAFE_ANCHOR_MATCH}`;
      updatePanel(true);
    } catch (e) {
      console.error("[CatChat Rescuer] state load failed", e);
      state.status = `State 载入失败：${e.message || e}`;
      updatePanel(true);
    }
  }
  async function loadPreviousFullJsonFile(file) {
    if (!file) return;
    try {
      const text = await readFileText(file);
      const parsed = JSON.parse(text);
      if (!Array.isArray(parsed.messages)) throw new Error("Missing messages array");
      state.previousFullJson = parsed;
      state.previousFullJsonName = file.name;
      state.status = `已载入旧 JSON：${file.name}｜旧全文 ${parsed.messages.length} 条｜可生成 combined-full`;
      updatePanel(true);
    } catch (e) {
      console.error("[CatChat Rescuer] previous full JSON load failed", e);
      state.previousFullJson = null;
      state.previousFullJsonName = "";
      state.status = `旧 JSON 载入失败：${e.message || e}`;
      updatePanel(true);
    }
  }
  function buildIncrementalMarkdown(newMessages, previousState, match, exportedAt, filenames, scanMessageCount) {
    let md = "---\n";
    md += `title: ${yamlString(`${state.title}｜incremental patch`)}\n`;
    md += `date: ${yamlString(isoDate(exportedAt))}\n`;
    md += `timezone: ${yamlString("UTC")}\n`;
    md += `exported_at: ${yamlString(exportedAt)}\n`;
    md += `conversation_id: ${yamlString(state.id)}\n`;
    md += `mode: ${yamlString("incremental_patch")}\n`;
    md += `previous_state_file: ${yamlString(state.previousRescueStateName || "loaded rescue-state")}\n`;
    md += `previous_message_count: ${Number(previousState.message_count || 0)}\n`;
    md += `new_message_count: ${newMessages.length}\n`;
    md += `match_window_size: ${match.window_size}\n`;
    md += `min_required_window_size: ${MIN_SAFE_ANCHOR_MATCH}\n`;
    md += `match_end_ordinal: ${match.match_end_ordinal}\n`;
    md += `updated_rescue_state_file: ${yamlString(filenames.state)}\n`;
    md += "message_timestamps_available: false\n";
    md += "message_capture_timestamps_available: true\n";
    md += "---\n\n";
    md += `# ${escapeMd(state.title)}｜incremental patch\n\n`;
    md += `- mode: incremental_patch\n`;
    md += `- previous_state_file: ${state.previousRescueStateName || "loaded rescue-state"}\n`;
    md += `- previous_message_count: ${Number(previousState.message_count || 0)}\n`;
    md += `- current_scan_message_count: ${scanMessageCount}\n`;
    md += `- new_message_count: ${newMessages.length}\n`;
    md += `- match_window_size: ${match.window_size}\n`;
    md += `- min_required_window_size: ${MIN_SAFE_ANCHOR_MATCH}\n`;
    md += `- match_end_ordinal: ${match.match_end_ordinal}\n`;
    md += `- exported_at: ${exportedAt}\n\n`;
    if (!newMessages.length) {
      md += `> No new messages were found after the matched tail anchor.\n\n`;
      return md;
    }
    const baseIndex = Number(previousState.message_count || match.match_end_ordinal || 0);
    for (let i = 0; i < newMessages.length; i++) {
      const m = newMessages[i];
      const ordinal = String(baseIndex + i + 1).padStart(4, "0");
      md += `## ${roleLabel(m.role)}｜${ordinal}\n\n${escapeMd(m.text)}\n\n`;
    }
    return md;
  }
  async function scanForIncrementalMatch(previous) {
    const scanSession = createScanSession();
    state.countMode = "incremental";
    state.incrementalScanCount = 0;
    state.autoScrolling = true;
    state.lastAutoEnded = false;
    state.autoStartedAtMs = nowMs();
    state.autoStep = 0;
    state.lastWeakMatch = null;
    startTotalTimer(false);
    suppressScrollGrabUntilMs = nowMs() + 1000;
    state.status = `增量扫描准备中：先跳到底部，再向上找旧尾巴锚点；稳定匹配需≥${MIN_SAFE_ANCHOR_MATCH} 条…`;
    updatePanel(true);
    scrollToBottom();
    await sleep(1200);
    let match = null;
    let scanResult = null;
    let noMovement = 0;
    for (let i = 0; i <= MAX_INCREMENTAL_SCAN_STEPS && state.autoScrolling; i++) {
      state.autoStep = i;
      const before = posSnapshot();
      const beforeTop = topDistance();
      const batch = extractMessagesFromDOM();
      const added = mergeBatchIntoScanSession(scanSession, batch, "up");
      const currentScanMessages = scanSessionMessages(scanSession);
      state.incrementalScanCount = currentScanMessages.length;
      match = findTailAnchorMatchInScanSession(scanSession, previous);
      if (match && match.window_size >= MIN_SAFE_ANCHOR_MATCH) {
        state.status = `已找到稳定旧尾巴｜匹配 ${match.window_size} 条｜扫描 ${i} 步｜完整缓存 ${state.map.size}｜本轮扫描 ${currentScanMessages.length}`;
        updatePanel(true);
        scanResult = { match, scanMessages: currentScanMessages };
        break;
      }
      const weak = state.lastWeakMatch ? `｜弱匹配 ${state.lastWeakMatch.window_size} 条，继续找` : "";
      state.status = `增量扫描中：第 ${i + 1} 步｜本轮新增 ${added}｜完整缓存 ${state.map.size}｜本轮扫描 ${currentScanMessages.length}${weak}`;
      updatePanel();
      scrollUpOneStep();
      await sleep(speedConfig().delay);
      const after = posSnapshot();
      const afterTop = topDistance();
      if (after === before || Math.abs(afterTop - beforeTop) < 2) noMovement += 1;
      else noMovement = 0;
      if (afterTop <= 5 && noMovement >= 3) break;
      if (noMovement >= 12) break;
    }
    if (state.autoStartedAtMs) state.lastAutoDurationMs = nowMs() - state.autoStartedAtMs;
    state.autoStartedAtMs = null;
    state.lastAutoEnded = true;
    stopTotalTimer();
    state.autoScrolling = false;
    return scanResult;
  }
  async function exportIncrementalPatch() {
    if (state.autoScrolling) return;
    const previous = state.previousRescueState;
    if (!previous) {
      state.status = "请先点「载入 State」，再点「增量扫描」";
      updatePanel(true);
      return;
    }
    const scanResult = await scanForIncrementalMatch(previous);
    if (!scanResult) {
      const weak = state.lastWeakMatch ? `\n只找到 ${state.lastWeakMatch.window_size} 条弱匹配；安全阈值是 ${MIN_SAFE_ANCHOR_MATCH} 条。` : "";
      state.status = `增量失败：未找到≥${MIN_SAFE_ANCHOR_MATCH}条连续旧尾巴锚点，未导出文件｜完整缓存 ${state.map.size}｜本轮扫描 ${state.incrementalScanCount}`;
      updatePanel(true);
      alert(`增量失败：没有找到稳定旧尾巴锚点。${weak}\n没有导出任何文件。\n可以切到慢速/普通，或手动滚到接近旧尾巴附近后再试。`);
      return;
    }
    const { match, scanMessages } = scanResult;
    const exportedAt = new Date().toISOString();
    const baseName = `${baseExportName(exportedAt)}-incremental`;
    const patchJsonFilename = `${baseName}.patch.json`;
    const patchMdFilename = `${baseName}.patch.md`;
    const loadedOldMessages = Array.isArray(state.previousFullJson?.messages) ? state.previousFullJson.messages : null;
    const expectedOldCount = Number(previous.message_count || 0);
    const previousJsonCountMatches = !!loadedOldMessages && (!expectedOldCount || loadedOldMessages.length === expectedOldCount);
    const hasPreviousFullJson = !!loadedOldMessages && previousJsonCountMatches;
    const combinedJsonFilename = hasPreviousFullJson ? `${baseName}.combined-full.json` : "";
    const combinedMdFilename = hasPreviousFullJson ? `${baseName}.combined-full.md` : "";
    const stateFilename = hasPreviousFullJson ? `${baseName}.rescue-state.json` : `${baseName}.patch-only.rescue-state.json`;
    const newMessages = scanMessages.slice(match.match_end_index + 1);
    const oldMessages = hasPreviousFullJson ? loadedOldMessages : [];
    const combinedMessages = hasPreviousFullJson ? [...oldMessages, ...newMessages] : [];
    const incrementalMessages = newMessages.map((m, i) => ({
      incrementalIndex: i + 1,
      absoluteIndex: Number(previous.message_count || match.match_end_ordinal || 0) + i + 1,
      ...m
    }));
    const patchJsonData = {
      exporterVersion: VERSION,
      exportedAt,
      date: isoDate(exportedAt),
      timezone: "UTC",
      mode: "incremental_patch_after_strict_anchor_scan",
      conversationId: state.id,
      title: state.title,
      url: state.url,
      previousStateFile: state.previousRescueStateName || "loaded rescue-state",
      previousFullJsonFile: state.previousFullJsonName || null,
      previousMessageCount: previous.message_count || null,
      currentScanMessageCount: scanMessages.length,
      newMessageCount: newMessages.length,
      minSafeAnchorMatch: MIN_SAFE_ANCHOR_MATCH,
      match,
      messageTimestampsAvailable: false,
      messageCaptureTimestampsAvailable: true,
      updatedRescueStateFile: stateFilename,
      combinedFullJsonFile: combinedJsonFilename || null,
      combinedFullMarkdownFile: combinedMdFilename || null,
      combinedFullGenerated: hasPreviousFullJson,
      note: hasPreviousFullJson ? "combined-full was generated from loaded previous full JSON plus this patch." : (loadedOldMessages ? "旧 JSON 消息数与旧 State 不一致，因此未生成真正 combined-full；state 只是 patch-only / scan-session state。" : "未载入旧 JSON，因此未生成真正 combined-full；state 只是 patch-only / scan-session state。"),
      messages: incrementalMessages
    };
    const patchMd = buildIncrementalMarkdown(newMessages, previous, match, exportedAt, { json: patchJsonFilename, markdown: patchMdFilename, state: stateFilename }, scanMessages.length);
    state.status = hasPreviousFullJson
      ? `已匹配稳定尾巴｜旧 ${oldMessages.length}｜新增 ${newMessages.length}｜合并 ${combinedMessages.length}｜完整缓存 ${state.map.size}｜本轮扫描 ${scanMessages.length}｜正在导出…`
      : `已匹配稳定尾巴｜新增 ${newMessages.length}｜${loadedOldMessages ? "旧 JSON 与 State 数量不一致" : "未载入旧 JSON"}，因此未生成真正 combined-full｜完整缓存 ${state.map.size}｜本轮扫描 ${scanMessages.length}｜正在导出 patch…`;
    updatePanel(true);
    await downloadQueued(patchJsonFilename, JSON.stringify(patchJsonData, null, 2), "application/json;charset=utf-8");
    await downloadQueued(patchMdFilename, patchMd, "text/markdown;charset=utf-8");
    if (hasPreviousFullJson) {
      const combinedJsonData = buildFullJsonData(combinedMessages, exportedAt, {
        mode: "combined_full_after_session_incremental_scan",
        previousStateFile: state.previousRescueStateName || "loaded rescue-state",
        previousFullJsonFile: state.previousFullJsonName || "loaded previous full JSON",
        previousMessageCount: previous.message_count || oldMessages.length,
        incrementalNewMessageCount: newMessages.length,
        minSafeAnchorMatch: MIN_SAFE_ANCHOR_MATCH,
        incrementalMatch: match,
        rescueStateFile: stateFilename,
        incrementalPatchJsonFile: patchJsonFilename,
        incrementalPatchMarkdownFile: patchMdFilename,
        rawCapturedCount: combinedMessages.length
      });
      const combinedMd = buildFullMarkdown(combinedMessages, exportedAt, stateFilename, {
        mode: "combined_full_after_session_incremental_scan",
        previous_state_file: state.previousRescueStateName || "loaded rescue-state",
        previous_full_json_file: state.previousFullJsonName || "loaded previous full JSON",
        previous_message_count: String(previous.message_count || oldMessages.length),
        incremental_new_message_count: String(newMessages.length),
        rawCapturedCount: combinedMessages.length,
        min_safe_anchor_match: String(MIN_SAFE_ANCHOR_MATCH),
        incremental_patch_json_file: patchJsonFilename,
        incremental_patch_markdown_file: patchMdFilename
      });
      await downloadQueued(combinedJsonFilename, JSON.stringify(combinedJsonData, null, 2), "application/json;charset=utf-8");
      await downloadQueued(combinedMdFilename, combinedMd, "text/markdown;charset=utf-8");
      await downloadRescueState(combinedMessages, exportedAt, baseName, {
        incremental_patch_json: patchJsonFilename,
        incremental_patch_markdown: patchMdFilename,
        combined_full_json: combinedJsonFilename,
        combined_full_markdown: combinedMdFilename,
        rescue_state: stateFilename
      }, {
        mode: "combined_full_after_session_incremental_scan",
        previous_state_file: state.previousRescueStateName || "loaded rescue-state",
        previous_full_json_file: state.previousFullJsonName || "loaded previous full JSON",
        previous_message_count: previous.message_count || oldMessages.length,
        incremental_new_message_count: newMessages.length,
        combined_message_count: combinedMessages.length,
        raw_captured_count: combinedMessages.length,
        min_safe_anchor_match: MIN_SAFE_ANCHOR_MATCH,
        incremental_match: match
      });
      state.status = `增量完成｜旧 ${oldMessages.length}｜新增 ${newMessages.length}｜合并 ${combinedMessages.length}｜稳定匹配 ${match.window_size}｜完整缓存 ${state.map.size}｜本轮扫描 ${scanMessages.length}`;
    } else {
      await downloadRescueState(scanMessages, exportedAt, `${baseName}.patch-only`, {
        incremental_patch_json: patchJsonFilename,
        incremental_patch_markdown: patchMdFilename,
        patch_only_rescue_state: stateFilename
      }, {
        mode: "patch_only_after_session_incremental_scan",
        previous_state_file: state.previousRescueStateName || "loaded rescue-state",
        previous_message_count: previous.message_count || null,
        incremental_new_message_count: newMessages.length,
        current_scan_message_count: scanMessages.length,
        raw_captured_count: scanMessages.length,
        min_safe_anchor_match: MIN_SAFE_ANCHOR_MATCH,
        incremental_match: match,
        warning: loadedOldMessages ? "旧 JSON 消息数与旧 State 不一致，因此未生成真正 combined-full；此 state 只描述本轮扫描结果，不代表旧完整归档。" : "未载入旧 JSON，因此未生成真正 combined-full；此 state 只描述本轮扫描结果，不代表旧完整归档。"
      });
      state.status = `增量完成｜新增 ${newMessages.length}｜${loadedOldMessages ? "旧 JSON 与 State 数量不一致" : "未载入旧 JSON"}，因此未生成真正 combined-full｜稳定匹配 ${match.window_size}｜完整缓存 ${state.map.size}｜本轮扫描 ${scanMessages.length}`;
    }
    updatePanel(true);
  }
  function makePanel() {
    document.getElementById(LEGACY_PANEL_ID)?.remove();
    document.getElementById(PANEL_ID)?.remove();
    const panel = document.createElement("div");
    panel.id = PANEL_ID;
    panel.innerHTML = `
      <div class="ccr-title">
        <span>猫茶抢救器 v0.4.2</span>
        <button id="ccr-hide" title="Hide">×</button>
      </div>
      <div class="ccr-count"><span id="ccr-count-label">完整缓存</span>：<span id="ccr-count">0</span></div>
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
        <button id="ccr-load-state">载入 State</button>
        <button id="ccr-load-json">载入旧 JSON</button>
        <button id="ccr-incremental">增量扫描</button>
        <button id="ccr-reset">重置计时</button>
        <button id="ccr-clear">清空插件缓存</button>
        <input id="ccr-state-file" type="file" accept="application/json,.json" style="display:none" />
        <input id="ccr-json-file" type="file" accept="application/json,.json" style="display:none" />
      </div>
      <div class="ccr-status" id="ccr-status">v0.4.2：增量扫描只用本轮扫描缓存；合并完整归档需载入旧 JSON</div>
    `;
    document.body.appendChild(panel);
    const stateFileInput = panel.querySelector("#ccr-state-file");
    const jsonFileInput = panel.querySelector("#ccr-json-file");
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
    panel.querySelector("#ccr-load-state").onclick = () => stateFileInput.click();
    panel.querySelector("#ccr-load-json").onclick = () => jsonFileInput.click();
    panel.querySelector("#ccr-incremental").onclick = () => exportIncrementalPatch();
    panel.querySelector("#ccr-reset").onclick = () => resetTimer();
    panel.querySelector("#ccr-clear").onclick = () => clearCurrent();
    stateFileInput.onchange = () => loadStateFile(stateFileInput.files?.[0]);
    jsonFileInput.onchange = () => loadPreviousFullJsonFile(jsonFileInput.files?.[0]);
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
    const showingIncremental = state.countMode === "incremental";
    setText("ccr-count-label", showingIncremental ? "本轮扫描" : "完整缓存", force);
    setText("ccr-count", String(showingIncremental ? state.incrementalScanCount : state.map.size), force);
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
      state.status = `已载入本地缓存；增量请先载入 State。合并完整归档需载入旧 JSON。稳定匹配需≥${MIN_SAFE_ANCHOR_MATCH}条`;
    }
    startPanelTimer();
    updatePanel(true);
    console.log("[CatChat Rescuer v0.4.2] session incremental scan loaded.");
  }
  init();
})();
