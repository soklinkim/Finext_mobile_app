-- Run once in the Supabase SQL editor (after 001_sync.sql).
-- Business registration documents uploaded from Edit Profile; one current file per kind per user.

create table if not exists public.business_documents (
    user_id text not null,
    kind text not null check (kind in ('patent_tax', 'certificate_of_incorporation')),
    file_name text not null,
    content_type text not null,
    size_bytes integer not null,
    content bytea not null,
    uploaded_at bigint not null,
    constraint business_documents_pkey primary key (user_id, kind)
);

-- Same access model as sync_rows: only the API (service role) reads or writes documents.
alter table public.business_documents enable row level security;
revoke all on public.business_documents from anon, authenticated;
grant all on public.business_documents to service_role;
