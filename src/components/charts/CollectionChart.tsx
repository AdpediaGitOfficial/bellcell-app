'use client'

import { useId, useState } from 'react'
import { formatPaiseShort } from '@/lib/money'

export interface CollectionPoint {
  label: string
  collectedPaise: number
}

/**
 * Daily fee collection, last N days.
 *
 * One series, so no legend box is needed - the card title names it. Carries a
 * crosshair + tooltip on hover per the interaction spec. Single y-axis only;
 * a target line would be a second scale and is deliberately not drawn here.
 */
export function CollectionChart({
  points,
  height = 200,
}: {
  points: CollectionPoint[]
  height?: number
}) {
  const gradientId = useId()
  const [active, setActive] = useState<number | null>(null)

  if (points.length < 2) {
    return (
      <p className="px-5 pb-5 text-sm text-muted">
        Not enough data to plot a trend yet.
      </p>
    )
  }

  const W = 640
  const H = height
  const PAD = { top: 12, right: 8, bottom: 24, left: 8 }
  const plotW = W - PAD.left - PAD.right
  const plotH = H - PAD.top - PAD.bottom

  const values = points.map((p) => p.collectedPaise)
  const max = Math.max(...values, 1)
  const stepX = plotW / (points.length - 1)

  const xOf = (i: number) => PAD.left + i * stepX
  const yOf = (v: number) => PAD.top + plotH - (v / max) * plotH

  const line = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${xOf(i).toFixed(2)},${yOf(p.collectedPaise).toFixed(2)}`)
    .join(' ')

  const area = `${line} L${xOf(points.length - 1).toFixed(2)},${(PAD.top + plotH).toFixed(2)} L${xOf(0).toFixed(2)},${(PAD.top + plotH).toFixed(2)} Z`

  const activePoint = active !== null ? points[active] : null

  return (
    <div className="relative px-5 pb-5">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        style={{ height }}
        role="img"
        aria-label="Daily fee collection trend"
        onMouseLeave={() => setActive(null)}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#00958F" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#00958F" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Recessive gridlines. */}
        {[0, 0.25, 0.5, 0.75, 1].map((t) => (
          <line
            key={t}
            x1={PAD.left}
            x2={W - PAD.right}
            y1={PAD.top + plotH * t}
            y2={PAD.top + plotH * t}
            stroke="rgb(var(--border-base))"
            strokeWidth={1}
          />
        ))}

        <path d={area} fill={`url(#${gradientId})`} />
        <path
          d={line}
          fill="none"
          stroke="#00958F"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Crosshair + marker for the hovered column. */}
        {active !== null && activePoint && (
          <>
            <line
              x1={xOf(active)}
              x2={xOf(active)}
              y1={PAD.top}
              y2={PAD.top + plotH}
              stroke="rgb(var(--border-strong))"
              strokeWidth={1}
              strokeDasharray="3 3"
            />
            <circle
              cx={xOf(active)}
              cy={yOf(activePoint.collectedPaise)}
              r={5}
              fill="#00958F"
              stroke="rgb(var(--surface-card))"
              strokeWidth={2}
            />
          </>
        )}

        {/* Invisible hit columns, wider than the marks. */}
        {points.map((p, i) => (
          <rect
            key={p.label}
            x={xOf(i) - stepX / 2}
            y={0}
            width={stepX}
            height={H}
            fill="transparent"
            onMouseEnter={() => setActive(i)}
          />
        ))}

        {/* Sparse x labels - first, middle, last - to avoid collisions. */}
        {[0, Math.floor((points.length - 1) / 2), points.length - 1].map((i) => (
          <text
            key={i}
            x={xOf(i)}
            y={H - 6}
            textAnchor={i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle'}
            className="fill-[rgb(var(--text-faint))] text-[11px]"
          >
            {points[i]?.label}
          </text>
        ))}
      </svg>

      {activePoint && active !== null && (
        <div
          className="pointer-events-none absolute -translate-x-1/2 -translate-y-full rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs text-white shadow-popover dark:bg-slate-700"
          style={{
            left: `calc(${((xOf(active) / W) * 100).toFixed(2)}% )`,
            top: `${(yOf(activePoint.collectedPaise) / H) * height - 4}px`,
          }}
        >
          <div className="font-medium">{activePoint.label}</div>
          <div className="numeric text-slate-300">
            {formatPaiseShort(activePoint.collectedPaise)}
          </div>
        </div>
      )}
    </div>
  )
}
