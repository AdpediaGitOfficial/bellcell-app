import type { Metadata } from 'next'
import Link from 'next/link'
import { Hash } from 'lucide-react'
import { requirePageUser } from '@/lib/auth/guard'
import { can } from '@/lib/rbac/can'
import { needsBranchChoice } from '@/lib/branch'
import type { SearchParams } from '@/lib/table/params'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageHeader } from '@/components/shell/PageHeader'
import {
  AddSection,
  AllocateNumbers,
  ReallocateButton,
  ReleaseButton,
  ScopePicker,
} from './RollControls'
import {
  parseRollScope,
  releasedNumbers,
  rollFilterOptions,
  sectionsFor,
  unallocatedStudents,
} from './queries'

export const metadata: Metadata = { title: 'Roll Numbers' }

/**
 * "Generate Roll No" in the vendor scope: allocate students to divisions of
 * a class, set numbers per course and year, and drop/reallocate.
 */
export default async function RollNumbersPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const user = await requirePageUser('admission.rollNumber')
  const sp = await searchParams
  const scope = parseRollScope(sp)

  const [options, sections, unallocated, released] = await Promise.all([
    rollFilterOptions(),
    sectionsFor(user, scope),
    unallocatedStudents(user, scope),
    releasedNumbers(user, scope),
  ])

  const mayCreate = can(user, 'admission.rollNumber', 'create')
  const mayUpdate = can(user, 'admission.rollNumber', 'update')
  const chosen = Boolean(scope.courseId && scope.batchId)

  const nextFor = (sectionId: string) => {
    const section = sections.find((s) => s.id === sectionId)
    const highest = section?.rollNumbers.reduce((m, r) => Math.max(m, r.rollNo), 0) ?? 0
    return highest + 1
  }

  const studentOptions = unallocated.map((s) => ({
    id: s.id,
    label: `${s.firstName} ${s.lastName ?? ''}`.trim(),
    meta: s.admissionNo ?? s.applicationNo,
  }))

  return (
    <>
      <PageHeader
        title="Roll Numbers"
        subtitle="Allocate students to divisions of a class, and reallocate numbers freed by a drop."
      />

      <Card className="mb-4 overflow-hidden">
        <ScopePicker
          courses={options.courses}
          batches={options.batches}
          courseId={scope.courseId}
          batchId={scope.batchId}
          courseYear={scope.courseYear}
        />

        {chosen && (
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
            <p className="text-sm text-muted">
              {sections.length} section{sections.length === 1 ? '' : 's'} ·{' '}
              {sections.reduce((n, s) => n + s.rollNumbers.length, 0)} allocated ·{' '}
              <span className={unallocated.length > 0 ? 'text-caution-600 dark:text-caution-500' : ''}>
                {unallocated.length} waiting
              </span>
            </p>
            <div className="flex flex-wrap gap-2">
              {mayCreate && (
                <AddSection
                  courseId={scope.courseId!}
                  batchId={scope.batchId!}
                  courseYear={scope.courseYear}
                  branches={needsBranchChoice(user) ? user.branches : undefined}
                />
              )}
              {mayCreate && (
                <AllocateNumbers
                  sections={sections.map((s) => ({
                    id: s.id,
                    name: s.name,
                    nextNumber: nextFor(s.id),
                  }))}
                  students={studentOptions}
                />
              )}
            </div>
          </div>
        )}
      </Card>

      {!chosen ? (
        <Card className="px-5 py-16">
          <EmptyState
            icon={<Hash className="h-5 w-5" aria-hidden />}
            title="Choose a course and batch"
            description="Roll numbers are allocated within one course, batch and year at a time."
          />
        </Card>
      ) : sections.length === 0 ? (
        <Card className="px-5 py-16">
          <EmptyState
            icon={<Hash className="h-5 w-5" aria-hidden />}
            title="No sections defined"
            description="Create at least one section (A, B, …) before allocating roll numbers."
          />
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {sections.map((section) => (
            <Card key={section.id} className="overflow-hidden">
              <div className="flex items-center justify-between border-b border-[rgb(var(--border-base))] px-5 py-3">
                <h2 className="text-sm font-semibold text-strong">
                  Section {section.name}
                </h2>
                <span className="numeric text-xs text-muted">
                  {section.rollNumbers.length}
                  {section.capacity ? ` / ${section.capacity}` : ''} students
                </span>
              </div>

              {section.rollNumbers.length === 0 ? (
                <p className="px-5 py-8 text-center text-sm text-muted">
                  No one allocated to this section yet.
                </p>
              ) : (
                <ul className="divide-y divide-[rgb(var(--border-base))]">
                  {section.rollNumbers.map((r) => (
                    <li key={r.id} className="flex items-center gap-3 px-5 py-2.5">
                      <span className="numeric w-10 shrink-0 text-sm font-semibold text-brand-700 dark:text-brand-400">
                        {r.rollNo}
                      </span>
                      <Link
                        href={`/admissions/applications/${r.student.id}`}
                        className="min-w-0 flex-1 truncate text-sm text-strong hover:text-brand-700 hover:underline dark:hover:text-brand-400"
                      >
                        {r.student.firstName} {r.student.lastName ?? ''}
                      </Link>
                      <span className="numeric hidden shrink-0 text-xs text-muted sm:block">
                        {r.student.admissionNo ?? r.student.applicationNo}
                      </span>
                      {mayUpdate && (
                        <ReleaseButton
                          rollNumberId={r.id}
                          rollNo={r.rollNo}
                          studentName={`${r.student.firstName} ${r.student.lastName ?? ''}`.trim()}
                        />
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          ))}

          {released.length > 0 && (
            <Card className="overflow-hidden lg:col-span-2">
              <div className="border-b border-[rgb(var(--border-base))] px-5 py-3">
                <h2 className="text-sm font-semibold text-strong">Freed numbers</h2>
                <p className="mt-0.5 text-xs text-muted">
                  Released when a student was dropped. Available to reallocate.
                </p>
              </div>
              <ul className="divide-y divide-[rgb(var(--border-base))]">
                {released.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center gap-3 px-5 py-2.5">
                    <span className="numeric w-10 shrink-0 text-sm font-semibold text-muted">
                      {r.rollNo}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm text-muted">
                      Section {r.section.name} · previously{' '}
                      {r.student.firstName} {r.student.lastName ?? ''}
                    </span>
                    <Badge tone="neutral">Free</Badge>
                    {mayUpdate && (
                      <ReallocateButton
                        rollNumberId={r.id}
                        rollNo={r.rollNo}
                        sectionName={r.section.name}
                        students={studentOptions.map((s) => ({ id: s.id, label: `${s.label} · ${s.meta}` }))}
                      />
                    )}
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      )}
    </>
  )
}
