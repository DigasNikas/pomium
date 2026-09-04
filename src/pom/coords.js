// A <webview> is a separate frame, so a click inside a page reports
// coordinates relative to that pane. The overlay canvas spans the whole
// window, so those have to be shifted by where the pane sits.
export function windowPoint(pageX, pageY, paneRect) {
  const left = paneRect ? paneRect.left : 0;
  const top = paneRect ? paneRect.top : 0;
  return { x: pageX + left, y: pageY + top };
}
