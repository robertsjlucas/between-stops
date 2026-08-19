-- Between Stops: allow published tour gallery images to be signed publicly.

drop policy if exists "Public can view published tour gallery media"
on storage.objects;

create policy "Public can view published tour gallery media"
on storage.objects
for select
to anon, authenticated
using (
  bucket_id = 'tour-media'
  and exists (
    select 1
    from public.experience_gallery_images
    join public.experiences
      on experiences.id = experience_gallery_images.experience_id
    where experience_gallery_images.path = storage.objects.name
      and experiences.id::text = (storage.foldername(storage.objects.name))[2]
      and experiences.status = 'published'
      and experiences.published_at is not null
      and experiences.visibility = 'public'
  )
);
