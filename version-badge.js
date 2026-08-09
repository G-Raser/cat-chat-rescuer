(() => {
  const PANEL_ID = "catchat-rescuer-v030-panel";
  const version = chrome.runtime.getManifest().version;
  const FOLDABLES = [
    { selector: ".ccr-quick", key: "catchat-rescuer-quick-collapsed" },
    { selector: "#ccr-thinking-section", key: "catchat-rescuer-thinking-collapsed" }
  ];

  function ensureStyle() {
    if (document.getElementById("ccr-ui-polish-style")) return;
    const style = document.createElement("style");
    style.id = "ccr-ui-polish-style";
    style.textContent = `
      #${PANEL_ID} .ccr-foldable > .ccr-section-heading {
        cursor:pointer !important;
        user-select:none !important;
      }
      #${PANEL_ID} .ccr-foldable.ccr-section-collapsed > :not(.ccr-section-heading) {
        display:none !important;
      }
      #${PANEL_ID} .ccr-section-toggle {
        margin-left:auto !important;
        flex:0 0 auto !important;
        min-width:18px !important;
        text-align:center !important;
        color:rgba(247,243,251,.62) !important;
        font-size:15px !important;
        font-weight:700 !important;
        line-height:1 !important;
      }
      #${PANEL_ID} .ccr-section-heading:focus-visible {
        outline:1px solid rgba(197,181,255,.55) !important;
        outline-offset:4px !important;
        border-radius:6px !important;
      }
    `;
    document.head.appendChild(style);
  }

  function fixVersion(panel) {
    for (const badge of panel.querySelectorAll(".ccr-badge")) {
      if (badge.textContent !== version) badge.textContent = version;
    }
  }

  function installFoldable(section, key) {
    if (!section || section.dataset.ccrFoldable === "1") return Boolean(section);
    const heading = section.querySelector(":scope > .ccr-section-heading");
    if (!heading) return false;
    section.dataset.ccrFoldable = "1";
    section.classList.add("ccr-foldable");
    heading.setAttribute("role", "button");
    heading.setAttribute("tabindex", "0");

    let toggle = heading.querySelector(".ccr-section-toggle");
    if (!toggle) {
      toggle = document.createElement("span");
      toggle.className = "ccr-section-toggle";
      toggle.setAttribute("aria-hidden", "true");
      heading.appendChild(toggle);
    }

    const apply = (collapsed) => {
      section.classList.toggle("ccr-section-collapsed", collapsed);
      heading.setAttribute("aria-expanded", String(!collapsed));
      toggle.textContent = collapsed ? "+" : "−";
      toggle.title = collapsed ? "展开" : "收起";
    };
    const initial = localStorage.getItem(key) === "1";
    apply(initial);

    const toggleSection = () => {
      const collapsed = !section.classList.contains("ccr-section-collapsed");
      localStorage.setItem(key, collapsed ? "1" : "0");
      apply(collapsed);
    };
    heading.addEventListener("click", (event) => {
      if (event.target.closest("input, select, button, a")) return;
      toggleSection();
    });
    heading.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      toggleSection();
    });
    return true;
  }

  function applyUi() {
    const panel = document.getElementById(PANEL_ID);
    if (!panel) return false;
    ensureStyle();
    fixVersion(panel);
    for (const item of FOLDABLES) installFoldable(panel.querySelector(item.selector), item.key);
    return true;
  }

  applyUi();
  const observer = new MutationObserver(() => applyUi());
  observer.observe(document.documentElement, { childList:true, subtree:true, characterData:true });
})();
