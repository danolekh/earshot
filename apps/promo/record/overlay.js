/* The film's own layer over the page, for the recorder: a caption, a keycap when a shortcut is
 * pressed, and the closing card. Mounted on first use (after the page has hydrated, so React never
 * sees it) and animated by CSS transitions, which the recorder's clock holds to its frames. Its
 * colours are the film's look (looks.ts, as `window.__overlayLook`), dark by default. */
(() => {
  const FONT = '"Inter Variable", "Inter", ui-sans-serif, system-ui, sans-serif';
  const MONO = '"Geist Mono Variable", ui-monospace, "SF Mono", monospace';
  const look = {
    caption: {
      background: "rgb(10 11 13 / 0.88)",
      boxShadow: "0 12px 40px rgb(0 0 0 / 0.35), inset 0 0 0 1px rgb(255 255 255 / 0.08)",
      color: "#f4f5f7",
    },
    key: {
      background: "#f4f5f7",
      color: "#0b0c0e",
      boxShadow: "0 5px 0 #b9bdc4, 0 14px 30px rgb(0 0 0 / 0.35)",
    },
    card: { background: "radial-gradient(70% 90% at 50% 40%, #11151c 0%, #0b0c0e 70%)", color: "#f4f5f7" },
    title: {},
    eyebrow: "#9aa3ad",
    subtitle: "#cfd5dc",
    line: "#c6ff3d",
    ...window.__overlayLook,
  };
  const css = (el, style) => Object.assign(el.style, style);
  let root, caption, key, card, keyTimer;

  const mount = () => {
    if (root) return;
    root = document.createElement("div");
    root.id = "promo-overlay";
    css(root, {
      position: "fixed",
      inset: "0",
      zIndex: "2147483646",
      pointerEvents: "none",
      fontFamily: FONT,
    });
    caption = document.createElement("div");
    css(caption, {
      position: "absolute",
      left: "50%",
      bottom: "34px",
      maxWidth: "78%",
      padding: "14px 28px 16px",
      borderRadius: "18px",
      ...look.caption,
      fontSize: "44px",
      fontWeight: "600",
      letterSpacing: "-0.015em",
      lineHeight: "1.2",
      textAlign: "center",
      opacity: "0",
      transform: "translate(-50%, 10px)",
      transition: "opacity 280ms ease-out, transform 280ms ease-out",
    });
    key = document.createElement("div");
    css(key, {
      position: "absolute",
      right: "36px",
      bottom: "36px",
      minWidth: "64px",
      height: "64px",
      padding: "0 16px",
      boxSizing: "border-box",
      display: "grid",
      placeItems: "center",
      borderRadius: "14px",
      ...look.key,
      font: `600 30px ${MONO}`,
      opacity: "0",
      transform: "translateY(8px) scale(0.92)",
      transition: "opacity 160ms ease-out, transform 160ms ease-out",
    });
    card = document.createElement("div");
    css(card, {
      position: "absolute",
      inset: "0",
      display: "grid",
      placeContent: "center",
      justifyItems: "center",
      gap: "18px",
      ...look.card,
      textAlign: "center",
      opacity: "0",
      transition: "opacity 500ms ease-out",
    });
    root.append(caption, key, card);
    document.body.append(root);
  };

  // Captions and keys sit over the call, left of the inspector when it's open, so they never
  // cover what the inspector is showing.
  const place = () => {
    const inspector = document.getElementById("inspector")?.getBoundingClientRect();
    const right = inspector && inspector.width > 0 ? inspector.left : innerWidth;
    css(caption, { left: `${right / 2}px`, maxWidth: `${Math.round(right * 0.86)}px` });
    css(key, { right: `${innerWidth - right + 36}px` });
  };

  window.__overlay = {
    caption(text) {
      mount();
      place();
      if (text) caption.textContent = text;
      css(caption, {
        opacity: text ? "1" : "0",
        transform: text ? "translate(-50%, 0)" : "translate(-50%, 10px)",
      });
    },
    key(label) {
      mount();
      place();
      key.textContent = label;
      css(key, { opacity: "1", transform: "translateY(0) scale(1)" });
      clearTimeout(keyTimer);
      keyTimer = setTimeout(() => css(key, { opacity: "0", transform: "translateY(8px) scale(0.92)" }), 650);
    },
    card({ eyebrow, title, subtitle, lines = [] }) {
      mount();
      card.replaceChildren();
      const add = (text, style) => {
        const el = document.createElement("div");
        el.textContent = text;
        css(el, style);
        card.append(el);
      };
      if (eyebrow) add(eyebrow, { fontSize: "26px", color: look.eyebrow, fontWeight: "500" });
      add(title, {
        fontSize: "104px",
        fontWeight: "650",
        letterSpacing: "-0.035em",
        lineHeight: "1",
        ...look.title,
      });
      if (subtitle)
        add(subtitle, { fontSize: "34px", color: look.subtitle, fontWeight: "500", maxWidth: "980px" });
      const list = document.createElement("div");
      css(list, { display: "grid", gap: "10px", marginTop: "26px" });
      for (const line of lines) {
        const el = document.createElement("div");
        el.textContent = line;
        css(el, { font: `500 28px ${MONO}`, color: look.line });
        list.append(el);
      }
      card.append(list);
      css(caption, { opacity: "0" });
      css(card, { opacity: "1" });
    },
  };
})();
