-- Between Stops: preview, seasonal availability, age guidance and tour gallery

alter table public.experiences
  add column if not exists available_from date,
  add column if not exists available_to date,
  add column if not exists age_guidance text not null default 'all_ages';

alter table public.experiences
  drop constraint if exists experiences_availability_dates_check;

alter table public.experiences
  add constraint experiences_availability_dates_check
  check (
    available_from is null
    or available_to is null
    or available_from <= available_to
  );

alter table public.experiences
  drop constraint if exists experiences_age_guidance_check;

alter table public.experiences
  add constraint experiences_age_guidance_check
  check (age_guidance in ('all_ages', 'not_for_children'));

create table if not exists public.experience_gallery_images (
  id uuid primary key default gen_random_uuid(),
  experience_id uuid not null references public.experiences(id) on delete cascade,
  path text not null unique,
  filename text not null,
  mime_type text not null,
  size_bytes bigint not null,
  position integer not null check (position between 0 and 3),
  created_at timestamptz not null default now(),
  unique (experience_id, position)
);

create index if not exists experience_gallery_images_experience_idx
on public.experience_gallery_images (experience_id, position);

alter table public.experience_gallery_images enable row level security;

grant select, insert, update, delete
on public.experience_gallery_images
to authenticated;

grant select
on public.experience_gallery_images
to anon;

drop policy if exists "Creators can view their gallery images"
on public.experience_gallery_images;

create policy "Creators can view their gallery images"
on public.experience_gallery_images
for select
to authenticated
using (
  exists (
    select 1
    from public.experiences
    where experiences.id = experience_gallery_images.experience_id
      and experiences.owner_id = auth.uid()
  )
);

drop policy if exists "Creators can create their gallery images"
on public.experience_gallery_images;

create policy "Creators can create their gallery images"
on public.experience_gallery_images
for insert
to authenticated
with check (
  exists (
    select 1
    from public.experiences
    where experiences.id = experience_gallery_images.experience_id
      and experiences.owner_id = auth.uid()
      and experiences.status in ('draft', 'changes_requested')
  )
);

drop policy if exists "Creators can update their gallery images"
on public.experience_gallery_images;

create policy "Creators can update their gallery images"
on public.experience_gallery_images
for update
to authenticated
using (
  exists (
    select 1
    from public.experiences
    where experiences.id = experience_gallery_images.experience_id
      and experiences.owner_id = auth.uid()
      and experiences.status in ('draft', 'changes_requested')
  )
)
with check (
  exists (
    select 1
    from public.experiences
    where experiences.id = experience_gallery_images.experience_id
      and experiences.owner_id = auth.uid()
      and experiences.status in ('draft', 'changes_requested')
  )
);

drop policy if exists "Creators can delete their gallery images"
on public.experience_gallery_images;

create policy "Creators can delete their gallery images"
on public.experience_gallery_images
for delete
to authenticated
using (
  exists (
    select 1
    from public.experiences
    where experiences.id = experience_gallery_images.experience_id
      and experiences.owner_id = auth.uid()
      and experiences.status in ('draft', 'changes_requested')
  )
);

drop policy if exists "Anyone can view published gallery images"
on public.experience_gallery_images;

create policy "Anyone can view published gallery images"
on public.experience_gallery_images
for select
to anon, authenticated
using (
  exists (
    select 1
    from public.experiences
    where experiences.id = experience_gallery_images.experience_id
      and experiences.status = 'published'
      and experiences.visibility = 'public'
  )
);

drop policy if exists "Admins can view all gallery images"
on public.experience_gallery_images;

create policy "Admins can view all gallery images"
on public.experience_gallery_images
for select
to authenticated
using (public.is_platform_admin());

create or replace function public.retract_experience_submission(
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

  if not found or v_experience.owner_id is distinct from auth.uid() then
    raise exception 'Experience not found or access denied.';
  end if;

  if v_experience.status <> 'submitted' then
    raise exception 'Only an experience awaiting review can be retracted.';
  end if;

  update public.experiences
  set status = 'draft',
      visibility = 'private',
      published_at = null,
      updated_at = now()
  where id = p_experience_id;

  insert into public.experience_status_history (
    experience_id,
    changed_by,
    from_status,
    to_status,
    note
  ) values (
    p_experience_id,
    auth.uid(),
    'submitted',
    'draft',
    'Retracted by creator'
  );
end;
$$;

revoke all on function public.retract_experience_submission(uuid) from public;
grant execute on function public.retract_experience_submission(uuid) to authenticated;
