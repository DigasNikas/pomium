# Packaging Pomium as a double-clickable installer — Design

Date: 2026-09-05
Status: Approved for planning

## Goal

Produce installers a non-technical person can use. Today the only way to run
Pomium is `npm install && npm start`, which rules out the intended audience
entirely.

Success is: they open a link, click one file for their platform, click through
one first-run warning, and Pomium is in their Start Menu or Applications folder.

## Decisions taken during brainstorming

| Question | Decision |
| --- | --- |
| Platforms | Windows and macOS |
| Code signing | None — unsigned, with a written guide for the first-run warning |
| Delivery | GitHub Release, public, attached by CI on a version tag |
| Tooling | electron-builder |

### Accepted consequences

**Each recipient sees one scary warning per machine.** Windows SmartScreen says
"Windows protected your PC"; macOS says the developer cannot be verified.
Removing them costs roughly $99/year for Apple plus $200-400/year for a Windows
certificate, which is not proportionate for a handful of recipients. On current
macOS the override moved into System Settings and is genuinely hard to find
unaided, so the guide matters more than it would have a few years ago.

**Public releases distribute the bundled artwork.** The installers contain the
44 vendored atlas files, and a public release makes them downloadable by anyone.

## Why electron-builder rather than Forge

Forge's value is its plugin and bundler ecosystem. This app has no build step to
plug into: plain JavaScript, no transpiler, no bundler, ES modules scoped by
nested `package.json` files. electron-builder produces installers directly with
less ceremony, and its `files` allowlist is the cleaner way to keep tests and
documentation out of the shipped app.

## What ships

Only `src/`, `assets/` and `package.json`.

Explicitly excluded: `test/`, `docs/`, `.github/`, `scripts/`,
`electron-builder.yml`. This matters more than usual — `docs/` holds a 2.7 MB
demo GIF, and `assets/` already contributes 15 MB of atlases.

Expect roughly 250 MB installed on Windows and 400 MB for a macOS universal
build, almost all of it Chromium.

## One file per platform

macOS gets a **universal** `.dmg` running on both Intel and Apple Silicon. It
roughly doubles the Mac download. That is the right trade: "which of these two
Mac files do I need?" is exactly the question that stops the intended audience.

Windows gets a single x64 NSIS `.exe`. arm64 Windows is rare enough not to
justify a second artifact and a second choice.

Artifact names state the platform plainly: `Pomium-1.0.0-mac.dmg` and
`Pomium-1.0.0-win.exe`.

## Icons

The repository has no `icons/` directory — that was the browser extension. One
1024x1024 PNG is generated at `build/icon.png` from **frame 57 of `char_07`**,
a 200x200 square at `(0, 1781)` in that atlas.

This deliberately differs from the browser extension, whose icon is frame 60 of
`char_04` at 156x156. That source was fine there because the largest icon the
extension ships is 128px; macOS renders app icons up to 1024, where a 156px
source is visibly soft. Every larger frame in `char_04` was checked and rejected
— they are all either fire blowout from the spawn or the near-black fade at the
end of the animation. A sweep of every character's mid-animation frames found
`char_07` frame 57 to be the largest clean, front-facing pose in the whole set.

Icon quality is worth more here than matching the sibling product, since a soft
or default icon is precisely what reads as unfinished to a non-technical user.

electron-builder derives `.icns` and `.ico` from that PNG. If it does not derive
them cleanly, both are generated explicitly rather than shipping the default
Electron icon — an app carrying Electron's own icon reads as unfinished to
exactly the audience this work targets.

## Release pipeline

A GitHub Actions workflow triggered by a `v*` tag, with a two-runner matrix:
`macos-latest` builds the dmg, `windows-latest` builds the exe, and both attach
to the same GitHub Release.

The workflow **fails if the tag disagrees with `package.json`'s version**. The
same gate in the sibling extension repository caught a real mistake, and the
failure mode without it — a release named `v1.1.0` containing an app that
reports `1.0.0` — is invisible until a user reports it.

Tests run before either build. A tag that does not pass the suite produces no
installers.

`package.json` moves to `1.0.0`. `0.1.0` is a scaffold number, and the first
release someone else installs should not look like a draft.

## The guide

`docs/install.md`, written for the recipient rather than the developer. Two
short sections with the literal click-path each platform demands:

- Windows: **More info** then **Run anyway**
- macOS: **System Settings → Privacy & Security → Open Anyway**

The macOS path is called out specifically because right-click-Open no longer
bypasses Gatekeeper for unnotarised apps on current macOS, and most advice
online is stale on this point.

Release notes link the guide, since the release page is where someone stands
when the warning appears.

## Testing

CI proves both installers build and attach. Nothing automated can prove either
one installs and launches: a CI runner has no display, and the Windows artifact
cannot be exercised from a macOS development machine at all.

That verification is manual, once per platform, and is recorded as a checklist
in the guide: install, launch, click a page, confirm poms appear.

The existing 68 tests are unaffected — packaging touches no runtime code, and
the workflow runs them as a gate rather than adding to them.

## Out of scope

- **Auto-update.** It needs a signed application to be worth building.
- **Code signing and notarisation**, per the decision above.
- **Linux.** No recipient asked for it.
- **App Store or Microsoft Store distribution.** Both require signing and
  review, and neither serves the goal of sending someone a link.
