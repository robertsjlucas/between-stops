-- Between Stops: stable public URLs and audio-first Stories

alter table public.experiences
  add column if not exists slug text;

create or replace function public.make_experience_slug(
  p_title text,
  p_id uuid
)
returns text
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    nullif(
      trim(both '-' from regexp_replace(lower(coalesce(p_title, 'tour')), '[^a-z0-9]+', '-', 'g')),
      ''
    ),
    'tour'
  ) || '-' || left(p_id::text, 8)
$$;

update public.experiences
set slug = public.make_experience_slug(title, id)
where slug is null or trim(slug) = '';

create unique index if not exists experiences_slug_unique_idx
on public.experiences (slug);

create or replace function public.set_experience_slug()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.slug is null or trim(new.slug) = '' then
    new.slug := public.make_experience_slug(new.title, new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists set_experience_slug_before_insert
on public.experiences;

create trigger set_experience_slug_before_insert
before insert on public.experiences
for each row execute function public.set_experience_slug();

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
  select * into v_experience
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
    select 1 from public.stories
    where experience_id = p_experience_id
  ) then
    raise exception 'Add at least one Story before submitting.';
  end if;

  if exists (
    select 1 from public.stories
    where experience_id = p_experience_id
      and audio_path is null
  ) then
    raise exception 'Every Story needs an audio file before submitting.';
  end if;

  if not exists (
    select 1 from public.creator_profiles
    where id = auth.uid()
      and nullif(trim(display_name), '') is not null
  ) then
    raise exception 'Complete your creator profile before submitting.';
  end if;

  update public.experiences
  set status = 'submitted',
      visibility = 'private',
      published_at = null,
      slug = coalesce(slug, public.make_experience_slug(title, id)),
      updated_at = now()
  where id = p_experience_id;

  insert into public.experience_status_history (
    experience_id, changed_by, from_status, to_status
  ) values (
    p_experience_id, auth.uid(), v_experience.status, 'submitted'
  );
end;
$$;

revoke all on function public.submit_experience_for_review(uuid) from public;
grant execute on function public.submit_experience_for_review(uuid) to authenticated;
