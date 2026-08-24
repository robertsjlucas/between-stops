-- Beyond the Stops: international SEO geography and stable public slugs

begin;

alter table public.experiences
  add column if not exists country_code text,
  add column if not exists country_slug text,
  add column if not exists city_slug text;

-- Existing catalogue is currently Edinburgh, UK.
update public.experiences
set
  country_code = coalesce(nullif(trim(country_code), ''), 'GB'),
  country_slug = coalesce(nullif(trim(country_slug), ''), 'uk'),
  city_slug = coalesce(
    nullif(trim(city_slug), ''),
    trim(
      both '-' from regexp_replace(
        lower(coalesce(city, 'city')),
        '[^a-z0-9]+',
        '-',
        'g'
      )
    )
  );

alter table public.experiences
  alter column country_code set default 'GB',
  alter column country_slug set default 'uk';

update public.experiences
set slug = trim(
  both '-' from regexp_replace(
    lower(coalesce(title, 'experience')),
    '[^a-z0-9]+',
    '-',
    'g'
  )
)
where slug is not null;

drop index if exists public.experiences_slug_unique;
drop index if exists public.experiences_slug_unique_idx;

create unique index if not exists experiences_public_location_slug_unique
on public.experiences (
  lower(country_slug),
  lower(city_slug),
  lower(slug)
)
where
  country_slug is not null
  and city_slug is not null
  and slug is not null;

create or replace function public.make_experience_slug(
  p_title text,
  p_id uuid
)
returns text
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    nullif(
      trim(
        both '-' from regexp_replace(
          lower(coalesce(p_title, 'experience')),
          '[^a-z0-9]+',
          '-',
          'g'
        )
      ),
      ''
    ),
    'experience'
  )
$$;

create or replace function public.set_experience_slug()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.city_slug is null or trim(new.city_slug) = '' then
    new.city_slug := trim(
      both '-' from regexp_replace(
        lower(coalesce(new.city, 'city')),
        '[^a-z0-9]+',
        '-',
        'g'
      )
    );
  end if;

  if new.country_code is null or trim(new.country_code) = '' then
    new.country_code := 'GB';
  end if;

  if new.country_slug is null or trim(new.country_slug) = '' then
    new.country_slug := 'uk';
  end if;

  if new.slug is null or trim(new.slug) = '' then
    new.slug := public.make_experience_slug(new.title, new.id);
  end if;

  return new;
end;
$$;

commit;
