(() => {
  if (globalThis.__CCR_BOOT_HIDE__) return;
  globalThis.__CCR_BOOT_HIDE__ = true;
  const style = document.createElement("style");
  style.id = "ccr-boot-hide-style";
  style.textContent = '#catchat-rescuer-v030-panel:not([data-ccr-ready="1"]){visibility:hidden!important;opacity:0!important;pointer-events:none!important}';
  (document.head || document.documentElement).appendChild(style);
})();