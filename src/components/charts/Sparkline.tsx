/**
 * Bare trend line for a stat tile. No axes, no tooltip - it conveys shape
 * only, and the tile's number carries the value. 2px stroke per mark specs.
 */
export function Sparkline({
  points,
  tone = '#00958F',
  width = 72,
  height = 28,
}: {
  points: number[]
  tone?: string
  width?: number
  height?: number
}) {
  if (points.length < 2) return null

  const min = Math.min(...points)
  const max = Math.max(...points)
  const span = max - min || 1
  const stepX = width / (points.length - 1)

  const d = points
    .map((p, i) => {
      const x = i * stepX
      const y = height - ((p - min) / span) * height
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`
    })
    .join(' ')

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      fill="none"
      aria-hidden
      className="overflow-visible"
    >
      <path
        d={d}
        stroke={tone}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
