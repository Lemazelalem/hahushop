-- Allow sellers to SELECT their own order_items rows.
-- Required for Supabase real-time subscriptions (realtime respects RLS for the session user).
-- Without this policy, the seller dashboard's postgres_changes listener on
-- order_items (filter: seller_id=eq.<id>) silently receives nothing.

alter table public.order_items enable row level security;

drop policy if exists order_items_seller_select on public.order_items;

create policy order_items_seller_select
  on public.order_items
  for select
  to authenticated
  using (seller_id = (select auth.uid()));
