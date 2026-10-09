import type { Resource } from '@/lib/rbac/resources'

export interface NavItem {
  label: string
  href: string
  resource: Resource
  /** Rendered by the sidebar via a name -> lucide icon lookup. */
  icon: string
}

export interface NavGroup {
  /** Null for ungrouped top-level items such as the dashboard. */
  title: string | null
  items: NavItem[]
}

/**
 * The sidebar.
 *
 * Two rules keep this from becoming a 55-item list (see docs/design-system.md):
 *   1. Masters and Reports get ONE entry each, leading to an index page.
 *   2. Maximum two levels, no flyouts - counselling staff work on tablets.
 *
 * Items are filtered by `canView` at render time, so a counsellor simply does
 * not see Accounts.
 */
export const NAV: NavGroup[] = [
  {
    title: null,
    items: [
      { label: 'Dashboard', href: '/dashboard', resource: 'dashboard', icon: 'LayoutDashboard' },
    ],
  },
  {
    title: 'Enquiry',
    items: [
      { label: 'Leads', href: '/enquiry/leads', resource: 'enquiry.lead', icon: 'Inbox' },
      { label: 'Enquiries', href: '/enquiry/enquiries', resource: 'enquiry.enquiry', icon: 'UserPlus' },
      { label: 'Call Schedule', href: '/enquiry/call-schedule', resource: 'enquiry.callSchedule', icon: 'PhoneCall' },
      { label: 'Counselling', href: '/enquiry/counselling', resource: 'enquiry.counselling', icon: 'MessagesSquare' },
    ],
  },
  {
    title: 'Admissions',
    items: [
      { label: 'Applications', href: '/admissions/applications', resource: 'admission.application', icon: 'FileText' },
      { label: 'Fee Collection', href: '/admissions/fees', resource: 'admission.fee', icon: 'IndianRupee' },
      { label: 'ID Cards', href: '/admissions/id-cards', resource: 'admission.idCard', icon: 'IdCard' },
      { label: 'Roll Numbers', href: '/admissions/roll-numbers', resource: 'admission.rollNumber', icon: 'Hash' },
      { label: 'Certificates', href: '/admissions/certificates', resource: 'admission.certificateCustody', icon: 'ShieldCheck' },
      { label: 'Study Materials', href: '/admissions/study-materials', resource: 'admission.studyMaterial', icon: 'BookOpen' },
      { label: 'Promotion & Transfer', href: '/admissions/promotions', resource: 'admission.promotion', icon: 'ArrowUpRight' },
    ],
  },
  {
    title: 'Examinations',
    items: [
      { label: 'Exam Schedule', href: '/exams/schedule', resource: 'exam.schedule', icon: 'CalendarDays' },
      { label: 'Results', href: '/exams/results', resource: 'exam.result', icon: 'ClipboardCheck' },
      { label: 'Certificates Issued', href: '/exams/certificates', resource: 'exam.certificate', icon: 'Award' },
    ],
  },
  {
    title: 'Accounts',
    items: [
      { label: 'Daily Transactions', href: '/accounts/transactions', resource: 'accounts.dailyTransaction', icon: 'ArrowLeftRight' },
      { label: 'Affiliation Payments', href: '/accounts/affiliation', resource: 'accounts.affiliationPayment', icon: 'Landmark' },
      { label: 'Day Book', href: '/accounts/day-book', resource: 'accounts.dayBook', icon: 'BookMarked' },
    ],
  },
  {
    title: 'People',
    items: [
      { label: 'Employees', href: '/people/employees', resource: 'people.employee', icon: 'Users' },
      { label: 'Payroll', href: '/people/payroll', resource: 'people.payroll', icon: 'Wallet' },
    ],
  },
  {
    title: null,
    items: [
      { label: 'Reports', href: '/reports', resource: 'reports', icon: 'BarChart3' },
      { label: 'Masters', href: '/masters', resource: 'masters', icon: 'Database' },
      { label: 'Settings', href: '/settings', resource: 'settings.user', icon: 'Settings' },
    ],
  },
]
