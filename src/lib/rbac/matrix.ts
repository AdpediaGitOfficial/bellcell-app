import type { UserRole } from '@prisma/client'
import { ACTIONS, type Action, type Resource } from './resources'

/**
 * THE PERMISSION MATRIX.
 *
 * Read it as: role -> resource -> allowed actions.
 * `ALL` is shorthand for every action. An omitted resource means NO access.
 *
 * Deliberate choices worth defending in a review:
 *   * Only ADMIN and SUPER_ADMIN may `approve` a fee concession, and nobody
 *     may approve one they created (enforced in the action, not here).
 *   * ACCOUNTANT cannot edit student academic records, and COUNSELLOR cannot
 *     touch money. Separation of duties is the whole point.
 *   * Nobody except SUPER_ADMIN can `delete` a payment - payments are
 *     cancelled (status change, audit-logged), never deleted.
 *   * `export` is a distinct action because exporting the full student list
 *     is a data-protection event, not just a read.
 */

const ALL = [...ACTIONS] as Action[]
const VIEW: Action[] = ['view']
const VIEW_EXPORT: Action[] = ['view', 'export']
const CRU: Action[] = ['view', 'create', 'update']
const CRU_EXPORT: Action[] = ['view', 'create', 'update', 'export']

type RoleMatrix = Partial<Record<Resource, Action[]>>

export const MATRIX: Record<UserRole, RoleMatrix> = {
  // SUPER_ADMIN is deliberately empty: `can()` short-circuits to true for it
  // before consulting this table. Keeping the entry empty means a new
  // resource is never accidentally withheld from the owner of the system.
  SUPER_ADMIN: {},

  ADMIN: {
    dashboard: VIEW,
    'enquiry.lead': ALL,
    'enquiry.enquiry': ALL,
    'enquiry.callSchedule': VIEW_EXPORT,
    'enquiry.counselling': CRU_EXPORT,
    'admission.application': ALL,
    'admission.fee': CRU_EXPORT,
    'admission.concession': ALL,
    'admission.refund': ALL,
    'admission.idCard': CRU_EXPORT,
    'admission.rollNumber': CRU_EXPORT,
    'admission.certificateCustody': CRU_EXPORT,
    'admission.studyMaterial': CRU_EXPORT,
    'admission.promotion': CRU_EXPORT,
    'academics.attendance': ALL,
    'exam.schedule': ALL,
    'exam.result': ALL,
    'exam.certificate': ALL,
    'accounts.dailyTransaction': CRU_EXPORT,
    'accounts.affiliationPayment': CRU_EXPORT,
    'accounts.dayBook': VIEW_EXPORT,
    'people.employee': ALL,
    'people.payroll': ALL, // including approve — see the ACCOUNTANT row
    'people.staffAttendance': ALL,
    'people.leave': ALL, // including approve
    reports: VIEW_EXPORT,
    masters: ALL,
    'settings.user': ALL,
    'settings.branch': CRU,
    'settings.audit': VIEW_EXPORT,
  },

  ACCOUNTANT: {
    dashboard: VIEW,
    'admission.application': VIEW,
    'admission.fee': CRU_EXPORT,
    'admission.concession': CRU, // may propose, not approve
    'admission.refund': CRU,
    'accounts.dailyTransaction': CRU_EXPORT,
    'accounts.affiliationPayment': CRU_EXPORT,
    'accounts.dayBook': VIEW_EXPORT,
    // Prepares payroll but cannot approve or pay it. The person who works
    // out what everyone is owed should not also be the person who releases
    // it — the same separation as fee concessions above.
    'people.payroll': CRU_EXPORT,
    // Reads the register payroll is computed from, but does not mark it.
    // Whoever runs payroll should not also be able to quietly change the
    // attendance it reads — nor the leave that writes it.
    'people.staffAttendance': VIEW_EXPORT,
    'people.leave': VIEW_EXPORT,
    reports: VIEW_EXPORT,
    masters: VIEW,
  },

  COUNSELLOR: {
    dashboard: VIEW,
    'enquiry.lead': CRU_EXPORT,
    'enquiry.enquiry': CRU_EXPORT,
    'enquiry.callSchedule': VIEW,
    'enquiry.counselling': CRU,
    'admission.application': CRU, // can start an application from an enquiry
    'admission.fee': VIEW, // can see dues, cannot collect
    reports: VIEW,
    masters: VIEW,
  },

  FACULTY: {
    dashboard: VIEW,
    'admission.application': VIEW,
    'admission.studyMaterial': CRU,
    // Faculty take the register — they are the people in the room. They may
    // correct a sheet they got wrong, but not delete one.
    'academics.attendance': CRU_EXPORT,
    'exam.schedule': VIEW,
    'exam.result': CRU,
    reports: VIEW,
    masters: VIEW,
  },

  STAFF: {
    dashboard: VIEW,
    'enquiry.lead': CRU,
    'enquiry.enquiry': VIEW,
    'enquiry.callSchedule': VIEW,
    'admission.application': VIEW,
    'admission.idCard': CRU,
    'admission.certificateCustody': VIEW,
    'admission.studyMaterial': CRU,
    // The front desk marks the staff register and can take a class roll
    // call when a lecturer is away, but sees no salary consequence of it.
    'academics.attendance': CRU_EXPORT,
    'people.staffAttendance': CRU_EXPORT,
    // Records leave requests on behalf of staff, but someone senior decides
    // them. There is no self-service portal (open question #13).
    'people.leave': CRU_EXPORT,
    reports: VIEW,
    masters: VIEW,
  },
}
