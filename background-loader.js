importScripts("background.js");

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id || !tab.url) return;
  if (!/^https:\/\/(chatgpt\.com|chat\.openai\.com)\//.test(tab.url)) return;
  try {
    await new Promise((resolve) => setTimeout(resolve, 180));
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => { delete globalThis.__CCR_THINKING_EXPORT_V2__; }
    });
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["thinking-export-v2.js", "version-badge.js"]
    });
  } catch (error) {
    console.error("[CatChat Rescuer] thinking export inject failed", error);
  }
});
