/**
 * Development seed.
 *
 * Creates the Bell Cell branches, a realistic master-data set, one user per
 * role, and enough demo enquiry/admission/fee traffic for the dashboard to be
 * meaningful. Safe to re-run: everything is upserted on a natural key.
 *
 * NOT for production. Production starts from masters only, with no demo rows
 * and no default passwords.
 */
import { Prisma, PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const db = new PrismaClient()

const DEMO_PASSWORD = 'BellCell@2026'

function daysAgo(n: number): Date {
  const d = new Date()
  d.setDate(d.getDate() - n)
  d.setHours(10, 30, 0, 0)
  return d
}
function daysFromNow(n: number): Date {
  return daysAgo(-n)
}
/** Deterministic pseudo-random so reseeding gives a stable-looking dataset. */
function makeRng(seed: number) {
  let s = seed
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296
    return s / 4294967296
  }
}
const rand = makeRng(20261008)
function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(rand() * arr.length)] as T
}
function int(min: number, max: number): number {
  return Math.floor(rand() * (max - min + 1)) + min
}

async function main() {
  console.log('Seeding Bell Cell EduSuite…')

  // ---------------------------------------------------------------- branches
  const main_ = await db.branch.upsert({
    where: { code: 'BC-MAIN' },
    update: {},
    create: {
      code: 'BC-MAIN',
      name: 'Main Campus',
      city: 'Kozhikode',
      state: 'Kerala',
      isHeadOffice: true,
    },
  })
  const city = await db.branch.upsert({
    where: { code: 'BC-CITY' },
    update: {},
    create: {
      code: 'BC-CITY',
      name: 'City Centre',
      city: 'Kozhikode',
      state: 'Kerala',
    },
  })
  const branches = [main_, city]

  // ----------------------------------------------------------------- masters
  const courseTypes = await Promise.all(
    [
      ['Under Graduate', 1],
      ['Post Graduate', 2],
      ['Diploma', 3],
    ].map(([name, sortOrder]) =>
      db.courseType.upsert({
        where: { name: name as string },
        update: {},
        create: { name: name as string, sortOrder: sortOrder as number },
      }),
    ),
  )
  const [ug, pg, diploma] = courseTypes

  const courseSpecs: [string, string, string, number][] = [
    ['BCOM', 'B.Com', ug!.id, 3],
    ['BBA', 'BBA', ug!.id, 3],
    ['BCA', 'BCA', ug!.id, 3],
    ['MCOM', 'M.Com', pg!.id, 2],
    ['MBA', 'MBA', pg!.id, 2],
    ['DCA', 'Diploma in Computer Applications', diploma!.id, 1],
  ]
  const courses = await Promise.all(
    courseSpecs.map(([code, name, courseTypeId, durationYears]) =>
      db.course.upsert({
        where: { code },
        update: {},
        create: { code, name, courseTypeId, durationYears },
      }),
    ),
  )

  const batch = await db.batch.upsert({
    where: { name: '2026-2027' },
    update: {},
    create: {
      name: '2026-2027',
      startDate: new Date('2026-06-01'),
      endDate: new Date('2027-05-31'),
      isCurrent: true,
    },
  })

  const calicut = await db.affiliationBody.upsert({
    where: { code: 'CU' },
    update: {},
    create: { code: 'CU', name: 'University of Calicut', state: 'Kerala' },
  })
  await db.affiliationBody.upsert({
    where: { code: 'BU' },
    update: {},
    create: { code: 'BU', name: 'Bharathiar University', state: 'Tamil Nadu' },
  })

  const languages = await Promise.all(
    ['English', 'Malayalam', 'Tamil', 'Hindi'].map((name) =>
      db.language.upsert({ where: { name }, update: {}, create: { name } }),
    ),
  )

  await Promise.all(
    ['Hindu', 'Muslim', 'Christian', 'Other'].map((name) =>
      db.religion.upsert({ where: { name }, update: {}, create: { name } }),
    ),
  )

  const classModes = await Promise.all(
    ['Regular', 'Distance', 'Weekend'].map((name) =>
      db.classMode.upsert({ where: { name }, update: {}, create: { name } }),
    ),
  )

  await Promise.all(
    [
      ['DEPT-ADMIN', 'Administration'],
      ['DEPT-COM', 'Commerce'],
      ['DEPT-CS', 'Computer Science'],
      ['DEPT-MGMT', 'Management'],
    ].map(([code, name]) =>
      db.department.upsert({
        where: { code: code! },
        update: {},
        create: { code: code!, name: name! },
      }),
    ),
  )

  await Promise.all(
    [
      ['CT-SSLC', 'SSLC Certificate'],
      ['CT-PLUS2', 'Plus Two Certificate'],
      ['CT-TC', 'Transfer Certificate'],
      ['CT-MIG', 'Migration Certificate'],
      ['CT-DEG', 'Degree Certificate'],
    ].map(([code, name]) =>
      db.certificateType.upsert({
        where: { code: code! },
        update: {},
        create: { code: code!, name: name! },
      }),
    ),
  )

  await db.examCentre.upsert({
    where: { code: 'EC-MAIN' },
    update: {},
    create: { code: 'EC-MAIN', name: 'Bell Cell Main Campus', city: 'Kozhikode' },
  })

  // Account heads first - fee types reference them.
  const headSpecs: [string, string, 'INCOME' | 'EXPENSE'][] = [
    ['AH-FEE', 'Student Fees', 'INCOME'],
    ['AH-DON', 'Donation', 'INCOME'],
    ['AH-SAL', 'Salary', 'EXPENSE'],
    ['AH-RENT', 'Rent', 'EXPENSE'],
    ['AH-STAT', 'Stationery', 'EXPENSE'],
    ['AH-TRAV', 'Travel Expenses', 'EXPENSE'],
    ['AH-UNIV', 'University Remittance', 'EXPENSE'],
  ]
  const heads = await Promise.all(
    headSpecs.map(([code, name, kind]) =>
      db.accountHead.upsert({
        where: { code },
        update: {},
        create: { code, name, kind },
      }),
    ),
  )
  const feeHead = heads.find((h) => h.code === 'AH-FEE')!

  const feeTypeSpecs: [string, string, Prisma.FeeTypeCreateInput['category'], boolean][] = [
    ['FT-APP', 'Application Fee', 'APPLICATION', false],
    ['FT-TUI', 'Tuition Fee', 'TUITION', false],
    ['FT-EXAM', 'Examination Fee', 'EXAMINATION', true],
    ['FT-AFF', 'University Registration Fee', 'AFFILIATION', true],
    ['FT-ID', 'ID Card Fee', 'ID_CARD', false],
  ]
  const feeTypes = await Promise.all(
    feeTypeSpecs.map(([code, name, category, isPayableToAffiliation]) =>
      db.feeType.upsert({
        where: { code },
        update: {},
        create: {
          code,
          name,
          category,
          isPayableToAffiliation,
          accountHeadId: feeHead.id,
        },
      }),
    ),
  )
  const tuition = feeTypes.find((f) => f.code === 'FT-TUI')!
  const appFee = feeTypes.find((f) => f.code === 'FT-APP')!
  const examFee = feeTypes.find((f) => f.code === 'FT-EXAM')!

  await db.bankAccount.upsert({
    where: { bankName_accountNumber: { bankName: 'SBI', accountNumber: '30112233445' } },
    update: {},
    create: {
      accountName: 'Bell Cell Group of Institutions',
      bankName: 'SBI',
      branchName: 'Kozhikode Main',
      accountNumber: '30112233445',
      ifsc: 'SBIN0001234',
    },
  })

  const sources = await Promise.all(
    ['Direct', 'News Paper', 'Web Site', 'Social Media', 'Friends', 'C/O'].map(
      (name) =>
        db.enquirySource.upsert({ where: { name }, update: {}, create: { name } }),
    ),
  )

  const statusSpecs: [string, boolean, boolean][] = [
    ['Call Later', true, false],
    ['Attended', true, false],
    ['Interested', true, false],
    ['Not Interested', false, true],
    ['Not Reachable', true, false],
    ['Admitted', false, true],
  ]
  const callStatuses = await Promise.all(
    statusSpecs.map(([name, requiresFollowUp, isTerminal], i) =>
      db.enquiryCallStatus.upsert({
        where: { name },
        update: {},
        create: { name, requiresFollowUp, isTerminal, sortOrder: i },
      }),
    ),
  )

  // ------------------------------------------------------------------- users
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12)
  const userSpecs: [string, string, Prisma.UserCreateInput['role']][] = [
    ['admin@bellcell.test', 'Nisha Varghese', 'SUPER_ADMIN'],
    ['principal@bellcell.test', 'Anjali Menon', 'ADMIN'],
    ['accounts@bellcell.test', 'Rahul Nair', 'ACCOUNTANT'],
    ['counsellor@bellcell.test', 'Priya Das', 'COUNSELLOR'],
    ['faculty@bellcell.test', 'Arun Kumar', 'FACULTY'],
    ['frontdesk@bellcell.test', 'Fathima Riyas', 'STAFF'],
  ]
  const users = await Promise.all(
    userSpecs.map(([email, fullName, role]) =>
      db.user.upsert({
        where: { email },
        update: { role, fullName },
        create: { email, fullName, role, passwordHash },
      }),
    ),
  )
  for (const u of users) {
    if (u.role === 'SUPER_ADMIN') continue
    for (const [i, b] of branches.entries()) {
      // Everyone gets the main campus; only admins also get the city centre.
      if (i > 0 && u.role !== 'ADMIN') continue
      await db.userBranch.upsert({
        where: { userId_branchId: { userId: u.id, branchId: b.id } },
        update: {},
        create: { userId: u.id, branchId: b.id, isDefault: i === 0 },
      })
    }
  }
  const counsellor = users.find((u) => u.role === 'COUNSELLOR')!
  const accountant = users.find((u) => u.role === 'ACCOUNTANT')!

  // --------------------------------------------------------------- employees
  // Staff and faculty on roll. Three of them are deliberately linked to the
  // demo logins above, so the Login & access tab has both cases to show:
  // someone who can sign in, and someone who only exists as a personnel file.
  const departments = await db.department.findMany()
  const deptBy = (code: string) => departments.find((d) => d.code === code)?.id ?? null

  const employeeSpecs: {
    code: string
    first: string
    last: string
    designation: string
    dept: string
    gender: 'MALE' | 'FEMALE'
    joined: string
    status?: 'ACTIVE' | 'ON_LEAVE'
    phone: string
    linkEmail?: string
  }[] = [
    {
      code: 'EMP-001',
      first: 'Anjali',
      last: 'Menon',
      designation: 'Principal',
      dept: 'DEPT-ADMIN',
      gender: 'FEMALE',
      joined: '2016-06-01',
      phone: '9847011001',
      linkEmail: 'principal@bellcell.test',
    },
    {
      code: 'EMP-002',
      first: 'Rahul',
      last: 'Nair',
      designation: 'Accounts Officer',
      dept: 'DEPT-ADMIN',
      gender: 'MALE',
      joined: '2018-07-16',
      phone: '9847011002',
      linkEmail: 'accounts@bellcell.test',
    },
    {
      code: 'EMP-003',
      first: 'Arun',
      last: 'Kumar',
      designation: 'Assistant Professor',
      dept: 'DEPT-CS',
      gender: 'MALE',
      joined: '2019-06-10',
      phone: '9847011003',
      linkEmail: 'faculty@bellcell.test',
    },
    {
      code: 'EMP-004',
      first: 'Deepa',
      last: 'Krishnan',
      designation: 'Lecturer',
      dept: 'DEPT-COM',
      gender: 'FEMALE',
      joined: '2020-08-03',
      phone: '9847011004',
    },
    {
      code: 'EMP-005',
      first: 'Sajith',
      last: 'Thomas',
      designation: 'Lecturer',
      dept: 'DEPT-MGMT',
      gender: 'MALE',
      joined: '2021-01-11',
      status: 'ON_LEAVE',
      phone: '9847011005',
    },
    {
      code: 'EMP-006',
      first: 'Fathima',
      last: 'Riyas',
      designation: 'Office Assistant',
      dept: 'DEPT-ADMIN',
      gender: 'FEMALE',
      joined: '2022-02-01',
      phone: '9847011006',
    },
    {
      code: 'EMP-007',
      first: 'Vinod',
      last: 'Pillai',
      designation: 'Lab Instructor',
      dept: 'DEPT-CS',
      gender: 'MALE',
      joined: '2023-06-05',
      phone: '9847011007',
    },
  ]

  const languageRows = await db.language.findMany()
  const langBy = (name: string) => languageRows.find((l) => l.name === name)?.id

  for (const spec of employeeSpecs) {
    const employee = await db.employee.upsert({
      where: {
        branchId_employeeCode: { branchId: main_.id, employeeCode: spec.code },
      },
      update: {},
      create: {
        branchId: main_.id,
        employeeCode: spec.code,
        firstName: spec.first,
        lastName: spec.last,
        gender: spec.gender,
        designation: spec.designation,
        departmentId: deptBy(spec.dept),
        dateOfJoining: new Date(spec.joined),
        status: spec.status ?? 'ACTIVE',
        phone: spec.phone,
        email: `${spec.first.toLowerCase()}.${spec.last.toLowerCase()}@bellcell.test`,
        city: 'Kozhikode',
        state: 'Kerala',
      },
    })

    if (spec.linkEmail) {
      await db.user.update({
        where: { email: spec.linkEmail },
        data: { employeeId: employee.id },
      })
    }

    // A couple of qualifications and languages, so the tabs are not empty.
    const existingEducation = await db.employeeEducation.count({
      where: { employeeId: employee.id },
    })
    if (existingEducation === 0) {
      await db.employeeEducation.create({
        data: {
          employeeId: employee.id,
          qualification: spec.dept === 'DEPT-ADMIN' ? 'M.Com' : 'M.Sc',
          boardOrUniversity: 'Calicut University',
          yearOfPassing: 2014,
          marksPercentage: new Prisma.Decimal('72.50'),
        },
      })
    }

    const existingLanguages = await db.employeeLanguageSkill.count({
      where: { employeeId: employee.id },
    })
    if (existingLanguages === 0) {
      for (const [name, proficiency] of [
        ['Malayalam', 'NATIVE'],
        ['English', 'FLUENT'],
      ] as const) {
        const languageId = langBy(name)
        if (!languageId) continue
        await db.employeeLanguageSkill.create({
          data: { employeeId: employee.id, languageId, proficiency },
        })
      }
    }
  }

  // ----------------------------------------------------------- fee structure
  // One Year-1 structure per course, so every demo student can be assigned
  // one. Tuition varies by course type to look like a real fee card.
  const tuitionByCode: Record<string, number> = {
    BCOM: 1500000,
    BBA: 1800000,
    BCA: 2000000,
    MCOM: 2200000,
    MBA: 3500000,
    DCA: 900000,
  }

  const structures = new Map<string, string>()
  for (const course of courses) {
    const perInstallment = tuitionByCode[course.code] ?? 1500000
    const id = `seed-structure-${course.code.toLowerCase()}-y1`
    const created = await db.feeStructure.upsert({
      where: { id },
      update: {},
      create: {
        id,
        name: `${course.name} Year 1 — ${batch.name}`,
        branchId: null, // available to every branch
        courseId: course.id,
        batchId: batch.id,
        courseYear: 1,
        graceDays: 7,
        lateFeePerDayPaise: 2000, // Rs 20/day
        lateFeeMaxPaise: 200000, // capped at Rs 2,000
        items: {
          create: [
            { feeTypeId: appFee.id, amountPaise: 50000, installmentNo: 1, dueAfterDays: 0 },
            { feeTypeId: tuition.id, amountPaise: perInstallment, installmentNo: 1, dueAfterDays: 15 },
            { feeTypeId: tuition.id, amountPaise: perInstallment, installmentNo: 2, dueAfterDays: 120 },
            { feeTypeId: examFee.id, amountPaise: 300000, installmentNo: 3, dueAfterDays: 210 },
          ],
        },
      },
    })
    structures.set(course.id, created.id)
  }
  const structure = { id: structures.get(courses[0]!.id)! }

  // --------------------------------------------------------- demo enquiry data
  const firstNames = ['Aiswarya','Rahul','Fathima','Arjun','Nikhil','Sneha','Vishnu','Anjana','Hari','Meera','Sachin','Divya','Ashwin','Reshma','Jithin','Gokul','Lakshmi','Nandana','Vivek','Athira','Sreehari','Parvathy','Akhil','Neethu']
  const lastNames = ['Nair','Menon','Pillai','Kurup','Varma','Das','Raj','Mohan','Krishnan','Thomas','Joseph','Rahman']

  const existingLeads = await db.enquiryLead.count()
  if (existingLeads === 0) {
    for (let i = 0; i < 48; i += 1) {
      const name = `${pick(firstNames)} ${pick(lastNames)}`
      const phone = `9${int(100000000, 999999999)}`
      await db.enquiryLead.create({
        data: {
          branchId: pick(branches).id,
          name,
          phone,
          email: `${name.split(' ')[0]!.toLowerCase()}${int(10, 99)}@example.com`,
          city: 'Kozhikode',
          courseId: pick(courses).id,
          sourceId: pick(sources).id,
          callStatusId: pick(callStatuses).id,
          assignedToId: counsellor.id,
          callCount: int(0, 3),
          nextCallAt: rand() > 0.5 ? daysFromNow(int(0, 6)) : null,
          createdAt: daysAgo(int(0, 45)),
        },
      })
    }
    console.log('  · 48 leads')
  }

  const existingEnquiries = await db.enquiry.count()
  if (existingEnquiries === 0) {
    const stages = [
      'NEW', 'NEW', 'CONTACTED', 'CONTACTED', 'CONTACTED',
      'COUNSELLING_SCHEDULED', 'COUNSELLING_SCHEDULED',
      'COUNSELLING_COMPLETED', 'CONVERTED', 'LOST',
    ] as const

    for (let i = 0; i < 60; i += 1) {
      const stage = pick(stages)
      const name = `${pick(firstNames)} ${pick(lastNames)}`
      const created = daysAgo(int(0, 60))
      await db.enquiry.create({
        data: {
          branchId: pick(branches).id,
          enquiryNo: `ENQ${String(i + 1).padStart(4, '0')}`,
          name,
          phone: `9${int(100000000, 999999999)}`,
          city: 'Kozhikode',
          courseId: pick(courses).id,
          sourceId: pick(sources).id,
          callStatusId: pick(callStatuses).id,
          assignedToId: counsellor.id,
          stage,
          callCount: int(1, 5),
          // Roughly a quarter of open enquiries are due a call today, so the
          // dashboard's "Today's follow-up calls" card is populated.
          nextCallAt:
            stage === 'CONVERTED' || stage === 'LOST'
              ? null
              : rand() > 0.72
                ? new Date(new Date().setHours(int(9, 17), 0, 0, 0))
                : daysFromNow(int(1, 10)),
          counsellingScheduledAt:
            stage === 'COUNSELLING_SCHEDULED' || stage === 'COUNSELLING_COMPLETED' || stage === 'CONVERTED'
              ? daysAgo(int(1, 20))
              : null,
          counsellingCompletedAt:
            stage === 'COUNSELLING_COMPLETED' || stage === 'CONVERTED'
              ? daysAgo(int(0, 15))
              : null,
          createdAt: created,
        },
      })
    }
    console.log('  · 60 enquiries')
  }

  // ----------------------------------------------- demo students, fees, money
  const existingStudents = await db.student.count()
  if (existingStudents === 0) {
    for (let i = 0; i < 34; i += 1) {
      const branch = pick(branches)
      const course = pick(courses)
      // Weighted toward recent days: ~45% land in the current month, so the
      // month-on-month KPI deltas read plausibly instead of showing -94%.
      const admitted = rand() < 0.45 ? daysAgo(int(0, 7)) : daysAgo(int(8, 100))
      const firstName = pick(firstNames)
      const lastName = pick(lastNames)

      const student = await db.student.create({
        data: {
          branchId: branch.id,
          applicationNo: `APP${String(1000 + i)}`,
          admissionNo: `BC/${batch.name.slice(0, 4)}/${String(100 + i)}`,
          firstName,
          lastName,
          phone: `9${int(100000000, 999999999)}`,
          email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}@example.com`,
          city: 'Kozhikode',
          state: 'Kerala',
          courseId: course.id,
          batchId: batch.id,
          classModeId: pick(classModes).id,
          affiliationBodyId: calicut.id,
          mediumId: languages[0]!.id,
          courseYear: 1,
          admissionDate: admitted,
          status: 'ACTIVE',
          createdAt: admitted,
        },
      })

      await db.studentFeeAssignment.create({
        data: {
          studentId: student.id,
          structureId: structure.id,
          totalPaise: 3350000,
          assignedAt: admitted,
        },
      })

      // Two instalments each: the first due in the past, the second ahead.
      const inst1 = await db.feeInstallment.create({
        data: {
          studentId: student.id,
          feeTypeId: tuition.id,
          label: 'Tuition — Instalment 1',
          installmentNo: 1,
          dueDate: daysAgo(int(1, 40)),
          duePaise: 1500000,
        },
      })
      await db.feeInstallment.create({
        data: {
          studentId: student.id,
          feeTypeId: tuition.id,
          label: 'Tuition — Instalment 2',
          installmentNo: 2,
          dueDate: daysFromNow(int(20, 90)),
          duePaise: 1500000,
        },
      })

      // ~70% have paid instalment 1 (some partially), leaving a realistic
      // overdue figure on the dashboard.
      const roll = rand()
      if (roll > 0.3) {
        const full = roll > 0.5
        const amount = full ? 1500000 : 750000
        const receiptDate = daysAgo(int(0, 29))

        const payment = await db.payment.create({
          data: {
            branchId: branch.id,
            studentId: student.id,
            receiptNo: `RC/2026-27/${String(500 + i)}`,
            receiptDate,
            amountPaise: amount,
            mode: pick(['CASH', 'UPI', 'CARD', 'NET_BANKING'] as const),
            collectedById: accountant.id,
            allocations: {
              create: [{ installmentId: inst1.id, amountPaise: amount }],
            },
          },
        })

        await db.feeInstallment.update({
          where: { id: inst1.id },
          data: {
            paidPaise: amount,
            status: full ? 'PAID' : 'PARTIALLY_PAID',
          },
        })

        // Every receipt posts to the ledger, so the Day Book ties to the fee
        // register. See ADR-003.
        await db.ledgerEntry.create({
          data: {
            branchId: branch.id,
            entryDate: receiptDate,
            source: 'FEE_PAYMENT',
            accountHeadId: feeHead.id,
            debitPaise: amount,
            narration: `Fee receipt ${payment.receiptNo}`,
            paymentId: payment.id,
          },
        })
      } else {
        await db.feeInstallment.update({
          where: { id: inst1.id },
          data: { status: 'OVERDUE' },
        })
      }
    }
    console.log('  · 34 students with fees, receipts and ledger postings')
  }

  // ------------------------------------------- admissions workflow demo data
  const certTypes = await db.certificateType.findMany({
    where: { code: { in: ['CT-SSLC', 'CT-PLUS2', 'CT-TC'] } },
  })
  const allStudents = await db.student.findMany({
    select: { id: true, affiliationBodyId: true },
  })

  if ((await db.certificateCustody.count()) === 0 && certTypes.length > 0) {
    const states = [
      'WITH_INSTITUTE',
      'WITH_INSTITUTE',
      'SENT_FOR_VERIFICATION',
      'RETURNED_FROM_AFFILIATION',
      'RETURNED_TO_STUDENT',
    ] as const

    for (const student of allStudents.slice(0, 22)) {
      const type = pick(certTypes)
      const status = pick(states)
      const collectedAt = daysAgo(int(20, 90))

      const custody = await db.certificateCustody.create({
        data: {
          studentId: student.id,
          certificateTypeId: type.id,
          affiliationBodyId: student.affiliationBodyId,
          status,
          collectedAt,
          sentAt: status === 'WITH_INSTITUTE' ? null : daysAgo(int(10, 19)),
          returnedAt: ['RETURNED_FROM_AFFILIATION', 'RETURNED_TO_STUDENT'].includes(status)
            ? daysAgo(int(3, 9))
            : null,
          handedBackAt: status === 'RETURNED_TO_STUDENT' ? daysAgo(int(0, 2)) : null,
        },
      })

      await db.certificateCustodyEvent.create({
        data: {
          custodyId: custody.id,
          toStatus: 'WITH_INSTITUTE',
          occurredAt: collectedAt,
          remarks: 'Original collected at admission',
        },
      })
      if (status !== 'WITH_INSTITUTE') {
        await db.certificateCustodyEvent.create({
          data: {
            custodyId: custody.id,
            fromStatus: 'WITH_INSTITUTE',
            toStatus: 'SENT_FOR_VERIFICATION',
            occurredAt: daysAgo(int(10, 19)),
            remarks: 'Sent for university verification',
          },
        })
      }
    }
    console.log('  · 22 certificate custody records')
  }

  if ((await db.studentIdCard.count()) === 0) {
    const cardStates = [
      'REQUESTED',
      'REQUESTED',
      'SENT_TO_AFFILIATION',
      'RECEIVED',
      'RECEIVED',
      'STUDENT_NOTIFIED',
      'COLLECTED',
    ] as const

    for (const student of allStudents.slice(0, 26)) {
      const status = pick(cardStates)
      const requestedAt = daysAgo(int(15, 60))
      await db.studentIdCard.create({
        data: {
          studentId: student.id,
          status,
          requestedAt,
          cardNumber:
            status === 'REQUESTED' || status === 'SENT_TO_AFFILIATION'
              ? null
              : `BC${int(10000, 99999)}`,
          receivedAt: ['RECEIVED', 'STUDENT_NOTIFIED', 'COLLECTED'].includes(status)
            ? daysAgo(int(4, 12))
            : null,
          notifiedAt: ['STUDENT_NOTIFIED', 'COLLECTED'].includes(status)
            ? daysAgo(int(2, 5))
            : null,
          collectedAt: status === 'COLLECTED' ? daysAgo(int(0, 2)) : null,
        },
      })
    }
    console.log('  · 26 ID card records')
  }

  if ((await db.studyMaterial.count()) === 0) {
    const materialSpecs: [string, string, string, number][] = [
      ['SM-BCOM-1', 'B.Com Year 1 Textbook Set', 'BCOM', 40],
      ['SM-BCA-1', 'BCA Year 1 Lab Manual', 'BCA', 25],
      ['SM-MBA-1', 'MBA Case Study Pack', 'MBA', 15],
      ['SM-SYL-26', 'University Syllabus 2026-27', '', 0],
      ['SM-KIT', 'Student Welcome Kit', '', 60],
    ]
    for (const [code, title, courseCode, stock] of materialSpecs) {
      const course = courseCode ? courses.find((c) => c.code === courseCode) : null
      await db.studyMaterial.create({
        data: {
          code,
          title,
          kind: code.includes('SYL') ? 'SYLLABUS' : code.includes('KIT') ? 'KIT' : 'BOOK',
          courseId: course?.id ?? null,
          stockTotal: stock,
        },
      })
    }

    const kit = await db.studyMaterial.findUnique({ where: { code: 'SM-KIT' } })
    if (kit) {
      for (const student of allStudents.slice(0, 12)) {
        await db.studyMaterialIssue.create({
          data: { studentId: student.id, materialId: kit.id, quantity: 1, issuedAt: daysAgo(int(1, 40)) },
        })
      }
      await db.studyMaterial.update({
        where: { id: kit.id },
        data: { stockIssued: Math.min(12, allStudents.length) },
      })
    }
    console.log('  · 5 study materials, 12 issued')
  }

  if ((await db.classSection.count()) === 0) {
    for (const course of courses.slice(0, 3)) {
      for (const sectionName of ['A', 'B']) {
        await db.classSection.create({
          data: {
            branchId: main_.id,
            courseId: course.id,
            batchId: batch.id,
            courseYear: 1,
            name: sectionName,
            capacity: 60,
          },
        })
      }
    }
    console.log('  · 6 class sections')
  }

  // ------------------------------------------------- accounts demo movement
  if ((await db.dailyTransaction.count()) === 0) {
    const expenseHeads = heads.filter((h) => h.kind === 'EXPENSE')
    const incomeHeads = heads.filter((h) => h.kind === 'INCOME' && h.code !== 'AH-FEE')
    const bank = await db.bankAccount.findFirst()

    let voucherSeq = 0
    for (let i = 0; i < 24; i += 1) {
      const isIncome = rand() > 0.75
      const head = isIncome ? pick(incomeHeads) : pick(expenseHeads)
      if (!head) continue
      voucherSeq += 1
      const when = daysAgo(int(0, 28))
      const amountPaise = isIncome ? int(50, 400) * 1000 : int(20, 250) * 1000

      const txn = await db.dailyTransaction.create({
        data: {
          branchId: pick(branches).id,
          voucherNo: `VCH/2026-27/${String(voucherSeq).padStart(4, '0')}`,
          transactionDate: when,
          kind: head.kind,
          accountHeadId: head.id,
          amountPaise,
          mode: pick(['CASH', 'UPI', 'BANK_TRANSFER', 'CHEQUE'] as const),
          bankAccountId: rand() > 0.5 ? (bank?.id ?? null) : null,
          enteredById: accountant.id,
          narration: `${head.name} — ${when.toLocaleDateString('en-IN', { month: 'long' })}`,
        },
      })

      await db.ledgerEntry.create({
        data: {
          branchId: txn.branchId,
          entryDate: when,
          source: 'DAILY_TRANSACTION',
          accountHeadId: head.id,
          bankAccountId: txn.bankAccountId,
          debitPaise: head.kind === 'INCOME' ? amountPaise : 0,
          creditPaise: head.kind === 'EXPENSE' ? amountPaise : 0,
          narration: `${txn.voucherNo} — ${head.name}`,
          dailyTransactionId: txn.id,
        },
      })
    }

    // Keep the voucher counter in step with the rows we just inserted, so the
    // first voucher saved through the UI does not collide with a seeded one.
    await db.receiptSequence.upsert({
      where: {
        branchId_financialYear_series: {
          branchId: main_.id,
          financialYear: '2026-27',
          series: 'VOUCHER',
        },
      },
      create: {
        branchId: main_.id,
        financialYear: '2026-27',
        series: 'VOUCHER',
        prefix: 'VCH',
        lastNumber: voucherSeq,
      },
      update: { lastNumber: voucherSeq },
    })
    console.log(`  · ${voucherSeq} daily transactions`)
  }

  if ((await db.affiliationPayment.count()) === 0) {
    const univHead = heads.find((h) => h.code === 'AH-UNIV')
    for (let i = 0; i < 3; i += 1) {
      const when = daysAgo(int(5, 50))
      const amountPaise = int(150, 600) * 1000
      const payment = await db.affiliationPayment.create({
        data: {
          branchId: main_.id,
          affiliationBodyId: calicut.id,
          feeTypeId: i === 2 ? null : pick([examFee.id, feeTypes.find((f) => f.code === 'FT-AFF')!.id]),
          amountPaise,
          paidOn: when,
          mode: 'BANK_TRANSFER',
          referenceNo: `NEFT${int(100000, 999999)}`,
          studentCount: int(10, 34),
        },
      })
      await db.ledgerEntry.create({
        data: {
          branchId: main_.id,
          entryDate: when,
          source: 'AFFILIATION_PAYMENT',
          accountHeadId: univHead?.id ?? null,
          creditPaise: amountPaise,
          narration: `Remittance to ${calicut.name}`,
          affiliationPaymentId: payment.id,
        },
      })
    }
    console.log('  · 3 affiliation remittances')
  }

  // ------------------------------------------------- examinations demo data
  if ((await db.subject.count()) === 0) {
    const subjectSpecs: [string, string, string][] = [
      ['BCOM101', 'Financial Accounting', 'BCOM'],
      ['BCOM102', 'Business Management', 'BCOM'],
      ['BCOM103', 'Business Economics', 'BCOM'],
      ['BCOM104', 'Business Communication', 'BCOM'],
      ['BCA101', 'Programming Fundamentals', 'BCA'],
      ['BCA102', 'Digital Logic', 'BCA'],
      ['BCA103', 'Mathematics I', 'BCA'],
      ['MBA101', 'Organisational Behaviour', 'MBA'],
      ['MBA102', 'Managerial Economics', 'MBA'],
    ]
    for (const [code, name, courseCode] of subjectSpecs) {
      const course = courses.find((c) => c.code === courseCode)
      if (!course) continue
      await db.subject.create({
        data: {
          code,
          name,
          courseId: course.id,
          courseTypeId: course.courseTypeId,
          courseYear: 1,
          maxMarks: 100,
          // A practical-heavy paper needs more to pass; the rest take 35.
          passMarks: code.endsWith('04') ? 40 : 35,
        },
      })
    }
    console.log(`  · ${subjectSpecs.length} subjects`)
  }

  if ((await db.examSchedule.count()) === 0) {
    const centre = await db.examCentre.findFirst()
    const bcom = courses.find((c) => c.code === 'BCOM')!
    const bca = courses.find((c) => c.code === 'BCA')!

    for (const [course, name, term, offset, published] of [
      [bcom, 'B.Com Year 1 — Mid Term 2026', 'MID_TERM', -40, true],
      [bcom, 'B.Com Year 1 — Annual 2026', 'ANNUAL', 25, false],
      [bca, 'BCA Year 1 — Mid Term 2026', 'MID_TERM', -30, true],
    ] as const) {
      const subjects = await db.subject.findMany({
        where: { courseId: course.id, courseYear: 1 },
        orderBy: { code: 'asc' },
      })
      const start = daysAgo(-offset)
      const schedule = await db.examSchedule.create({
        data: {
          branchId: main_.id,
          name,
          courseId: course.id,
          batchId: batch.id,
          courseYear: 1,
          term,
          examCentreId: centre?.id ?? null,
          startDate: start,
          endDate: daysAgo(-(offset + subjects.length)),
          isPublished: published,
          subjects: {
            create: subjects.map((sub, i) => ({
              subjectId: sub.id,
              examDate: daysAgo(-(offset + i)),
              startTime: '10:00',
              endTime: '13:00',
              maxMarks: sub.maxMarks,
            })),
          },
        },
      })

      // Marks for the two mid-terms, which have already happened.
      if (term !== 'MID_TERM') continue

      const cohort = await db.student.findMany({
        where: { courseId: course.id, courseYear: 1, branchId: main_.id },
        take: 20,
        select: { id: true },
      })

      for (const student of cohort) {
        const rows = subjects.map((sub) => {
          const absent = rand() < 0.06
          // Most students pass; a tail does not.
          const marks = absent ? null : rand() < 0.15 ? int(12, 34) : int(38, 96)
          return { subject: sub, marks, absent }
        })

        const total = rows.reduce((t, r) => t + (r.marks ?? 0), 0)
        const max = rows.reduce((t, r) => t + r.subject.maxMarks, 0)
        const pct = max > 0 ? Math.round((total / max) * 10000) / 100 : 0
        const anyAbsent = rows.some((r) => r.absent)
        const anyFail = rows.some((r) => !r.absent && (r.marks ?? 0) < r.subject.passMarks)
        const allAbsent = rows.every((r) => r.absent)
        const status = allAbsent ? 'ABSENT' : anyFail || anyAbsent ? 'FAIL' : 'PASS'
        const grade =
          status !== 'PASS'
            ? 'F'
            : pct >= 90 ? 'A+' : pct >= 80 ? 'A' : pct >= 70 ? 'B+' : pct >= 60 ? 'B' : pct >= 50 ? 'C' : 'D'

        await db.examResult.create({
          data: {
            scheduleId: schedule.id,
            studentId: student.id,
            totalMarks: total,
            maxMarks: max,
            percentage: new Prisma.Decimal(pct),
            grade,
            status,
            publishedAt: published ? daysAgo(5) : null,
            subjects: {
              create: rows.map((r) => ({
                subjectId: r.subject.id,
                marks: r.marks,
                maxMarks: r.subject.maxMarks,
                isAbsent: r.absent,
              })),
            },
          },
        })
      }
    }
    console.log('  · 3 examinations with marks for the completed ones')
  }


  // ----------------------------------------------------------------- payroll
  // Components and salary structures, but deliberately NO statutory settings:
  // a seeded database must not pretend the institute is registered for PF.
  // Switching that on is a decision someone makes on the settings screen.
  const componentSpecs: [string, string, 'EARNING' | 'DEDUCTION', string, number, boolean, boolean][] = [
    // code, name, kind, calculation, sortOrder, partOfBasic, proRated
    ['BASIC', 'Basic pay', 'EARNING', 'FIXED', 1, true, true],
    ['DA', 'Dearness allowance', 'EARNING', 'FIXED', 2, true, true],
    ['HRA', 'House rent allowance', 'EARNING', 'PERCENT_OF_BASIC', 3, false, true],
    ['CONV', 'Conveyance allowance', 'EARNING', 'FIXED', 4, false, true],
    ['SPL', 'Special allowance', 'EARNING', 'FIXED', 5, false, true],
    ['PHONE', 'Phone reimbursement', 'EARNING', 'FIXED', 6, false, false],
    ['ADV', 'Salary advance recovery', 'DEDUCTION', 'FIXED', 20, false, false],
  ]

  const components = new Map<string, string>()
  for (const [code, name, kind, calculation, sortOrder, partOfBasic, proRated] of componentSpecs) {
    const row = await db.salaryComponent.upsert({
      where: { code },
      update: {},
      create: {
        code,
        name,
        kind,
        calculation: calculation as 'FIXED' | 'PERCENT_OF_BASIC',
        percentage: code === 'HRA' ? new Prisma.Decimal('40') : null,
        partOfBasic,
        proRated,
        sortOrder,
      },
    })
    components.set(code, row.id)
  }

  // Basic pay by designation, so the demo register is not seven identical rows.
  const salaryByCode: Record<string, { basic: number; da: number; conv: number; spl: number }> = {
    'EMP-001': { basic: 6500000, da: 1500000, conv: 300000, spl: 500000 }, // Principal
    'EMP-002': { basic: 3200000, da: 800000, conv: 200000, spl: 200000 },
    'EMP-003': { basic: 3800000, da: 900000, conv: 200000, spl: 300000 },
    'EMP-004': { basic: 2800000, da: 700000, conv: 150000, spl: 150000 },
    'EMP-005': { basic: 2600000, da: 650000, conv: 150000, spl: 100000 },
    // Deliberately under the ESI eligibility limit, so a demo run shows
    // both PF and ESI and makes the employee/employer split visible.
    'EMP-006': { basic: 900000, da: 250000, conv: 80000, spl: 0 },
    'EMP-007': { basic: 800000, da: 200000, conv: 70000, spl: 0 },
  }

  for (const [employeeCode, pay] of Object.entries(salaryByCode)) {
    const employee = await db.employee.findFirst({
      where: { branchId: main_.id, employeeCode },
      select: { id: true },
    })
    if (!employee) continue

    const already = await db.salaryStructure.count({
      where: { employeeId: employee.id },
    })
    if (already > 0) continue

    await db.salaryStructure.create({
      data: {
        employeeId: employee.id,
        effectiveFrom: new Date('2026-04-01'),
        notes: 'Opening structure',
        lines: {
          create: [
            { componentId: components.get('BASIC')!, amountPaise: pay.basic },
            { componentId: components.get('DA')!, amountPaise: pay.da },
            { componentId: components.get('HRA')!, amountPaise: 0 },
            { componentId: components.get('CONV')!, amountPaise: pay.conv },
            ...(pay.spl > 0
              ? [{ componentId: components.get('SPL')!, amountPaise: pay.spl }]
              : []),
          ],
        },
      },
    })
  }
  console.log('  \u00b7 7 salary structures (statutory deductions left switched OFF)')


  // --------------------------------------------------------------- holidays
  const holidaySpecs: [string, string][] = [
    ['2026-01-26', 'Republic Day'],
    ['2026-04-14', 'Vishu'],
    ['2026-05-01', 'May Day'],
    ['2026-08-15', 'Independence Day'],
    ['2026-08-26', 'Onam'],
    ['2026-08-27', 'Thiruvonam'],
    ['2026-10-02', 'Gandhi Jayanti'],
    ['2026-12-25', 'Christmas'],
  ]
  for (const [date, name] of holidaySpecs) {
    await db.holiday.upsert({
      // Institute-wide: branchId null. The composite unique treats null as a
      // distinct value in Postgres, so findFirst-then-create is used instead.
      where: { id: `seed-holiday-${date}` },
      update: {},
      create: {
        id: `seed-holiday-${date}`,
        branchId: null,
        date: new Date(`${date}T00:00:00.000Z`),
        name,
      },
    })
  }

  // ------------------------------------------------------- staff attendance
  // One realistic month (August 2026) for the main campus, so the payroll
  // run for that month has a register to read rather than assuming nobody
  // was ever away.
  const staffForAttendance = await db.employee.findMany({
    where: { branchId: main_.id, archivedAt: null },
    orderBy: { employeeCode: 'asc' },
    select: { id: true, employeeCode: true },
  })

  const augustHolidays = new Set(['2026-08-15', '2026-08-26', '2026-08-27'])
  // Who was away, and how. Everyone else is simply present.
  const absences: Record<string, Record<number, 'ABSENT' | 'HALF_DAY' | 'PAID_LEAVE' | 'UNPAID_LEAVE'>> = {
    'EMP-002': { 5: 'PAID_LEAVE', 6: 'PAID_LEAVE' },
    'EMP-004': { 11: 'UNPAID_LEAVE', 12: 'UNPAID_LEAVE' },
    'EMP-005': { 18: 'HALF_DAY', 19: 'ABSENT' },
    'EMP-007': { 24: 'HALF_DAY' },
  }

  const existingStaffMarks = await db.staffAttendance.count({
    where: {
      branchId: main_.id,
      date: {
        gte: new Date('2026-08-01T00:00:00.000Z'),
        lt: new Date('2026-09-01T00:00:00.000Z'),
      },
    },
  })

  if (existingStaffMarks === 0 && staffForAttendance.length > 0) {
    const rows: Prisma.StaffAttendanceCreateManyInput[] = []
    for (const employee of staffForAttendance) {
      for (let day = 1; day <= 31; day += 1) {
        const iso = `2026-08-${String(day).padStart(2, '0')}`
        const date = new Date(`${iso}T00:00:00.000Z`)
        // Sundays are not marked at all, which is the honest state for an
        // institute with no weekly-off rows generated yet.
        if (date.getUTCDay() === 0) continue

        const status = augustHolidays.has(iso)
          ? 'HOLIDAY'
          : (absences[employee.employeeCode]?.[day] ?? 'PRESENT')

        rows.push({
          branchId: main_.id,
          employeeId: employee.id,
          date,
          status,
        })
      }
    }
    await db.staffAttendance.createMany({ data: rows, skipDuplicates: true })
    console.log(`  \u00b7 ${rows.length} staff attendance records for August 2026`)
  }

  // ----------------------------------------------------- student attendance
  // Twelve sessions for one cohort, with a deliberate spread so the shortage
  // report has all three bands to show.
  const currentBatch = await db.batch.findFirst({
    where: { isCurrent: true },
    select: { id: true },
  })
  // The biggest year-1 cohort at the main campus, so the demo register is
  // worth looking at rather than four rows.
  const biggestCohort = currentBatch
    ? (
        await db.student.groupBy({
          by: ['courseId'],
          where: {
            branchId: main_.id,
            batchId: currentBatch.id,
            courseYear: 1,
            archivedAt: null,
          },
          _count: { courseId: true },
          orderBy: { _count: { courseId: 'desc' } },
          take: 1,
        })
      )[0]
    : undefined
  const attendanceCourse = biggestCohort ? { id: biggestCohort.courseId } : null

  if (attendanceCourse && currentBatch) {
    const cohort = await db.student.findMany({
      where: {
        branchId: main_.id,
        courseId: attendanceCourse.id,
        batchId: currentBatch.id,
        courseYear: 1,
        archivedAt: null,
      },
      orderBy: { firstName: 'asc' },
      take: 20,
      select: { id: true },
    })

    const existingSessions = await db.attendanceSession.count({
      where: { branchId: main_.id, courseId: attendanceCourse.id },
    })

    if (existingSessions === 0 && cohort.length > 0) {
      for (let i = 0; i < 12; i += 1) {
        const date = new Date(Date.UTC(2026, 7, 3 + i))
        if (date.getUTCDay() === 0) continue

        const session = await db.attendanceSession.create({
          data: {
            branchId: main_.id,
            courseId: attendanceCourse.id,
            batchId: currentBatch.id,
            courseYear: 1,
            date,
          },
        })

        await db.studentAttendance.createMany({
          data: cohort.map((student, index) => {
            // Student 0 attends everything; the last two miss most of it, so
            // the register shows Clear, Condonation and Short.
            let status: 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED' = 'PRESENT'
            if (index === cohort.length - 1 && i % 3 !== 0) status = 'ABSENT'
            else if (index === cohort.length - 2 && i % 4 === 0) status = 'ABSENT'
            else if (index === 2 && i === 5) status = 'LATE'
            else if (index === 3 && i === 7) status = 'EXCUSED'
            return { sessionId: session.id, studentId: student.id, status }
          }),
        })
      }
      console.log(`  \u00b7 12 class registers for a cohort of ${cohort.length}`)
    }
  }


  // ------------------------------------------------------------ leave types
  // Entitlements are the institute's to set; these are a starting point and
  // the master screen says so. The paid flag is the one that costs money.
  const leaveTypeSpecs: [string, string, boolean, number, boolean, number, number][] = [
    // code, name, isPaid, daysPerYear, carryForward, cap, sortOrder
    ['CL', 'Casual leave', true, 12, false, 0, 1],
    ['SL', 'Sick leave', true, 10, false, 0, 2],
    ['EL', 'Earned leave', true, 15, true, 30, 3],
    ['LOP', 'Loss of pay', false, 0, false, 0, 9],
  ]
  for (const [code, name, isPaid, days, carry, cap, sortOrder] of leaveTypeSpecs) {
    await db.leaveType.upsert({
      where: { code },
      update: {},
      create: {
        code,
        name,
        isPaid,
        annualEntitlementDays: new Prisma.Decimal(days),
        allowCarryForward: carry,
        carryForwardCapDays: new Prisma.Decimal(cap),
        sortOrder,
      },
    })
  }

  // A couple of decided requests so the screen is not empty. These are
  // recorded WITHOUT touching the register, because the August staff
  // attendance above was seeded directly and approving here would fight it.
  const clType = await db.leaveType.findUnique({ where: { code: 'CL' } })
  const lopType = await db.leaveType.findUnique({ where: { code: 'LOP' } })
  const leaveSeedEmployees = await db.employee.findMany({
    where: { branchId: main_.id, employeeCode: { in: ['EMP-003', 'EMP-006'] } },
    select: { id: true, employeeCode: true },
  })

  if (clType && lopType && (await db.leaveRequest.count()) === 0) {
    for (const employee of leaveSeedEmployees) {
      const isCasual = employee.employeeCode === 'EMP-003'
      await db.leaveRequest.create({
        data: {
          branchId: main_.id,
          employeeId: employee.id,
          leaveTypeId: isCasual ? clType.id : lopType.id,
          fromDate: new Date(isCasual ? '2026-09-14T00:00:00.000Z' : '2026-09-21T00:00:00.000Z'),
          toDate: new Date(isCasual ? '2026-09-15T00:00:00.000Z' : '2026-09-21T00:00:00.000Z'),
          days: new Prisma.Decimal(isCasual ? 2 : 1),
          reason: isCasual ? 'Family function' : 'Personal, no leave left',
          status: 'PENDING',
        },
      })
    }
    console.log('  \u00b7 4 leave types and 2 pending requests')
  }

  console.log('\nSeed complete.')
  console.log(`  Sign in with any of:`)
  for (const [email, , role] of userSpecs) {
    console.log(`    ${email.padEnd(28)} ${role}`)
  }
  console.log(`  Password for all demo accounts: ${DEMO_PASSWORD}`)
}

main()
  .then(() => db.$disconnect())
  .catch(async (e) => {
    console.error(e)
    await db.$disconnect()
    process.exit(1)
  })
