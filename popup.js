const $ = (id) => document.getElementById(id);

function render(s) {
  const p = s.policy || {};
  $("status").textContent = s.blocking ? "PROTECTED" : "GAMES ALLOWED";
  $("status").className = "pill " + (s.blocking ? "on" : "off");
  if (s.blocking) {
    const parts = [];
    if (p.blockWebGL) parts.push("WebGL");
    if (p.blockWebGPU) parts.push("WebGPU");
    if (p.blockDomains) parts.push((p.domains || []).length + " game sites");
    $("desc").textContent = "Blocking: " + (parts.join(", ") || "nothing (all rules off)");
    $("unlockCard").style.display = "";
  } else if (p.unlockUntil) {
    $("desc").textContent = "Games unlocked until " + new Date(p.unlockUntil).toLocaleTimeString();
    $("unlockCard").style.display = "none";
  } else {
    $("desc").textContent = "Protection is turned off by the admin.";
    $("unlockCard").style.display = "none";
  }
  $("sync-info").textContent =
    (s.online === false ? "⚠️ Server unreachable – using cached policy. " : "") +
    (s.lastSync ? "Last sync " + new Date(s.lastSync).toLocaleTimeString() : "Not synced yet");
  if (s.server) $("admin").href = s.server + "/admin";
}

function refresh() {
  chrome.runtime.sendMessage({ type: "status" }, (s) => s && render(s));
}

$("form").addEventListener("submit", (e) => {
  e.preventDefault();
  $("err").textContent = "";
  chrome.runtime.sendMessage(
    { type: "unlock", password: $("pw").value, minutes: Number($("min").value) },
    (res) => {
      if (res && res.ok) {
        $("pw").value = "";
        refresh();
      } else {
        $("err").textContent = (res && res.error) || "Unlock failed";
      }
    }
  );
});

$("sync").addEventListener("click", () => {
  $("sync").textContent = "Refreshing…";
  chrome.runtime.sendMessage({ type: "sync" }, () => {
    $("sync").textContent = "Refresh policy";
    refresh();
  });
});

refresh();
