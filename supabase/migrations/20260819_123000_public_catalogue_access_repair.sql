-- Between Stops: repair anonymous access for public, published tours.
-- RLS policies decide which rows can be read; these grants allow the anon role
-- to issue the SELECT queries used by server-rendered public tour pages.

grant usage on schema public to anon;

grant select on table public.experiences to anon;
grant select on table public.stories to anon;
grant select on table public.creator_profiles to anon;
grant select on table public.experience_gallery_images to anon;

-- Repair any older published records that pre-date the published_at workflow.
update public.experiences
set published_at = coalesce(published_at, updated_at, now())
where status = 'published'
  and published_at is null;

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

select
  has_table_privilege(
    'anon',
    'public.experiences',
    'SELECT'
  ) as anon_can_select_experiences,
  has_table_privilege(
    'anon',
    'public.stories',
    'SELECT'
  ) as anon_can_select_stories,
  (
    select count(*)
    from public.experiences
    where status = 'published'
      and visibility = 'public'
      and published_at is not null
      and slug is not null
  ) as public_tour_count;
