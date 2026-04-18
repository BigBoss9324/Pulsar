export type UrlService =
  | 'youtube'
  | 'ytmusic'
  | 'other'

export interface UrlInfo {
  service: UrlService
  isMusic: boolean
  label: string
  contentType: string
  canBePlaylist: boolean
}

const SERVICE_META: Record<UrlService, { label: string; isMusic: boolean }> = {
  youtube: { label: 'YouTube', isMusic: false },
  ytmusic: { label: 'YouTube Music', isMusic: true },
  other: { label: 'Video', isMusic: false },
}

export function detectUrl(raw: string): UrlInfo {
  let hostname = ''
  try {
    const u = new URL(raw)
    hostname = u.hostname.replace(/^www\./, '')
  } catch {
    return makeInfo('other')
  }

  let service: UrlService = 'other'

  if (hostname === 'youtu.be' || hostname === 'youtube.com') service = 'youtube'
  else if (hostname === 'music.youtube.com') service = 'ytmusic'

  return makeInfo(service)
}

function makeInfo(service: UrlService): UrlInfo {
  const meta = SERVICE_META[service]
  return {
    service,
    isMusic: meta.isMusic,
    label: meta.label,
    contentType: '',
    canBePlaylist: service === 'youtube' || service === 'ytmusic',
  }
}
