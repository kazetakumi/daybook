# Live recomputation with payment snapshots

Settlements are never stored — every total is recomputed live from marks, rate periods, and cycle configs, and any past day stays editable forever. The only stored money fact is the Payment snapshot ("Mark paid": amount + date); if later edits change a paid cycle's computed total, the UI shows the drift ("computed ₹5,400 / paid ₹5,500") rather than locking days or rewriting history. We chose this over the conventional lock-on-settle because the app's users are one household correcting their own typos: locking would demand an unlock flow with no fraud risk to justify it, while silent recomputation without a snapshot would erase the record of what was actually handed over.

## Consequences

- Marks are stored as exceptions only (Present = no row), so recomputation is always over the full timeline — there is no materialized cycle or day table to drift out of sync.
- The salary computation must be a pure function of (worker, cycle window, marks, rate periods); it will be unit-tested against fixed worked examples.
- History screens must render both the live-computed total and the Payment amount whenever they differ.
