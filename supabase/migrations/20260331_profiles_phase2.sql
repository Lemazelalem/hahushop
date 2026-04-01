-- Phase 2: profiles-first performance cleanup
-- Safe FK indexes plus a narrower, faster RLS surface for public.profiles.

-- -----------------------------------------------------------------------------
-- Helper function: evaluate admin access once per statement instead of forcing
-- row-by-row policy checks that query public.profiles again.
-- -----------------------------------------------------------------------------
create or replace function public.current_user_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles as p
    where p.id = (select auth.uid())
      and p.role = 'admin'
  );
$$;

revoke all on function public.current_user_is_admin() from public;
grant execute on function public.current_user_is_admin() to authenticated;

comment on function public.current_user_is_admin() is
  'Fast SECURITY DEFINER helper for RLS policies that need to know whether the current authenticated user is an admin.';

-- -----------------------------------------------------------------------------
-- Profiles table: keep the policy surface small and predictable.
-- The app only needs:
--   1. authenticated users can read/update/insert their own profile row
--   2. admins can read/update any profile row
-- -----------------------------------------------------------------------------
do $$
declare
  profile_policy record;
begin
  if to_regclass('public.profiles') is null then
    raise notice 'public.profiles does not exist, skipping profiles policy reset';
    return;
  end if;

  for profile_policy in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'profiles'
  loop
    execute format(
      'drop policy if exists %I on public.profiles',
      profile_policy.policyname
    );
  end loop;
end
$$;

do $$
begin
  if to_regclass('public.profiles') is null then
    raise notice 'public.profiles does not exist, skipping profiles policy creation';
    return;
  end if;

  execute 'alter table public.profiles enable row level security';

  execute '
    create policy profiles_select_self_or_admin
    on public.profiles
    for select
    to authenticated
    using (
      id = (select auth.uid())
      or (select public.current_user_is_admin())
    )
  ';

  execute '
    create policy profiles_insert_self
    on public.profiles
    for insert
    to authenticated
    with check (
      id = (select auth.uid())
    )
  ';

  execute '
    create policy profiles_update_self_or_admin
    on public.profiles
    for update
    to authenticated
    using (
      id = (select auth.uid())
      or (select public.current_user_is_admin())
    )
    with check (
      id = (select auth.uid())
      or (select public.current_user_is_admin())
    )
  ';
end
$$;

-- -----------------------------------------------------------------------------
-- Safe FK / hot-path indexes.
-- Each CREATE INDEX is guarded so the migration can run safely across slightly
-- different environments without failing on missing legacy tables or columns.
-- -----------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.profiles') is not null then
    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'profiles'
        and column_name = 'role'
    ) and exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'profiles'
        and column_name = 'seller_verified'
    ) then
      execute '
        create index if not exists profiles_role_seller_verified_idx
        on public.profiles (role, seller_verified)
      ';
    elsif exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'profiles'
        and column_name = 'role'
    ) then
      execute '
        create index if not exists profiles_role_idx
        on public.profiles (role)
      ';
    end if;

    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'profiles'
        and column_name = 'is_public_employee'
    ) and exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'profiles'
        and column_name = 'gov_employee_status'
    ) then
      execute '
        create index if not exists profiles_is_public_employee_gov_status_idx
        on public.profiles (is_public_employee, gov_employee_status)
      ';
    end if;

    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'profiles'
        and column_name = 'is_public_employee'
    ) and exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'profiles'
        and column_name = 'pe_verification_status'
    ) then
      execute '
        create index if not exists profiles_is_public_employee_pe_status_idx
        on public.profiles (is_public_employee, pe_verification_status)
      ';
    end if;
  end if;

  if to_regclass('public.addresses') is not null and exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'addresses'
      and column_name = 'user_id'
  ) then
    execute '
      create index if not exists addresses_user_id_idx
      on public.addresses (user_id)
    ';
  end if;

  if to_regclass('public.orders') is not null and exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'orders'
      and column_name = 'user_id'
  ) then
    execute '
      create index if not exists orders_user_id_idx
      on public.orders (user_id)
    ';
  end if;

  if to_regclass('public.return_requests') is not null and exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'return_requests'
      and column_name = 'user_id'
  ) then
    execute '
      create index if not exists return_requests_user_id_idx
      on public.return_requests (user_id)
    ';
  end if;

  if to_regclass('public.seller_applications') is not null and exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'seller_applications'
      and column_name = 'user_id'
  ) then
    execute '
      create index if not exists seller_applications_user_id_idx
      on public.seller_applications (user_id)
    ';
  end if;

  if to_regclass('public.seller_documents') is not null and exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'seller_documents'
      and column_name = 'seller_id'
  ) then
    execute '
      create index if not exists seller_documents_seller_id_idx
      on public.seller_documents (seller_id)
    ';
  end if;

  if to_regclass('public.seller_payouts') is not null and exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'seller_payouts'
      and column_name = 'seller_id'
  ) then
    execute '
      create index if not exists seller_payouts_seller_id_idx
      on public.seller_payouts (seller_id)
    ';
  end if;

  if to_regclass('public.business_applications') is not null and exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'business_applications'
      and column_name = 'user_id'
  ) then
    execute '
      create index if not exists business_applications_user_id_idx
      on public.business_applications (user_id)
    ';
  end if;

  if to_regclass('public.public_employee_documents') is not null and exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'public_employee_documents'
      and column_name = 'user_id'
  ) then
    execute '
      create index if not exists public_employee_documents_user_id_idx
      on public.public_employee_documents (user_id)
    ';
  end if;

  if to_regclass('public.products') is not null and exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'products'
      and column_name = 'seller_id'
  ) then
    execute '
      create index if not exists products_seller_id_idx
      on public.products (seller_id)
    ';
  end if;

  if to_regclass('public.order_items') is not null and exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'order_items'
      and column_name = 'seller_id'
  ) then
    execute '
      create index if not exists order_items_seller_id_idx
      on public.order_items (seller_id)
    ';
  end if;

  if to_regclass('public.product_ratings') is not null and exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'product_ratings'
      and column_name = 'user_id'
  ) then
    execute '
      create index if not exists product_ratings_user_id_idx
      on public.product_ratings (user_id)
    ';
  end if;
end
$$;
