importScripts("background.js");

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id || !tab.url) return;
  if (!/^https:\/\/(chatgpt\.com|chat\.openai\.com)\//.test(tab.url)) return;
  try {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["thinking-export.js"] });
  } catch (error) {
    console.error("[CatChat Rescuer] thinking export inject failed", error);
  }
});
