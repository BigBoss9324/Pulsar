# Pulsar
<img width="125" height="125" alt="Pulsar" src="https://github.com/user-attachments/assets/10218e63-c634-44cf-80ee-11190953ac2f" />

Pulsar is a Windows desktop app for downloading video and audio from many sites supported by `yt-dlp`, including platforms such as YouTube, TikTok, Instagram, Shorts, and playlist-based sources.

It is designed for people who want a simple desktop experience instead of managing command-line download tools directly. Pulsar gives you a queue, format selection, download history, version management, and update support in a single app.

## What Pulsar Does
<img width="920" height="700" alt="Pulsar app screenshot" src="https://github.com/user-attachments/assets/84e2422f-283e-4161-8f6b-fe0fe2f70985" />

With Pulsar, you can:

- download video as MP4
- download audio as MP3, M4A, Opus, or WAV
- fetch playlist links and choose specific items
- queue multiple downloads and let them finish in order
- keep a saved history of completed downloads
- manage app versions from inside the app

## Why Use It

Pulsar is meant to make powerful media downloading tools easier to use for everyday Windows users.

Instead of manually installing supporting tools or remembering terminal commands, you can:

- paste a link
- choose a format
- select a save folder
- start the download

On first launch, Pulsar automatically downloads the tools it needs, including `yt-dlp` and `ffmpeg`.

## Download And Install

### Always-latest installer

Download **[PulsarSetup.exe](https://github.com/BigBoss9324/Pulsar/releases/latest/download/PulsarSetup.exe)** if you want a small installer that always downloads the newest public version of Pulsar when you run it.

This is the easiest option for most people.

### Specific version

If you want a particular release, open the [GitHub Releases](https://github.com/BigBoss9324/Pulsar/releases) page and download the versioned installer for that release, such as `PulsarSetup-1.2.0.exe`.

## How To Use Pulsar

1. Paste a supported video, audio, or playlist link into the main input box.
2. Click `Fetch`.
3. Choose the format you want.
4. Confirm the output folder if needed.
5. Start the download or add it to the queue.

By default, Pulsar saves downloads to your Windows `Downloads` folder until you change that in Settings.

## Playlists, Queue, And History

Pulsar is built for more than one-off downloads.

- Playlist links can be expanded so you can download selected items or the full list.
- The queue lets you line up multiple downloads and process them in order.
- Completed items are stored in History so you can reopen the folder, inspect the result, or redownload later.

## Updates And Version Management

Pulsar can automatically check for app updates.

When a new version is available, the app can:

- show that an update exists
- tell you whether it is stable or pre-release
- download the update
- restart into the updated version

From the app's version management area, you can also browse releases and install a newer or older version directly. This makes it easier to stay on a stable release, try a beta, or roll back if needed.

## Settings And Behavior

Pulsar includes settings for common day-to-day preferences, including:

- default save folder
- default format
- subtitle handling
- duplicate handling
- behavior after download errors
- automatic update checks
- pre-release update opt-in
- automatically opening the output folder after a download finishes

For new installs, Pulsar now waits 3 seconds before continuing after a download error by default.

## Requirements

- Windows x64
- Internet connection for first-launch setup
- Internet connection for update checks, release browsing, and version installs

## App Data

Pulsar stores its working files in its Windows app data directory.

Important files include:

| File | Purpose |
| --- | --- |
| `settings.json` | Saved app settings |
| `history.json` | Download history |
| `queue.json` | Saved queue state |
| `pulsar.log` | App log file |
| `yt-dlp.exe` | Download engine |
| `ffmpeg.exe` | Media processing tool |

## Current Limitations

- Pulsar currently targets Windows x64.
- Site support depends on what `yt-dlp` supports.
- Spotify is not currently supported.

## Legal And Usage Note

Pulsar uses third-party tools such as `yt-dlp` and `ffmpeg`. You are responsible for making sure your usage complies with the terms of service, copyright rules, and local laws that apply to the content you download.
