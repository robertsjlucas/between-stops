-- Beyond the Stops: additive multi-leg journey foundation.
-- Existing single-route experiences remain unchanged.
-- Apply manually in Supabase SQL Editor. Do not use supabase db push.

begin;

-- ---------------------------------------------------------------------------
-- Experience structure
-- ---------------------------------------------------------------------------

alter table public.experiences
  add column if not exists journey_structure text not null default 'single',
  add column if not exists is_loop boolean not null default false;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'experiences_journey_structure_check'
      and conrelid = 'public.experiences'::regclass
  ) then
    alter table public.experiences
      add constraint experiences_journey_structure_check
      check (journey_structure in ('single', 'multi_leg'));
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- Ordered transport legs
-- ---------------------------------------------------------------------------

create table if not exists public.experience_legs (
  id uuid primary key default gen_random_uuid(),
  experience_id uuid not null
    references public.experiences(id)
    on delete cascade,

  position integer not null,

  route_id text not null,
  section_mode text not null default 'section'
    check (section_mode in ('whole', 'section')),

  journey_direction text not null default 'forward'
    check (journey_direction in ('forward', 'reverse')),

  start_stop_id text not null,
  end_stop_id text not null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint experience_legs_position_positive
    check (position >= 0),

  constraint experience_legs_position_unique
    unique (experience_id, position),

  constraint experience_legs_id_experience_unique
    unique (id, experience_id)
);

create index if not exists experience_legs_experience_position_idx
  on public.experience_legs (experience_id, position);

alter table public.experience_legs enable row level security;

-- ---------------------------------------------------------------------------
-- Stories may optionally belong to a specific leg.
--
-- leg_id remains nullable so every existing single-route Story continues
-- to work exactly as it does now.
-- ---------------------------------------------------------------------------

alter table public.stories
  add column if not exists leg_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'stories_leg_experience_fk'
      and conrelid = 'public.stories'::regclass
  ) then
    alter table public.stories
      add constraint stories_leg_experience_fk
      foreign key (leg_id, experience_id)
      references public.experience_legs (id, experience_id)
      on delete cascade;
  end if;
end
$$;

create index if not exists stories_leg_id_idx
  on public.stories (leg_id);

-- ---------------------------------------------------------------------------
-- Handovers between legs
--
-- transfer:
--   passenger leaves one service and proceeds towards the next leg.
--
-- explore:
--   passenger is deliberately invited to pause/explore before continuing.
--
-- Route/service information for the next transport leg remains attached
-- to the leg itself. These fields contain only handover-specific guidance.
-- ---------------------------------------------------------------------------

create table if not exists public.experience_handovers (
  id uuid primary key default gen_random_uuid(),

  experience_id uuid not null
    references public.experiences(id)
    on delete cascade,

  from_leg_id uuid not null,
  to_leg_id uuid not null,

  handover_type text not null default 'transfer'
    check (handover_type in ('transfer', 'explore')),

  title text not null default '',
  instructions text not null default '',
  exploration_text text not null default '',

  walk_minutes integer,
  stop_reference text not null default '',
  towards_label text not null default '',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint experience_handovers_walk_minutes_check
    check (walk_minutes is null or walk_minutes >= 0),

  constraint experience_handovers_different_legs_check
    check (from_leg_id <> to_leg_id),

  constraint experience_handovers_pair_unique
    unique (experience_id, from_leg_id, to_leg_id),

  constraint experience_handovers_from_leg_fk
    foreign key (from_leg_id, experience_id)
    references public.experience_legs (id, experience_id)
    on delete cascade,

  constraint experience_handovers_to_leg_fk
    foreign key (to_leg_id, experience_id)
    references public.experience_legs (id, experience_id)
    on delete cascade
);

create index if not exists experience_handovers_experience_idx
  on public.experience_handovers (experience_id);

alter table public.experience_handovers enable row level security;

-- ---------------------------------------------------------------------------
-- Creator / admin policies: legs
-- ---------------------------------------------------------------------------

drop policy if exists "Creators and admins can view experience legs"
  on public.experience_legs;

create policy "Creators and admins can view experience legs"
  on public.experience_legs
  for select
  to authenticated
  using (
    public.is_platform_admin()
    or exists (
      select 1
      from public.experiences
      where experiences.id = experience_legs.experience_id
        and experiences.owner_id = auth.uid()
    )
  );

drop policy if exists "Creators and admins can create experience legs"
  on public.experience_legs;

create policy "Creators and admins can create experience legs"
  on public.experience_legs
  for insert
  to authenticated
  with check (
    public.is_platform_admin()
    or exists (
      select 1
      from public.experiences
      where experiences.id = experience_legs.experience_id
        and experiences.owner_id = auth.uid()
    )
  );

drop policy if exists "Creators and admins can update experience legs"
  on public.experience_legs;

create policy "Creators and admins can update experience legs"
  on public.experience_legs
  for update
  to authenticated
  using (
    public.is_platform_admin()
    or exists (
      select 1
      from public.experiences
      where experiences.id = experience_legs.experience_id
        and experiences.owner_id = auth.uid()
    )
  )
  with check (
    public.is_platform_admin()
    or exists (
      select 1
      from public.experiences
      where experiences.id = experience_legs.experience_id
        and experiences.owner_id = auth.uid()
    )
  );

drop policy if exists "Creators and admins can delete experience legs"
  on public.experience_legs;

create policy "Creators and admins can delete experience legs"
  on public.experience_legs
  for delete
  to authenticated
  using (
    public.is_platform_admin()
    or exists (
      select 1
      from public.experiences
      where experiences.id = experience_legs.experience_id
        and experiences.owner_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- Creator / admin policies: handovers
-- ---------------------------------------------------------------------------

drop policy if exists "Creators and admins can view experience handovers"
  on public.experience_handovers;

create policy "Creators and admins can view experience handovers"
  on public.experience_handovers
  for select
  to authenticated
  using (
    public.is_platform_admin()
    or exists (
      select 1
      from public.experiences
      where experiences.id = experience_handovers.experience_id
        and experiences.owner_id = auth.uid()
    )
  );

drop policy if exists "Creators and admins can create experience handovers"
  on public.experience_handovers;

create policy "Creators and admins can create experience handovers"
  on public.experience_handovers
  for insert
  to authenticated
  with check (
    public.is_platform_admin()
    or exists (
      select 1
      from public.experiences
      where experiences.id = experience_handovers.experience_id
        and experiences.owner_id = auth.uid()
    )
  );

drop policy if exists "Creators and admins can update experience handovers"
  on public.experience_handovers;

create policy "Creators and admins can update experience handovers"
  on public.experience_handovers
  for update
  to authenticated
  using (
    public.is_platform_admin()
    or exists (
      select 1
      from public.experiences
      where experiences.id = experience_handovers.experience_id
        and experiences.owner_id = auth.uid()
    )
  )
  with check (
    public.is_platform_admin()
    or exists (
      select 1
      from public.experiences
      where experiences.id = experience_handovers.experience_id
        and experiences.owner_id = auth.uid()
    )
  );

drop policy if exists "Creators and admins can delete experience handovers"
  on public.experience_handovers;

create policy "Creators and admins can delete experience handovers"
  on public.experience_handovers
  for delete
  to authenticated
  using (
    public.is_platform_admin()
    or exists (
      select 1
      from public.experiences
      where experiences.id = experience_handovers.experience_id
        and experiences.owner_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- Passenger read policies
-- ---------------------------------------------------------------------------

drop policy if exists "Public can view published experience legs"
  on public.experience_legs;

create policy "Public can view published experience legs"
  on public.experience_legs
  for select
  to anon, authenticated
  using (
    exists (
      select 1
      from public.experiences
      where experiences.id = experience_legs.experience_id
        and experiences.status = 'published'
        and experiences.published_at is not null
        and experiences.visibility in ('public', 'unlisted')
    )
  );

drop policy if exists "Public can view published experience handovers"
  on public.experience_handovers;

create policy "Public can view published experience handovers"
  on public.experience_handovers
  for select
  to anon, authenticated
  using (
    exists (
      select 1
      from public.experiences
      where experiences.id = experience_handovers.experience_id
        and experiences.status = 'published'
        and experiences.published_at is not null
        and experiences.visibility in ('public', 'unlisted')
    )
  );

grant select, insert, update, delete
  on public.experience_legs
  to authenticated;

grant select
  on public.experience_legs
  to anon;

grant select, insert, update, delete
  on public.experience_handovers
  to authenticated;

grant select
  on public.experience_handovers
  to anon;

commit;

-- ---------------------------------------------------------------------------
-- Confirmation
-- Existing experiences should all report journey_structure = single.
-- ---------------------------------------------------------------------------

select
  (select count(*) from public.experience_legs) as leg_count,
  (select count(*) from public.experience_handovers) as handover_count,
  (select count(*) from public.experiences where journey_structure = 'single')
    as existing_single_experience_count,
  (select count(*) from public.experiences where journey_structure = 'multi_leg')
    as multi_leg_experience_count,
  (select count(*)
   from information_schema.columns
   where table_schema = 'public'
     and table_name = 'stories'
     and column_name = 'leg_id') as stories_leg_column_count;
