# Pulsar

A desktop video and audio downloader built with Electron. Paste any URL, pick a format, and download — no manual setup required.

## Features

- Download video (MP4) at any available resolution up to 4K
- Extract audio as MP3, M4A, Opus, or WAV
- Playlist support with per-item selection
- Download queue with progress and speed readout
- Download history with file reveal
- Persisted settings and queue across restarts
- Auto-updates via GitHub Releases

## Download

Head to the [Releases](https://github.com/BigBoss9324/Pulsar/releases/latest) page and download the latest `Pulsar-Setup-x.x.x.exe` installer.

1. Run the installer
2. Launch Pulsar
3. On first launch it will automatically download `yt-dlp` and `ffmpeg` — no manual setup needed

## Requirements

- Windows x64 (macOS/Linux binaries are detected but installer targets Windows)
- Internet connection on first launch to download `yt-dlp` and `ffmpeg` automatically

## Development

```bash
npm install
npm run dev
```

## Build

```bash
npm run dist
```

The installer is written to `release/`.

## Tech Stack

- [Electron](https://www.electronjs.org/) — desktop shell
- [React 18](https://react.dev/) — renderer UI
- [electron-vite](https://electron-vite.github.io/) — dev server and build
- [yt-dlp](https://github.com/yt-dlp/yt-dlp) — download engine (auto-downloaded at runtime)
- [ffbinaries](https://github.com/ffbinaries/ffbinaries-node) — ffmpeg provisioning
- [electron-updater](https://www.electron.build/auto-update) — auto-update

## Data & Storage

All app data lives in the Electron `userData` directory:

| File | Contents |
|---|---|
| `yt-dlp[.exe]` | Download engine binary |
| `ffmpeg[.exe]` | Media muxing binary |
| `settings.json` | User preferences |
| `history.json` | Completed download history |
| `queue.json` | Persisted download queue |
