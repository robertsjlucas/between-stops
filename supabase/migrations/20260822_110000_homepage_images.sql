-- Between Stops: platform-owned homepage/city photography

begin;

create table if not exists public.homepage_images (
  id uuid primary key default gen_random_uuid(),
  city text not null default 'Global',
  image_path text not null,
  alt_text text not null default '',
  is_hero boolean not null default false,
  is_active boolean not null default true,
  display_order integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists homepage_images_city_active_order_idx
  on public.homepage_images (city, is_active, display_order);

alter table public.homepage_images enable row level security;

drop policy if exists "Public can view active homepage images"
  on public.homepage_images;

create policy "Public can view active homepage images"
  on public.homepage_images
  for select
  using (is_active = true or public.is_platform_admin());

drop policy if exists "Admins can insert homepage images"
  on public.homepage_images;

create policy "Admins can insert homepage images"
  on public.homepage_images
  for insert
  to authenticated
  with check (public.is_platform_admin());

drop policy if exists "Admins can update homepage images"
  on public.homepage_images;

create policy "Admins can update homepage images"
  on public.homepage_images
  for update
  to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

drop policy if exists "Admins can delete homepage images"
  on public.homepage_images;

create policy "Admins can delete homepage images"
  on public.homepage_images
  for delete
  to authenticated
  using (public.is_platform_admin());

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'homepage-media',
  'homepage-media',
  false,
  10485760,
  array[
    'image/jpeg',
    'image/png',
    'image/webp'
  ]
)
on conflict (id) do update set
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public can view homepage media"
  on storage.objects;

create policy "Public can view homepage media"
  on storage.objects
  for select
  using (
    bucket_id = 'homepage-media'
  );

drop policy if exists "Admins can upload homepage media"
  on storage.objects;

create policy "Admins can upload homepage media"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'homepage-media'
    and public.is_platform_admin()
  );

drop policy if exists "Admins can update homepage media"
  on storage.objects;

create policy "Admins can update homepage media"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'homepage-media'
    and public.is_platform_admin()
  )
  with check (
    bucket_id = 'homepage-media'
    and public.is_platform_admin()
  );

drop policy if exists "Admins can delete homepage media"
  on storage.objects;

create policy "Admins can delete homepage media"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'homepage-media'
    and public.is_platform_admin()
  );

commit;
