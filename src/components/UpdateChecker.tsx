// Checks for an update once per launch and, if one exists, offers to install
// it — a small pill in the header rather than an interruption, since most
// launches have nothing to report. The signed manifest and installer come
// from whatever GitHub Release `.github/workflows/release.yml` last
// published; see that workflow for how a release gets made.

import { useEffect, useState } from 'react'
import { relaunch } from '@tauri-apps/plugin-process'
import { check, type Update } from '@tauri-apps/plugin-updater'

import { Icon } from '../ui'

interface Props {
  notify: (message: string, kind: 'error' | 'ok') => void
}

export default function UpdateChecker({ notify }: Props) {
  const [update, setUpdate] = useState<Update | null>(null)
  const [installing, setInstalling] = useState(false)

  useEffect(() => {
    let cancelled = false
    check()
      .then((u) => {
        if (!cancelled && u) setUpdate(u)
      })
      .catch(() => {
        // No network, no release published yet, anything — none of that
        // should ever interrupt opening the app, so it's silently ignored.
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (!update) return null

  async function install() {
    if (!update) return
    setInstalling(true)
    try {
      await update.downloadAndInstall()
      await relaunch()
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Could not install the update', 'error')
      setInstalling(false)
    }
  }

  return (
    <button
      onClick={() => void install()}
      disabled={installing}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold"
      style={{
        background: 'color-mix(in srgb, var(--primary) 16%, var(--secondary))',
        color: 'var(--primary)',
        opacity: installing ? 0.7 : 1,
      }}
      title={update.body || `Version ${update.version} is ready to install`}
    >
      <Icon name="download" size={12} strokeWidth={2.5} />
      {installing ? 'Installing…' : `Update to ${update.version}`}
    </button>
  )
}
