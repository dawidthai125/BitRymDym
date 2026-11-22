-- 2026-11-22: PayU orderId stored at checkout, so the return page can ask PayU about a
-- pending order when the notification never arrived (PayU looks orders up only by orderId).
alter table public.payment_orders
  add column if not exists provider_order_id text;
alter table public.payment_orders drop constraint if exists payment_orders_provider_order_id_chk;
alter table public.payment_orders add constraint payment_orders_provider_order_id_chk
  check (provider_order_id is null or provider_order_id ~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$');
