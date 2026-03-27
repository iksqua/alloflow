-- supabase/migrations/20260327000002_fiscal_journal.sql

create table public.fiscal_journal_entries (
  id               uuid primary key default gen_random_uuid(),
  establishment_id uuid not null references public.establishments(id) on delete cascade,
  sequence_no      bigint not null,                            -- monotonically increasing per establishment
  event_type       text not null check (event_type in ('sale', 'void', 'refund', 'z_close')),
  order_id         uuid references public.orders(id),         -- null for z_close
  amount_ttc       numeric(10,2) not null default 0,
  cashier_id       uuid references auth.users(id),
  occurred_at      timestamptz not null default now(),
  previous_hash    text not null default '',                   -- '' for sequence_no = 1
  entry_hash       text not null,                             -- SHA-256 chain hash
  meta             jsonb                                       -- extra context (session_id, etc.)
);

-- sequence_no is unique per establishment
create unique index fiscal_journal_establishment_seq
  on public.fiscal_journal_entries(establishment_id, sequence_no);

create index fiscal_journal_establishment_time
  on public.fiscal_journal_entries(establishment_id, occurred_at desc);

-- RLS: read-only for establishment members, no UPDATE/DELETE allowed
alter table public.fiscal_journal_entries enable row level security;

create policy "fiscal_journal_select"
  on public.fiscal_journal_entries for select
  using (
    establishment_id in (
      select establishment_id from public.profiles where id = auth.uid()
    )
  );

-- INSERT only (no update/delete — immutable journal)
create policy "fiscal_journal_insert"
  on public.fiscal_journal_entries for insert
  with check (
    establishment_id in (
      select establishment_id from public.profiles where id = auth.uid()
    )
  );
