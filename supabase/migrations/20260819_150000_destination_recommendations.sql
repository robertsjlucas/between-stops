-- Between Stops: simple admin-managed destination recommendations.

create table if not exists public.destination_recommendations (
  id uuid primary key default gen_random_uuid(),
  route_id text not null,
  stop_id text not null,
  title text not null check (char_length(trim(title)) between 1 and 120),
  category text not null default 'Things to do',
  summary text not null default '',
  url text not null,
  placement_type text not null default 'editorial'
    check (placement_type in ('editorial', 'sponsored')),
  display_order integer not null default 100,
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists destination_recommendations_lookup_idx
on public.destination_recommendations (
  route_id,
  stop_id,
  is_active,
  display_order
);

alter table public.destination_recommendations enable row level security;

grant select on public.destination_recommendations to anon, authenticated;
grant insert, update, delete on public.destination_recommendations to authenticated;

drop policy if exists "Anyone can view active destination recommendations"
on public.destination_recommendations;

create policy "Anyone can view active destination recommendations"
on public.destination_recommendations
for select
to anon, authenticated
using (
  is_active
);

drop policy if exists "Admins can view all destination recommendations"
on public.destination_recommendations;

create policy "Admins can view all destination recommendations"
on public.destination_recommendations
for select
to authenticated
using (public.is_platform_admin());

drop policy if exists "Admins can add destination recommendations"
on public.destination_recommendations;

create policy "Admins can add destination recommendations"
on public.destination_recommendations
for insert
to authenticated
with check (
  public.is_platform_admin()
  and created_by = auth.uid()
);

drop policy if exists "Admins can update destination recommendations"
on public.destination_recommendations;

create policy "Admins can update destination recommendations"
on public.destination_recommendations
for update
to authenticated
using (public.is_platform_admin())
with check (public.is_platform_admin());

drop policy if exists "Admins can delete destination recommendations"
on public.destination_recommendations;

create policy "Admins can delete destination recommendations"
on public.destination_recommendations
for delete
to authenticated
using (public.is_platform_admin());
