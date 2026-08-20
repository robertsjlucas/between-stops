-- Privacy-conscious product analytics for starts, completions and destination clicks.

create table if not exists public.tour_analytics_events (
  id bigint generated always as identity primary key,
  event_type text not null check (event_type in ('tour_started', 'tour_completed', 'recommendation_clicked')),
  experience_id uuid not null references public.experiences(id) on delete cascade,
  recommendation_id uuid references public.destination_recommendations(id) on delete set null,
  journey_id uuid,
  user_id uuid references auth.users(id) on delete set null,
  device_token uuid,
  created_at timestamptz not null default now()
);

create index if not exists tour_analytics_event_created_idx
on public.tour_analytics_events (event_type, created_at desc);
create index if not exists tour_analytics_experience_idx
on public.tour_analytics_events (experience_id, created_at desc);
create unique index if not exists tour_analytics_once_per_journey_idx
on public.tour_analytics_events (event_type, journey_id)
where journey_id is not null and event_type in ('tour_started', 'tour_completed');

alter table public.tour_analytics_events enable row level security;
grant select on public.tour_analytics_events to authenticated;

drop policy if exists "Admins can read tour analytics"
on public.tour_analytics_events;
create policy "Admins can read tour analytics"
on public.tour_analytics_events for select to authenticated
using (public.is_platform_admin());

create or replace function public.record_tour_analytics_event(
  p_event_type text,
  p_experience_id uuid,
  p_journey_id uuid default null,
  p_recommendation_id uuid default null,
  p_device_token uuid default null
)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_event_type not in ('tour_started', 'tour_completed', 'recommendation_clicked') then
    raise exception 'Unsupported analytics event.';
  end if;
  if not exists (select 1 from public.experiences where id = p_experience_id) then
    raise exception 'Tour not found.';
  end if;
  if p_event_type = 'recommendation_clicked' and p_recommendation_id is null then
    raise exception 'Recommendation required.';
  end if;

  insert into public.tour_analytics_events
    (event_type, experience_id, recommendation_id, journey_id, user_id, device_token)
  values
    (p_event_type, p_experience_id, p_recommendation_id, p_journey_id, auth.uid(), p_device_token)
  on conflict (event_type, journey_id) where journey_id is not null and event_type in ('tour_started', 'tour_completed')
  do nothing;
end;
$$;

revoke all on function public.record_tour_analytics_event(text, uuid, uuid, uuid, uuid) from public;
grant execute on function public.record_tour_analytics_event(text, uuid, uuid, uuid, uuid) to anon, authenticated;

create or replace function public.admin_reset_tour_analytics()
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_platform_admin() then
    raise exception 'Administrator access required.';
  end if;
  delete from public.tour_analytics_events;
end;
$$;

revoke all on function public.admin_reset_tour_analytics() from public;
grant execute on function public.admin_reset_tour_analytics() to authenticated;

create or replace function public.get_admin_operations_metrics()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_result jsonb;
begin
  if not public.is_platform_admin() then
    raise exception 'Administrator access required.';
  end if;
  select jsonb_build_object(
    'creators', (select count(*) from public.creator_profiles),
    'tours', (select count(*) from public.experiences),
    'published_tours', (select count(*) from public.experiences where status = 'published' and visibility <> 'private'),
    'stories', (select count(*) from public.stories),
    'pending_approvals', (select count(*) from public.experiences where status = 'submitted'),
    'pending_reviews', (select count(*) from public.passenger_reviews where moderation_status = 'pending'),
    'open_reports', (select count(*) from public.platform_reports where status <> 'resolved'),
    'tours_started', (select count(*) from public.tour_analytics_events where event_type = 'tour_started'),
    'tours_completed', (select count(*) from public.tour_analytics_events where event_type = 'tour_completed'),
    'recommendation_clicks', (select count(*) from public.tour_analytics_events where event_type = 'recommendation_clicked'),
    'storage_bytes', coalesce((select sum(coalesce(nullif(metadata ->> 'size', '')::bigint, 0)) from storage.objects), 0),
    'storage_by_bucket', coalesce((select jsonb_object_agg(bucket_id, bytes) from (
      select bucket_id, sum(coalesce(nullif(metadata ->> 'size', '')::bigint, 0)) as bytes
      from storage.objects group by bucket_id
    ) totals), '{}'::jsonb)
  ) into v_result;
  return v_result;
end;
$$;

revoke all on function public.get_admin_operations_metrics() from public;
grant execute on function public.get_admin_operations_metrics() to authenticated;
