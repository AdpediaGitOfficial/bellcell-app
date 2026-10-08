import { describe, expect, it } from 'vitest'
import {
  aggregate,
  cohortStats,
  gradeFor,
  markError,
  subjectOutcome,
  type SubjectMark,
} from './core'

const mark = (over: Partial<SubjectMark>): SubjectMark => ({
  subjectId: 's',
  marks: null,
  maxMarks: 100,
  passMarks: 35,
  isAbsent: false,
  ...over,
})

describe('gradeFor', () => {
  it('maps percentages onto the scale at the band boundaries', () => {
    expect(gradeFor(100)).toBe('A+')
    expect(gradeFor(90)).toBe('A+')
    expect(gradeFor(89.99)).toBe('A')
    expect(gradeFor(60)).toBe('B')
    expect(gradeFor(40)).toBe('D')
    expect(gradeFor(39.99)).toBe('F')
    expect(gradeFor(0)).toBe('F')
  })
})

describe('subjectOutcome', () => {
  it('uses the subject master pass mark, not a fixed 35%', () => {
    // A practical paper may need 50 to pass out of 100.
    expect(subjectOutcome(mark({ marks: 45, passMarks: 50 }))).toBe('FAIL')
    expect(subjectOutcome(mark({ marks: 50, passMarks: 50 }))).toBe('PASS')
  })

  it('distinguishes absent from a zero score', () => {
    expect(subjectOutcome(mark({ marks: 0 }))).toBe('FAIL')
    expect(subjectOutcome(mark({ isAbsent: true }))).toBe('ABSENT')
  })

  it('reports a blank cell as pending, not as a fail', () => {
    expect(subjectOutcome(mark({ marks: null }))).toBe('PENDING')
  })
})

describe('aggregate', () => {
  it('totals marks and derives a grade when every subject is passed', () => {
    const r = aggregate([
      mark({ subjectId: 'a', marks: 80 }),
      mark({ subjectId: 'b', marks: 70 }),
    ])
    expect(r.totalMarks).toBe(150)
    expect(r.maxMarks).toBe(200)
    expect(r.percentage).toBe(75)
    expect(r.status).toBe('PASS')
    expect(r.grade).toBe('B+')
    expect(r.subjectsPassed).toBe(2)
  })

  it('fails the whole result if any single subject is failed', () => {
    // ASSUMPTION under test: no supplementary allowance.
    const r = aggregate([
      mark({ subjectId: 'a', marks: 95 }),
      mark({ subjectId: 'b', marks: 20 }),
    ])
    expect(r.status).toBe('FAIL')
    expect(r.grade).toBe('F')
    expect(r.subjectsFailed).toBe(1)
    // Marks still total, so the mark sheet shows what was scored.
    expect(r.totalMarks).toBe(115)
  })

  it('counts an absent subject toward the denominator but not the total', () => {
    const r = aggregate([
      mark({ subjectId: 'a', marks: 80 }),
      mark({ subjectId: 'b', isAbsent: true }),
    ])
    expect(r.totalMarks).toBe(80)
    expect(r.maxMarks).toBe(200)
    expect(r.percentage).toBe(40)
    expect(r.status).toBe('FAIL')
    expect(r.subjectsAbsent).toBe(1)
  })

  it('reports ABSENT, not FAIL, when the student sat nothing', () => {
    const r = aggregate([
      mark({ subjectId: 'a', isAbsent: true }),
      mark({ subjectId: 'b', isAbsent: true }),
    ])
    expect(r.status).toBe('ABSENT')
  })

  it('never reports a pass while a mark is still unentered', () => {
    const r = aggregate([
      mark({ subjectId: 'a', marks: 90 }),
      mark({ subjectId: 'b', marks: null }),
    ])
    expect(r.status).toBe('FAIL')
    expect(r.pending).toBe(1)
  })

  it('honours an explicit withhold over everything else', () => {
    const r = aggregate([mark({ subjectId: 'a', marks: 90 })], { withheld: true })
    expect(r.status).toBe('WITHHELD')
    expect(r.grade).toBe('F')
  })

  it('does not divide by zero when a schedule has no subjects', () => {
    const r = aggregate([])
    expect(r.percentage).toBe(0)
    expect(r.maxMarks).toBe(0)
  })

  it('rounds the percentage to two places', () => {
    const r = aggregate([mark({ subjectId: 'a', marks: 1, maxMarks: 3, passMarks: 1 })])
    expect(r.percentage).toBe(33.33)
  })
})

describe('markError', () => {
  it('accepts a blank cell and valid marks', () => {
    expect(markError(null, 100)).toBeNull()
    expect(markError(0, 100)).toBeNull()
    expect(markError(100, 100)).toBeNull()
    expect(markError(67.5, 100)).toBeNull()
  })

  it('rejects out-of-range and impossible values', () => {
    expect(markError(-1, 100)).toMatch(/negative/)
    expect(markError(101, 100)).toMatch(/maximum of 100/)
    expect(markError(67.3, 100)).toMatch(/whole or half/)
    expect(markError(Number.NaN, 100)).toMatch(/Not a number/)
  })
})

describe('cohortStats', () => {
  it('excludes withheld and absent from the pass rate', () => {
    // Otherwise a cohort with many withheld results looks like it failed.
    const stats = cohortStats([
      aggregate([mark({ marks: 80 })]),
      aggregate([mark({ marks: 80 })]),
      aggregate([mark({ marks: 10 })]),
      aggregate([mark({ marks: 80 })], { withheld: true }),
      aggregate([mark({ isAbsent: true })]),
    ])
    expect(stats.entered).toBe(5)
    expect(stats.passed).toBe(2)
    expect(stats.failed).toBe(1)
    expect(stats.withheld).toBe(1)
    expect(stats.absent).toBe(1)
    expect(stats.passRate).toBe(66.67) // 2 of the 3 who sat
  })

  it('reports a zero pass rate rather than NaN for an empty cohort', () => {
    const stats = cohortStats([])
    expect(stats.passRate).toBe(0)
    expect(stats.averagePercentage).toBe(0)
  })
})
