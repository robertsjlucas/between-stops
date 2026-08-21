create table if not exists public.passenger_purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  experience_id uuid not null references public.experiences(id) on delete cascade,

  stripe_checkout_session_id text unique,
  stripe_payment_intent_id text,

  amount_pence integer not null check (amount_pence >= 0),
  currency text not null default 'gbp',

  creator_amount_pence integer not null check (creator_amount_pence >= 0),
  platform_amount_pence integer not null check (platform_amount_pence >= 0),

  status text not null default 'paid'
    check (status in ('paid', 'refunded')),

  purchased_at timestamptz not null default now(),

  unique (user_id, experience_id)
);

alter table public.passenger_purchases enable row level security;

drop policy if exists "Passengers can view own purchases"
  on public.passenger_purchases;

create policy "Passengers can view own purchases"
  on public.passenger_purchases
  for select
  to authenticated
  using (auth.uid() = user_id);

create index if not exists passenger_purchases_user_id_idx
  on public.passenger_purchases(user_id);

create index if not exists passenger_purchases_experience_id_idx
  on public.passenger_purchases(experience_id);
