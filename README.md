# Pulsar<img width="125" height="125" alt="Pulsar" src="https://github.com/user-attachments/assets/10218e63-c634-44cf-80ee-11190953ac2f" />


Welcome to the first release of Pulsar.

Pulsar is a Windows app for downloading video and audio from many supported sites. You can paste links from services like YouTube, TikTok, Instagram, playlists, Shorts, and many other sources supported by `yt-dlp`.
Spotify is not yet supported but I have plans to add it in the future.

## What You Can Do
<img width="920" height="700" alt="image" src="https://github.com/user-attachments/assets/84e2422f-283e-4161-8f6b-fe0fe2f70985" />

- Download video as MP4
- Download audio as MP3, M4A, Opus, or WAV
- Build a queue with multiple downloads
- Pick individual items from playlists
- Keep a saved download history
- Install newer or older app versions from inside Settings

## Getting Started

### Option 1 — Always-Latest Installer (Recommended)

Download **[PulsarSetup.exe](https://github.com/BigBoss9324/Pulsar/releases/PulsarSetup.exe)** — a small stub installer that automatically downloads and installs the current latest version every time you run it. You never need to update this file.

### Option 2 — Specific Version

Download a specific release from [GitHub Releases](https://github.com/BigBoss9324/Pulsar/releases) and run `Pulsar-Setup-x.x.x.exe`.

---

1. Run the installer.
2. Open Pulsar after installation.
3. On first launch, let Pulsar download `yt-dlp` and `ffmpeg` automatically.

## How To Download

1. Paste a supported video, audio, or playlist link into the main input box.
2. Click `Fetch`.
3. Choose the format you want.
4. Confirm the save folder if needed.
5. Start the download or add it to your queue.

By default, Pulsar saves to your Windows Downloads folder until you change it in Settings.

## Playlists And Queue

- If a playlist is detected, you can choose specific items or download the full list
- You can queue multiple downloads and let them finish in order
- Completed downloads appear in History so you can reopen the folder or redownload later

## Updates And Versions

Pulsar can check for app updates automatically.

When a new version is available:

- Pulsar asks before updating
- The update window shows the version number
- It tells you whether the release is `Stable` or `Pre-release / Beta`

If you accept the update, Pulsar downloads it and restarts automatically when it is ready.

From `Settings > Version`, you can also:

- browse release notes
- see the current installed version
- install a newer version
- install an older version

This means you can stay on a stable version, try a beta, or go back to an older release if you prefer its features or behavior.

## Settings

Inside Settings you can:

- change the default save folder
- choose a default format
- change the maximum history size
- turn automatic update checks on or off
- allow pre-release updates
- open the download folder automatically when a download finishes
- enable developer mode

## Requirements

- Windows x64
- Internet connection for first launch setup
- Internet connection for update checks, release notes, and release browsing

## App Data

Pulsar stores its app data in its AppData folder on Windows.

Important files include:

| File | Purpose |
| --- | --- |
| `settings.json` | Saved app settings |
| `history.json` | Download history |
| `queue.json` | Saved queue |
| `pulsar.log` | App log file |
| `yt-dlp.exe` | Download engine |
| `ffmpeg.exe` | Media processing tool |

If needed, Pulsar also includes a `Wipe data & uninstall` option to clear app data before uninstalling. This is located in the dev menu
