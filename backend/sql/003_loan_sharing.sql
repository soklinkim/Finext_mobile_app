-- Run once in the Supabase SQL editor (after 002_business_documents.sql).
-- Consent-based sharing of an SME's loan-readiness data with partner banks.

-- Partner banks / MFIs that SMEs can share with. Added by an admin (scripts/add_lender.py).
create table if not exists public.lenders (
    id uuid primary key default gen_random_uuid(),
    name text not null unique,
    active boolean not null default true,
    created_at bigint not null
);

-- Bank staff: Supabase Auth users who may use the lender portal for one lender.
create table if not exists public.lender_members (
    user_id text primary key,
    lender_id uuid not null references public.lenders (id) on delete cascade,
    created_at bigint not null
);

-- One SME's consent for one lender to see the chosen parts of its data until it expires or is revoked.
create table if not exists public.loan_shares (
    id uuid primary key default gen_random_uuid(),
    sme_user_id text not null,
    lender_id uuid not null references public.lenders (id) on delete cascade,
    scopes text[] not null,
    created_at bigint not null,
    expires_at bigint not null,
    revoked_at bigint,
    -- Set by the lender in the portal; shown back to the SME.
    decision text not null default 'new' check (decision in ('new', 'reviewing', 'approved', 'declined')),
    decision_note text,
    decided_at bigint,
    -- Latest readiness result, so the lender's applicant list doesn't recompute every SME.
    -- Refreshed when the SME or the lender opens the full report.
    readiness_score integer,
    readiness_level text,
    readiness_at bigint
);
create index if not exists loan_shares_sme_idx on public.loan_shares (sme_user_id);
create index if not exists loan_shares_lender_idx on public.loan_shares (lender_id);
-- At most one live consent per SME and lender; sharing again updates it.
create unique index if not exists loan_shares_one_active_idx
    on public.loan_shares (sme_user_id, lender_id) where revoked_at is null;

-- Audit trail: every time lender staff open an SME's report.
create table if not exists public.loan_share_views (
    share_id uuid not null references public.loan_shares (id) on delete cascade,
    viewer_user_id text not null,
    viewed_at bigint not null
);
create index if not exists loan_share_views_share_idx on public.loan_share_views (share_id, viewed_at desc);

-- Same access model as the other tables: only the API (service role) reads or writes.
alter table public.lenders enable row level security;
alter table public.lender_members enable row level security;
alter table public.loan_shares enable row level security;
alter table public.loan_share_views enable row level security;
revoke all on public.lenders, public.lender_members, public.loan_shares, public.loan_share_views from anon, authenticated;
grant all on public.lenders, public.lender_members, public.loan_shares, public.loan_share_views to service_role;

-- When the lender first marked the application "reviewing" (decided_at is the latest decision),
-- so the SME's progress line can show Shared → Viewed → Under review → Decision with dates.
alter table public.loan_shares add column if not exists reviewing_at bigint;
