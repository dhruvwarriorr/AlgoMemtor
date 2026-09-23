import { Download, ExternalLink } from '@/components/icons/algo-icons'

import { browserFamily, type BrowserFamily } from './extension-bridge'

// Store listings, once published. Until then the site offers the zip builds.
const storeUrl = (family: BrowserFamily): string | undefined => {
  const value: unknown =
    family === 'firefox'
      ? import.meta.env.VITE_FIREFOX_EXTENSION_URL
      : import.meta.env.VITE_CHROME_EXTENSION_URL
  return typeof value === 'string' && value.startsWith('https://')
    ? value
    : undefined
}

const downloads: Record<BrowserFamily, { label: string; href: string }> = {
  chrome: {
    label: 'Chrome, Edge, Brave',
    href: '/extension/algomemtor-connector-chrome.zip',
  },
  firefox: {
    label: 'Firefox, Zen',
    href: '/extension/algomemtor-connector-firefox.zip',
  },
}

const code = (text: string) => (
  <code className="rounded bg-muted px-1 break-all">{text}</code>
)

export function InstallExtensionSteps() {
  const family = browserFamily()
  const store = storeUrl(family)
  const other: BrowserFamily = family === 'firefox' ? 'chrome' : 'firefox'

  return (
    <div className="flex min-w-0 flex-col gap-3 text-sm text-foreground">
      <div className="flex min-w-0 flex-wrap gap-2">
        {store !== undefined ? (
          <a
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground"
            href={store}
            rel="noopener noreferrer"
            target="_blank"
          >
            <ExternalLink aria-hidden="true" className="size-3.5" />
            Install from the{' '}
            {family === 'firefox' ? 'Firefox Add-ons' : 'Chrome Web Store'}
          </a>
        ) : (
          <a
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground"
            download
            href={downloads[family].href}
          >
            <Download aria-hidden="true" className="size-3.5" />
            Download for {downloads[family].label}
          </a>
        )}
        <a
          className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm text-foreground"
          download
          href={downloads[other].href}
        >
          <Download aria-hidden="true" className="size-3.5" />
          {downloads[other].label}
        </a>
      </div>
      {store !== undefined ? (
        <p className="text-muted-foreground">
          After installing, the extension opens this section and connects on its
          own.
        </p>
      ) : family === 'firefox' ? (
        <ol className="flex list-decimal flex-col gap-1.5 pl-5">
          <li>Download the Firefox build above.</li>
          <li>
            Open {code('about:debugging#/runtime/this-firefox')} and choose{' '}
            <strong>Load Temporary Add-on…</strong>, then pick the downloaded
            zip.
          </li>
          <li>
            The extension opens this section and connects. A temporary add-on is
            removed when the browser quits; the signed release from Firefox
            Add-ons stays installed.
          </li>
        </ol>
      ) : (
        <ol className="flex list-decimal flex-col gap-1.5 pl-5">
          <li>Download the Chrome build above and unzip it.</li>
          <li>
            Open {code('chrome://extensions')}, turn on{' '}
            <strong>Developer mode</strong>, choose{' '}
            <strong>Load unpacked</strong>, and select the unzipped folder.
          </li>
          <li>The extension opens this section and connects on its own.</li>
        </ol>
      )}
    </div>
  )
}
