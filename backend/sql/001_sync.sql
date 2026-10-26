-- Run once in the Supabase SQL editor before starting the FINEXT API.
-- The API connects with the server-side DATABASE_URL and scopes every query by user_id.

create sequence if not exists public.sync_seq;

create table if not exists public.sync_rows (
    seq bigint not null default nextval('public.sync_seq'),
    user_id text not null,
    table_name text not null,
    id text not null,
    data jsonb not null,
    updated_at bigint not null,
    deleted_at bigint,
    constraint sync_rows_pkey primary key (user_id, table_name, id)
);

create unique index if not exists sync_rows_seq_key on public.sync_rows (seq);
create index if not exists sync_rows_user_seq_idx on public.sync_rows (user_id, seq);
create index if not exists sync_rows_user_table_idx on public.sync_rows (user_id, table_name);

alter sequence public.sync_seq owned by public.sync_rows.seq;

-- Client apps use Supabase Auth only. Ledger rows are accessed through the authenticated API.
alter table public.sync_rows enable row level security;
revoke all on public.sync_rows from anon, authenticated;
revoke all on sequence public.sync_seq from anon, authenticated;
grant all on public.sync_rows to service_role;
grant usage, select on sequence public.sync_seq to service_role;
