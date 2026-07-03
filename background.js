chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id || !tab.url) return;
  if (!/^https:\/\/(chatgpt\.com|chat\.openai\.com)\//.test(tab.url)) return;
  try {
    await chrome.scripting.insertCSS({ target: { tabId: tab.id }, files: ["style.css"] });
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content.js"] });
  } catch (e) {
    console.error("[CatChat Rescuer v0.3.0] inject failed", e);
  }
});
