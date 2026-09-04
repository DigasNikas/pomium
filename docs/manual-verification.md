# Manual verification

Nothing in this document has been run. It was written by an agent with no
display, unable to launch Electron. Every box below is unchecked and stays
that way until a human actually runs the app and ticks them by hand.

## What has automated coverage, and what does not

`npm test` runs 66 tests (`node --test`) against `src/pom/`: the sprite
maths (velocity, jitter, depth), the fixed-step loop, atlas parsing and
cache eviction, render-argument construction, and coordinate translation.
None of that touches a browser window.

Untested by anything automated:

- DOM assembly in `src/renderer/renderer.js` (tabs, address bar, wiring the
  overlay canvas to pointer events)
- the overlay canvas actually painting on screen
- `src/pom/atlas-loader.js` reading real files off disk through Electron's
  file APIs, as opposed to the mocked loader the unit tests use
- IPC: `src/webview-preload.js` forwarding page events to the host, and the
  host forwarding shake events to `src/main.js`
- the window-shake handler in `src/main.js` (`ipcMain.on('pom-shake', ...)`)
  actually moving the OS window

This checklist exists to cover exactly that list.

## Setup

```sh
npm install
npm start
```

Expect a window titled "Pomium" with a tab strip, a toolbar, an address
bar, and one tab open to Google. If this does not happen, stop here —
nothing below can be checked.

## Checklist

- [ ] **Click in a page.** Click anywhere on the loaded page (not the
  chrome). Expected: a pair of Pomeranians and a fire shockwave appear and
  sweep down and to the right across the window. Failure looks like:
  nothing appears, or something appears only on the page area rather than
  the full window.

- [ ] **Click on the tab strip or the address bar.** Expected: poms spawn
  and fly over the chrome exactly as they did over the page — the tab strip
  and toolbar are not a dead zone. Failure: nothing spawns, or poms are
  visibly clipped at the top of the window where the chrome sits.

- [ ] **Click near the left edge vs. near the right edge.** Click once near
  the window's left edge, then once near the right edge. Expected: the
  left-edge click enters higher and steeper than the right-edge one — the
  spawn angle depends on horizontal position. Failure: both clicks look the
  same regardless of x position.

- [ ] **Hold and drag.** Press the mouse down on a page and drag it around
  without releasing. Expected: poms spawn continuously for as long as the
  button is held, not just once on press. Failure: only one pair spawns
  despite continued dragging.

- [ ] **Window jolt on spawn.** Watch the OS window frame (its title bar or
  edges against the desktop) while clicking. Expected: the window
  physically moves — a jolt — on each spawn, then settles back to where it
  started once the animation finishes. Failure: the window never moves, or
  it moves but does not return to its original position afterwards.

- [ ] **Move the window, then click again.** Drag the window to a new
  position on your desktop using its title bar. Click inside it. Expected:
  the shake happens from the new position — the window jolts around
  wherever you just put it, then returns there. Failure: the window jumps
  back to its old position (teleports) instead of shaking in place.

- [ ] **Maximise, click, then un-maximise and move.** Maximise the window
  and click inside it. Expected: no shake at all — this is deliberate,
  since `setBounds` fights the OS window manager while maximised or
  fullscreen. Then un-maximise, drag the window to a new spot, and click
  again. Expected: it now shakes from that new spot, not from wherever the
  window sat before it was maximised. This exact path had a real bug found
  in review (stale resting position after maximise), so check it
  specifically rather than assuming the earlier checks cover it. Failure:
  the window shakes while maximised, or teleports back to the pre-maximise
  position after un-maximising.

- [ ] **Links and the address bar still work.** Click a link on a page and
  confirm it navigates. Click into the address bar, confirm it focuses,
  type a URL, press Enter, confirm it loads. Failure: a click intended for
  the page or the address bar is swallowed by the pom overlay instead of
  reaching its target.

- [ ] **Switch tabs mid-animation.** Click to start a pom animation, then
  immediately click a different tab. Expected: the animation keeps running
  uninterrupted over the new tab's content; switching tabs does not reset
  or stop it. Failure: the animation freezes, restarts, or vanishes on tab
  switch.

- [ ] **Second tab, correct placement.** Open a new tab and click inside
  its page content. Expected: poms spawn at the position you actually
  clicked in that tab, not at a stale position left over from the first
  tab. Failure: poms spawn at the wrong location, or don't spawn at all in
  a second tab.

- [ ] **Clean console.** Open DevTools (for the host chrome, and separately
  for a `<webview>`'s own devtools if you open them) and repeat a few of
  the actions above. Expected: no errors or warnings logged. Failure: any
  uncaught exception, failed asset fetch, or repeated warning while poms
  are spawning.

## Not a bug: continuous shake during a drag-stream

While a hold-and-drag stream is running, the window shakes continuously
for as long as poms keep spawning. That makes drag-to-select on a page
impractical during a stream — the window itself is moving under your
cursor. This is a deliberate consequence of shaking on every spawn, not a
defect to file.
