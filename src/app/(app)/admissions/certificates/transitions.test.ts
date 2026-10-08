import { describe, expect, it } from 'vitest'
import { ALLOWED_TRANSITIONS, CUSTODY_LABELS, IN_OUR_HANDS } from './queries'
import { IDCARD_LABELS, IDCARD_NEXT } from '../id-cards/queries'

/**
 * The transition maps are the server-side guard, not a UI convenience: the
 * actions consult them before writing, so hiding a menu item is never the
 * only thing stopping an illegal move.
 */
describe('certificate custody transitions', () => {
  it('covers every status', () => {
    for (const status of Object.keys(CUSTODY_LABELS)) {
      expect(ALLOWED_TRANSITIONS).toHaveProperty(status)
    }
  })

  it('never lets a document go straight from the university to the student', () => {
    // It must come back to the institute first — otherwise the record claims
    // the student has a document that is still in the post.
    expect(ALLOWED_TRANSITIONS.SENT_FOR_VERIFICATION).not.toContain('RETURNED_TO_STUDENT')
    expect(ALLOWED_TRANSITIONS.SENT_FOR_VERIFICATION).toContain('RETURNED_FROM_AFFILIATION')
  })

  it('treats handed-back and lost as terminal', () => {
    expect(ALLOWED_TRANSITIONS.RETURNED_TO_STUDENT).toEqual([])
    expect(ALLOWED_TRANSITIONS.LOST).toEqual([])
  })

  it('allows LOST from every state where we are responsible for the document', () => {
    for (const status of IN_OUR_HANDS) {
      expect(ALLOWED_TRANSITIONS[status]).toContain('LOST')
    }
  })

  it('never allows a no-op transition back to the same status', () => {
    for (const [from, tos] of Object.entries(ALLOWED_TRANSITIONS)) {
      expect(tos).not.toContain(from)
    }
  })
})

describe('ID card transitions', () => {
  it('covers every status and ends at collected', () => {
    for (const status of Object.keys(IDCARD_LABELS)) {
      expect(IDCARD_NEXT).toHaveProperty(status)
    }
    expect(IDCARD_NEXT.COLLECTED).toEqual([])
  })

  it('cannot inform a student before the card has arrived', () => {
    expect(IDCARD_NEXT.REQUESTED).not.toContain('STUDENT_NOTIFIED')
    expect(IDCARD_NEXT.SENT_TO_AFFILIATION).not.toContain('STUDENT_NOTIFIED')
    expect(IDCARD_NEXT.RECEIVED).toContain('STUDENT_NOTIFIED')
  })

  it('allows collection straight from received, since students often just turn up', () => {
    expect(IDCARD_NEXT.RECEIVED).toContain('COLLECTED')
  })

  it('never allows a no-op transition', () => {
    for (const [from, tos] of Object.entries(IDCARD_NEXT)) {
      expect(tos).not.toContain(from)
    }
  })
})
