// A <webview> is a separate frame, so a click inside a page reports
// coordinates relative to that pane. The overlay canvas spans the whole
// window, so those have to be shifted by where the pane sits.
//
// Only the horizontal offset is needed: poms spawn along a line whose
// position is parameterised by x alone (see engine.spawnPair), so a y
// translation would have nothing to feed.
export function windowX(pageX, paneRect) {
  return pageX + (paneRect ? paneRect.left : 0);
}
