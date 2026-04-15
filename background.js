const VERSION_JSON_URL = "https://raw.githubusercontent.com/ShubhTamrakar/detained--PSIT/main/docs/version.json";

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type !== "CHECK_UPDATE") return false;
  fetch(VERSION_JSON_URL)
    .then(r => r.json())
    .then(data => sendResponse({ ok: true, version: data.version, releaseUrl: data.releaseUrl }))
    .catch(err => sendResponse({ ok: false, error: String(err) }));
  return true; // keep channel open for async response
});
