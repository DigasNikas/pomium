# Packaging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce a `.dmg` and a `.exe` that a non-technical person can install by clicking one file, built and published automatically from a version tag.

**Architecture:** electron-builder configured by `electron-builder.yml`, driven by a GitHub Actions workflow with a two-runner matrix — `macos-latest` builds a universal dmg, `windows-latest` builds an x64 NSIS installer — both attaching to one GitHub Release. No signing; a written guide covers the one first-run warning each platform shows.

**Tech Stack:** electron-builder 26.x, GitHub Actions, Electron 44.2.0.

**Spec:** `docs/superpowers/specs/2026-09-05-packaging-design.md`

## Global Constraints

- **electron-builder is the only new dependency**, added to `devDependencies`. Nothing else is added, at any point.
- **The repo root stays CommonJS.** No `"type"` key in the root `package.json`. `src/pom/` and `test/` are ESM via their own nested `package.json` files, and packaging must not disturb that.
- **Only `src/`, `assets/` and `package.json` ship.** `test/`, `docs/`, `.github/`, `scripts/` and `electron-builder.yml` are excluded. `docs/` holds a 2.7MB demo GIF; letting it into the app is a silent 2.7MB tax on every download.
- **No code signing.** Do not add signing identities, certificates, entitlements, or notarisation steps. Unsigned is the deliberate decision, not an oversight to fix.
- **`package.json` version becomes `1.0.0`** and the release workflow fails if a tag disagrees with it.
- **Commit messages are bare subject lines plus bodies.** No `Co-Authored-By`, no `Claude-Session`, no AI attribution trailer of any kind. Verify with `git log -1 --format=%B`.
- **The existing 68 tests must stay green** and unchanged in number. Packaging touches no runtime code.
- **Prose style** for the guide: plain and direct, written for the recipient rather than the developer. Do not use "delve", "seamless", "robust", "comprehensive", "leverage", "harness", "intricate", "landscape". Avoid the "**Bold term**: explanation" list pattern.

### Verified before this plan was written

- `electron-builder` current version is **26.15.3**.
- The icon source frame exists: `char_07` frame 57 is a **200x200** rect at `(0, 1781)` in `assets/desktop/char_07_desktop.webp`.
- The Swift icon generator in Task 1 was built and run against that exact frame; it produced a valid 1024x1024 RGBA PNG with alpha.

---

### Task 1: Generate the application icon

**Files:**
- Create: `scripts/make-icon.swift`
- Create: `build/icon.png`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: `assets/desktop/char_07_desktop.webp` (vendored by an earlier branch).
- Produces: `build/icon.png`, a 1024x1024 RGBA PNG that Task 2's electron-builder config points at.

There is no icon in this repository. Without one, both installers ship Electron's default icon, which reads as unfinished to exactly the audience this work is for.

The generator is Swift because the atlases are WebP, and decoding WebP in Node needs a dependency the Global Constraints forbid. macOS ships ImageIO, which decodes it natively. This runs once on a developer's Mac; the PNG is committed, so CI never needs it.

- [ ] **Step 1: Write `scripts/make-icon.swift`**

```swift
// Generates the application icon from the bundled spritesheet.
//
// Source: char_07 frame 57 — a 200x200 square at (0, 1781). That frame was
// chosen because it is the largest clean, front-facing pose in the whole set.
// Every larger frame in the atlases is either fire blowout from the spawn or
// the near-black fade at the end of the animation.
//
// Swift rather than Node because the atlases are WebP and decoding that in
// Node would need a dependency. macOS decodes it natively through ImageIO.
//
//   swiftc -O scripts/make-icon.swift -o /tmp/make-icon
//   /tmp/make-icon assets/desktop/char_07_desktop.webp build/icon.png
import Foundation
import AppKit
import ImageIO

let args = CommandLine.arguments
guard args.count >= 3 else {
    FileHandle.standardError.write("usage: make-icon <atlas.webp> <out.png>\n".data(using: .utf8)!)
    exit(2)
}

let FRAME = CGRect(x: 0, y: 1781, width: 200, height: 200)
let SIZE = 1024
let PAD = 0.03

guard let src = CGImageSourceCreateWithURL(URL(fileURLWithPath: args[1]) as CFURL, nil),
      let atlas = CGImageSourceCreateImageAtIndex(src, 0, nil),
      let cut = atlas.cropping(to: FRAME) else {
    FileHandle.standardError.write("could not read or crop \(args[1])\n".data(using: .utf8)!)
    exit(1)
}

let ctx = CGContext(data: nil, width: SIZE, height: SIZE, bitsPerComponent: 8, bytesPerRow: 0,
                    space: CGColorSpaceCreateDeviceRGB(),
                    bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
ctx.interpolationQuality = .high
ctx.clear(CGRect(x: 0, y: 0, width: SIZE, height: SIZE))

let inset = Double(SIZE) * PAD
let box = Double(SIZE) - inset * 2
let scale = min(box / Double(cut.width), box / Double(cut.height))
let w = Double(cut.width) * scale
let h = Double(cut.height) * scale
ctx.draw(cut, in: CGRect(x: (Double(SIZE) - w) / 2, y: (Double(SIZE) - h) / 2, width: w, height: h))

let rep = NSBitmapImageRep(cgImage: ctx.makeImage()!)
try! rep.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: args[2]))
print("wrote \(args[2]) at \(SIZE)x\(SIZE)")
```

- [ ] **Step 2: Build and run it**

```bash
mkdir -p build
swiftc -O scripts/make-icon.swift -o /tmp/make-icon
/tmp/make-icon assets/desktop/char_07_desktop.webp build/icon.png
```

Expected: `wrote build/icon.png at 1024x1024`

- [ ] **Step 3: Verify the PNG**

```bash
sips -g pixelWidth -g pixelHeight -g hasAlpha build/icon.png
```

Expected: `pixelWidth: 1024`, `pixelHeight: 1024`, `hasAlpha: yes`.

Alpha matters — electron-builder derives a macOS `.icns` from this, and a PNG without transparency produces an icon with an opaque square background.

- [ ] **Step 4: Make sure `build/` is not ignored**

`build/icon.png` must be committed so CI has it. Check nothing excludes it:

```bash
cat .gitignore
git check-ignore -v build/icon.png || echo "not ignored - correct"
```

Expected: `not ignored - correct`. If a rule matches, add a negation for `build/icon.png` rather than removing the rule.

- [ ] **Step 5: Confirm the suite is untouched**

Run: `npm test`
Expected: **68 tests, 68 pass, 0 fail**.

- [ ] **Step 6: Commit**

```bash
git add scripts/make-icon.swift build/icon.png .gitignore
git commit -m "feat: add the application icon

Generated from char_07 frame 57, the largest clean front-facing pose in the
bundled spritesheets at 200x200. Every larger frame is either fire blowout
from the spawn or the near-black fade at the end of the animation.

The generator is Swift because the atlases are WebP, which Node cannot decode
without a dependency, and macOS decodes natively through ImageIO. It runs once
on a developer machine; the PNG is committed so CI never needs it."
```

---

### Task 2: electron-builder configuration

**Files:**
- Create: `electron-builder.yml`
- Modify: `package.json`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: `build/icon.png` from Task 1.
- Produces: `npm run dist` building into `dist/`, and the artifact names Task 3's workflow attaches: `Pomium-<version>-mac.dmg` and `Pomium-<version>-win.exe`.

- [ ] **Step 1: Add electron-builder and the scripts**

```bash
npm install --save-dev electron-builder@^26.15.3
```

Then add to `package.json`'s `scripts`, leaving `start` and `test` alone:

```json
"dist": "electron-builder --publish never",
"dist:mac": "electron-builder --mac --publish never",
"dist:win": "electron-builder --win --publish never"
```

`--publish never` matters: without it electron-builder tries to upload to GitHub whenever it detects a CI token, and Task 3 attaches artifacts itself. Two upload paths would race.

- [ ] **Step 2: Bump the version to 1.0.0**

In `package.json`, change `"version": "0.1.0"` to `"version": "1.0.0"`.

`0.1.0` is a scaffold number and the first release someone else installs should not look like a draft.

- [ ] **Step 3: Write `electron-builder.yml`**

```yaml
appId: com.digasnikas.pomium
productName: Pomium

# Only what the app needs at runtime. Everything else would be dead weight in
# every download — docs/ alone holds a 2.7MB demo GIF.
files:
  - src/**/*
  - assets/**/*
  - package.json

directories:
  output: dist
  buildResources: build

# Names state the platform plainly, so someone choosing a download does not
# have to interpret an architecture triple.
mac:
  target:
    - target: dmg
      arch: [universal]
  category: public.app-category.utilities
  artifactName: Pomium-${version}-mac.${ext}

win:
  target:
    - target: nsis
      arch: [x64]
  artifactName: Pomium-${version}-win.${ext}

nsis:
  oneClick: false
  allowToChangeInstallationDirectory: false
  createDesktopShortcut: true
  createStartMenuShortcut: true
```

`oneClick: false` gives a normal Next-Next installer rather than a silent one that finishes before the user realises it started. `allowToChangeInstallationDirectory: false` removes a decision the intended audience should not be asked to make.

- [ ] **Step 4: Ignore the build output**

Add `dist/` to `.gitignore` if not already present. A built installer is a ~250MB artifact derived entirely from tracked files; committing one would bloat every clone permanently.

```bash
grep -q '^dist/$' .gitignore || echo 'dist/' >> .gitignore
cat .gitignore
```

- [ ] **Step 5: Build the macOS installer locally**

Run: `npm run dist:mac`

Expected: a `dist/Pomium-1.0.0-mac.dmg` appears. This takes several minutes — a universal build downloads both architecture runtimes.

If it fails complaining about the icon, generate `.icns` explicitly rather than shipping Electron's default:

```bash
mkdir -p /tmp/icon.iconset
for s in 16 32 64 128 256 512; do
  sips -z $s $s build/icon.png --out /tmp/icon.iconset/icon_${s}x${s}.png >/dev/null
  sips -z $((s*2)) $((s*2)) build/icon.png --out /tmp/icon.iconset/icon_${s}x${s}@2x.png >/dev/null
done
iconutil -c icns /tmp/icon.iconset -o build/icon.icns
```

Then commit `build/icon.icns` too and re-run.

- [ ] **Step 6: Verify what actually shipped**

```bash
hdiutil attach dist/Pomium-1.0.0-mac.dmg -nobrowse -mountpoint /tmp/pomium-dmg
ls /tmp/pomium-dmg
APP=/tmp/pomium-dmg/Pomium.app/Contents/Resources/app.asar
npx asar list "$APP" | grep -cE '^/test/|^/docs/|^/scripts/' || echo "0 dev files - correct"
npx asar list "$APP" | grep -c '^/assets/' 
hdiutil detach /tmp/pomium-dmg
```

Expected: `0 dev files - correct`, and a non-zero assets count. If `test/` or `docs/` appear, the `files` allowlist is wrong.

- [ ] **Step 7: Confirm the suite still passes**

Run: `npm test`
Expected: **68 tests, 68 pass, 0 fail**.

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json electron-builder.yml .gitignore
git commit -m "feat: add electron-builder configuration

Builds a universal macOS dmg and an x64 Windows NSIS installer. The files
allowlist ships only src, assets and package.json — docs alone holds a 2.7MB
demo GIF that would otherwise ride along in every download.

macOS gets one universal file rather than separate Intel and Apple Silicon
builds. It roughly doubles that download, and 'which of these two Mac files do
I need' is exactly the question that stops a non-technical user.

Version goes to 1.0.0; 0.1.0 is a scaffold number."
```

---

### Task 3: Release workflow

**Files:**
- Create: `.github/workflows/release.yml`

**Interfaces:**
- Consumes: the `dist:mac` and `dist:win` scripts from Task 2.
- Produces: a published GitHub Release carrying both installers, triggered by a `v*` tag.

- [ ] **Step 1: Write `.github/workflows/release.yml`**

```yaml
name: Release

# Tagging is the whole release process. Pushing a v* tag runs the tests, builds
# both installers, and publishes a GitHub Release with them attached.
#
#   git tag v1.0.0 && git push origin v1.0.0
#
# A hyphenated tag (v1.1.0-rc1) publishes as a prerelease instead: downloadable,
# but not marked latest and no release notification.

on:
  push:
    tags:
      - 'v*'

permissions:
  contents: write

jobs:
  # The tag and the app must agree before anything is built. A release named
  # v1.1.0 containing an app that reports 1.0.0 is invisible until a user
  # reports it, and the version cannot be reused once published.
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
      - name: Tag must match package.json version
        run: |
          TAG="${GITHUB_REF_NAME#v}"
          TAG="${TAG%%-*}"
          PKG="$(node -p "require('./package.json').version")"
          if [ "$TAG" != "$PKG" ]; then
            echo "::error::tag ${GITHUB_REF_NAME} implies ${TAG}, package.json says ${PKG}"
            exit 1
          fi
          echo "tag and package.json agree on ${PKG}"
      - name: Test
        run: npm test

  build:
    needs: verify
    strategy:
      fail-fast: false
      matrix:
        include:
          - os: macos-latest
            script: dist:mac
            artifact: 'dist/*.dmg'
          - os: windows-latest
            script: dist:win
            artifact: 'dist/*.exe'
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
      - run: npm ci
      - name: Build installer
        run: npm run ${{ matrix.script }}
      - uses: actions/upload-artifact@v4
        with:
          name: installer-${{ matrix.os }}
          path: ${{ matrix.artifact }}
          if-no-files-found: error

  publish:
    needs: build
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/download-artifact@v4
        with:
          path: artifacts
          merge-multiple: true
      - name: List what will be published
        run: ls -la artifacts
      - name: Publish release
        env:
          GH_TOKEN: ${{ github.token }}
        run: |
          VERSION="${GITHUB_REF_NAME#v}"
          PRERELEASE=""
          case "$VERSION" in
            *-*) PRERELEASE="--prerelease" ;;
          esac
          gh release create "$GITHUB_REF_NAME" \
            artifacts/* \
            --title "Pomium ${VERSION}" \
            --notes "Install instructions: https://github.com/${GITHUB_REPOSITORY}/blob/main/docs/install.md

          **macOS** — download the \`.dmg\`, open it, drag Pomium to Applications.
          **Windows** — download the \`.exe\` and run it.

          Both are unsigned, so the first launch shows a warning. The install guide above walks through it." \
            $PRERELEASE
```

`fail-fast: false` matters: if the Windows build breaks, the macOS artifact should still be produced so the failure can be diagnosed against a working comparison.

`if-no-files-found: error` matters more. Without it, a build that silently produces no installer uploads an empty artifact and the release publishes with nothing attached.

- [ ] **Step 2: Check the workflow parses**

```bash
python3 -c "import yaml,sys; yaml.safe_load(open('.github/workflows/release.yml')); print('yaml ok')"
```

Expected: `yaml ok`

- [ ] **Step 3: Verify the version-gate logic locally**

The gate strips a `v` prefix and any prerelease suffix. Check it against the cases it will see:

```bash
for TAG in v1.0.0 v1.1.0-rc1 v2.0.0; do
  T="${TAG#v}"; T="${T%%-*}"
  echo "$TAG -> $T"
done
```

Expected: `v1.0.0 -> 1.0.0`, `v1.1.0-rc1 -> 1.1.0`, `v2.0.0 -> 2.0.0`.

- [ ] **Step 4: Confirm the suite still passes**

Run: `npm test`
Expected: **68 tests, 68 pass, 0 fail**.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/release.yml
git commit -m "ci: build and publish installers on a version tag

Two runners build in parallel — macos-latest produces the universal dmg,
windows-latest the NSIS exe — and a third job attaches both to one release.

Three gates exist because each failure is otherwise invisible until a user
hits it. The tag must agree with package.json, since a release named v1.1.0
containing an app reporting 1.0.0 cannot be fixed by re-tagging. The tests run
before either build. And if-no-files-found: error stops a build that produced
no installer from publishing an empty release."
```

---

### Task 4: The install guide

**Files:**
- Create: `docs/install.md`
- Modify: `README.md`

**Interfaces:**
- Consumes: the release URL shape from Task 3.
- Produces: the guide the release notes link to.

This is the deliverable that decides whether the work succeeds. Both installers are unsigned, so the recipient meets a warning that says, in effect, that the software may be malicious. Someone non-technical stops there unless told exactly what to click.

- [ ] **Step 1: Write `docs/install.md`**

Write for the person installing, not the developer. It must contain, in this order:

1. A one-line statement of what Pomium is.
2. **Windows**: download `Pomium-<version>-win.exe` from the releases page; run it; at "Windows protected your PC" click **More info**, then **Run anyway**; finish the installer; Pomium is in the Start Menu.
3. **macOS**: download `Pomium-<version>-mac.dmg`; open it; drag Pomium to Applications; the first launch is blocked, so open **System Settings → Privacy & Security**, scroll to Security, and click **Open Anyway** next to the message about Pomium; confirm once more.
4. A short "why the warning" paragraph: the app is not signed, because a certificate costs a few hundred a year and this is a toy. The warning means unrecognised, not infected.
5. A "check it works" step: open any page, click it, poms should sweep across the window.

The macOS instruction must say **System Settings → Privacy & Security**. Do not write "right-click and choose Open" — that no longer bypasses Gatekeeper for unnotarised apps on current macOS, and most advice online is stale on this point. A reader following stale advice concludes the app is broken.

- [ ] **Step 2: Link it from `README.md`**

Add a short "Install" section near the top, above the existing developer instructions, pointing at the latest release and at `docs/install.md`. Keep the `npm install && npm start` instructions — they are still how a developer runs it — but make clear they are not what a user needs.

- [ ] **Step 3: Check every path and claim**

```bash
ls docs/install.md
grep -n "right-click" docs/install.md && echo "STALE ADVICE - fix" || echo "no stale macOS advice - correct"
grep -c "Privacy & Security" docs/install.md
```

Expected: the file exists, no stale advice, and at least one mention of Privacy & Security.

- [ ] **Step 4: Confirm the suite still passes**

Run: `npm test`
Expected: **68 tests, 68 pass, 0 fail**.

- [ ] **Step 5: Commit**

```bash
git add docs/install.md README.md
git commit -m "docs: add an install guide for unsigned builds

Both installers are unsigned, so a recipient meets a warning saying the
software may be malicious. Someone non-technical stops there unless told
exactly what to click, which makes this guide the piece that decides whether
the installers are usable at all.

The macOS path is System Settings, Privacy and Security, Open Anyway. Right
click and Open no longer bypasses Gatekeeper for unnotarised apps, and most
advice online is still stale on that point."
```

---

### Task 5: Cut the release and verify

**Files:**
- None. This task runs the pipeline and records the result.

**Interfaces:**
- Consumes: everything above.
- Produces: a published GitHub Release with both installers attached.

- [ ] **Step 1: Merge to `main` first**

The workflow triggers on a tag, and the tag should point at `main`. Merge the packaging branch before tagging, or the release is built from a commit no branch contains.

- [ ] **Step 2: Tag and push**

```bash
git checkout main
git pull
git tag v1.0.0
git push origin v1.0.0
```

- [ ] **Step 3: Watch the run**

```bash
gh run watch --exit-status
```

Expected: `verify` passes, both `build` jobs pass, `publish` attaches two files.

If the macOS build fails on the universal target, the fallback is `arch: [arm64, x64]` producing two dmgs. Take that only if universal genuinely fails — it reintroduces the "which file do I need" question the design exists to avoid, and the guide would need updating to match.

- [ ] **Step 4: Confirm the release**

```bash
gh release view v1.0.0 --json assets --jq '.assets[] | "\(.name) \(.size)"'
```

Expected: one `.dmg` of roughly 300-450MB and one `.exe` of roughly 150-250MB.

- [ ] **Step 5: Install it yourself on macOS**

Download the dmg from the release page — not from `dist/` — so the quarantine attribute a real download carries is exercised. Then walk `docs/install.md` exactly as written, including the Privacy & Security step, and confirm each instruction matches what actually appears on screen. Fix any wording that does not match.

Then launch Pomium, click a page, and confirm poms appear.

- [ ] **Step 6: Record the result**

Report which steps matched the guide and which needed correcting. The Windows path cannot be verified from a Mac and stays unverified until someone runs it on Windows — say so plainly rather than implying it was checked.

---

## Self-review notes

**Spec coverage.** electron-builder over Forge (Task 2), the `files` allowlist (Task 2), universal dmg and single-choice Windows exe (Task 2), artifact naming (Task 2), the icon and its source frame (Task 1), the CI matrix and version gate (Task 3), the guide with the macOS Privacy & Security path (Task 4), version to 1.0.0 (Task 2), public release with both installers (Tasks 3, 5). Out-of-scope items — auto-update, signing, Linux, store distribution — appear nowhere.

**Unverifiable by design.** No task claims the Windows installer was tested; Task 5 states it explicitly. Nothing in CI can prove either installer launches, which is why Task 5 has a human doing it on macOS.

**Known risk.** The universal macOS build is the most likely failure, since it downloads and merges two runtimes. Task 5 Step 3 carries the fallback and the cost of taking it.
