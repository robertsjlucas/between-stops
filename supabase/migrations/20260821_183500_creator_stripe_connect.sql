-- Between Stops: Stripe Connect state for creators.
-- A Stripe account is created only when a creator needs payouts for a paid tour.

begin;

alter table public.creator_profiles
  add column if not exists stripe_account_id text,
  add column if not exists stripe_onboarding_complete boolean not null default false,
  add column if not exists stripe_charges_enabled boolean not null default false,
  add column if not exists stripe_payouts_enabled boolean not null default false;

create unique index if not exists creator_profiles_stripe_account_id_key
  on public.creator_profiles (stripe_account_id)
  where stripe_account_id is not null;

commit;
