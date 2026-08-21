-- Between Stops platform journey audio.
-- Three centrally managed announcements:
-- welcome, next_stop and tour_end.

begin;

create table if not exists public.platform_audio (
  audio_key text primary key
    check (audio_key in ('welcome', 'next_stop', 'tour_end')),
  storage_path text,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

insert into public.platform_audio (audio_key)
values
  ('welcome'),
  ('next_stop'),
  ('tour_end')
on conflict (audio_key) do nothing;

alter table public.platform_audio enable row level security;

drop policy if exists "Public can read platform audio"
on public.platform_audio;

create policy "Public can read platform audio"
on public.platform_audio
for select
to anon, authenticated
using (true);

drop policy if exists "Admins can update platform audio"
on public.platform_audio;

create policy "Admins can update platform audio"
on public.platform_audio
for update
to authenticated
using (public.is_platform_admin())
with check (public.is_platform_admin());

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'platform-audio',
  'platform-audio',
  true,
  10485760,
  array[
    'audio/mpeg',
    'audio/mp4',
    'audio/x-m4a',
    'audio/wav',
    'audio/ogg',
    'audio/webm'
  ]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public can hear platform audio"
on storage.objects;

create policy "Public can hear platform audio"
on storage.objects
for select
to anon, authenticated
using (bucket_id = 'platform-audio');

drop policy if exists "Admins can upload platform audio"
on storage.objects;

create policy "Admins can upload platform audio"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'platform-audio'
  and public.is_platform_admin()
);

drop policy if exists "Admins can update platform audio files"
on storage.objects;

create policy "Admins can update platform audio files"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'platform-audio'
  and public.is_platform_admin()
)
with check (
  bucket_id = 'platform-audio'
  and public.is_platform_admin()
);

drop policy if exists "Admins can delete platform audio files"
on storage.objects;

create policy "Admins can delete platform audio files"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'platform-audio'
  and public.is_platform_admin()
);

commit;
