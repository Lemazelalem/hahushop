-- Atomic stock decrement for simple (non-variant) products.
-- Prevents race conditions when two orders arrive simultaneously:
-- instead of read-then-write (which can overcount), this does a single
-- atomic UPDATE that floors at 0.
create or replace function public.decrement_stock(p_product_id uuid, p_qty int)
returns void
language sql
security definer
set search_path = public
as $$
  update public.products
  set stock_quantity = greatest(0, coalesce(stock_quantity, 0) - p_qty)
  where id = p_product_id;
$$;

revoke all on function public.decrement_stock(uuid, int) from public;
grant execute on function public.decrement_stock(uuid, int) to service_role;
