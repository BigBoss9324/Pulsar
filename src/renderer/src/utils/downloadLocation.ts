type DownloadLocationTarget = {
  outputDir: string
  outputPath?: string
}

type ToastFn = (message: string, type: string) => void

const REVEAL_FALLBACK_MESSAGE = 'Exact file path is unavailable, so the folder was opened instead'

export async function revealDownloadLocation(target: DownloadLocationTarget, showToast?: ToastFn): Promise<void> {
  if (target.outputPath) {
    await window.api.revealItem(target.outputPath)
    return
  }

  await window.api.openFolder(target.outputDir)
  showToast?.(REVEAL_FALLBACK_MESSAGE, '')
}

export async function openDownloadFolder(target: DownloadLocationTarget): Promise<void> {
  await window.api.openFolder(target.outputDir)
}
