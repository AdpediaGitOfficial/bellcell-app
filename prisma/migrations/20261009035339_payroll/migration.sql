-- CreateEnum
CREATE TYPE "SalaryComponentKind" AS ENUM ('EARNING', 'DEDUCTION', 'EMPLOYER_CONTRIBUTION');

-- CreateEnum
CREATE TYPE "SalaryCalculation" AS ENUM ('FIXED', 'PERCENT_OF_BASIC', 'PERCENT_OF_GROSS');

-- CreateEnum
CREATE TYPE "PayrollRunStatus" AS ENUM ('DRAFT', 'APPROVED', 'PAID', 'CANCELLED');

-- CreateTable
CREATE TABLE "salary_components" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "SalaryComponentKind" NOT NULL,
    "calculation" "SalaryCalculation" NOT NULL DEFAULT 'FIXED',
    "percentage" DECIMAL(6,3),
    "partOfBasic" BOOLEAN NOT NULL DEFAULT false,
    "proRated" BOOLEAN NOT NULL DEFAULT true,
    "isStatutory" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "salary_components_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "salary_structures" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "salary_structures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "salary_structure_lines" (
    "id" TEXT NOT NULL,
    "structureId" TEXT NOT NULL,
    "componentId" TEXT NOT NULL,
    "amountPaise" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "salary_structure_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_settings" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "pfEnabled" BOOLEAN NOT NULL DEFAULT false,
    "pfEmployeeRate" DECIMAL(6,3) NOT NULL DEFAULT 12,
    "pfEmployerRate" DECIMAL(6,3) NOT NULL DEFAULT 12,
    "pfWageCeilingPaise" INTEGER NOT NULL DEFAULT 1500000,
    "pfNumber" TEXT,
    "esiEnabled" BOOLEAN NOT NULL DEFAULT false,
    "esiEmployeeRate" DECIMAL(6,3) NOT NULL DEFAULT 0.75,
    "esiEmployerRate" DECIMAL(6,3) NOT NULL DEFAULT 3.25,
    "esiEligibilityPaise" INTEGER NOT NULL DEFAULT 2100000,
    "esiNumber" TEXT,
    "ptEnabled" BOOLEAN NOT NULL DEFAULT false,
    "standardWorkingDays" INTEGER,
    "salaryAccountHeadId" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payroll_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_tax_slabs" (
    "id" TEXT NOT NULL,
    "settingId" TEXT NOT NULL,
    "fromPaise" INTEGER NOT NULL,
    "toPaise" INTEGER,
    "amountPaise" INTEGER NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "payroll_tax_slabs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_runs" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "month" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "status" "PayrollRunStatus" NOT NULL DEFAULT 'DRAFT',
    "workingDays" INTEGER NOT NULL,
    "grossPaise" INTEGER NOT NULL DEFAULT 0,
    "deductionsPaise" INTEGER NOT NULL DEFAULT 0,
    "netPaise" INTEGER NOT NULL DEFAULT 0,
    "employerContributionPaise" INTEGER NOT NULL DEFAULT 0,
    "headcount" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdById" TEXT,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "paymentMode" "PaymentMode",
    "bankAccountId" TEXT,
    "voucherId" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payroll_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payslips" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "workingDays" INTEGER NOT NULL,
    "lopDays" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "paidDays" DECIMAL(5,2) NOT NULL,
    "grossPaise" INTEGER NOT NULL DEFAULT 0,
    "deductionsPaise" INTEGER NOT NULL DEFAULT 0,
    "netPaise" INTEGER NOT NULL DEFAULT 0,
    "employerContributionPaise" INTEGER NOT NULL DEFAULT 0,
    "manualTdsPaise" INTEGER NOT NULL DEFAULT 0,
    "remarks" TEXT,
    "excluded" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payslips_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payslip_lines" (
    "id" TEXT NOT NULL,
    "payslipId" TEXT NOT NULL,
    "componentId" TEXT,
    "label" TEXT NOT NULL,
    "kind" "SalaryComponentKind" NOT NULL,
    "amountPaise" INTEGER NOT NULL,
    "isStatutory" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "payslip_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "salary_components_code_key" ON "salary_components"("code");

-- CreateIndex
CREATE INDEX "salary_components_kind_sortOrder_idx" ON "salary_components"("kind", "sortOrder");

-- CreateIndex
CREATE INDEX "salary_structures_employeeId_effectiveFrom_idx" ON "salary_structures"("employeeId", "effectiveFrom");

-- CreateIndex
CREATE UNIQUE INDEX "salary_structure_lines_structureId_componentId_key" ON "salary_structure_lines"("structureId", "componentId");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_settings_branchId_key" ON "payroll_settings"("branchId");

-- CreateIndex
CREATE INDEX "payroll_tax_slabs_settingId_sortOrder_idx" ON "payroll_tax_slabs"("settingId", "sortOrder");

-- CreateIndex
CREATE INDEX "payroll_runs_branchId_status_idx" ON "payroll_runs"("branchId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_runs_branchId_year_month_key" ON "payroll_runs"("branchId", "year", "month");

-- CreateIndex
CREATE INDEX "payslips_employeeId_idx" ON "payslips"("employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "payslips_runId_employeeId_key" ON "payslips"("runId", "employeeId");

-- CreateIndex
CREATE INDEX "payslip_lines_payslipId_sortOrder_idx" ON "payslip_lines"("payslipId", "sortOrder");

-- AddForeignKey
ALTER TABLE "salary_structures" ADD CONSTRAINT "salary_structures_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salary_structure_lines" ADD CONSTRAINT "salary_structure_lines_structureId_fkey" FOREIGN KEY ("structureId") REFERENCES "salary_structures"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salary_structure_lines" ADD CONSTRAINT "salary_structure_lines_componentId_fkey" FOREIGN KEY ("componentId") REFERENCES "salary_components"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_settings" ADD CONSTRAINT "payroll_settings_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_tax_slabs" ADD CONSTRAINT "payroll_tax_slabs_settingId_fkey" FOREIGN KEY ("settingId") REFERENCES "payroll_settings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payslips" ADD CONSTRAINT "payslips_runId_fkey" FOREIGN KEY ("runId") REFERENCES "payroll_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payslips" ADD CONSTRAINT "payslips_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payslip_lines" ADD CONSTRAINT "payslip_lines_payslipId_fkey" FOREIGN KEY ("payslipId") REFERENCES "payslips"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payslip_lines" ADD CONSTRAINT "payslip_lines_componentId_fkey" FOREIGN KEY ("componentId") REFERENCES "salary_components"("id") ON DELETE SET NULL ON UPDATE CASCADE;

