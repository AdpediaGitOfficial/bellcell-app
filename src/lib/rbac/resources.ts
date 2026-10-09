/**
 * Every screen in the system, as a permission resource.
 *
 * The vendor scope named three roles ("super admin, admin, staff etc.") and
 * stopped there. Without an explicit matrix, "who can waive a fee?" becomes a
 * weekly argument. This file is that matrix's vocabulary; matrix.ts is the
 * matrix. Both are in version control so changes are reviewable.
 */

export const ACTIONS = [
  'view',
  'create',
  'update',
  'delete',
  'export',
  'approve',
] as const

export type Action = (typeof ACTIONS)[number]

export const RESOURCES = {
  dashboard: 'Dashboard',

  'enquiry.lead': 'Enquiry · Leads',
  'enquiry.enquiry': 'Enquiry · Enquiries',
  'enquiry.callSchedule': 'Enquiry · Call Schedule',
  'enquiry.counselling': 'Enquiry · Counselling',

  'admission.application': 'Admissions · Applications',
  'admission.fee': 'Admissions · Fee Collection',
  'admission.concession': 'Admissions · Fee Concessions',
  'admission.refund': 'Admissions · Fee Refunds',
  'admission.idCard': 'Admissions · ID Cards',
  'admission.rollNumber': 'Admissions · Roll Numbers',
  'admission.certificateCustody': 'Admissions · Certificate Custody',
  'admission.studyMaterial': 'Admissions · Study Materials',
  'admission.promotion': 'Admissions · Promotion & Transfer',

  'exam.schedule': 'Examinations · Schedule',
  'exam.result': 'Examinations · Results',
  'exam.certificate': 'Examinations · TC & Completion Certificates',

  'accounts.dailyTransaction': 'Accounts · Daily Transactions',
  'accounts.affiliationPayment': 'Accounts · Affiliation Payments',
  'accounts.dayBook': 'Accounts · Day Book',

  'people.employee': 'People · Employees',
  'people.payroll': 'People · Payroll',

  reports: 'Reports',
  masters: 'Masters',

  'settings.user': 'Settings · Users & Roles',
  'settings.branch': 'Settings · Branches',
  'settings.audit': 'Settings · Audit Log',
} as const

export type Resource = keyof typeof RESOURCES

export type Permission = `${Resource}:${Action}`

export function permission(resource: Resource, action: Action): Permission {
  return `${resource}:${action}`
}
