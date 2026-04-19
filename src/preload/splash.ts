import { ipcRenderer } from 'electron'

window.addEventListener('DOMContentLoaded', () => {
  ipcRenderer.on('splash-update', (_e, d: { status?: string; progress?: number; icon?: string }) => {
    const status = document.getElementById('status')
    const bar = document.getElementById('bar')
    if (status && d.status != null) status.textContent = d.status
    if (bar && d.progress != null) bar.style.width = d.progress + '%'
  })
})
