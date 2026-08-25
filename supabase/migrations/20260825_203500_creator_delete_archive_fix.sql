-- Reliable creator deletion / retirement.
--
-- Creator-facing DELETE/UPDATE RLS is intentionally restrictive,
-- so lifecycle actions that are allowed by the product should happen
-- through owner-checked security-definer functions instead of relying
-- on a client mutation that may affect zero rows silently.

create or replace function public.creator_archive_experience(
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

  if not found
     or v_experience.owner_id is distinct from auth.uid() then
    raise exception 'Experience not found or access denied.';
  end if;

  update public.experiences
  set
    status = 'archived',
    visibility = 'private',
    featured_rank = null,
    updated_at = now()
  where id = p_experience_id;

  insert into public.experience_status_history (
    experience_id,
    changed_by,
    from_status,
    to_status,
    note
  )
  values (
    p_experience_id,
    auth.uid(),
    v_experience.status,
    'archived',
    'Retired by creator'
  );
end;
$$;


create or replace function public.creator_delete_experience(
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

  if not found
     or v_experience.owner_id is distinct from auth.uid() then
    raise exception 'Experience not found or access denied.';
  end if;

  if exists (
    select 1
    from public.passenger_purchases
    where experience_id = p_experience_id
  )
  or exists (
    select 1
    from public.creator_tips
    where experience_id = p_experience_id
  )
  or exists (
    select 1
    from public.passenger_reviews
    where experience_id = p_experience_id
  )
  or exists (
    select 1
    from public.tour_analytics_events
    where experience_id = p_experience_id
  ) then
    raise exception
      'This experience has passenger or payment history and must be retired instead of deleted.';
  end if;

  delete from public.experiences
  where id = p_experience_id;

  if not found then
    raise exception 'The experience could not be deleted.';
  end if;
end;
$$;


revoke all
on function public.creator_archive_experience(uuid)
from public;

revoke all
on function public.creator_delete_experience(uuid)
from public;

grant execute
on function public.creator_archive_experience(uuid)
to authenticated;

grant execute
on function public.creator_delete_experience(uuid)
to authenticated;
