// Injected before page scripts. Draws a synthetic pointer that tracks mouse
// events and pulses on click, so recorded clicks are legible.
//
// Style (owner feedback 2026-08-04: the translucent white dot disappeared
// into the light theme): warm amber, deliberately OFF the app palette, so
// amber reads as an annotation, not UI. Clicks additionally spawn an
// expanding ripple ring so a tap registers even when the viewer's eye
// arrives late.
//
// The recorded page runs at `html { zoom: 1.5 }` (see record-core.mjs's
// PAGE_ZOOM), but mouse events report clientX/clientY in the UNZOOMED
// coordinate space Chromium tracks internally. Dividing by the current zoom
// converts back to the zoomed layout pixels the dot needs to draw in, so it
// lands under the real pointer instead of 1.5x toward the top-left corner.
export const CURSOR_INIT_SCRIPT = `
(() => {
  const z = () => parseFloat(getComputedStyle(document.documentElement).zoom) || 1;
  const draw = () => {
    if (document.getElementById("__demo_cursor")) return;
    const style = document.createElement("style");
    style.textContent =
      "@keyframes __demo_ripple{from{width:28px;height:28px;opacity:.85}" +
      "to{width:88px;height:88px;opacity:0}}";
    document.head.appendChild(style);
    const dot = document.createElement("div");
    dot.id = "__demo_cursor";
    dot.style.cssText = [
      "position:fixed","top:0","left:0","width:28px","height:28px",
      "border-radius:50%","background:rgba(255,179,0,0.4)",
      "border:3px solid rgba(230,138,0,0.95)","pointer-events:none",
      "z-index:2147483647","transform:translate(-50%,-50%)",
      "transition:width .12s,height .12s,background .12s",
      "box-shadow:0 0 0 2px rgba(255,255,255,0.85),0 2px 10px rgba(0,0,0,.35)",
      // Hidden until the pointer actually moves, parked at (0,0) it renders
      // as a stray quarter-circle in the top-left corner of every frame
      // recorded before the first mouse action. Playwright clicks dispatch a
      // real mousemove first, so the dot always appears before any tap it
      // needs to mark.
      "display:none",
    ].join(";");
    document.body.appendChild(dot);
    document.addEventListener("mousemove", (e) => {
      dot.style.display = "block";
      dot.style.left = e.clientX / z() + "px";
      dot.style.top = e.clientY / z() + "px";
    }, true);
    document.addEventListener("mousedown", (e) => {
      dot.style.width = "38px"; dot.style.height = "38px";
      dot.style.background = "rgba(255,179,0,0.65)";
      const ring = document.createElement("div");
      ring.style.cssText = [
        "position:fixed","left:" + e.clientX / z() + "px","top:" + e.clientY / z() + "px",
        "width:28px","height:28px","border-radius:50%",
        "border:3px solid rgba(230,138,0,0.9)","background:transparent",
        "pointer-events:none","z-index:2147483646",
        "transform:translate(-50%,-50%)",
        "animation:__demo_ripple .45s ease-out forwards",
      ].join(";");
      document.body.appendChild(ring);
      setTimeout(() => ring.remove(), 500);
    }, true);
    document.addEventListener("mouseup", () => {
      dot.style.width = "28px"; dot.style.height = "28px";
      dot.style.background = "rgba(255,179,0,0.4)";
    }, true);
  };
  if (document.body) draw();
  else document.addEventListener("DOMContentLoaded", draw);
})();
`;
