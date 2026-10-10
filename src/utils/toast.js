// Minimal toast utility — no React required, appends to document.body
const TOAST_CONTAINER_ID = "app-toast-container";
const TOP_TOAST_CONTAINER_ID = "app-top-toast-container";

function ensureContainer() {
  let c = document.getElementById(TOAST_CONTAINER_ID);
  if (c) return c;
  c = document.createElement("div");
  c.id = TOAST_CONTAINER_ID;
  Object.assign(c.style, {
    position: "fixed",
    right: "16px",
    bottom: "16px",
    zIndex: 9999,
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    alignItems: "flex-end",
    pointerEvents: "none",
  });
  document.body.appendChild(c);
  return c;
}

function ensureTopContainer() {
  let c = document.getElementById(TOP_TOAST_CONTAINER_ID);
  if (c) return c;
  c = document.createElement("div");
  c.id = TOP_TOAST_CONTAINER_ID;
  Object.assign(c.style, {
    position: "fixed",
    top: "24px",
    left: "50%",
    transform: "translateX(-50%)",
    zIndex: "99999",
    display: "flex",
    flexDirection: "column",
    gap: "10px",
    alignItems: "center",
    pointerEvents: "none",
    width: "100%",
    maxWidth: "520px",
    padding: "0 16px",
    boxSizing: "border-box",
  });
  document.body.appendChild(c);
  return c;
}

/**
 * Top floating pop-up toast notification
 * Displays at the top center of the screen, automatically dismisses after duration.
 * Supports persistent visibility across route changes.
 */
export function showTopToast(title, { description = "", duration = 3500, type = "success" } = {}) {
  if (typeof document === "undefined") return;
  const container = ensureTopContainer();

  const el = document.createElement("div");
  el.className = `app-top-toast app-top-toast--${type}`;

  const isSuccess = type === "success";
  const iconBg = isSuccess ? "#D1FAE5" : type === "error" ? "#FEE2E2" : "#E0E7FF";
  const iconStroke = isSuccess ? "#059669" : type === "error" ? "#DC2626" : "#4F46E5";
  const borderColor = isSuccess ? "#A7F3D0" : type === "error" ? "#FCA5A5" : "#A5B4FC";
  const titleColor = isSuccess ? "#065F46" : type === "error" ? "#991B1B" : "#1E1B4B";
  const descColor = isSuccess ? "#047857" : type === "error" ? "#B91C1C" : "#4338CA";

  const iconSvg = isSuccess
    ? `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${iconStroke}" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`
    : `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${iconStroke}" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>`;

  el.innerHTML = `
    <div style="width: 36px; height: 36px; border-radius: 50%; background: ${iconBg}; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
      ${iconSvg}
    </div>
    <div style="display: flex; flex-direction: column; gap: 2px; flex: 1; min-width: 0;">
      <div style="font-family: 'Sarabun', sans-serif; font-size: 15px; font-weight: 700; color: ${titleColor}; line-height: 1.35; overflow-wrap: anywhere; word-break: break-word;">${title}</div>
      ${description ? `<div style="font-family: 'Sarabun', sans-serif; font-size: 13.5px; color: ${descColor}; line-height: 1.4; overflow-wrap: anywhere; word-break: break-word;">${description}</div>` : ""}
    </div>
  `;

  Object.assign(el.style, {
    background: "#FFFFFF",
    border: `1.5px solid ${borderColor}`,
    borderRadius: "16px",
    boxShadow: "0 12px 32px -4px rgba(16, 185, 129, 0.18), 0 4px 12px -2px rgba(0, 0, 0, 0.08)",
    padding: "14px 20px",
    display: "flex",
    alignItems: "center",
    gap: "14px",
    pointerEvents: "auto",
    cursor: "pointer",
    opacity: "0",
    transform: "translateY(-18px) scale(0.96)",
    transition: "opacity 260ms cubic-bezier(0.16, 1, 0.3, 1), transform 260ms cubic-bezier(0.16, 1, 0.3, 1)",
    width: "100%",
    boxSizing: "border-box",
  });

  container.appendChild(el);

  // animate in
  requestAnimationFrame(() => {
    el.style.opacity = "1";
    el.style.transform = "translateY(0) scale(1)";
  });

  const timeout = setTimeout(() => {
    hide();
  }, duration);

  function hide() {
    clearTimeout(timeout);
    el.style.opacity = "0";
    el.style.transform = "translateY(-18px) scale(0.96)";
    setTimeout(() => {
      el.remove();
    }, 280);
  }

  el.addEventListener("click", hide);
  return { hide };
}

export function showToast(message, { duration = 3500, type = "info" } = {}) {
  if (typeof document === "undefined") return;
  const container = ensureContainer();

  const el = document.createElement("div");
  el.className = `app-toast app-toast--${type}`;
  el.textContent = message;
  Object.assign(el.style, {
    background: type === "error" ? "#F87171" : type === "success" ? "#34D399" : "#111827",
    color: "#fff",
    padding: "10px 14px",
    borderRadius: "10px",
    boxShadow: "0 6px 20px rgba(2,6,23,0.12)",
    fontSize: "14px",
    pointerEvents: "auto",
    opacity: "0",
    transform: "translateY(8px)",
    transition: "opacity 220ms ease, transform 220ms ease",
    maxWidth: "320px",
  });

  container.appendChild(el);

  // animate in
  requestAnimationFrame(() => {
    el.style.opacity = "1";
    el.style.transform = "translateY(0)";
  });

  const timeout = setTimeout(() => {
    hide();
  }, duration);

  function hide() {
    clearTimeout(timeout);
    el.style.opacity = "0";
    el.style.transform = "translateY(8px)";
    setTimeout(() => {
      el.remove();
    }, 240);
  }

  el.addEventListener("click", hide);
  return { hide };
}

export default { showToast, showTopToast };
