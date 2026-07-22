export function resizeCanvasToDisplaySize(canvas, overlay = null, stage = null) {
  const target = stage || canvas.parentElement || canvas;
  const rect = target.getBoundingClientRect();
  const cssWidth = Math.max(1, Math.round(rect.width || target.clientWidth || canvas.clientWidth || 1));
  const cssHeight = Math.max(1, Math.round(rect.height || target.clientHeight || canvas.clientHeight || 1));
  const pixelRatio = Math.min(canvas.ownerDocument?.defaultView?.devicePixelRatio || 1, 1.5);
  const width = Math.max(1, Math.round(cssWidth * pixelRatio));
  const height = Math.max(1, Math.round(cssHeight * pixelRatio));
  const overlayChanged = Boolean(overlay) && (
    overlay.style.width !== `${cssWidth}px`
    || overlay.style.height !== `${cssHeight}px`
    || overlay.style.right !== "auto"
    || overlay.style.bottom !== "auto"
  );
  const changed = canvas.style.width !== `${cssWidth}px`
    || canvas.style.height !== `${cssHeight}px`
    || canvas.width !== width
    || canvas.height !== height
    || overlayChanged;

  if (canvas.style.width !== `${cssWidth}px`) canvas.style.width = `${cssWidth}px`;
  if (canvas.style.height !== `${cssHeight}px`) canvas.style.height = `${cssHeight}px`;
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;

  if (overlay) {
    overlay.style.left = "0";
    overlay.style.top = "0";
    overlay.style.right = "auto";
    overlay.style.bottom = "auto";
    overlay.style.width = `${cssWidth}px`;
    overlay.style.height = `${cssHeight}px`;
  }

  return {changed, size: {cssWidth, cssHeight, width, height, pixelRatio}};
}
