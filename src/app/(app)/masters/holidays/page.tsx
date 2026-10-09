import type { Metadata } from 'next'
import { Trash2 } from 'lucide-react'
import { db } from '@/lib/db'
import { requirePageUser } from '@/lib/auth/guard'
import { can } from '@/lib/rbac/can'
import type { SearchParams } from '@/lib/table/params'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { PageHeader } from '@/components/shell/PageHeader'
import { AddHolidayForm, WeeklyOffForm } from './HolidayForms'
import { deleteHolidayAction } from './actions'

export const metadata: Metadata = { title: 'Holidays' }

export default async function HolidaysPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const user = await requirePageUser('masters')
  const sp = await searchParams

  const thisYear = new Date().getFullYear()
  const yearRaw = typeof sp.year === 'string' ? Number.parseInt(sp.year, 10) : NaN
  const year = Number.isFinite(yearRaw) && yearRaw > 2000 && yearRaw < 2100 ? yearRaw : thisYear

  const holidays = await db.holiday.findMany({
    where: {
      date: {
        gte: new Date(Date.UTC(year, 0, 1)),
        lt: new Date(Date.UTC(year + 1, 0, 1)),
      },
    },
    orderBy: { date: 'asc' },
    include: { branch: { select: { name: true } } },
  })

  const declared = holidays.filter((h) => !h.isWeeklyOff)
  const weeklyOffs = holidays.filter((h) => h.isWeeklyOff)
  const canEdit = can(user, 'masters', 'create')
  const canDelete = can(user, 'masters', 'delete')

  return (
    <>
      <PageHeader
        eyebrow="Masters"
        title="Holidays"
        subtitle="Days the institute is closed. Attendance screens use them to say how many days should have been marked."
        action={
          <form method="get" className="flex items-center gap-2">
            <label htmlFor="year" className="text-sm text-muted">
              Year
            </label>
            <input
              id="year"
              name="year"
              type="number"
              min={2000}
              max={2100}
              defaultValue={year}
              className="h-9 w-24 rounded-lg border border-[rgb(var(--border-strong))] bg-[rgb(var(--surface-card))] px-3 text-sm text-strong"
            />
          </form>
        }
      />

      {canEdit && (
        <div className="mb-4 space-y-4">
          <AddHolidayForm branches={user.branches} />
          <WeeklyOffForm branches={user.branches} />
        </div>
      )}

      <Card className="overflow-hidden">
        <h2 className="border-b border-[rgb(var(--border-base))] px-5 py-3 text-sm font-semibold text-strong">
          Declared holidays in {year}
          <span className="numeric ml-2 text-xs font-normal text-muted">
            {declared.length}
          </span>
        </h2>
        {declared.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-muted">
            No holidays declared for {year}.
          </p>
        ) : (
          <ul className="divide-y divide-[rgb(var(--border-base))]">
            {declared.map((h) => (
              <li key={h.id} className="flex items-center gap-3 px-5 py-2.5">
                <span className="numeric w-28 shrink-0 text-sm text-muted">
                  {h.date.toLocaleDateString('en-IN', {
                    day: '2-digit',
                    month: 'short',
                    weekday: 'short',
                    timeZone: 'UTC',
                  })}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-strong">
                  {h.name}
                </span>
                <Badge tone={h.branch ? 'neutral' : 'brand'}>
                  {h.branch?.name ?? 'Every branch'}
                </Badge>
                {canDelete && (
                  <form action={deleteHolidayAction}>
                    <input type="hidden" name="id" value={h.id} />
                    <button
                      type="submit"
                      aria-label={`Remove ${h.name}`}
                      className="rounded-md p-1.5 text-faint hover:bg-critical-50 hover:text-critical-600 dark:hover:bg-critical-500/10"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden />
                    </button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="mt-4 p-5">
        <h2 className="text-sm font-semibold text-strong">
          Weekly offs in {year}
          <span className="numeric ml-2 text-xs font-normal text-muted">
            {weeklyOffs.length}
          </span>
        </h2>
        <p className="mt-1 text-xs text-muted">
          {weeklyOffs.length === 0
            ? 'None generated. Use the form above if the institute has a fixed weekly off.'
            : 'Listed separately so the declared-holiday list stays readable. Delete an individual date if the institute works that day.'}
        </p>
      </Card>
    </>
  )
}
