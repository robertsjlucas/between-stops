alter table public.experiences
  add column if not exists journey_direction_availability text
  not null default 'either';

alter table public.experiences
  drop constraint if exists experiences_journey_direction_availability_check;

alter table public.experiences
  add constraint experiences_journey_direction_availability_check
  check (
    journey_direction_availability in (
      'either',
      'forward',
      'reverse'
    )
  );
