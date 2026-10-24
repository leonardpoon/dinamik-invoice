// The post-it beside a debit note's number: a small triangle that opens a
// sticky card to jot a reminder on the shipment. Never printed.
//
// Hover previews the card; a click pins it open so it can be typed into and
// stays put while the pointer wanders. The card is portalled to <body> and
// positioned with `fixed`, because the note rails scroll and would clip it.

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

interface Props {
  text: string
  /** ISO time the note was first written; empty when there is none. */
  stamp: string
  label: string
  onSave: (text: string) => Promise<void> | void
}

const CARD_W = 220
const CARD_H = 150
const CLOSE_DELAY_MS = 140

/** "24 Oct 2026, 3:42 pm" in the office PC's own time zone. */
function stampLabel(iso: string): string | null {
  const d = new Date(iso)
  if (!iso || Number.isNaN(d.getTime())) return null
  const date = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  const time = d.toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true })
  return `${date}, ${time}`
}

export default function StickyNote({ text, stamp, label, onSave }: Props) {
  const [hover, setHover] = useState(false)
  const [pinned, setPinned] = useState(false)
  const [draft, setDraft] = useState(text)
  const [pos, setPos] = useState({ left: 0, top: 0 })
  const tagRef = useRef<HTMLButtonElement>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const timer = useRef<number | undefined>(undefined)
  const open = hover || pinned
  const filled = text.trim() !== ''

  // A fresh draft each time the card opens, and whenever the saved text changes
  // underneath it while closed.
  useEffect(() => {
    if (!open) setDraft(text)
  }, [open, text])

  const commit = useCallback(() => {
    if (draft.trim() !== text.trim()) void onSave(draft)
  }, [draft, text, onSave])

  const close = useCallback(() => {
    commit()
    setHover(false)
    setPinned(false)
  }, [commit])

  useLayoutEffect(() => {
    if (!open || !tagRef.current) return
    const r = tagRef.current.getBoundingClientRect()
    const left = Math.min(r.right + 6, window.innerWidth - CARD_W - 8)
    const top = Math.max(8, Math.min(r.top - 8, window.innerHeight - CARD_H - 8))
    setPos({ left, top })
  }, [open])

  // Pinned: leave on an outside press or Escape. An iframe never bubbles a
  // mousedown, so a click into the PDF preview arrives as a window blur.
  useEffect(() => {
    if (!pinned) return
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node
      if (cardRef.current?.contains(t) || tagRef.current?.contains(t)) return
      close()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    const onBlur = () => {
      if (document.activeElement?.tagName === 'IFRAME') close()
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    window.addEventListener('blur', onBlur)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('blur', onBlur)
    }
  }, [pinned, close])

  useEffect(() => () => window.clearTimeout(timer.current), [])

  const enter = () => {
    window.clearTimeout(timer.current)
    setHover(true)
  }
  const leave = () => {
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      setHover(false)
      if (!pinned) commit()
    }, CLOSE_DELAY_MS)
  }

  return (
    <>
      <button
        ref={tagRef}
        type="button"
        aria-label={filled ? `Sticky note for ${label}` : `Add sticky note to ${label}`}
        onMouseEnter={enter}
        onMouseLeave={leave}
        onClick={(e) => {
          e.stopPropagation()
          if (pinned) close()
          else setPinned(true)
        }}
        className="shrink-0 inline-flex items-center justify-center"
        style={{ width: 14, height: 14, lineHeight: 0, opacity: filled || open ? 1 : 0.55 }}
      >
        <svg width="9" height="10" viewBox="0 0 9 10" aria-hidden="true">
          <path
            d="M1 1 L8 5 L1 9 Z"
            fill={filled ? '#f2d04b' : 'none'}
            stroke={filled ? '#f2d04b' : 'var(--muted-foreground)'}
            strokeWidth="1.2"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {open &&
        createPortal(
          <div
            ref={cardRef}
            onMouseEnter={enter}
            onMouseLeave={leave}
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'fixed',
              left: pos.left,
              top: pos.top,
              width: CARD_W,
              zIndex: 1000,
              background: '#f6e27a',
              color: '#3b3210',
              borderRadius: 2,
              padding: '14px 10px 8px',
              boxShadow: '0 8px 18px rgba(0,0,0,0.45), 0 1px 0 rgba(255,255,255,0.25) inset',
              transform: 'rotate(-1deg)',
            }}
          >
            <span
              aria-hidden="true"
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                height: 8,
                background: 'rgba(0,0,0,0.07)',
              }}
            />
            <textarea
              value={draft}
              autoFocus={pinned}
              onFocus={() => setPinned(true)}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) close()
              }}
              placeholder="Jot a note on this shipment…"
              rows={5}
              maxLength={500}
              style={{
                width: '100%',
                resize: 'none',
                background: 'transparent',
                border: 'none',
                outline: 'none',
                color: '#3b3210',
                fontSize: 12,
                lineHeight: 1.45,
                fontFamily: 'var(--font-inter)',
                padding: 0,
              }}
            />
            <div
              className="flex items-center justify-between"
              style={{ fontSize: 9, color: 'rgba(59,50,16,0.6)', fontFamily: 'var(--font-jetbrains)' }}
            >
              <span>{stampLabel(stamp) ?? (pinned ? 'Ctrl+Enter to save' : 'Click to edit')}</span>
              {draft.trim() !== '' && pinned && (
                <button
                  type="button"
                  onClick={() => {
                    setDraft('')
                    void onSave('')
                    setHover(false)
                    setPinned(false)
                  }}
                  style={{ textDecoration: 'underline' }}
                >
                  Clear
                </button>
              )}
            </div>
          </div>,
          document.body,
        )}
    </>
  )
}
