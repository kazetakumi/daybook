# Daybook

**Daybook** (the app's name) tracks daily attendance of household workers and computes each pay cycle's salary from a daily rate, a paid-leave quota, and employer-initiated half-pay days.

## Language

**Worker**:
A household employee (maid, cook, …) with a joining date, a Rate, a Cycle start day, and a Paid-leave quota.
_Avoid_: employee, staff, maid (as a model term)

**Present**:
The default state of a worker-day: the worker came and earns a full day's Rate. Present days are implicit — they exist as the absence of a Mark.
_Avoid_: worked, attended

**Leave**:
A worker-initiated non-arrival. Classified per cycle into Paid leave or Unpaid leave against the quota.
_Avoid_: absent, absence

**Off**:
An employer-initiated non-arrival ("don't come today"), paid at half the day's Rate. Does not consume the quota.
_Avoid_: holiday, employer-leave, sent off

**Mark**:
A stored exception (Leave or Off) on a worker-day. Marking a day back to Present removes the Mark.
_Avoid_: entry, attendance record

**Paid leave / Unpaid leave**:
The per-cycle classification of Leaves: the earliest Leave dates up to the quota are Paid (full Rate), the rest Unpaid (nothing). Recomputed live whenever days change.

**Paid-leave quota**:
How many Leaves per Cycle are paid, set per Worker (default 2). Applies in full even to Stub cycles.
_Avoid_: leave balance, allowance

**Rate**:
A Worker's pay in whole rupees per day. Changes take an effective-from date, so a cycle can span two Rates.
_Avoid_: salary (that's the cycle total), wage

**Cycle**:
A pay period running from its start day D (1–28) through the day before the next D. The unit of settlement and quota reset.
_Avoid_: month, period

**Stub cycle**:
A shortened Cycle bridging a Worker's joining date, or a change of Cycle start day, to the next regular boundary. Carries the full quota.
_Avoid_: partial cycle, pro-rata cycle

**Settlement**:
The live-computed breakdown (Present / Paid leave / Unpaid leave / Off counts and amounts) and total for one Worker-Cycle. The final total rounds half-rupees up.
_Avoid_: payslip, invoice

**Payment**:
The recorded fact of settling a Cycle: the amount actually paid and the date, snapshotted by "Mark paid". Never blocks later day edits.
_Avoid_: settlement (that's the computation)

**Drift**:
A visible mismatch between a Cycle's Payment and its currently computed Settlement total, caused by day edits after payday. Displayed, never silently reconciled.

**Archive**:
Retiring a departed Worker: hidden from daily marking, history and Payments kept forever. Workers are never deleted.
_Avoid_: delete, remove
