const params = new URLSearchParams(location.search);
const domain = params.get("d") || "";
const el = (id) => document.getElementById(id);
if (domain) el("domain").textContent = domain;

el("form").addEventListener("submit", (e) => {
  e.preventDefault();
  el("err").textContent = "";
  chrome.runtime.sendMessage(
    { type: "unlock", password: el("pw").value, minutes: Number(el("min").value) },
    (res) => {
      if (res && res.ok) {
        el("err").className = "err ok";
        el("err").textContent = "Unlocked! Redirecting…";
        setTimeout(() => {
          location.href = domain ? "https://" + domain : "about:blank";
        }, 600);
      } else {
        el("err").textContent = (res && res.error) || "Unlock failed";
      }
    }
  );
});

// Report the blocked visit once.
if (domain && !sessionStorage.getItem("gg-reported-" + domain)) {
  sessionStorage.setItem("gg-reported-" + domain, "1");
  chrome.runtime.sendMessage({ type: "report", kind: "domain", url: "https://" + domain, detail: "site blocked" });
}
