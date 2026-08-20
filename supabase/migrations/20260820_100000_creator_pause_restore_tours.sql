-- Creators may take a published tour offline without deleting its publication
-- history. Restoring an unchanged tour is immediate; editing returns it to the
-- normal draft -> admin review -> published workflow.

create or replace function public.creator_pause_experience(
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
  select * into v_experience
  from public.experiences
  where id = p_experience_id;

  if not found or v_experience.owner_id is distinct from auth.uid() then
    raise exception 'Experience not found or access denied.';
  end if;

  if v_experience.status <> 'published' then
    raise exception 'Only a published tour can be paused.';
  end if;

  update public.experiences
  set status = 'paused',
      visibility = 'private',
      featured_rank = null,
      updated_at = now()
  where id = p_experience_id;

  insert into public.experience_status_history (
    experience_id, changed_by, from_status, to_status, note
  ) values (
    p_experience_id, auth.uid(), 'published', 'paused',
    'Taken offline by creator'
  );
end;
$$;

create or replace function public.creator_restore_paused_experience(
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
  select * into v_experience
  from public.experiences
  where id = p_experience_id;

  if not found or v_experience.owner_id is distinct from auth.uid() then
    raise exception 'Experience not found or access denied.';
  end if;

  if v_experience.status <> 'paused' then
    raise exception 'Only a paused tour can be restored.';
  end if;

  update public.experiences
  set status = 'published',
      visibility = 'public',
      published_at = coalesce(published_at, now()),
      updated_at = now()
  where id = p_experience_id;

  insert into public.experience_status_history (
    experience_id, changed_by, from_status, to_status, note
  ) values (
    p_experience_id, auth.uid(), 'paused', 'published',
    'Unchanged tour restored by creator'
  );
end;
$$;

create or replace function public.creator_edit_paused_experience(
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
  select * into v_experience
  from public.experiences
  where id = p_experience_id;

  if not found or v_experience.owner_id is distinct from auth.uid() then
    raise exception 'Experience not found or access denied.';
  end if;

  if v_experience.status <> 'paused' then
    raise exception 'Only a paused tour can be returned to draft.';
  end if;

  update public.experiences
  set status = 'draft',
      visibility = 'private',
      published_at = null,
      featured_rank = null,
      updated_at = now()
  where id = p_experience_id;

  insert into public.experience_status_history (
    experience_id, changed_by, from_status, to_status, note
  ) values (
    p_experience_id, auth.uid(), 'paused', 'draft',
    'Returned to draft for editing by creator'
  );
end;
$$;

revoke all on function public.creator_pause_experience(uuid) from public;
revoke all on function public.creator_restore_paused_experience(uuid) from public;
revoke all on function public.creator_edit_paused_experience(uuid) from public;

grant execute on function public.creator_pause_experience(uuid) to authenticated;
grant execute on function public.creator_restore_paused_experience(uuid) to authenticated;
grant execute on function public.creator_edit_paused_experience(uuid) to authenticated;
