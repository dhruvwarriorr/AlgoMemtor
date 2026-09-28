// Builds the connector for Chrome (and Chromium browsers) and for Firefox
// (and Firefox-based browsers such as Zen), then packages each as a zip.
//
//   ALGOMEMTOR_WEB_URL  site the extension pairs with (local default: localhost:5173)
//   ALGOMEMTOR_API_URL  API it uploads to; the Next.js site serves the API, so
//                       this defaults to ALGOMEMTOR_WEB_URL
// Without ALGOMEMTOR_WEB_URL, Vercel builds fall back to its production
// domain, which Vercel picks as the shortest custom domain on the project, so
// set ALGOMEMTOR_WEB_URL whenever more than one domain is attached. Deployment
// builds reject localhost URLs.
//
// Output: dist/<target>/ (load unpacked), release/*.zip, and copies of the
// zips in apps/web/public/extension/ so the website can offer downloads.
import { execFileSync } from 'node:child_process'
import {
  cpSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { deflateSync } from 'node:zlib'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const version = pkg.version
const deploymentBuild = process.env.ALGOMEMTOR_DEPLOYMENT_BUILD === '1'
const vercelDomain =
  process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL
const deployedWebUrl = vercelDomain ? `https://${vercelDomain}` : undefined
const configuredWebUrl = process.env.ALGOMEMTOR_WEB_URL || deployedWebUrl
const configuredApiUrl = process.env.ALGOMEMTOR_API_URL || configuredWebUrl

if (deploymentBuild && !configuredWebUrl) {
  throw new Error(
    'Deployment connector build needs a public site URL (ALGOMEMTOR_WEB_URL or Vercel domain).',
  )
}
const webUrl = new URL(configuredWebUrl ?? 'http://localhost:5173')
// Manual-sync cooldown in minutes (0 disables it, for local testing only).
const cooldownMinutes = Number(
  process.env.ALGOMEMTOR_MANUAL_SYNC_COOLDOWN_MINUTES ?? '15',
)
if (!Number.isFinite(cooldownMinutes) || cooldownMinutes < 0) {
  throw new Error('ALGOMEMTOR_MANUAL_SYNC_COOLDOWN_MINUTES must be 0 or more.')
}
const apiUrl = new URL(configuredApiUrl ?? 'http://localhost:5173')
for (const url of [webUrl, apiUrl]) {
  const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1'
  if (deploymentBuild && local) {
    throw new Error(`Deployment connector URL cannot use localhost: ${url}`)
  }
  if (url.protocol !== 'https:' && !(local && url.protocol === 'http:')) {
    throw new Error(`Use an https:// address (http only for localhost): ${url}`)
  }
}

// Match patterns cannot carry a port, so local builds match every port.
const pattern = (url) => `${url.protocol}//${url.hostname}/*`
const isLocal = (url) =>
  url.hostname === 'localhost' || url.hostname === '127.0.0.1'
// The site may be opened with or without "www.", so pair on both.
const sitePatterns = (url) => {
  if (isLocal(url)) return [pattern(url)]
  const apex = url.hostname.replace(/^www\./, '')
  return [`${url.protocol}//${apex}/*`, `${url.protocol}//www.${apex}/*`]
}
const hostPermissions = [
  'https://leetcode.com/*',
  'https://cses.fi/*',
  'https://codeforces.com/*',
  'https://www.codechef.com/*',
  ...new Set([pattern(apiUrl), ...sitePatterns(webUrl)]),
]

const manifest = (target) => ({
  manifest_version: 3,
  name: 'AlgoMemtor Connector',
  version,
  description:
    'Syncs your LeetCode, CSES, CodeChef, and Codeforces accounts to AlgoMemtor. Passwords and code never leave your browser.',
  icons: { 48: 'icon-48.png', 128: 'icon-128.png' },
  action: {
    default_popup: 'popup.html',
    default_title: 'AlgoMemtor Connector',
    default_icon: { 48: 'icon-48.png', 128: 'icon-128.png' },
  },
  permissions: ['storage', 'alarms', 'notifications', 'scripting'],
  host_permissions: hostPermissions,
  content_scripts: [
    { matches: sitePatterns(webUrl), js: ['pair.js'], run_at: 'document_idle' },
  ],
  ...(target === 'chrome'
    ? {
        minimum_chrome_version: '116',
        background: { service_worker: 'background.js', type: 'module' },
      }
    : {
        background: { scripts: ['background.js'], type: 'module' },
        browser_specific_settings: {
          gecko: {
            id: 'connector@algomemtor.site',
            strict_min_version: '128.0',
            data_collection_permissions: { required: ['websiteContent'] },
          },
        },
      }),
})

// A small solid PNG icon, so the build needs no image assets.
const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
const crc = (buffer) => {
  let c = 0xffffffff
  for (const byte of buffer) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
const chunk = (type, data) => {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const sum = Buffer.alloc(4)
  sum.writeUInt32BE(crc(body))
  return Buffer.concat([length, body, sum])
}
const icon = (size) => {
  const rows = []
  const radius = size * 0.22
  for (let y = 0; y < size; y += 1) {
    const row = [0]
    for (let x = 0; x < size; x += 1) {
      // Rounded orange square with a lighter centre bar.
      const dx = Math.max(radius - x, x - (size - 1 - radius), 0)
      const dy = Math.max(radius - y, y - (size - 1 - radius), 0)
      const inside = dx * dx + dy * dy <= radius * radius
      const bar =
        y > size * 0.3 && y < size * 0.7 && x > size * 0.44 && x < size * 0.56
      row.push(
        ...(inside
          ? bar
            ? [255, 236, 224, 255]
            : [217, 72, 15, 255]
          : [0, 0, 0, 0]),
      )
    }
    rows.push(Buffer.from(row))
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(size, 0)
  header.writeUInt32BE(size, 4)
  header.writeUInt8(8, 8)
  header.writeUInt8(6, 9)
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(Buffer.concat(rows))),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

const compiled = join(root, 'dist', '.compiled')
rmSync(join(root, 'dist'), { recursive: true, force: true })
execFileSync(
  'npx',
  ['tsc', '-p', 'tsconfig.build.json', '--outDir', compiled],
  {
    cwd: root,
    stdio: 'inherit',
  },
)

const releaseDir = join(root, 'release')
const webDownloads = join(root, '..', 'web', 'public', 'extension')
mkdirSync(releaseDir, { recursive: true })
mkdirSync(webDownloads, { recursive: true })

for (const target of ['chrome', 'firefox']) {
  const out = join(root, 'dist', target)
  mkdirSync(out, { recursive: true })
  for (const file of readdirSync(compiled)) {
    if (file.endsWith('.js')) cpSync(join(compiled, file), join(out, file))
  }
  cpSync(join(root, 'static'), out, { recursive: true })
  writeFileSync(
    join(out, 'config.js'),
    `export const WEB_URL = ${JSON.stringify(webUrl.origin)}\nexport const DEFAULT_API_URL = ${JSON.stringify(apiUrl.origin)}\nexport const MANUAL_SYNC_COOLDOWN_MINUTES = ${cooldownMinutes}\n`,
  )
  writeFileSync(
    join(out, 'manifest.json'),
    `${JSON.stringify(manifest(target), null, 2)}\n`,
  )
  writeFileSync(join(out, 'icon-48.png'), icon(48))
  writeFileSync(join(out, 'icon-128.png'), icon(128))

  const zipName = `algomemtor-connector-${target}-${version}.zip`
  rmSync(join(releaseDir, zipName), { force: true })
  execFileSync('zip', ['-q', '-r', '-X', join(releaseDir, zipName), '.'], {
    cwd: out,
  })
  cpSync(
    join(releaseDir, zipName),
    join(webDownloads, `algomemtor-connector-${target}.zip`),
  )
  console.log(`${target}: dist/${target} and release/${zipName}`)
}
rmSync(compiled, { recursive: true, force: true })
writeFileSync(
  join(webDownloads, 'version.json'),
  `${JSON.stringify({ version, webUrl: webUrl.origin, apiUrl: apiUrl.origin })}\n`,
)
