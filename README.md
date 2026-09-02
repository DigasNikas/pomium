# Pomium

A Chromium-based desktop browser (built on Electron) where every click
bombs the screen with a Pomeranian.

## Run

```sh
npm install
npm start
```

## How it works

- `src/main.js` — Electron main process, opens the browser window.
- `src/renderer/` — the browser chrome: tab strip, address bar, nav buttons,
  and a `<webview>` per tab.
- `src/webview-preload.js` — injected into every page loaded in a tab;
  forwards click coordinates from the page to the host chrome.
- `src/pom-bomb.js` / `src/pom-bomb.css` — the click-bomb effect itself
  (drop-in Pomeranian + a burst of paw prints). No external assets —
  everything is inline SVG so it renders instantly with zero network
  dependency. Swap in real art by replacing `POM_SVG` / `PAW_SVG` in
  `pom-bomb.js`.

## Known limitations (v0.1)

- Single window, no bookmarks/history/downloads UI yet.
- No packaging config (electron-builder/forge) yet — run from source.
