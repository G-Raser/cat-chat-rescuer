(() => {
  if (globalThis.__CCR_PANEL_MOBILITY__) return;
  globalThis.__CCR_PANEL_MOBILITY__ = true;
  const PANEL_ID = "catchat-rescuer-v030-panel";
  const COLLAPSE_KEY = "catchat-rescuer-panel-collapsed";
  const TOP_KEY = "catchat-rescuer-panel-top";
  const EDGE_GAP = 8;
  const DRAG_THRESHOLD = 4;
  const q = (s, r = document) => r.querySelector(s);
  let panel = null;
  let title = null;
  let edgeTab = null;
  let drag = null;
  let suppressClick = false;
  function clampTop(value) {
    if (!panel) return EDGE_GAP;
    const height = Math.min(panel.offsetHeight || 44, Math.max(44, window.innerHeight - EDGE_GAP * 2));
    const max = Math.max(EDGE_GAP, window.innerHeight - height - EDGE_GAP);
    return Math.min(Math.max(EDGE_GAP, value), max);
  }
  function applyTop(value, persist = false) {
    if (!panel) return;
    const top = clampTop(Number(value) || EDGE_GAP);
    panel.style.setProperty("top", `${Math.round(top)}px`, "important");
    panel.style.setProperty("bottom", "auto", "important");
    if (persist) localStorage.setItem(TOP_KEY, String(Math.round(top)));
  }
  function restoreTop() {
    const saved = Number(localStorage.getItem(TOP_KEY));
    if (Number.isFinite(saved)) applyTop(saved, false);
  }
  function syncCollapsedUi() {
    if (!panel || !edgeTab) return;
    const collapsed = panel.classList.contains("ccr-collapsed");
    edgeTab.setAttribute("aria-hidden", collapsed ? "false" : "true");
    edgeTab.tabIndex = collapsed ? 0 : -1;
    const hide = q("#ccr-hide", panel);
    if (hide && !collapsed) hide.textContent = "−";
    requestAnimationFrame(() => {
      const saved = Number(localStorage.getItem(TOP_KEY));
      if (Number.isFinite(saved)) applyTop(saved, false);
    });
  }
  function beginDrag(e, handle) {
    if (!panel || e.button > 0) return;
    if (handle === title && e.target.closest("button,input,select,a,label,details,summary")) return;
    const rect = panel.getBoundingClientRect();
    drag = { pointerId: e.pointerId, startY: e.clientY, startTop: rect.top, moved: false, handle };
    handle.setPointerCapture?.(e.pointerId);
  }
  function moveDrag(e) {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const delta = e.clientY - drag.startY;
    if (!drag.moved && Math.abs(delta) < DRAG_THRESHOLD) return;
    if (!drag.moved) {
      drag.moved = true;
      panel.classList.add("ccr-dragging");
    }
    e.preventDefault();
    applyTop(drag.startTop + delta, false);
  }
  function endDrag(e) {
    if (!drag || e.pointerId !== drag.pointerId) return false;
    const moved = drag.moved;
    drag.handle.releasePointerCapture?.(e.pointerId);
    drag = null;
    panel?.classList.remove("ccr-dragging");
    if (moved && panel) {
      const top = panel.getBoundingClientRect().top;
      applyTop(top, true);
      suppressClick = true;
      setTimeout(() => { suppressClick = false; }, 0);
    }
    return moved;
  }
  function bindHandle(handle) {
    handle.addEventListener("pointerdown", (e) => beginDrag(e, handle));
    handle.addEventListener("pointermove", moveDrag, { passive: false });
    handle.addEventListener("pointerup", endDrag);
    handle.addEventListener("pointercancel", endDrag);
    handle.addEventListener("click", (e) => {
      if (!suppressClick) return;
      e.preventDefault();
      e.stopImmediatePropagation();
    }, true);
  }
  function enhance() {
    if (panel?.isConnected) return true;
    panel = document.getElementById(PANEL_ID);
    if (!panel) return false;
    title = q(".ccr-title", panel);
    if (!title) return false;
    edgeTab = q(".ccr-edge-tab", panel);
    if (!edgeTab) {
      edgeTab = document.createElement("button");
      edgeTab.type = "button";
      edgeTab.className = "ccr-edge-tab";
      edgeTab.textContent = "🐾";
      edgeTab.title = "展开 CatLog；拖动可上下移动";
      edgeTab.setAttribute("aria-label", "展开 CatLog；拖动可上下移动");
      panel.appendChild(edgeTab);
    }
    bindHandle(title);
    bindHandle(edgeTab);
    edgeTab.addEventListener("click", () => {
      if (suppressClick) return;
      const hide = q("#ccr-hide", panel);
      if (hide) hide.click();
      else {
        panel.classList.remove("ccr-collapsed");
        localStorage.setItem(COLLAPSE_KEY, "0");
        syncCollapsedUi();
      }
    });
    new MutationObserver(syncCollapsedUi).observe(panel, { attributes: true, attributeFilter: ["class"] });
    restoreTop();
    syncCollapsedUi();
    return true;
  }
  const timer = setInterval(() => {
    if (enhance()) clearInterval(timer);
  }, 250);
  setTimeout(() => clearInterval(timer), 20000);
  window.addEventListener("resize", () => {
    if (!panel) return;
    const saved = Number(localStorage.getItem(TOP_KEY));
    if (Number.isFinite(saved)) applyTop(saved, true);
  });
})();
