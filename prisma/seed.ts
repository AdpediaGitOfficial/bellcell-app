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
import { PrismaClient, type Prisma } from '@prisma/client'
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
