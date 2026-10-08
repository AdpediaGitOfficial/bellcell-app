'use client'

import { useState } from 'react'
import { cn } from '@/lib/cn'

export interface FunnelStage {
  label: string
  value: number
}

/**
 * Enquiry funnel - the single most valuable chart Bell Cell can have, and
 * entirely absent from the supplied reference.
 *
 * Stages are ORDERED, so this uses the single-hue sequential teal ramp, not
 * categorical hues. Each bar is direct-labelled with its count and its
 * conversion rate from the previous stage, so identity and value are never
 * carried by colour alone.
 */
export function FunnelChart({ stages }: { stages: FunnelStage[] }) {
  const [hover, setHover] = useState<number | null>(null)

  const top = stages[0]?.value ?? 0
  if (!top) {
    return (
      <p className="px-5 pb-5 text-sm text-muted">
        No enquiries in this period yet.
      </p>
    )
  }

  // Sequential ramp, darkening down the funnel.
  const ramp = ['#99dbd8', '#66c9c5', '#33b7b2', '#00a59f', '#00857f', '#007c77']

  return (
    <div className="space-y-2 px-5 pb-5">
      {stages.map((stage, i) => {
        const pctOfTop = (stage.value / top) * 100
        const prev = i > 0 ? stages[i - 1]?.value ?? 0 : null
        const stepPct =
          prev && prev > 0 ? (stage.value / prev) * 100 : null
        const fill = ramp[Math.min(i, ramp.length - 1)]

        return (
          <div
            key={stage.label}
            className="group"
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
          >
            <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
              <span className="font-medium text-strong">{stage.label}</span>
              <span className="numeric text-muted">
                {stage.value.toLocaleString('en-IN')}
                {stepPct !== null && (
                  <span className="ml-1.5 text-faint">
                    {stepPct.toFixed(0)}% of previous
                  </span>
                )}
              </span>
            </div>

            <div className="h-7 w-full overflow-hidden rounded-md bg-[rgb(var(--surface-sunken))]">
              <div
                className={cn(
                  'h-full rounded-md transition-[width,opacity] duration-300',
                  hover !== null && hover !== i && 'opacity-55',
                )}
                style={{
                  width: `${Math.max(pctOfTop, 1.5)}%`,
                  backgroundColor: fill,
                }}
                role="img"
                aria-label={`${stage.label}: ${stage.value} enquiries, ${pctOfTop.toFixed(0)}% of total`}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}
