import type { Metadata } from 'next'
import Link from 'next/link'
import { BookOpen, Undo2 } from 'lucide-react'
import { db } from '@/lib/db'
import { requirePageUser } from '@/lib/auth/guard'
import { can } from '@/lib/rbac/can'
import { branchScope } from '@/lib/branch'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageHeader } from '@/components/shell/PageHeader'
import { returnMaterialAction } from './actions'
import { AddMaterial, IssueMaterial } from './MaterialControls'

export const metadata: Metadata = { title: 'Study Materials' }

export default async function StudyMaterialsPage() {
  const user = await requirePageUser('admission.studyMaterial')
  const scope = branchScope(user)

  const [materials, issues, students, courses] = await Promise.all([
    db.studyMaterial.findMany({
      where: { archivedAt: null },
      orderBy: { title: 'asc' },
      include: { course: { select: { name: true } } },
    }),
    db.studyMaterialIssue.findMany({
      where: { student: { ...scope, archivedAt: null } },
      orderBy: [{ returnedAt: 'asc' }, { issuedAt: 'desc' }],
      take: 100,
      include: {
        material: { select: { title: true } },
        student: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            applicationNo: true,
            admissionNo: true,
          },
        },
      },
    }),
    db.student.findMany({
      where: { ...scope, archivedAt: null, status: { in: ['ADMITTED', 'ACTIVE', 'PROMOTED'] } },
      orderBy: [{ firstName: 'asc' }],
      take: 500,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        applicationNo: true,
        admissionNo: true,
      },
    }),
    db.course.findMany({
      where: { archivedAt: null },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    }),
  ])

  const mayIssue = can(user, 'admission.studyMaterial', 'create')
  const mayReturn = can(user, 'admission.studyMaterial', 'update')
  const outstanding = issues.filter((i) => !i.returnedAt)

  return (
    <>
      <PageHeader
        title="Study Materials"
        subtitle="What has been issued to whom, and what is still on the shelf."
        action={
          mayIssue ? (
            <div className="flex gap-2">
              <AddMaterial courses={courses} />
              <IssueMaterial
                materials={materials.map((m) => ({
                  id: m.id,
                  label: m.title,
                  available: m.stockTotal === 0 ? 9999 : m.stockTotal - m.stockIssued,
                }))}
                students={students.map((s) => ({
                  id: s.id,
                  label: `${s.firstName} ${s.lastName ?? ''}`.trim() + ` · ${s.admissionNo ?? s.applicationNo}`,
                }))}
              />
            </div>
          ) : null
        }
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-[rgb(var(--border-base))] px-5 py-3">
            <h2 className="text-sm font-semibold text-strong">Issued</h2>
            <span className="text-xs text-muted">
              {outstanding.length} not yet returned
            </span>
          </div>

          {issues.length === 0 ? (
            <div className="px-5 py-12">
              <EmptyState
                icon={<BookOpen className="h-5 w-5" aria-hidden />}
                title="Nothing issued yet"
                description="Issue a book, kit or syllabus to a student to start tracking it."
              />
            </div>
          ) : (
            <ul className="divide-y divide-[rgb(var(--border-base))]">
              {issues.map((i) => (
                <li key={i.id} className="flex items-center gap-3 px-5 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-strong">
                      {i.material.title}
                      {i.quantity > 1 && (
                        <span className="numeric ml-1.5 text-xs text-muted">×{i.quantity}</span>
                      )}
                    </p>
                    <p className="truncate text-xs text-muted">
                      <Link
                        href={`/admissions/applications/${i.student.id}`}
                        className="hover:text-brand-700 hover:underline dark:hover:text-brand-400"
                      >
                        {i.student.firstName} {i.student.lastName ?? ''}
                      </Link>
                      {' · '}
                      {i.issuedAt.toLocaleDateString('en-IN', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </p>
                  </div>

                  {i.returnedAt ? (
                    <Badge tone="positive">Returned</Badge>
                  ) : (
                    <>
                      <Badge tone="caution">With student</Badge>
                      {mayReturn && (
                        <form action={returnMaterialAction}>
                          <input type="hidden" name="issueId" value={i.id} />
                          <button
                            type="submit"
                            aria-label="Mark returned"
                            title="Mark returned"
                            className="rounded-md p-1.5 text-faint hover:bg-[rgb(var(--surface-hover))] hover:text-strong"
                          >
                            <Undo2 className="h-4 w-4" aria-hidden />
                          </button>
                        </form>
                      )}
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="h-fit overflow-hidden">
          <h2 className="border-b border-[rgb(var(--border-base))] px-5 py-3 text-sm font-semibold text-strong">
            Stock
          </h2>
          {materials.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-muted">
              No materials defined yet.
            </p>
          ) : (
            <ul className="divide-y divide-[rgb(var(--border-base))]">
              {materials.map((m) => {
                const tracked = m.stockTotal > 0
                const available = m.stockTotal - m.stockIssued
                return (
                  <li key={m.id} className="flex items-center gap-3 px-5 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-strong">{m.title}</p>
                      <p className="truncate text-xs text-muted">
                        {m.code}
                        {m.course ? ` · ${m.course.name}` : ''}
                      </p>
                    </div>
                    {tracked ? (
                      <span
                        className={
                          'numeric shrink-0 text-sm font-medium ' +
                          (available <= 0
                            ? 'text-critical-600 dark:text-critical-500'
                            : available <= 3
                              ? 'text-caution-600 dark:text-caution-500'
                              : 'text-strong')
                        }
                      >
                        {available} / {m.stockTotal}
                      </span>
                    ) : (
                      <span className="shrink-0 text-xs text-faint">Not tracked</span>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </Card>
      </div>
    </>
  )
}
