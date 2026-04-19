import type { JSX } from 'react'

interface ReleaseNotesClassNames {
  title: string
  heading: string
  paragraph: string
  list: string
}

function normalizeHtmlNotes(body: string) {
  return body
    .replace(/\r\n/g, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>\s*<p>/gi, '\n\n')
    .replace(/<\/li>\s*<li>/gi, '\n- ')
    .replace(/<li>/gi, '- ')
    .replace(/<\/li>/gi, '\n')
    .replace(/<\/?(ul|ol)>/gi, '\n')
    .replace(/<h1[^>]*>(.*?)<\/h1>/gi, '\n# $1\n')
    .replace(/<h2[^>]*>(.*?)<\/h2>/gi, '\n## $1\n')
    .replace(/<h3[^>]*>(.*?)<\/h3>/gi, '\n### $1\n')
    .replace(/<h4[^>]*>(.*?)<\/h4>/gi, '\n### $1\n')
    .replace(/<p[^>]*>/gi, '')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
}

export function renderReleaseNotes(body: string, classNames: ReleaseNotesClassNames) {
  const lines = normalizeHtmlNotes(body)
    .split('\n')
    .map((line) => line.trimEnd())

  const blocks: JSX.Element[] = []
  let bulletItems: string[] = []
  let paragraphLines: string[] = []

  const flushBullets = () => {
    if (!bulletItems.length) return
    blocks.push(
      <ul key={`ul-${blocks.length}`} className={classNames.list}>
        {bulletItems.map((item, index) => (
          <li key={`li-${index}`}>{item}</li>
        ))}
      </ul>,
    )
    bulletItems = []
  }

  const flushParagraph = () => {
    if (!paragraphLines.length) return
    blocks.push(
      <p key={`p-${blocks.length}`} className={classNames.paragraph}>
        {paragraphLines.join(' ')}
      </p>,
    )
    paragraphLines = []
  }

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) {
      flushBullets()
      flushParagraph()
      continue
    }

    const headingMatch = trimmed.match(/^(#{1,3})\s+(.+)$/)
    if (headingMatch) {
      flushBullets()
      flushParagraph()
      const level = headingMatch[1].length
      const content = headingMatch[2].trim()
      if (level === 1) {
        blocks.push(<h3 key={`h-${blocks.length}`} className={classNames.title}>{content}</h3>)
      } else {
        blocks.push(<h4 key={`h-${blocks.length}`} className={classNames.heading}>{content}</h4>)
      }
      continue
    }

    const bulletMatch = trimmed.match(/^[-*]\s+(.+)$/)
    if (bulletMatch) {
      flushParagraph()
      bulletItems.push(bulletMatch[1].trim())
      continue
    }

    paragraphLines.push(trimmed)
  }

  flushBullets()
  flushParagraph()

  return blocks.length
    ? blocks
    : <p className={classNames.paragraph}>{normalizeHtmlNotes(body).trim()}</p>
}
