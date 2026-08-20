-- Optional passenger accounts initially provide cross-device favourites.

create table if not exists public.passenger_favourites (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  experience_id uuid not null references public.experiences(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, experience_id)
);

alter table public.passenger_favourites enable row level security;

grant select, insert, delete on public.passenger_favourites to authenticated;

drop policy if exists "Passengers can read their favourites"
on public.passenger_favourites;
create policy "Passengers can read their favourites"
on public.passenger_favourites for select to authenticated
using (user_id = auth.uid());

drop policy if exists "Passengers can add their favourites"
on public.passenger_favourites;
create policy "Passengers can add their favourites"
on public.passenger_favourites for insert to authenticated
with check (user_id = auth.uid());

drop policy if exists "Passengers can remove their favourites"
on public.passenger_favourites;
create policy "Passengers can remove their favourites"
on public.passenger_favourites for delete to authenticated
using (user_id = auth.uid());
