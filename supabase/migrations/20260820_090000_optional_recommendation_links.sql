-- Destination recommendations can be useful even when no public website exists.
alter table public.destination_recommendations
  alter column url drop not null;
