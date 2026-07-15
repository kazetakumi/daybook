CREATE TABLE workers (
  id                    INTEGER PRIMARY KEY,
  name                  TEXT NOT NULL,
  role                  TEXT,                      -- optional label, e.g. 'Maid'
  joined_on             TEXT NOT NULL,             -- ISO date
  archived_on           TEXT,                      -- ISO date or NULL
  paid_leaves_per_cycle INTEGER NOT NULL DEFAULT 2
);
CREATE TABLE rate_periods (
  id INTEGER PRIMARY KEY, worker_id INTEGER NOT NULL REFERENCES workers(id),
  rate_rupees INTEGER NOT NULL,
  effective_from TEXT NOT NULL                     -- first row = joined_on
);
CREATE TABLE cycle_configs (
  id INTEGER PRIMARY KEY, worker_id INTEGER NOT NULL REFERENCES workers(id),
  start_day INTEGER NOT NULL CHECK (start_day BETWEEN 1 AND 28),
  effective_from TEXT NOT NULL                     -- first row = joined_on
);
CREATE TABLE marks (
  worker_id INTEGER NOT NULL REFERENCES workers(id),
  date TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('leave','off')),
  PRIMARY KEY (worker_id, date)                    -- present = no row
);
CREATE TABLE payments (
  id INTEGER PRIMARY KEY, worker_id INTEGER NOT NULL REFERENCES workers(id),
  period_start TEXT NOT NULL, period_end TEXT NOT NULL,
  amount_rupees INTEGER NOT NULL, paid_on TEXT NOT NULL
);
CREATE TABLE settings ( key TEXT PRIMARY KEY, value TEXT NOT NULL );  -- pin_hash, …
