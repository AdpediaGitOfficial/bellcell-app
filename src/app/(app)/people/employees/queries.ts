import 'server-only'
import type { EmploymentStatus, Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { branchScope } from '@/lib/branch'
import type { CurrentUser } from '@/lib/auth/current-user'
import { skipTake, type TableParams } from '@/lib/table/params'

export const EMPLOYEE_SORTS = [
  'name',
  'employeeCode',
  'dateOfJoining',
  'createdAt',
] as const

export const EMPLOYEE_FILTER_KEYS = ['status', 'departmentId', 'access'] as const

export const EMPLOYMENT_LABELS: Record<EmploymentStatus, string> = {
  ACTIVE: 'Active',
  ON_LEAVE: 'On leave',
  RESIGNED: 'Resigned',
  TERMINATED: 'Terminated',
}

export function buildEmployeeWhere(
  user: CurrentUser,
  params: TableParams,
): Prisma.EmployeeWhereInput {
  const where: Prisma.EmployeeWhereInput = {
    ...branchScope(user),
    archivedAt: null,
  }

  if (params.q) {
    where.OR = [
      { firstName: { contains: params.q, mode: 'insensitive' } },
      { lastName: { contains: params.q, mode: 'insensitive' } },
      { employeeCode: { contains: params.q, mode: 'insensitive' } },
      { designation: { contains: params.q, mode: 'insensitive' } },
      { phone: { contains: params.q } },
      { email: { contains: params.q, mode: 'insensitive' } },
    ]
  }

  const f = params.filters
  if (f.status) where.status = f.status as EmploymentStatus
  if (f.departmentId) where.departmentId = f.departmentId
  // Whether the employee has a login, derived from the relation rather than
  // a stored flag so it cannot drift.
  if (f.access === 'yes') where.user = { isNot: null }
  if (f.access === 'no') where.user = { is: null }

  return where
}

function orderBy(params: TableParams): Prisma.EmployeeOrderByWithRelationInput[] {
  const dir = params.dir
  switch (params.sort) {
    case 'name':
      return [{ firstName: dir }, { lastName: dir }]
    case 'employeeCode':
      return [{ employeeCode: dir }]
    case 'dateOfJoining':
      return [{ dateOfJoining: { sort: dir, nulls: 'last' } }]
    default:
      return [{ createdAt: dir }]
  }
}

export const employeeSelect = {
  id: true,
  employeeCode: true,
  firstName: true,
  lastName: true,
  designation: true,
  phone: true,
  email: true,
  status: true,
  dateOfJoining: true,
  createdAt: true,
  department: { select: { id: true, name: true } },
  branch: { select: { id: true, name: true } },
  user: { select: { id: true, email: true, role: true, isActive: true, lastLoginAt: true } },
} satisfies Prisma.EmployeeSelect

export type EmployeeRow = Prisma.EmployeeGetPayload<{ select: typeof employeeSelect }>

export async function listEmployees(
  user: CurrentUser,
  params: TableParams,
): Promise<{ rows: EmployeeRow[]; total: number }> {
  const where = buildEmployeeWhere(user, params)
  const { skip, take } = skipTake(params)
  const [rows, total] = await Promise.all([
    db.employee.findMany({
      where,
      select: employeeSelect,
      orderBy: orderBy(params),
      skip,
      take,
    }),
    db.employee.count({ where }),
  ])
  return { rows, total }
}

export async function listEmployeesForExport(
  user: CurrentUser,
  params: TableParams,
): Promise<EmployeeRow[]> {
  return db.employee.findMany({
    where: buildEmployeeWhere(user, params),
    select: employeeSelect,
    orderBy: orderBy(params),
    take: 20_000,
  })
}

export async function employeeSummary(user: CurrentUser) {
  const scope = { ...branchScope(user), archivedAt: null }
  const [total, active, onLeave, withLogin] = await Promise.all([
    db.employee.count({ where: scope }),
    db.employee.count({ where: { ...scope, status: 'ACTIVE' } }),
    db.employee.count({ where: { ...scope, status: 'ON_LEAVE' } }),
    db.employee.count({ where: { ...scope, user: { isNot: null } } }),
  ])
  return { total, active, onLeave, withLogin }
}

export async function employeeFilterOptions() {
  const [departments, languages] = await Promise.all([
    db.department.findMany({
      where: { archivedAt: null },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    }),
    db.language.findMany({
      where: { archivedAt: null },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    }),
  ])
  return { departments, languages }
}

export async function getEmployeeRecord(user: CurrentUser, id: string) {
  return db.employee.findFirst({
    where: { id, ...branchScope(user), archivedAt: null },
    include: {
      department: true,
      branch: true,
      user: {
        select: {
          id: true,
          email: true,
          role: true,
          isActive: true,
          lastLoginAt: true,
          mustChangePassword: true,
          lockedUntil: true,
          failedLoginCount: true,
          branches: { include: { branch: { select: { id: true, name: true } } } },
        },
      },
      educations: { orderBy: { yearOfPassing: 'desc' } },
      experiences: { orderBy: { fromDate: 'desc' } },
      languages: { include: { language: { select: { id: true, name: true } } } },
    },
  })
}

export type EmployeeRecord = NonNullable<
  Awaited<ReturnType<typeof getEmployeeRecord>>
>
