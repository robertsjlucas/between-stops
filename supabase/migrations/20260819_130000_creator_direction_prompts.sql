-- Between Stops: reusable creator-recorded left/right direction prompts.

alter table public.creator_profiles
  add column if not exists left_prompt_path text,
  add column if not exists left_prompt_filename text,
  add column if not exists left_prompt_mime_type text,
  add column if not exists left_prompt_size_bytes bigint,
  add column if not exists right_prompt_path text,
  add column if not exists right_prompt_filename text,
  add column if not exists right_prompt_mime_type text,
  add column if not exists right_prompt_size_bytes bigint;

-- Profile media now holds the avatar plus two short guide voice recordings.
update storage.buckets
set
  file_size_limit = 26214400,
  allowed_mime_types = array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'audio/mpeg',
    'audio/mp4',
    'audio/x-m4a',
    'audio/wav',
    'audio/x-wav'
  ]
where id = 'profile-media';

drop policy if exists "Public can view published creator avatars"
on storage.objects;

drop policy if exists "Public can view published creator media"
on storage.objects;

create policy "Public can view published creator media"
on storage.objects
for select
to anon, authenticated
using (
  bucket_id = 'profile-media'
  and exists (
    select 1
    from public.creator_profiles
    where creator_profiles.id::text = (storage.foldername(storage.objects.name))[1]
      and storage.objects.name in (
        creator_profiles.avatar_path,
        creator_profiles.left_prompt_path,
        creator_profiles.right_prompt_path
      )
      and creator_profiles.is_public
      and exists (
        select 1
        from public.experiences
        where experiences.owner_id = creator_profiles.id
          and experiences.status = 'published'
          and experiences.published_at is not null
          and experiences.visibility in ('public', 'unlisted')
      )
  )
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

  if exists (
    select 1 from public.stories
    where experience_id = p_experience_id
      and story_type = 'look'
  ) and not exists (
    select 1 from public.creator_profiles
    where id = auth.uid()
      and left_prompt_path is not null
      and right_prompt_path is not null
  ) then
    raise exception 'Upload both guide voice prompts before submitting a tour with Something to spot Stories.';
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
