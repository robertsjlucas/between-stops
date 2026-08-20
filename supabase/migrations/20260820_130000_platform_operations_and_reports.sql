-- Lightweight operations dashboard and user-submitted issue/idea reports.

create table if not exists public.platform_reports (
  id uuid primary key default gen_random_uuid(),
  report_type text not null check (report_type in ('issue', 'idea', 'error')),
  message text not null,
  page_url text,
  reporter_email text,
  reported_by uuid references auth.users(id) on delete set null,
  context jsonb not null default '{}'::jsonb,
  status text not null default 'new' check (status in ('new', 'in_progress', 'resolved')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists platform_reports_status_created_idx
on public.platform_reports (status, created_at desc);

alter table public.platform_reports enable row level security;
grant select, update on public.platform_reports to authenticated;

drop policy if exists "Admins can read platform reports"
on public.platform_reports;
create policy "Admins can read platform reports"
on public.platform_reports for select to authenticated
using (public.is_platform_admin());

drop policy if exists "Admins can update platform reports"
on public.platform_reports;
create policy "Admins can update platform reports"
on public.platform_reports for update to authenticated
using (public.is_platform_admin())
with check (public.is_platform_admin());

create or replace function public.submit_platform_report(
  p_report_type text,
  p_message text,
  p_page_url text default null,
  p_reporter_email text default null,
  p_context jsonb default '{}'::jsonb
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if p_report_type not in ('issue', 'idea', 'error') then
    raise exception 'Unsupported report type.';
  end if;
  if char_length(trim(coalesce(p_message, ''))) < 10 then
    raise exception 'Please add a little more detail.';
  end if;
  if char_length(p_message) > 2000 then
    raise exception 'Report is too long.';
  end if;

  insert into public.platform_reports
    (report_type, message, page_url, reporter_email, reported_by, context)
  values
    (p_report_type, trim(p_message), left(p_page_url, 500),
     nullif(left(trim(coalesce(p_reporter_email, '')), 320), ''),
     auth.uid(), coalesce(p_context, '{}'::jsonb))
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.submit_platform_report(text, text, text, text, jsonb) from public;
grant execute on function public.submit_platform_report(text, text, text, text, jsonb) to anon, authenticated;

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
    'storage_bytes', coalesce((select sum(coalesce(nullif(metadata ->> 'size', '')::bigint, 0)) from storage.objects), 0),
    'storage_by_bucket', coalesce((
      select jsonb_object_agg(bucket_id, bytes)
      from (
        select bucket_id, sum(coalesce(nullif(metadata ->> 'size', '')::bigint, 0)) as bytes
        from storage.objects group by bucket_id
      ) totals
    ), '{}'::jsonb)
  ) into v_result;
  return v_result;
end;
$$;

revoke all on function public.get_admin_operations_metrics() from public;
grant execute on function public.get_admin_operations_metrics() to authenticated;
