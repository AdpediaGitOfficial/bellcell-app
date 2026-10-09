'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/Button'
import { Field, Input, Select } from '@/components/ui/Field'

export interface PickerOptions {
  courses: { id: string; name: string; durationYears: number }[]
  batches: { id: string; name: string; isCurrent: boolean }[]
  sections: {
    id: string
    name: string
    courseId: string
    batchId: string
    courseYear: number
  }[]
  subjects: {
    id: string
    name: string
    code: string
    courseId: string | null
    courseYear: number | null
  }[]
}

/**
 * Picking the class is the whole first step, so it writes to the URL — a
 * lecturer can bookmark their own class and land straight on the register.
 */
export function ClassPicker({
  options,
  basePath,
  current,
  showSubject = true,
}: {
  options: PickerOptions
  basePath: string
  current: {
    courseId: string
    batchId: string
    courseYear: string
    sectionId: string
    subjectId: string
    period: string
    date: string
  }
  showSubject?: boolean
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [, startTransition] = useTransition()

  const [courseId, setCourseId] = useState(current.courseId)
  const [batchId, setBatchId] = useState(current.batchId)
  const [courseYear, setCourseYear] = useState(current.courseYear)

  const course = options.courses.find((c) => c.id === courseId)
  const years = Array.from({ length: course?.durationYears ?? 3 }, (_, i) => i + 1)

  const sections = options.sections.filter(
    (s) =>
      s.courseId === courseId &&
      s.batchId === batchId &&
      String(s.courseYear) === courseYear,
  )
  const subjects = options.subjects.filter(
    (s) =>
      (s.courseId === null || s.courseId === courseId) &&
      (s.courseYear === null || String(s.courseYear) === courseYear),
  )

  const submit = (form: HTMLFormElement) => {
    const data = new FormData(form)
    const sp = new URLSearchParams(searchParams.toString())
    for (const key of ['courseId', 'batchId', 'courseYear', 'sectionId', 'subjectId', 'period', 'date']) {
      const value = String(data.get(key) ?? '')
      if (value) sp.set(key, value)
      else sp.delete(key)
    }
    startTransition(() => router.push(`${basePath}?${sp.toString()}`))
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        submit(e.currentTarget)
      }}
      className="rounded-card surface-card p-5 shadow-card"
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Course" htmlFor="courseId" required>
          <Select
            id="courseId"
            name="courseId"
            value={courseId}
            onChange={(e) => setCourseId(e.target.value)}
            required
          >
            <option value="">Select…</option>
            {options.courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Batch" htmlFor="batchId" required>
          <Select
            id="batchId"
            name="batchId"
            value={batchId}
            onChange={(e) => setBatchId(e.target.value)}
            required
          >
            <option value="">Select…</option>
            {options.batches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
                {b.isCurrent ? ' (current)' : ''}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Year" htmlFor="courseYear" required>
          <Select
            id="courseYear"
            name="courseYear"
            value={courseYear}
            onChange={(e) => setCourseYear(e.target.value)}
            required
          >
            {years.map((y) => (
              <option key={y} value={y}>
                Year {y}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label="Section"
          htmlFor="sectionId"
          hint={sections.length === 0 ? 'No sections defined — the whole year is marked.' : undefined}
        >
          <Select id="sectionId" name="sectionId" defaultValue={current.sectionId}>
            <option value="">Whole year</option>
            {sections.map((s) => (
              <option key={s.id} value={s.id}>
                Section {s.name}
              </option>
            ))}
          </Select>
        </Field>

        {showSubject && (
          <>
            <Field
              label="Subject"
              htmlFor="subjectId"
              hint="Leave blank for a single daily roll call."
            >
              <Select id="subjectId" name="subjectId" defaultValue={current.subjectId}>
                <option value="">Daily roll call</option>
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Period" htmlFor="period" hint="Optional.">
              <Input
                id="period"
                name="period"
                type="number"
                min={1}
                max={12}
                defaultValue={current.period}
              />
            </Field>
          </>
        )}

        <Field label="Date" htmlFor="date" required>
          <Input id="date" name="date" type="date" defaultValue={current.date} required />
        </Field>

        <div className="flex items-end">
          <Button type="submit" className="w-full justify-center">
            Open register
          </Button>
        </div>
      </div>
    </form>
  )
}
