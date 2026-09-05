# Installing Pomium

Pomium is a desktop browser where every click sends a pair of Pomeranians sweeping across the window behind a fire shockwave.

## Windows

1. Go to the [releases page](https://github.com/DigasNikas/pomium/releases) and download `Pomium-<version>-win.exe`.
2. Run the downloaded file. Windows will show a blue "Windows protected your PC" screen (this is the warning described below, not a sign anything is wrong). Click **More info**, then **Run anyway**.
3. Step through the installer (Next, Install, Finish). You don't need to change the install location.
4. Pomium is now in your Start Menu and on your desktop.

## macOS

1. Go to the [releases page](https://github.com/DigasNikas/pomium/releases) and download `Pomium-<version>-mac.dmg`.
2. Open the dmg and drag Pomium into the Applications folder.
3. Double-click Pomium in Applications. macOS will refuse to open it, with a dialog saying Apple could not verify it's free of malware. Dismiss that dialog.
4. Open **System Settings → Privacy & Security**, and scroll down to the Security section. You'll see a line mentioning that Pomium was blocked. Click **Open Anyway** next to it.
5. Authenticate with your password or Touch ID, then confirm once more on the dialog that follows. Pomium opens.

After this first launch, Pomium opens normally, with no further warnings.

## Why the warning shows up

Pomium isn't signed with a developer certificate. Those cost a few hundred dollars a year, and this is a toy project, not a business. Both operating systems flag any app that isn't signed, whether or not it's actually a problem. The warning means unrecognised, not infected.

## Check it works

Open any page and click on it. A pair of Pomeranians should sweep across the window behind a fire shockwave, and the window should jolt as they pass.
