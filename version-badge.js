(() => {
  const version = chrome.runtime.getManifest().version;
  const apply = () => {
    const badge = document.querySelector("#catchat-rescuer-v030-panel .ccr-badge");
    if (!badge) return false;
    badge.textContent = version;
    return true;
  };
  if (apply()) return;
  const timer = setInterval(() => {
    if (!apply()) return;
    clearInterval(timer);
  }, 200);
  setTimeout(() => clearInterval(timer), 10000);
})();
