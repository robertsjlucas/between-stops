-- Between Stops: marketplace foundation
-- Safe additive migration for the existing experiences and stories tables.
-- Run this whole file once in the Supabase SQL Editor.

begin;

-- ---------------------------------------------------------------------------
-- Creator profiles
-- ---------------------------------------------------------------------------

create table if not exists public.creator_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  bio text not null default '',
  avatar_path text,
  avatar_filename text,
  avatar_mime_type text,
  avatar_size_bytes bigint,
  is_public boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.creator_profiles enable row level security;

-- ---------------------------------------------------------------------------
-- Passenger-facing tour information
-- ---------------------------------------------------------------------------

alter table public.experiences
  add column if not exists slug text,
  add column if not exists summary text not null default '',
  add column if not exists description text not null default '',
  add column if not exists cover_image_path text,
  add column if not exists cover_image_filename text,
  add column if not exists cover_image_mime_type text,
  add column if not exists cover_image_size_bytes bigint,
  add column if not exists duration_minutes integer,
  add column if not exists start_longitude double precision,
  add column if not exists start_latitude double precision,
  add column if not exists visibility text not null default 'private',
  add column if not exists featured_rank integer,
  add column if not exists access_type text not null default 'free',
  add column if not exists price_pence integer,
  add column if not exists currency text not null default 'GBP',
  add column if not exists language_code text not null default 'en-GB',
  add column if not exists published_at timestamptz,
  add column if not exists rights_confirmed_at timestamptz;

create unique index if not exists experiences_slug_unique
  on public.experiences (lower(slug))
  where slug is not null;

create index if not exists experiences_public_catalogue_idx
  on public.experiences (status, visibility, featured_rank, published_at desc);

create index if not exists experiences_owner_id_idx
  on public.experiences (owner_id);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'experiences_visibility_check'
      and conrelid = 'public.experiences'::regclass
  ) then
    alter table public.experiences
      add constraint experiences_visibility_check
      check (visibility in ('private', 'unlisted', 'public'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'experiences_access_type_check'
      and conrelid = 'public.experiences'::regclass
  ) then
    alter table public.experiences
      add constraint experiences_access_type_check
      check (access_type in ('free', 'paid', 'sponsored'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'experiences_duration_minutes_check'
      and conrelid = 'public.experiences'::regclass
  ) then
    alter table public.experiences
      add constraint experiences_duration_minutes_check
      check (duration_minutes is null or duration_minutes > 0);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'experiences_price_pence_check'
      and conrelid = 'public.experiences'::regclass
  ) then
    alter table public.experiences
      add constraint experiences_price_pence_check
      check (price_pence is null or price_pence >= 0);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'experiences_start_longitude_check'
      and conrelid = 'public.experiences'::regclass
  ) then
    alter table public.experiences
      add constraint experiences_start_longitude_check
      check (start_longitude is null or start_longitude between -180 and 180);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'experiences_start_latitude_check'
      and conrelid = 'public.experiences'::regclass
  ) then
    alter table public.experiences
      add constraint experiences_start_latitude_check
      check (start_latitude is null or start_latitude between -90 and 90);
  end if;
end
$$;

-- Audio transcripts are distinct from the creator's working notes.
alter table public.stories
  add column if not exists transcript text not null default '',
  add column if not exists content_warning text not null default '';

-- ---------------------------------------------------------------------------
-- Updated-at support for creator profiles
-- ---------------------------------------------------------------------------

create or replace function public.touch_creator_profile_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists creator_profiles_touch_updated_at
  on public.creator_profiles;

create trigger creator_profiles_touch_updated_at
before update on public.creator_profiles
for each row
execute function public.touch_creator_profile_updated_at();

-- ---------------------------------------------------------------------------
-- Creator profile policies
-- ---------------------------------------------------------------------------

drop policy if exists "Creators can create their profile"
  on public.creator_profiles;
create policy "Creators can create their profile"
  on public.creator_profiles
  for insert
  to authenticated
  with check (auth.uid() is not null and auth.uid() = id);

drop policy if exists "Creators can view their profile"
  on public.creator_profiles;
create policy "Creators can view their profile"
  on public.creator_profiles
  for select
  to authenticated
  using (auth.uid() is not null and auth.uid() = id);

drop policy if exists "Creators can update their profile"
  on public.creator_profiles;
create policy "Creators can update their profile"
  on public.creator_profiles
  for update
  to authenticated
  using (auth.uid() is not null and auth.uid() = id)
  with check (auth.uid() is not null and auth.uid() = id);

-- ---------------------------------------------------------------------------
-- Public catalogue policies
--
-- Unlisted tours are readable by direct link but should be excluded from the
-- catalogue query in the application. Private drafts remain owner-only.
-- ---------------------------------------------------------------------------

drop policy if exists "Public can view published experiences"
  on public.experiences;
create policy "Public can view published experiences"
  on public.experiences
  for select
  to anon, authenticated
  using (
    status = 'published'
    and published_at is not null
    and visibility in ('public', 'unlisted')
  );

drop policy if exists "Public can view stories in published experiences"
  on public.stories;
create policy "Public can view stories in published experiences"
  on public.stories
  for select
  to anon, authenticated
  using (
    exists (
      select 1
      from public.experiences
      where experiences.id = stories.experience_id
        and experiences.status = 'published'
        and experiences.published_at is not null
        and experiences.visibility in ('public', 'unlisted')
    )
  );

drop policy if exists "Public can view profiles for published experiences"
  on public.creator_profiles;
create policy "Public can view profiles for published experiences"
  on public.creator_profiles
  for select
  to anon, authenticated
  using (
    is_public
    and exists (
      select 1
      from public.experiences
      where experiences.owner_id = creator_profiles.id
        and experiences.status = 'published'
        and experiences.published_at is not null
        and experiences.visibility in ('public', 'unlisted')
    )
  );

-- ---------------------------------------------------------------------------
-- Private media buckets
-- ---------------------------------------------------------------------------

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values
  (
    'tour-media',
    'tour-media',
    false,
    10485760,
    array['image/jpeg', 'image/png', 'image/webp']
  ),
  (
    'profile-media',
    'profile-media',
    false,
    5242880,
    array['image/jpeg', 'image/png', 'image/webp']
  )
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Tour cover uploads use: owner-id / experience-id / cover.ext

drop policy if exists "Creators can upload their tour media"
  on storage.objects;
create policy "Creators can upload their tour media"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'tour-media'
    and (storage.foldername(name))[1] = auth.uid()::text
    and exists (
      select 1
      from public.experiences
      where experiences.id::text = (storage.foldername(name))[2]
        and experiences.owner_id = auth.uid()
    )
  );

drop policy if exists "Creators can view their tour media"
  on storage.objects;
create policy "Creators can view their tour media"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'tour-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Creators can update their tour media"
  on storage.objects;
create policy "Creators can update their tour media"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'tour-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'tour-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Creators can delete their tour media"
  on storage.objects;
create policy "Creators can delete their tour media"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'tour-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Public can view published tour media"
  on storage.objects;
create policy "Public can view published tour media"
  on storage.objects
  for select
  to anon, authenticated
  using (
    bucket_id = 'tour-media'
    and exists (
      select 1
      from public.experiences
      where experiences.id::text = (storage.foldername(name))[2]
        and experiences.cover_image_path = storage.objects.name
        and experiences.status = 'published'
        and experiences.published_at is not null
        and experiences.visibility in ('public', 'unlisted')
    )
  );

-- Profile uploads use: owner-id / avatar.ext

drop policy if exists "Creators can upload their profile media"
  on storage.objects;
create policy "Creators can upload their profile media"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'profile-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Creators can view their profile media"
  on storage.objects;
create policy "Creators can view their profile media"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'profile-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Creators can update their profile media"
  on storage.objects;
create policy "Creators can update their profile media"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'profile-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'profile-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Creators can delete their profile media"
  on storage.objects;
create policy "Creators can delete their profile media"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'profile-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Public can view published creator avatars"
  on storage.objects;
create policy "Public can view published creator avatars"
  on storage.objects
  for select
  to anon, authenticated
  using (
    bucket_id = 'profile-media'
    and exists (
      select 1
      from public.creator_profiles
      where creator_profiles.id::text = (storage.foldername(name))[1]
        and creator_profiles.avatar_path = storage.objects.name
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

-- Existing Story media becomes readable only when its parent tour is published.
-- Existing owner-only Story media policies continue to apply to drafts.

drop policy if exists "Public can view media in published experiences"
  on storage.objects;
create policy "Public can view media in published experiences"
  on storage.objects
  for select
  to anon, authenticated
  using (
    bucket_id = 'story-media'
    and exists (
      select 1
      from public.stories
      join public.experiences
        on experiences.id = stories.experience_id
      where experiences.id::text = (storage.foldername(name))[2]
        and stories.id::text = (storage.foldername(name))[3]
        and storage.objects.name in (stories.audio_path, stories.image_path)
        and experiences.status = 'published'
        and experiences.published_at is not null
        and experiences.visibility in ('public', 'unlisted')
    )
  );

commit;

-- Confirmation: the result should show both new buckets and the new columns.
select
  (select count(*) from public.creator_profiles) as creator_profile_count,
  (select count(*) from storage.buckets where id in ('tour-media', 'profile-media')) as new_bucket_count,
  (select count(*)
   from information_schema.columns
   where table_schema = 'public'
     and table_name = 'experiences'
     and column_name in (
       'slug',
       'summary',
       'description',
       'cover_image_path',
       'duration_minutes',
       'visibility',
       'access_type',
       'published_at'
     )) as foundation_column_count;
