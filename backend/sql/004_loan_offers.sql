-- Run once in the Supabase SQL editor (after 003_loan_sharing.sql).
-- Two-sided loan decisions: when a bank approves, it makes an offer; the business then accepts or declines it.

-- The bank's offer, set together with decision = 'approved' (empty for any other decision).
alter table public.loan_shares add column if not exists offer_amount numeric(14, 2);
alter table public.loan_shares add column if not exists offer_currency text;
alter table public.loan_shares add column if not exists offer_rate numeric(6, 3);          -- annual interest, %
alter table public.loan_shares add column if not exists offer_term_months integer;

-- The business's answer to that offer. Once it has answered, the bank's decision is final.
alter table public.loan_shares add column if not exists sme_response text;
alter table public.loan_shares add column if not exists sme_response_note text;
alter table public.loan_shares add column if not exists sme_responded_at bigint;

do $$
begin
    if not exists (select 1 from pg_constraint where conname = 'loan_shares_offer_currency_check') then
        alter table public.loan_shares add constraint loan_shares_offer_currency_check
            check (offer_currency is null or offer_currency in ('USD', 'KHR'));
    end if;
    if not exists (select 1 from pg_constraint where conname = 'loan_shares_sme_response_check') then
        alter table public.loan_shares add constraint loan_shares_sme_response_check
            check (sme_response is null or sme_response in ('accepted', 'declined'));
    end if;
end $$;
