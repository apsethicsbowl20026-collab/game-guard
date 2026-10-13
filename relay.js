// GameGuard – isolated-world relay: forwards block notifications from the page to the background worker.
(() => {
  const seen = new Set();
  window.addEventListener("message", (ev) => {
    const d = ev.data;
    if (ev.source !== window || !d || d.__gameguard !== true) return;
    const key = d.kind + ":" + location.href;
    if (seen.has(key)) return;
    seen.add(key);
    try {
      chrome.runtime.sendMessage({
        type: "report",
        kind: String(d.kind),
        detail: String(d.detail || ""),
        url: location.href,
      });
    } catch (_) {}
  });
})();
