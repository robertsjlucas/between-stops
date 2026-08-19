-- Between Stops: administrator review workflow
-- The earliest existing Supabase account becomes the initial administrator.

create table if not exists public.platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);

alter table public.platform_admins enable row level security;

grant select on public.platform_admins to authenticated;

insert into public.platform_admins (user_id, created_by)
select id, id
from auth.users
order by created_at asc
limit 1
on conflict (user_id) do nothing;

drop policy if exists "Admins can view their admin membership"
on public.platform_admins;

create policy "Admins can view their admin membership"
on public.platform_admins
for select
to authenticated
using (user_id = auth.uid());

create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.platform_admins
    where user_id = auth.uid()
  );
$$;

revoke all on function public.is_platform_admin() from public;
grant execute on function public.is_platform_admin() to authenticated;

create table if not exists public.experience_status_history (
  id bigint generated always as identity primary key,
  experience_id uuid not null references public.experiences(id) on delete cascade,
  changed_by uuid references auth.users(id) on delete set null,
  from_status text,
  to_status text not null,
  note text,
  created_at timestamptz not null default now()
);

create index if not exists experience_status_history_experience_idx
on public.experience_status_history (experience_id, created_at desc);

alter table public.experience_status_history enable row level security;

grant select on public.experience_status_history to authenticated;

drop policy if exists "Creators can view their experience history"
on public.experience_status_history;

create policy "Creators can view their experience history"
on public.experience_status_history
for select
to authenticated
using (
  exists (
    select 1
    from public.experiences
    where experiences.id = experience_status_history.experience_id
      and experiences.owner_id = auth.uid()
  )
);

drop policy if exists "Admins can view all experience history"
on public.experience_status_history;

create policy "Admins can view all experience history"
on public.experience_status_history
for select
to authenticated
using (public.is_platform_admin());

drop policy if exists "Admins can view all experiences"
on public.experiences;

create policy "Admins can view all experiences"
on public.experiences
for select
to authenticated
using (public.is_platform_admin());

drop policy if exists "Admins can update all experiences"
on public.experiences;

create policy "Admins can update all experiences"
on public.experiences
for update
to authenticated
using (public.is_platform_admin())
with check (public.is_platform_admin());

drop policy if exists "Creators can update their experiences"
on public.experiences;

create policy "Creators can update their experiences"
on public.experiences
for update
to authenticated
using (
  auth.uid() is not null
  and auth.uid() = owner_id
  and status in ('draft', 'changes_requested')
)
with check (
  auth.uid() is not null
  and auth.uid() = owner_id
  and status in ('draft', 'changes_requested')
);

drop policy if exists "Creators can delete their experiences"
on public.experiences;

create policy "Creators can delete their experiences"
on public.experiences
for delete
to authenticated
using (
  auth.uid() is not null
  and auth.uid() = owner_id
  and status in ('draft', 'changes_requested')
);

drop policy if exists "Admins can view all stories"
on public.stories;

create policy "Admins can view all stories"
on public.stories
for select
to authenticated
using (public.is_platform_admin());

drop policy if exists "Creators can create their stories"
on public.stories;

create policy "Creators can create their stories"
on public.stories
for insert
to authenticated
with check (
  exists (
    select 1
    from public.experiences
    where experiences.id = stories.experience_id
      and experiences.owner_id = auth.uid()
      and experiences.status in ('draft', 'changes_requested')
  )
);

drop policy if exists "Creators can update their stories"
on public.stories;

create policy "Creators can update their stories"
on public.stories
for update
to authenticated
using (
  exists (
    select 1
    from public.experiences
    where experiences.id = stories.experience_id
      and experiences.owner_id = auth.uid()
      and experiences.status in ('draft', 'changes_requested')
  )
)
with check (
  exists (
    select 1
    from public.experiences
    where experiences.id = stories.experience_id
      and experiences.owner_id = auth.uid()
      and experiences.status in ('draft', 'changes_requested')
  )
);

drop policy if exists "Creators can delete their stories"
on public.stories;

create policy "Creators can delete their stories"
on public.stories
for delete
to authenticated
using (
  exists (
    select 1
    from public.experiences
    where experiences.id = stories.experience_id
      and experiences.owner_id = auth.uid()
      and experiences.status in ('draft', 'changes_requested')
  )
);

drop policy if exists "Admins can view all creator profiles"
on public.creator_profiles;

create policy "Admins can view all creator profiles"
on public.creator_profiles
for select
to authenticated
using (public.is_platform_admin());

drop policy if exists "Admins can view review media"
on storage.objects;

create policy "Admins can view review media"
on storage.objects
for select
to authenticated
using (
  public.is_platform_admin()
  and bucket_id in ('story-media', 'tour-media', 'profile-media')
);

create or replace function public.submit_experience_for_review(
  p_experience_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_experience public.experiences%rowtype;
begin
  select *
  into v_experience
  from public.experiences
  where id = p_experience_id;

  if not found or v_experience.owner_id is distinct from auth.uid() then
    raise exception 'Experience not found or access denied.';
  end if;

  if v_experience.status not in ('draft', 'changes_requested') then
    raise exception 'This experience cannot be submitted from its current status.';
  end if;

  if nullif(trim(v_experience.summary), '') is null then
    raise exception 'Add a short summary before submitting.';
  end if;

  if v_experience.cover_image_path is null then
    raise exception 'Add a tour cover image before submitting.';
  end if;

  if coalesce(v_experience.duration_minutes, 0) < 1 then
    raise exception 'Add an approximate duration before submitting.';
  end if;

  if v_experience.rights_confirmed_at is null then
    raise exception 'Confirm the media rights before submitting.';
  end if;

  if not exists (
    select 1
    from public.stories
    where experience_id = p_experience_id
  ) then
    raise exception 'Add at least one Story before submitting.';
  end if;

  if not exists (
    select 1
    from public.creator_profiles
    where id = auth.uid()
      and nullif(trim(display_name), '') is not null
  ) then
    raise exception 'Complete your creator profile before submitting.';
  end if;

  update public.experiences
  set status = 'submitted',
      visibility = 'private',
      published_at = null,
      updated_at = now()
  where id = p_experience_id;

  insert into public.experience_status_history (
    experience_id,
    changed_by,
    from_status,
    to_status
  ) values (
    p_experience_id,
    auth.uid(),
    v_experience.status,
    'submitted'
  );
end;
$$;

revoke all on function public.submit_experience_for_review(uuid) from public;
grant execute on function public.submit_experience_for_review(uuid) to authenticated;

create or replace function public.admin_review_experience(
  p_experience_id uuid,
  p_status text,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_experience public.experiences%rowtype;
begin
  if not public.is_platform_admin() then
    raise exception 'Administrator access required.';
  end if;

  if p_status is null or p_status not in ('approved', 'changes_requested', 'published') then
    raise exception 'Unsupported review status.';
  end if;

  select *
  into v_experience
  from public.experiences
  where id = p_experience_id;

  if not found then
    raise exception 'Experience not found.';
  end if;

  if p_status = 'approved' and v_experience.status not in ('submitted', 'published') then
    raise exception 'Only submitted or published experiences can be approved.';
  end if;

  if p_status = 'changes_requested'
     and v_experience.status not in ('submitted', 'approved') then
    raise exception 'Changes can only be requested during review.';
  end if;

  if p_status = 'changes_requested'
     and nullif(trim(coalesce(p_note, '')), '') is null then
    raise exception 'Add a note explaining the requested changes.';
  end if;

  if p_status = 'published' and v_experience.status <> 'approved' then
    raise exception 'Approve this experience before publishing it.';
  end if;

  update public.experiences
  set status = p_status,
      visibility = case
        when p_status = 'published' then 'public'
        else 'private'
      end,
      published_at = case
        when p_status = 'published' then coalesce(published_at, now())
        else null
      end,
      featured_rank = case
        when p_status = 'published' then featured_rank
        else null
      end,
      updated_at = now()
  where id = p_experience_id;

  insert into public.experience_status_history (
    experience_id,
    changed_by,
    from_status,
    to_status,
    note
  ) values (
    p_experience_id,
    auth.uid(),
    v_experience.status,
    p_status,
    nullif(trim(coalesce(p_note, '')), '')
  );
end;
$$;

revoke all on function public.admin_review_experience(uuid, text, text) from public;
grant execute on function public.admin_review_experience(uuid, text, text) to authenticated;

create or replace function public.admin_set_featured_rank(
  p_experience_id uuid,
  p_featured_rank integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'Administrator access required.';
  end if;

  if p_featured_rank is not null and p_featured_rank < 1 then
    raise exception 'Featured rank must be 1 or higher.';
  end if;

  update public.experiences
  set featured_rank = p_featured_rank,
      updated_at = now()
  where id = p_experience_id
    and status = 'published';

  if not found then
    raise exception 'Only published experiences can be featured.';
  end if;
end;
$$;

revoke all on function public.admin_set_featured_rank(uuid, integer) from public;
grant execute on function public.admin_set_featured_rank(uuid, integer) to authenticated;
