(() => {
  if (globalThis.__CCR_UI_CONTROLLER__) return;
  globalThis.__CCR_UI_CONTROLLER__ = true;
  globalThis.__CCR_THINKING_EXPORT_V2__ = true;
  const PANEL_ID = "catchat-rescuer-v030-panel", VERSION = chrome.runtime.getManifest().version;
  const CK = "catchat-rescuer-panel-collapsed", QK = "catchat-rescuer-quick-collapsed", TK = "catchat-rescuer-thinking-collapsed", UK = "catchat-rescuer-export-label-user", AK = "catchat-rescuer-export-label-assistant", CTK = "catchat-rescuer-conversation-timestamps", TTK = "catchat-rescuer-thinking-timestamps";
  let raw = null, data = null, timer = null, started = 0;
  const q = (s, r = document) => r.querySelector(s), qa = (s, r = document) => [...r.querySelectorAll(s)];
  function projectId(path = location.pathname) { const p = path.split("/").filter(Boolean), i = p.lastIndexOf("g"), v = p[i + 1]; return i >= 0 && v?.startsWith("g-p-") ? v : null; }
  function currentId() { return location.pathname.match(/\/c\/([^/?#]+)/)?.[1] || q("[data-conversation-id]")?.getAttribute("data-conversation-id") || null; }
  function parseRef(v) {
    const s = String(v || "").trim(); if (!s) return null;
    try { const u = new URL(s); if (!["chatgpt.com", "chat.openai.com"].includes(u.hostname)) throw new Error("不是 ChatGPT 对话链接"); const p = u.pathname.split("/").filter(Boolean), i = p.lastIndexOf("c"), id = p[i + 1]; if (i < 0 || !id) throw new Error("链接里没有找到 conversation ID"); return { id, project: projectId(u.pathname), label: "链接对话" }; } catch (e) { if (/^https?:/i.test(s) && e?.message && !/Invalid URL/i.test(e.message)) throw e; }
    if (/^[A-Za-z0-9_-]{8,}$/.test(s)) return { id: s, project: null, label: "指定对话" };
    throw new Error("无法识别这个对话链接或 conversation ID");
  }
  function target() { const typed = q("#ccr-api-reference")?.value?.trim(); if (typed) return parseRef(typed); const id = currentId(); if (!id) throw new Error("当前页面没有识别到 conversation ID"); return { id, project: projectId(), label: "当前对话" }; }
  function request(t) { return new Promise((resolve, reject) => chrome.runtime.sendMessage({ type: "CCR_API_READ", conversationId: t.id, projectId: t.project }, (r) => { if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message)); r?.ok && r.conversation ? resolve(r.conversation) : reject(new Error(r?.error || "API 读取失败")); })); }
  function labels() { return { user: localStorage.getItem(UK)?.trim() || "User", assistant: localStorage.getItem(AK)?.trim() || "Assistant" }; }
  function settingBool(key, fallback = true) { const v = localStorage.getItem(key); return v == null ? fallback : v !== "0"; }
  function setBool(key, value) { localStorage.setItem(key, value ? "1" : "0"); }
  function setText(id, text) { const el = q(`#${id}`); if (el) el.textContent = text; }
  function enabled(on) { for (const id of ["ccr-api-md", "ccr-api-raw", "ccr-thinking-md", "ccr-thinking-txt", "ccr-thinking-raw-md", "ccr-thinking-raw-txt", "ccr-thinking-probe"]) { const el = q(`#${id}`); if (el) el.disabled = !on; } }
  function stopTimer() { if (timer) clearInterval(timer); timer = null; }
  function startTimer(label) { stopTimer(); started = Date.now(); setText("ccr-api-status", `⟳ ${label}读取中 · 0s`); timer = setInterval(() => setText("ccr-api-status", `⟳ ${label}读取中 · ${Math.floor((Date.now() - started) / 1000)}s`), 1000); }
  function scope() { return q("#ccr-thinking-scope")?.value === "tree" ? "tree" : "current"; }
  function scopeLabel(s) { return s === "tree" ? "整棵对话树" : "当前分支"; }
  function includeConversationTimestamps() { return q("#ccr-conversation-timestamps")?.checked ?? true; }
  function includeThinkingTimestamps() { return q("#ccr-thinking-timestamps")?.checked ?? true; }
  function refreshThinking() { if (!data) return setText("ccr-thinking-status", "先读取内容；随后可直接导出思考轨迹"); const s = scope(), n = CCRApiData.scopeTurns(data, s).length; setText("ccr-thinking-status", `${scopeLabel(s)}｜${n} 个思考回合｜${data.source?.mode || "unknown"}`); }
  function download(name, content, type) { const url = URL.createObjectURL(new Blob([content], { type })), a = document.createElement("a"); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 3000); }
  function base() { return `catchat-api-${new Date().toISOString().slice(0, 10)}-${CCRApiData.safeFilename(data?.title)}-${data?.conversationId || "unknown"}`; }
  async function read() {
    let t; try { t = target(); } catch (e) { return setText("ccr-api-status", e?.message || String(e)); }
    raw = data = null; enabled(false); setText("ccr-thinking-status", "正在等待读取内容…"); startTimer(`${t.label} `);
    try { raw = await request(t); data = CCRApiData.normalize(raw); stopTimer(); setText("ccr-api-status", `已读｜正文 ${data.messages.length}｜思考 当前 ${data.contentThinkingTurnsOnCurrentPath.length} / 全树 ${data.contentThinkingTurns.length}｜${data.source?.mode || "unknown"}`); enabled(true); refreshThinking(); } catch (e) { stopTimer(); raw = data = null; enabled(false); setText("ccr-api-status", `读取失败：${e?.message || e}`); setText("ccr-thinking-status", "读取失败，暂无可导出的思考轨迹"); }
  }
  function fold(section, key) {
    if (!section) return;
    section.dataset.ccrFoldable = "1"; section.classList.add("ccr-foldable");
    const head = section.firstElementChild; if (!head?.classList.contains("ccr-section-heading")) return;
    const x = document.createElement("span"); x.className = "ccr-section-toggle"; head.appendChild(x);
    const apply = (c) => { section.classList.toggle("ccr-section-collapsed", c); x.textContent = c ? "+" : "−"; };
    apply(localStorage.getItem(key) === "1");
    head.onclick = (e) => { if (e.target.closest("input,select,button,a,label")) return; const c = !section.classList.contains("ccr-section-collapsed"); localStorage.setItem(key, c ? "1" : "0"); apply(c); };
  }
  function collapse(panel, c) { panel.classList.toggle("ccr-collapsed", c); localStorage.setItem(CK, c ? "1" : "0"); const b = q("#ccr-hide", panel); if (b) b.textContent = c ? "+" : "−"; }
  function styles() {
    if (q("#ccr-ui-v2-style")) return;
    const s = document.createElement("style"); s.id = "ccr-ui-v2-style";
    s.textContent = `#${PANEL_ID} .ccr-export-row{grid-template-columns:1fr 1fr!important}#${PANEL_ID} .ccr-thinking{padding:10px!important;border-radius:13px!important;background:rgba(255,255,255,.045)!important;border:1px solid rgba(255,255,255,.07)!important}#${PANEL_ID} .ccr-thinking-controls{display:grid!important;gap:7px!important}#${PANEL_ID} .ccr-thinking-controls label:not(.ccr-check),#${PANEL_ID} .ccr-thinking select{width:100%!important;box-sizing:border-box!important}#${PANEL_ID} .ccr-thinking-controls label:not(.ccr-check){display:grid!important;gap:4px!important;color:rgba(247,243,251,.62)!important;font-size:10px!important}#${PANEL_ID} .ccr-thinking select{border:1px solid rgba(255,255,255,.10)!important;border-radius:9px!important;padding:7px 9px!important;background:rgba(0,0,0,.18)!important;color:#faf8fc!important;font-size:12px!important}#${PANEL_ID} .ccr-thinking-export-row,#${PANEL_ID} .ccr-thinking-dev-grid{display:grid!important;grid-template-columns:1fr 1fr!important;gap:6px!important;margin-top:7px!important}#${PANEL_ID} .ccr-thinking-dev-grid button:last-child{grid-column:1/-1!important}#${PANEL_ID} .ccr-thinking-status{margin-top:8px!important;padding:7px 8px!important;border-radius:9px!important;background:rgba(0,0,0,.14)!important;color:rgba(247,243,251,.72)!important;font-size:11px!important}#${PANEL_ID} .ccr-foldable>.ccr-section-heading{cursor:pointer!important;user-select:none!important}#${PANEL_ID} .ccr-foldable.ccr-section-collapsed>:not(.ccr-section-heading){display:none!important}#${PANEL_ID} .ccr-section-toggle{margin-left:auto!important;min-width:18px!important;text-align:center!important;color:rgba(247,243,251,.62)!important;font-size:15px!important;font-weight:700!important}#${PANEL_ID} .ccr-export-options{display:flex!important;gap:10px!important;align-items:center!important;margin-top:7px!important;color:rgba(247,243,251,.68)!important;font-size:11px!important}#${PANEL_ID} .ccr-check{display:inline-flex!important;align-items:center!important;gap:6px!important;cursor:pointer!important;user-select:none!important}#${PANEL_ID} .ccr-check input{width:auto!important;min-width:0!important;margin:0!important;accent-color:#cdb9ff!important}`;
    document.head.appendChild(s);
  }
  function mount() {
    const panel = q(`#${PANEL_ID}`), oldButtons = panel && q(".ccr-buttons", panel); if (!panel || !oldButtons) return false;
    try {
      styles();
      const oldCount = q(".ccr-count", panel), oldTimers = q(".ccr-timers", panel), oldStatus = q("#ccr-status", panel);
      const body = document.createElement("div"); body.id = "ccr-unified-body"; body.className = "ccr-body";
      const quick = document.createElement("section"); quick.className = "ccr-quick";
      quick.innerHTML = `<div class="ccr-section-heading"><div><strong>读取内容</strong><small>API 直读一次，后续导出共用缓存</small></div><span class="ccr-badge">${VERSION}</span></div><input id="ccr-api-reference" type="text" placeholder="留空读取当前对话；或粘贴 /c/… 链接 / conversation ID"><button id="ccr-api-read" class="ccr-primary" type="button">读取内容</button><div class="ccr-export-row"><button id="ccr-api-md" disabled>可读 MD</button><button id="ccr-api-raw" disabled>Raw JSON</button></div><div class="ccr-export-options"><label class="ccr-check"><input id="ccr-conversation-timestamps" type="checkbox"><span>导出时间戳</span></label></div><div id="ccr-api-status" class="ccr-api-status">尚未读取</div><details class="ccr-label-settings"><summary>导出称呼</summary><div class="ccr-label-grid"><label><span>人类名</span><input id="ccr-label-user" maxlength="40"></label><label><span>AI名</span><input id="ccr-label-assistant" maxlength="40"></label><button id="ccr-label-reset" type="button">恢复 User / Assistant</button></div></details>`;
      const thinking = document.createElement("section"); thinking.id = "ccr-thinking-section"; thinking.className = "ccr-thinking";
      thinking.innerHTML = `<div class="ccr-section-heading"><div><strong>思考轨迹</strong><small>使用上方已读取内容；只计有正文的 thoughts</small></div></div><div class="ccr-thinking-controls"><label><span>导出范围</span><select id="ccr-thinking-scope"><option value="current">当前分支</option><option value="tree">整棵对话树</option></select></label><label class="ccr-check"><input id="ccr-thinking-timestamps" type="checkbox"><span>导出时间戳</span></label></div><div class="ccr-thinking-export-row"><button id="ccr-thinking-md" disabled>思考轨迹 MD</button><button id="ccr-thinking-txt" disabled>总文本 TXT</button></div><div id="ccr-thinking-status" class="ccr-thinking-status">先读取内容；随后可直接导出思考轨迹</div><details class="ccr-thinking-dev"><summary>开发诊断 / 完整原始轨迹</summary><div class="ccr-thinking-dev-grid"><button id="ccr-thinking-raw-md" disabled>完整 MD</button><button id="ccr-thinking-raw-txt" disabled>完整 TXT</button><button id="ccr-thinking-probe" disabled>探针 JSON</button></div></details>`;
      const legacy = document.createElement("details"); legacy.className = "ccr-legacy"; legacy.innerHTML = "<summary>传统 DOM / 增量抢救工具</summary>";
      q("#ccr-api-read", quick).onclick = read; q("#ccr-api-reference", quick).onkeydown = (e) => { if (e.key === "Enter") read(); };
      const conversationTs = q("#ccr-conversation-timestamps", quick); conversationTs.checked = settingBool(CTK, true); conversationTs.onchange = () => setBool(CTK, conversationTs.checked);
      const thinkingTs = q("#ccr-thinking-timestamps", thinking); thinkingTs.checked = settingBool(TTK, true); thinkingTs.onchange = () => setBool(TTK, thinkingTs.checked);
      q("#ccr-api-md", quick).onclick = () => data && download(`${base()}.md`, CCRApiData.conversationMarkdown(data, labels(), { includeTimestamps: includeConversationTimestamps() }), "text/markdown;charset=utf-8");
      q("#ccr-api-raw", quick).onclick = () => raw && download(`${base()}.raw.json`, JSON.stringify(raw, null, 2), "application/json;charset=utf-8");
      const userInput = q("#ccr-label-user", quick), assistantInput = q("#ccr-label-assistant", quick), sync = () => { const l = labels(); userInput.value = l.user; assistantInput.value = l.assistant; };
      sync(); userInput.onchange = () => { userInput.value.trim() ? localStorage.setItem(UK, userInput.value.trim()) : localStorage.removeItem(UK); sync(); }; assistantInput.onchange = () => { assistantInput.value.trim() ? localStorage.setItem(AK, assistantInput.value.trim()) : localStorage.removeItem(AK); sync(); }; q("#ccr-label-reset", quick).onclick = () => { localStorage.removeItem(UK); localStorage.removeItem(AK); sync(); };
      q("#ccr-thinking-scope", thinking).onchange = refreshThinking;
      q("#ccr-thinking-md", thinking).onclick = () => data && download(`${base()}-thinking-${scope()}.md`, CCRApiData.thinkingMarkdown(data, scope(), false, { includeTimestamps: includeThinkingTimestamps() }), "text/markdown;charset=utf-8");
      q("#ccr-thinking-txt", thinking).onclick = () => data && download(`${base()}-thinking-${scope()}.txt`, CCRApiData.thinkingText(data, scope(), false, { includeTimestamps: includeThinkingTimestamps() }), "text/plain;charset=utf-8");
      q("#ccr-thinking-raw-md", thinking).onclick = () => data && download(`${base()}-thinking-full.md`, CCRApiData.thinkingMarkdown(data, scope(), true, { includeTimestamps: includeThinkingTimestamps() }), "text/markdown;charset=utf-8");
      q("#ccr-thinking-raw-txt", thinking).onclick = () => data && download(`${base()}-thinking-full.txt`, CCRApiData.thinkingText(data, scope(), true, { includeTimestamps: includeThinkingTimestamps() }), "text/plain;charset=utf-8");
      q("#ccr-thinking-probe", thinking).onclick = () => data && download(`${base()}.thinking-probe.json`, JSON.stringify({ exportedAt: new Date().toISOString(), currentPathContentTurnCount: data.contentThinkingTurnsOnCurrentPath.length, treeContentTurnCount: data.contentThinkingTurns.length, currentPathRawTurnCount: data.thinkingTurnsOnCurrentPath.length, treeRawTurnCount: data.thinkingTurns.length, turns: data.thinkingTurns, items: data.displayedThinking }, null, 2), "application/json;charset=utf-8");
      fold(quick, QK); fold(thinking, TK);
      for (const el of [oldCount, oldTimers, oldButtons, oldStatus]) if (el) legacy.appendChild(el);
      body.append(quick, thinking, legacy);
      for (const b of qa(".ccr-body", panel)) b.remove();
      panel.appendChild(body);
      panel.dataset.ccrModernUi = "1"; panel.classList.add("ccr-modern");
      const title = q(".ccr-title span", panel); if (title) { title.textContent = "🐾 尾痕 | CatLog"; title.onclick = () => collapse(panel, !panel.classList.contains("ccr-collapsed")); }
      const hide = q("#ccr-hide", panel); if (hide) hide.onclick = () => collapse(panel, !panel.classList.contains("ccr-collapsed"));
      enabled(false); refreshThinking(); collapse(panel, localStorage.getItem(CK) === "1");
      panel.dataset.ccrReady = "1";
      return true;
    } catch (e) {
      console.error("[CatChat Rescuer] UI mount failed", e);
      return false;
    }
  }
  if (!mount()) {
    const t = setInterval(() => { if (mount()) clearInterval(t); }, 250);
    setTimeout(() => {
      clearInterval(t);
      const panel = q(`#${PANEL_ID}`);
      if (panel && panel.dataset.ccrReady !== "1") panel.dataset.ccrReady = "1";
    }, 15000);
  }
})();