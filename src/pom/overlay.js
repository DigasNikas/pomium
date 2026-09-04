export function canvasBackingSize(cssWidth, cssHeight, dpr) {
  const ratio = Math.min(3, Math.max(1, dpr || 1));
  return {
    width: Math.floor(cssWidth * ratio),
    height: Math.floor(cssHeight * ratio),
    dpr: ratio,
  };
}

// The canvas already exists in the chrome's own HTML, so unlike the browser
// extension this does not build a host element or a shadow root: there is no
// hostile page CSS to defend against here. It only measures and sizes.
export function attachOverlay(canvas) {
  const ctx = canvas.getContext('2d', { alpha: true });
  let destroyed = false;

  const overlay = {
    canvas,
    ctx,
    width: 0,
    height: 0,
    resize() {
      if (destroyed) return;
      const rect = canvas.getBoundingClientRect();
      const cssWidth = rect.width || window.innerWidth;
      const cssHeight = rect.height || window.innerHeight;
      const size = canvasBackingSize(cssWidth, cssHeight, window.devicePixelRatio);
      canvas.width = size.width;
      canvas.height = size.height;
      ctx.setTransform(size.dpr, 0, 0, size.dpr, 0, 0);
      overlay.width = cssWidth;
      overlay.height = cssHeight;
    },
    destroy() {
      destroyed = true;
      ctx.clearRect(0, 0, overlay.width, overlay.height);
    },
  };

  overlay.resize();
  return overlay;
}
