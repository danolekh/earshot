/* The cursor for the recorder, injected into the page: headless Chrome draws none. An ink dot with
 * a white edge, and a ring in the take's accent that shows while the button is down. It appears on
 * the first move, so a take can open without one. From cardstock's recorder. */
(() => {
  const accent = window.__cursorAccent ?? "#c6ff3d";
  const make = (style) => Object.assign(document.createElement("div"), { style: style.join(";") });
  const root = make([
    "position:fixed",
    "left:0",
    "top:0",
    "z-index:2147483647",
    "pointer-events:none",
    "opacity:0",
  ]);
  const ring = make([
    "position:absolute",
    "width:38px",
    "height:38px",
    "margin:-19px 0 0 -19px",
    "border-radius:50%",
    `border:3px solid ${accent}`,
    "box-sizing:border-box",
    "opacity:0",
    "scale:0.5",
    "transition:opacity 300ms ease-out, scale 300ms ease-out",
  ]);
  const dot = make([
    "position:absolute",
    "width:20px",
    "height:20px",
    "margin:-10px 0 0 -10px",
    "border-radius:50%",
    "background:#1c1a17",
    "border:2.5px solid #fff",
    "box-sizing:border-box",
    "box-shadow:0 2px 8px rgb(0 0 0 / 0.45)",
    "transition:scale 150ms",
  ]);
  root.append(ring, dot);
  const press = (down) => {
    ring.style.opacity = down ? "1" : "0";
    ring.style.scale = down ? "1" : "0.5";
    dot.style.scale = down ? "0.8" : "1";
  };
  addEventListener(
    "pointermove",
    (e) => {
      if (!root.isConnected) document.body.append(root);
      root.style.opacity = "1";
      root.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;
    },
    true,
  );
  // Off the frame for good (before a closing card): a pointer moved past the edge still reports
  // its last position inside the window.
  window.__cursor = { hide: () => (root.style.opacity = "0") };
  addEventListener("pointerdown", () => press(true), true);
  addEventListener("pointerup", () => press(false), true);
})();
