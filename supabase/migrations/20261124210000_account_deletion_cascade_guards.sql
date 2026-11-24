-- Account deletion: the cascade from auth.users / profiles also reaches quota credits (bought packs,
-- referral rewards) and premium_* rows. Their guards raise unless auth.role() = 'service_role', but the
-- cascade runs in GoTrue's own connection (auth.role() IS NULL), so deleteUser failed at the last step,
-- after the user's recordings and projects were already gone.
--
-- Same rule as 20261030061000 (studio guards): only a nested FK action outside API client roles passes.
-- Direct client and service_role writes are rejected exactly as before; premium_unlock_events stays
-- append-only for everyone who is not a cascade.

create or replace function public.studio_quota_credits_service_role_only()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.role() is distinct from 'service_role'
     and not (tg_op = 'DELETE' and public.studio_guard_cascade_delete_allowed()) then
    raise exception 'Only service_role may mutate studio_quota_credits' using errcode = '42501';
  end if;
  return coalesce(new, old);
end;
$$;

create or replace function public.prevent_premium_works_privilege_escalation()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.role() is distinct from 'service_role'
     and not (tg_op = 'DELETE' and public.studio_guard_cascade_delete_allowed()) then
    raise exception 'Only service_role may mutate premium_works';
  end if;
  return coalesce(new, old);
end;
$$;

create or replace function public.prevent_premium_credit_periods_privilege_escalation()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.role() is distinct from 'service_role'
     and not (tg_op = 'DELETE' and public.studio_guard_cascade_delete_allowed()) then
    raise exception 'Only service_role may mutate premium_credit_periods';
  end if;
  return coalesce(new, old);
end;
$$;

-- ON DELETE SET NULL of credit_period_id is an UPDATE here.
create or replace function public.prevent_premium_track_unlocks_privilege_escalation()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.studio_guard_cascade_delete_allowed() then
    if tg_op = 'DELETE' then
      return old;
    end if;
    if tg_op = 'UPDATE' and new.credit_period_id is null
       and to_jsonb(new) - 'credit_period_id' = to_jsonb(old) - 'credit_period_id' then
      return new;
    end if;
  end if;
  if auth.role() is distinct from 'service_role' then
    raise exception 'Only service_role may mutate premium_track_unlocks';
  end if;
  return coalesce(new, old);
end;
$$;

-- ON DELETE SET NULL of work_id is an UPDATE here.
create or replace function public.prevent_premium_unlock_events_privilege_escalation()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.studio_guard_cascade_delete_allowed() then
    if tg_op = 'DELETE' then
      return old;
    end if;
    if tg_op = 'UPDATE' and new.work_id is null
       and to_jsonb(new) - 'work_id' = to_jsonb(old) - 'work_id' then
      return new;
    end if;
  end if;
  if auth.role() is distinct from 'service_role' then
    raise exception 'Only service_role may mutate premium_unlock_events';
  end if;
  if tg_op = 'UPDATE' or tg_op = 'DELETE' then
    raise exception 'premium_unlock_events is append-only';
  end if;
  return new;
end;
$$;
