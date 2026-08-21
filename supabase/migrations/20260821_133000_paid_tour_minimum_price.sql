-- Between Stops: enforce free tours or paid tours of at least £2.99.

begin;

alter table public.experiences
  drop constraint if exists experiences_price_pence_check;

alter table public.experiences
  add constraint experiences_price_pence_check
  check (
    (access_type = 'free' and (price_pence is null or price_pence = 0))
    or
    (access_type = 'paid' and price_pence >= 299)
    or
    (access_type = 'sponsored' and (price_pence is null or price_pence >= 0))
  );

commit;
