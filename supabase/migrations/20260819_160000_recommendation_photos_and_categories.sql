-- Between Stops: controlled recommendation categories and optional photos.

alter table public.destination_recommendations
  add column if not exists image_path text,
  add column if not exists image_filename text,
  add column if not exists image_mime_type text,
  add column if not exists image_size_bytes bigint;

update public.destination_recommendations
set category = 'attraction'
where category not in (
  'food_drink',
  'museum',
  'attraction',
  'peace_quiet',
  'great_view',
  'walk',
  'shopping',
  'family',
  'events'
);

alter table public.destination_recommendations
  alter column category set default 'attraction';

alter table public.destination_recommendations
  drop constraint if exists destination_recommendations_category_check;

alter table public.destination_recommendations
  add constraint destination_recommendations_category_check
  check (category in (
    'food_drink',
    'museum',
    'attraction',
    'peace_quiet',
    'great_view',
    'walk',
    'shopping',
    'family',
    'events'
  ));

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'recommendation-media',
  'recommendation-media',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Anyone can view active recommendation photos"
on storage.objects;

create policy "Anyone can view active recommendation photos"
on storage.objects
for select
to anon, authenticated
using (
  bucket_id = 'recommendation-media'
  and exists (
    select 1
    from public.destination_recommendations
    where destination_recommendations.image_path = storage.objects.name
      and destination_recommendations.is_active
  )
);

drop policy if exists "Admins can manage recommendation photos"
on storage.objects;

create policy "Admins can manage recommendation photos"
on storage.objects
for all
to authenticated
using (
  bucket_id = 'recommendation-media'
  and public.is_platform_admin()
)
with check (
  bucket_id = 'recommendation-media'
  and public.is_platform_admin()
);
