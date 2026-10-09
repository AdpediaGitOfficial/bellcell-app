-- A PAID half-day leave previously had to be recorded as HALF_DAY, which
-- carries 0.5 days of loss of pay — the opposite of what paid leave means.
-- Found while building the leave module, from its own status-mapping table.
ALTER TYPE "StaffAttendanceStatus" ADD VALUE 'PAID_HALF_DAY';
