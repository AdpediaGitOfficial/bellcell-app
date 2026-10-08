/**
 * Examination logic — pure, so the rules can be tested exhaustively.
 *
 * ⚠ EVERYTHING HERE IS AN ASSUMPTION.
 *
 * The quotation says only "this module is to publish the result of exams
 * conducted". It defines no grade scale, no pass rule, no aggregation and no
 * handling for absence or withheld results. The rules below are a defensible
 * default for an Indian affiliated institute, isolated in this one file so
 * the institute can change them in one place.
 *
 * Confirm each against Bell Cell's actual regulations before go-live —
 * docs/open-questions.md #10. Getting them wrong means re-entering marks.
 */

export interface GradeBand {
  grade: string
  minPercentage: number
  description: string
}

/**
 * ASSUMPTION: a seven-band scale on the overall percentage.
 * Bands are checked high to low, so order matters.
 */
export const GRADE_SCALE: GradeBand[] = [
  { grade: 'A+', minPercentage: 90, description: 'Outstanding' },
  { grade: 'A', minPercentage: 80, description: 'Excellent' },
  { grade: 'B+', minPercentage: 70, description: 'Very good' },
  { grade: 'B', minPercentage: 60, description: 'Good' },
  { grade: 'C', minPercentage: 50, description: 'Satisfactory' },
  { grade: 'D', minPercentage: 40, description: 'Pass' },
  { grade: 'F', minPercentage: 0, description: 'Fail' },
]

export function gradeFor(percentage: number): string {
  const band = GRADE_SCALE.find((b) => percentage >= b.minPercentage)
  return band?.grade ?? 'F'
}

export interface SubjectMark {
  subjectId: string
  /** Null means not yet entered; absent is a separate flag. */
  marks: number | null
  maxMarks: number
  /** From the Subject master. */
  passMarks: number
  isAbsent: boolean
}

export type SubjectOutcome = 'PASS' | 'FAIL' | 'ABSENT' | 'PENDING'

/**
 * ASSUMPTION: a subject is passed on its own pass mark from the Subject
 * master. An absent subject is a fail for aggregation but is reported
 * distinctly, because "absent" and "scored zero" are different facts.
 */
export function subjectOutcome(m: SubjectMark): SubjectOutcome {
  if (m.isAbsent) return 'ABSENT'
  if (m.marks === null) return 'PENDING'
  return m.marks >= m.passMarks ? 'PASS' : 'FAIL'
}

export type OverallStatus = 'PASS' | 'FAIL' | 'WITHHELD' | 'ABSENT'

export interface ResultTotals {
  totalMarks: number
  maxMarks: number
  percentage: number
  grade: string
  status: OverallStatus
  subjectsPassed: number
  subjectsFailed: number
  subjectsAbsent: number
  pending: number
}

/**
 * Aggregate a student's subject marks into a result.
 *
 * ASSUMPTIONS:
 *   * The overall result is a straight total of marks, not credit-weighted.
 *     Credits exist in no master today; if the university weights by credit,
 *     this changes.
 *   * A student must pass EVERY subject to pass overall. Many universities
 *     allow a supplementary attempt in one or two papers instead — that is a
 *     regulation question, not a software one.
 *   * Absent in every subject reports ABSENT rather than FAIL, so a student
 *     who never sat the exam is not recorded as having failed it.
 *   * A result with any mark still unentered is never reported as passed.
 */
export function aggregate(
  marks: SubjectMark[],
  options: { withheld?: boolean } = {},
): ResultTotals {
  let total = 0
  let max = 0
  let passed = 0
  let failed = 0
  let absent = 0
  let pending = 0

  for (const m of marks) {
    max += m.maxMarks
    const outcome = subjectOutcome(m)
    if (outcome === 'PASS') {
      passed += 1
      total += m.marks ?? 0
    } else if (outcome === 'FAIL') {
      failed += 1
      total += m.marks ?? 0
    } else if (outcome === 'ABSENT') {
      absent += 1
    } else {
      pending += 1
    }
  }

  const percentage = max > 0 ? Math.round((total / max) * 10000) / 100 : 0

  let status: OverallStatus
  if (options.withheld) {
    status = 'WITHHELD'
  } else if (marks.length > 0 && absent === marks.length) {
    status = 'ABSENT'
  } else if (pending > 0) {
    // Not yet complete: never report a pass on partial data.
    status = 'FAIL'
  } else {
    status = failed === 0 && absent === 0 ? 'PASS' : 'FAIL'
  }

  return {
    totalMarks: total,
    maxMarks: max,
    percentage,
    grade: status === 'PASS' ? gradeFor(percentage) : 'F',
    status,
    subjectsPassed: passed,
    subjectsFailed: failed,
    subjectsAbsent: absent,
    pending,
  }
}

/** Validation for a single mark entry, surfaced per cell on the grid. */
export function markError(
  value: number | null,
  maxMarks: number,
): string | null {
  if (value === null) return null
  if (!Number.isFinite(value)) return 'Not a number'
  if (value < 0) return 'Cannot be negative'
  if (value > maxMarks) return `Above the maximum of ${maxMarks}`
  if (!Number.isInteger(value * 2)) return 'Use whole or half marks'
  return null
}

/** Cohort statistics for the results screen header. */
export function cohortStats(results: ResultTotals[]): {
  entered: number
  passed: number
  failed: number
  withheld: number
  absent: number
  passRate: number
  averagePercentage: number
} {
  const entered = results.length
  const passed = results.filter((r) => r.status === 'PASS').length
  const failed = results.filter((r) => r.status === 'FAIL').length
  const withheld = results.filter((r) => r.status === 'WITHHELD').length
  const absent = results.filter((r) => r.status === 'ABSENT').length

  // Pass rate excludes withheld and absent: neither is a sat-and-failed
  // result, and counting them drags the figure down misleadingly.
  const sat = passed + failed
  const average =
    entered > 0
      ? Math.round(
          (results.reduce((s, r) => s + r.percentage, 0) / entered) * 100,
        ) / 100
      : 0

  return {
    entered,
    passed,
    failed,
    withheld,
    absent,
    passRate: sat > 0 ? Math.round((passed / sat) * 10000) / 100 : 0,
    averagePercentage: average,
  }
}
