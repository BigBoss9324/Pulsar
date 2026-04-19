const fs = require('fs')
const path = require('path')
const https = require('https')

const rootDir = path.resolve(__dirname, '..')
const packageJson = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'))
const stubPath = path.join(rootDir, 'release', 'PulsarSetup.exe')
const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN
const owner = packageJson.build?.publish?.[0]?.owner || 'BigBoss9324'
const repo = packageJson.build?.publish?.[0]?.repo || packageJson.name
const version = packageJson.version
const possibleTags = [`v${version}`, version]

function requestJson(method, url, headers = {}, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, {
      method,
      headers: {
        'User-Agent': 'Pulsar-Release-Script',
        Accept: 'application/vnd.github+json',
        ...headers,
      },
    }, (res) => {
      const chunks = []
      res.on('data', (chunk) => chunks.push(chunk))
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8')
        const ok = res.statusCode && res.statusCode >= 200 && res.statusCode < 300
        const payload = text ? JSON.parse(text) : null
        if (ok) {
          resolve(payload)
          return
        }
        reject(new Error(payload?.message || `GitHub API request failed (${res.statusCode})`))
      })
    })
    req.on('error', reject)
    if (body) req.write(body)
    req.end()
  })
}

function request(method, url, headers = {}, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, {
      method,
      headers: {
        'User-Agent': 'Pulsar-Release-Script',
        ...headers,
      },
    }, (res) => {
      const chunks = []
      res.on('data', (chunk) => chunks.push(chunk))
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8')
        const ok = res.statusCode && res.statusCode >= 200 && res.statusCode < 300
        if (ok) {
          resolve(text)
          return
        }
        reject(new Error(text || `GitHub upload failed (${res.statusCode})`))
      })
    })
    req.on('error', reject)
    if (body) req.write(body)
    req.end()
  })
}

async function findRelease() {
  for (const tag of possibleTags) {
    try {
      const release = await requestJson(
        'GET',
        `https://api.github.com/repos/${owner}/${repo}/releases/tags/${encodeURIComponent(tag)}`,
        { Authorization: `Bearer ${token}` },
      )
      return release
    } catch (error) {
      if (!String(error.message).includes('Not Found')) throw error
    }
  }

  throw new Error(`Could not find a GitHub release for ${possibleTags.join(' or ')}`)
}

async function deleteExistingAsset(release, assetName) {
  const existing = Array.isArray(release.assets)
    ? release.assets.find((asset) => asset && asset.name === assetName)
    : null

  if (!existing) return

  await requestJson(
    'DELETE',
    `https://api.github.com/repos/${owner}/${repo}/releases/assets/${existing.id}`,
    { Authorization: `Bearer ${token}` },
  )
}

async function uploadAsset(release, assetPath) {
  const fileName = path.basename(assetPath)
  const fileBuffer = fs.readFileSync(assetPath)
  const uploadUrlTemplate = release.upload_url
  const uploadUrl = uploadUrlTemplate.replace(/\{\?name,label\}$/, `?name=${encodeURIComponent(fileName)}`)

  await request(
    'POST',
    uploadUrl,
    {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/octet-stream',
      'Content-Length': fileBuffer.length,
    },
    fileBuffer,
  )
}

async function main() {
  if (!token) {
    throw new Error('GH_TOKEN or GITHUB_TOKEN is required to upload the stub installer.')
  }

  if (!fs.existsSync(stubPath)) {
    throw new Error(`Stub installer not found: ${stubPath}`)
  }

  const release = await findRelease()
  await deleteExistingAsset(release, path.basename(stubPath))
  await uploadAsset(release, stubPath)
  console.log(`Uploaded ${path.basename(stubPath)} to ${release.tag_name}`)
}

main().catch((error) => {
  console.error(error.message || error)
  process.exit(1)
})
