'use client'

import { useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Download, FileSpreadsheet, FileText } from 'lucide-react'

/**
 * Export reuses the current query string verbatim, so what downloads is
 * exactly what is on screen — filters, search and sort included. The route
 * re-runs the same `buildWhere` the page used.
 */
export function ExportMenu({ exportPath }: { exportPath: string }) {
  const [open, setOpen] = useState(false)
  const searchParams = useSearchParams()

  const href = (format: 'csv' | 'xlsx') => {
    const sp = new URLSearchParams(searchParams.toString())
    sp.delete('page')
    sp.set('format', format)
    return `${exportPath}?${sp.toString()}`
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[rgb(var(--border-base))] px-3 text-[13px] font-medium text-muted hover:bg-[rgb(var(--surface-hover))] hover:text-strong"
      >
        <Download className="h-4 w-4" aria-hidden />
        Export
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} aria-hidden />
          <div
            role="menu"
            className="animate-slide-down absolute right-0 z-20 mt-1 w-52 rounded-lg border border-[rgb(var(--border-base))] bg-[rgb(var(--surface-card))] p-1 shadow-popover"
          >
            <a
              role="menuitem"
              href={href('xlsx')}
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-base hover:bg-[rgb(var(--surface-hover))]"
            >
              <FileSpreadsheet className="h-4 w-4 text-positive-600" aria-hidden />
              Excel (.xlsx)
            </a>
            <a
              role="menuitem"
              href={href('csv')}
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-base hover:bg-[rgb(var(--surface-hover))]"
            >
              <FileText className="h-4 w-4 text-info-600" aria-hidden />
              CSV
            </a>
            <p className="px-3 py-1.5 text-[11px] text-faint">
              Exports the current filters.
            </p>
          </div>
        </>
      )}
    </div>
  )
}
