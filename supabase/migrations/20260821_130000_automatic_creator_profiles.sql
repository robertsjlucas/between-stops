-- Between Stops: automatically create a creator profile for new accounts.
-- This does not grant administrator access.

begin;

create or replace function public.handle_new_between_stops_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.creator_profiles (id)
  values (new.id)
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_create_creator_profile
on auth.users;

create trigger on_auth_user_created_create_creator_profile
after insert on auth.users
for each row
execute function public.handle_new_between_stops_user();

-- Backfill any existing accounts which do not yet have a creator profile.
insert into public.creator_profiles (id)
select users.id
from auth.users as users
where not exists (
  select 1
  from public.creator_profiles as profiles
  where profiles.id = users.id
);

commit;
