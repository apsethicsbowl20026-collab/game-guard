// GameGuard – runs in the page's MAIN world at document_start.
// Disables WebGPU (next-gen 3D API used by newer engines).
(() => {
  if (window.__gameguardWebGPU) return;
  Object.defineProperty(window, "__gameguardWebGPU", { value: true });

  let reported = false;
  const notify = () => {
    if (reported) return;
    reported = true;
    try {
      window.postMessage({ __gameguard: true, kind: "webgpu", detail: "navigator.gpu" }, "*");
    } catch (_) {}
  };

  try {
    if ("gpu" in Navigator.prototype || "gpu" in navigator) {
      Object.defineProperty(Navigator.prototype, "gpu", {
        get() {
          notify();
          return undefined;
        },
        configurable: false,
      });
    }
  } catch (_) {}

  // Canvas "webgpu" context type.
  try {
    for (const C of [window.HTMLCanvasElement, window.OffscreenCanvas]) {
      if (!C) continue;
      const proto = C.prototype;
      const desc = Object.getOwnPropertyDescriptor(proto, "getContext");
      if (!desc || !desc.configurable) {
        // Already locked by the WebGL guard: wrap is not possible; navigator.gpu removal suffices.
        continue;
      }
      const original = proto.getContext;
      Object.defineProperty(proto, "getContext", {
        value: function getContext(type, ...rest) {
          if (typeof type === "string" && type.toLowerCase() === "webgpu") {
            notify();
            return null;
          }
          return original.call(this, type, ...rest);
        },
        writable: true,
        configurable: true,
      });
    }
  } catch (_) {}

  for (const name of ["GPU", "GPUAdapter", "GPUDevice", "GPUCanvasContext"]) {
    try {
      Object.defineProperty(window, name, { get: () => undefined, configurable: false });
    } catch (_) {}
  }
})();
