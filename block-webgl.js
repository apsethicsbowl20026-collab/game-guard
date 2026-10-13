// GameGuard – runs in the page's MAIN world at document_start.
// Disables WebGL (the engine behind virtually every 3D browser game: three.js,
// Babylon.js, Unity WebGL, PlayCanvas, Godot web exports, etc.).
(() => {
  if (window.__gameguardWebGL) return;
  Object.defineProperty(window, "__gameguardWebGL", { value: true });

  const BLOCKED = new Set(["webgl", "webgl2", "experimental-webgl", "experimental-webgl2", "moz-webgl"]);
  let reported = false;

  const notify = (detail) => {
    if (reported) return;
    reported = true;
    try {
      window.postMessage({ __gameguard: true, kind: "webgl", detail }, "*");
    } catch (_) {}
    showBanner();
  };

  function showBanner() {
    const draw = () => {
      if (window.top !== window) return; // only in top frame
      if (document.getElementById("__gameguard_banner")) return;
      const el = document.createElement("div");
      el.id = "__gameguard_banner";
      el.setAttribute(
        "style",
        "position:fixed;z-index:2147483647;left:50%;top:16px;transform:translateX(-50%);" +
          "background:#0f172a;color:#f8fafc;font:600 14px/1.4 system-ui,sans-serif;" +
          "padding:12px 18px;border-radius:12px;box-shadow:0 10px 30px rgba(0,0,0,.35);" +
          "border:1px solid #ef4444;display:flex;gap:10px;align-items:center;max-width:90vw"
      );
      el.innerHTML =
        '<span style="font-size:18px">🛡️</span><span>3D content was blocked by <b>GameGuard</b>. ' +
        'Ask an admin to unlock games.</span>';
      const close = document.createElement("button");
      close.textContent = "×";
      close.setAttribute(
        "style",
        "margin-left:8px;background:none;border:0;color:#94a3b8;font-size:20px;cursor:pointer"
      );
      close.onclick = () => el.remove();
      el.appendChild(close);
      (document.body || document.documentElement).appendChild(el);
    };
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", draw, { once: true });
    } else {
      draw();
    }
  }

  const patch = (proto) => {
    if (!proto || !proto.getContext) return;
    const original = proto.getContext;
    const guarded = function getContext(type, ...rest) {
      if (typeof type === "string" && BLOCKED.has(type.toLowerCase())) {
        notify(type);
        return null;
      }
      return original.call(this, type, ...rest);
    };
    Object.defineProperty(guarded, "toString", { value: () => "function getContext() { [native code] }" });
    Object.defineProperty(proto, "getContext", {
      value: guarded,
      writable: false,
      configurable: false,
      enumerable: true,
    });
  };

  patch(window.HTMLCanvasElement && HTMLCanvasElement.prototype);
  patch(window.OffscreenCanvas && OffscreenCanvas.prototype);

  // Hide WebGL constructors so feature-detection reports "not supported".
  for (const name of ["WebGLRenderingContext", "WebGL2RenderingContext"]) {
    try {
      Object.defineProperty(window, name, {
        get() {
          return undefined;
        },
        configurable: false,
      });
    } catch (_) {}
  }

  // Block transferring canvases to workers (would bypass the patch).
  try {
    const proto = HTMLCanvasElement.prototype;
    if (proto.transferControlToOffscreen) {
      Object.defineProperty(proto, "transferControlToOffscreen", {
        value: function () {
          notify("offscreen-transfer");
          throw new DOMException("Blocked by GameGuard", "NotSupportedError");
        },
        writable: false,
        configurable: false,
      });
    }
  } catch (_) {}
})();
