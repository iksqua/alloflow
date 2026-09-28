-- Remove the user-session INSERT policy on fiscal_journal_entries.
-- Inserts are now performed exclusively via the service role key (server-side only),
-- so authenticated browser clients cannot forge journal entries directly.
-- The service role bypasses RLS and is unaffected by this change.

drop policy if exists "fiscal_journal_insert" on public.fiscal_journal_entries;
