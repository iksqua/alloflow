-- Prevent TOCTOU race: two concurrent POST /api/cash-sessions calls could both
-- find no existing open session and both INSERT one, producing two open sessions
-- per establishment. A partial unique index enforces the one-open-session invariant
-- at the DB level so the second INSERT fails with a unique-violation error.
CREATE UNIQUE INDEX IF NOT EXISTS unique_open_cash_session_per_establishment
  ON cash_sessions (establishment_id)
  WHERE status = 'open';
