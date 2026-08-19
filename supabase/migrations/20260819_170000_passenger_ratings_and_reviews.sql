-- Between Stops: completion-gated passenger ratings and moderated reviews.

create table if not exists public.passenger_reviews (
  id uuid primary key default gen_random_uuid(),
  experience_id uuid not null references public.experiences(id) on delete cascade,
  device_token text not null,
  rating smallint not null check (rating between 1 and 5),
  review_text text not null default '' check (char_length(review_text) <= 500),
  moderation_status text not null default 'pending'
    check (moderation_status in ('pending', 'approved', 'hidden')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (experience_id, device_token)
);

create index if not exists passenger_reviews_experience_idx
on public.passenger_reviews (experience_id, created_at desc);

create index if not exists passenger_reviews_moderation_idx
on public.passenger_reviews (moderation_status, created_at desc);

alter table public.passenger_reviews enable row level security;

grant insert on public.passenger_reviews to anon, authenticated;
grant select, update, delete on public.passenger_reviews to authenticated;

drop policy if exists "Passengers can submit ratings for published tours"
on public.passenger_reviews;

create policy "Passengers can submit ratings for published tours"
on public.passenger_reviews
for insert
to anon, authenticated
with check (
  char_length(device_token) between 16 and 100
  and moderation_status = case
    when review_text = '' then 'approved'
    else 'pending'
  end
  and exists (
    select 1
    from public.experiences
    where experiences.id = passenger_reviews.experience_id
      and experiences.status = 'published'
      and experiences.visibility = 'public'
  )
);

drop policy if exists "Admins can view passenger reviews"
on public.passenger_reviews;

create policy "Admins can view passenger reviews"
on public.passenger_reviews
for select
to authenticated
using (public.is_platform_admin());

drop policy if exists "Admins can moderate passenger reviews"
on public.passenger_reviews;

create policy "Admins can moderate passenger reviews"
on public.passenger_reviews
for update
to authenticated
using (public.is_platform_admin())
with check (public.is_platform_admin());

drop policy if exists "Admins can delete passenger reviews"
on public.passenger_reviews;

create policy "Admins can delete passenger reviews"
on public.passenger_reviews
for delete
to authenticated
using (public.is_platform_admin());

create or replace function public.get_public_experience_ratings()
returns table (
  experience_id uuid,
  average_rating numeric,
  review_count bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    passenger_reviews.experience_id,
    round(avg(passenger_reviews.rating)::numeric, 1) as average_rating,
    count(*) as review_count
  from public.passenger_reviews
  join public.experiences
    on experiences.id = passenger_reviews.experience_id
  where experiences.status = 'published'
    and experiences.visibility = 'public'
  group by passenger_reviews.experience_id;
$$;

revoke all on function public.get_public_experience_ratings() from public;
grant execute on function public.get_public_experience_ratings()
to anon, authenticated;

create or replace function public.get_public_experience_reviews(
  p_experience_id uuid
)
returns table (
  id uuid,
  rating smallint,
  review_text text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    passenger_reviews.id,
    passenger_reviews.rating,
    passenger_reviews.review_text,
    passenger_reviews.created_at
  from public.passenger_reviews
  join public.experiences
    on experiences.id = passenger_reviews.experience_id
  where passenger_reviews.experience_id = p_experience_id
    and passenger_reviews.moderation_status = 'approved'
    and passenger_reviews.review_text <> ''
    and experiences.status = 'published'
    and experiences.visibility = 'public'
  order by passenger_reviews.created_at desc
  limit 20;
$$;

revoke all on function public.get_public_experience_reviews(uuid) from public;
grant execute on function public.get_public_experience_reviews(uuid)
to anon, authenticated;

comment on table public.passenger_reviews is
  'Passenger star ratings and optional written reviews submitted after local journey completion.';
