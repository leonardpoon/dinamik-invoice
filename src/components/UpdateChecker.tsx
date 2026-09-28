// Checks for an update once per launch, before the app itself is shown — a
// brief loading screen rather than a silent background check, so the office
// knows why the window took a moment to open. If one exists it then offers to
// install it as a small pill in the header rather than an interruption, since
// most launches have nothing to report. The signed manifest and installer
// come from whatever GitHub Release `.github/workflows/release.yml` last
// published; see that workflow for how a release gets made.

import { useEffect, useState } from 'react'
import { relaunch } from '@tauri-apps/plugin-process'
import { check, type Update } from '@tauri-apps/plugin-updater'

import { Icon } from '../ui'

// A PC with no network, or one where the update endpoint is simply
// unreachable, should never leave the office staring at "Checking for
// updates…" — five seconds is long enough for a real check to answer and
// short enough that a launch never feels stuck.
const CHECK_TIMEOUT_MS = 5000

/** Runs the update check exactly once per launch. `checking` gates the
 * app's own loading screen; `update` feeds the header's install pill. */
export function useUpdateCheck() {
  const [update, setUpdate] = useState<Update | null>(null)
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    let cancelled = false
    const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), CHECK_TIMEOUT_MS))
    Promise.race([check(), timeout])
      .then((u) => {
        if (!cancelled && u) setUpdate(u)
      })
      .catch(() => {
        // No network, no release published yet, anything — none of that
        // should ever interrupt opening the app, so it's silently ignored.
      })
      .finally(() => {
        if (!cancelled) setChecking(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  return { update, checking }
}

export default function UpdateChecker({
  update,
  notify,
}: {
  update: Update | null
  notify: (message: string, kind: 'error' | 'ok') => void
}) {
  const [installing, setInstalling] = useState(false)

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
