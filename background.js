// GameGuard – background service worker.
// Pulls the policy from the admin server and enforces it.
const SERVER = "https://3000-iua586pbhc6hf8wxo383d.e2b.app";
const EXT_VERSION = chrome.runtime.getManifest().version;
const SCRIPT_ID = "gameguard-3d-blocker";

// Fail closed: if the server has never been reached, block everything.
const DEFAULT_POLICY = {
  version: 0,
  protectionEnabled: true,
  blocking: true,
  blockWebGL: true,
  blockWebGPU: true,
  blockDomains: true,
  domains: ["poki.com","shellshock.io","venge.io","1v1.lol","voxiom.io","kirka.io","krunker.io","minecraft.net","slowroads.io","geoguessr.com","playcanvas.com","bloxd.io"],
  unlockUntil: null,
};

async function getClientId() {
  const { clientId } = await chrome.storage.local.get("clientId");
  if (clientId) return clientId;
  const id = crypto.randomUUID();
  await chrome.storage.local.set({ clientId: id });
  return id;
}

/** Decide locally whether blocking is active (handles unlock expiry while offline). */
function isBlocking(p) {
  if (!p.protectionEnabled) return false;
  if (p.unlockUntil && Date.parse(p.unlockUntil) > Date.now()) return false;
  return true;
}

async function applyScripts(blocking, p) {
  const files = [];
  if (blocking && p.blockWebGPU) files.push("block-webgpu.js");
  if (blocking && p.blockWebGL) files.push("block-webgl.js");

  const existing = await chrome.scripting.getRegisteredContentScripts({ ids: [SCRIPT_ID] }).catch(() => []);
  const current = existing[0] ? existing[0].js.join(",") : "";
  if (current === files.join(",")) return;

  if (existing.length) await chrome.scripting.unregisterContentScripts({ ids: [SCRIPT_ID] });
  if (files.length) {
    await chrome.scripting.registerContentScripts([
      {
        id: SCRIPT_ID,
        js: files,
        matches: ["<all_urls>"],
        runAt: "document_start",
        allFrames: true,
        matchOriginAsFallback: true,
        world: "MAIN",
        persistAcrossSessions: true,
      },
    ]);
  }
}

async function applyDomainRules(blocking, p) {
  const old = await chrome.declarativeNetRequest.getDynamicRules();
  const domains = blocking && p.blockDomains ? p.domains || [] : [];
  const rules = domains.slice(0, 4000).map((d, i) => ({
    id: i + 1,
    priority: 1,
    action: {
      type: "redirect",
      redirect: { extensionPath: "/blocked.html?d=" + encodeURIComponent(d) },
    },
    condition: { requestDomains: [d], resourceTypes: ["main_frame", "sub_frame"] },
  }));
  const sig = JSON.stringify(domains);
  const { ruleSig } = await chrome.storage.local.get("ruleSig");
  if (ruleSig === sig && old.length === rules.length) return;
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: old.map((r) => r.id),
    addRules: rules,
  });
  await chrome.storage.local.set({ ruleSig: sig });
}

function hostMatches(url, domains) {
  try {
    const h = new URL(url).hostname.toLowerCase();
    return domains.find((d) => h === d || h.endsWith("." + d));
  } catch (_) {
    return undefined;
  }
}

async function apply(p) {
  const blocking = isBlocking(p);
  const { lastBlocking } = await chrome.storage.local.get("lastBlocking");

  await applyScripts(blocking, p);
  await applyDomainRules(blocking, p);

  chrome.action.setBadgeText({ text: blocking ? "ON" : "OFF" });
  chrome.action.setBadgeBackgroundColor({ color: blocking ? "#dc2626" : "#16a34a" });

  // When protection switches back on, kick open tabs off blocked sites / reload 3D pages.
  if (blocking && lastBlocking === false) {
    const tabs = await chrome.tabs.query({});
    for (const t of tabs) {
      if (!t.id || !t.url || !/^https?:/.test(t.url)) continue;
      const d = p.blockDomains ? hostMatches(t.url, p.domains || []) : undefined;
      if (d) {
        chrome.tabs.update(t.id, { url: chrome.runtime.getURL("/blocked.html?d=" + encodeURIComponent(d)) });
      } else if (p.blockWebGL || p.blockWebGPU) {
        // Inject the blocker into already-open pages; reload those that already created a 3D context.
        chrome.scripting
          .executeScript({
            target: { tabId: t.id, allFrames: true },
            world: "MAIN",
            func: () => {
              const c = [...document.querySelectorAll("canvas")];
              // A canvas that refuses a "2d" context already owns a WebGL/WebGPU context.
              return c.some((el) => {
                try {
                  return el.getContext("2d") === null;
                } catch (_) {
                  return false;
                }
              });
            },
          })
          .then((res) => {
            if (res && res.some((r) => r.result)) chrome.tabs.reload(t.id);
          })
          .catch(() => {});
      }
    }
  }
  await chrome.storage.local.set({ lastBlocking: blocking });
}

async function sync() {
  let policy;
  try {
    const id = await getClientId();
    const res = await fetch(`${SERVER}/api/policy?client=${id}&v=${EXT_VERSION}`, { cache: "no-store" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    policy = await res.json();
    await chrome.storage.local.set({ policy, lastSync: Date.now(), online: true });
  } catch (e) {
    const stored = await chrome.storage.local.get("policy");
    policy = stored.policy || DEFAULT_POLICY;
    await chrome.storage.local.set({ online: false, lastError: String(e) });
  }
  await apply(policy);
  return policy;
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create("gameguard-sync", { periodInMinutes: 0.5 });
  sync();
});
chrome.runtime.onStartup.addListener(() => {
  chrome.alarms.create("gameguard-sync", { periodInMinutes: 0.5 });
  sync();
});
chrome.alarms.onAlarm.addListener((a) => {
  if (a.name === "gameguard-sync") sync();
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || typeof msg !== "object") return;

  if (msg.type === "report") {
    fetch(`${SERVER}/api/report`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: msg.kind, url: msg.url, detail: msg.detail }),
    }).catch(() => {});
    return;
  }

  if (msg.type === "sync") {
    sync().then((p) => sendResponse({ ok: true, policy: p, blocking: isBlocking(p) }));
    return true;
  }

  if (msg.type === "status") {
    chrome.storage.local.get(["policy", "lastSync", "online"]).then((s) => {
      const p = s.policy || DEFAULT_POLICY;
      sendResponse({ ...s, policy: p, blocking: isBlocking(p), server: SERVER });
    });
    return true;
  }

  if (msg.type === "unlock") {
    fetch(`${SERVER}/api/unlock`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: msg.password, minutes: msg.minutes }),
    })
      .then((r) => r.json())
      .then(async (data) => {
        if (data.ok) await sync();
        sendResponse(data);
      })
      .catch(() => sendResponse({ ok: false, error: "Cannot reach the GameGuard server" }));
    return true;
  }
});
