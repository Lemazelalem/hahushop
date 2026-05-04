-- Payment Method Controls
-- Allows admins to enable/disable individual payment methods at runtime.
-- Customers read this table at checkout to see only available methods.

create table if not exists public.payment_method_controls (
  id          text primary key,
  label       text not null,
  is_enabled  boolean not null default true,
  sort_order  int not null default 0,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users(id)
);

-- Seed all supported payment methods
insert into public.payment_method_controls (id, label, is_enabled, sort_order)
values
  ('pay_on_delivery', 'Pay on Delivery',    true, 1),
  ('stripe_card',     'Stripe Card Payment', true, 2),
  ('telebirr',        'Telebirr',            true, 3),
  ('cbe_birr',        'CBE Birr',            true, 4),
  ('paypal',          'PayPal',              true, 5),
  ('apple_pay',       'Apple Pay',           true, 6),
  ('google_pay',      'Google Pay',          true, 7),
  ('ceb_link',        'CEB Credit Link',     true, 8)
on conflict (id) do nothing;

-- Enable Row Level Security
alter table public.payment_method_controls enable row level security;

-- Everyone (including unauthenticated visitors) can read payment methods
-- so the checkout page can display only available methods.
drop policy if exists pmc_select on public.payment_method_controls;
create policy pmc_select
  on public.payment_method_controls
  for select
  using (true);

-- Only admins can update payment method status
drop policy if exists pmc_update on public.payment_method_controls;
create policy pmc_update
  on public.payment_method_controls
  for update
  to authenticated
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role = 'admin'
    )
  )
  with check (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role = 'admin'
    )
  );

-- Allow admins to insert new methods in the future
drop policy if exists pmc_insert on public.payment_method_controls;
create policy pmc_insert
  on public.payment_method_controls
  for insert
  to authenticated
  with check (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role = 'admin'
    )
  );
