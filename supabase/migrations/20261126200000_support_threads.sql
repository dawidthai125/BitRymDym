-- "Send feedback" / "Report a bug" with chat-style replies (owner request 2026-11-26).
-- Server code only (service_role): RLS on, no policies, no grants for anon / authenticated.

create table if not exists public.support_threads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('opinion', 'bug')),
  subject text not null check (char_length(subject) between 3 and 120),
  page_path text check (char_length(page_path) <= 300),
  browser text check (char_length(browser) <= 300),
  status text not null default 'open' check (status in ('open', 'closed')),
  created_at timestamptz not null default now(),
  last_message_at timestamptz not null default now(),
  last_sender text not null default 'user' check (last_sender in ('user', 'staff')),
  user_unread integer not null default 0,
  staff_unread integer not null default 0,
  user_read_at timestamptz,
  staff_read_at timestamptz
);
create index if not exists support_threads_user_idx on public.support_threads (user_id, last_message_at desc);
create index if not exists support_threads_status_idx on public.support_threads (status, last_message_at desc);

create table if not exists public.support_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.support_threads (id) on delete cascade,
  sender text not null check (sender in ('user', 'staff')),
  author_id uuid references auth.users (id) on delete set null,
  body text not null check (char_length(body) between 1 and 4000),
  created_at timestamptz not null default clock_timestamp()
);
create index if not exists support_messages_thread_idx on public.support_messages (thread_id, created_at);
create index if not exists support_messages_author_idx on public.support_messages (author_id);

alter table public.support_threads enable row level security;
alter table public.support_messages enable row level security;
revoke all on table public.support_threads, public.support_messages from anon, authenticated;

-- One atomic write: limits, ownership, unread counters and "should an e-mail go out".
-- E-mail only for the first unread message, and not while the other side has the chat open (60 s).
-- p_thread null + p_sender 'user' = new thread. p_user is the thread owner; p_author is who writes.
create or replace function public.support_post_message(
  p_sender text, p_author uuid, p_user uuid, p_thread uuid, p_body text,
  p_kind text default null, p_subject text default null, p_page text default null, p_browser text default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  t public.support_threads%rowtype;
  v_message uuid;
  v_notify boolean;
begin
  if p_sender not in ('user', 'staff') then
    return jsonb_build_object('result', 'invalid');
  end if;

  if p_sender = 'user' then
    perform pg_advisory_xact_lock(hashtext('support:' || p_user::text));
    if (select count(*) from public.support_messages m join public.support_threads s on s.id = m.thread_id
         where s.user_id = p_user and m.sender = 'user' and m.created_at > now() - interval '1 hour') >= 30 then
      return jsonb_build_object('result', 'limit');
    end if;
  end if;

  if p_thread is null then
    if p_sender <> 'user' then
      return jsonb_build_object('result', 'invalid');
    end if;
    if (select count(*) from public.support_threads where user_id = p_user and created_at > now() - interval '24 hours') >= 5 then
      return jsonb_build_object('result', 'limit');
    end if;
    -- Retention (privacy policy): threads silent for 24 months are removed.
    delete from public.support_threads where last_message_at < now() - interval '24 months';
    insert into public.support_threads (user_id, kind, subject, page_path, browser)
      values (p_user, p_kind, p_subject, p_page, p_browser) returning * into t;
  else
    select * into t from public.support_threads where id = p_thread for update;
    if not found or (p_sender = 'user' and t.user_id <> p_user) then
      return jsonb_build_object('result', 'missing');
    end if;
  end if;

  if p_sender = 'user' then
    v_notify := t.staff_unread = 0 and (t.staff_read_at is null or t.staff_read_at < now() - interval '60 seconds');
  else
    v_notify := t.user_unread = 0 and (t.user_read_at is null or t.user_read_at < now() - interval '60 seconds');
  end if;

  insert into public.support_messages (thread_id, sender, author_id, body)
    values (t.id, p_sender, p_author, p_body) returning id into v_message;

  update public.support_threads set
    last_message_at = now(),
    last_sender = p_sender,
    status = 'open',
    staff_unread = case when p_sender = 'user' then staff_unread + 1 else 0 end,
    user_unread = case when p_sender = 'staff' then user_unread + 1 else 0 end,
    staff_read_at = case when p_sender = 'staff' then clock_timestamp() else staff_read_at end,
    user_read_at = case when p_sender = 'user' then clock_timestamp() else user_read_at end
  where id = t.id;

  return jsonb_build_object('result', 'ok', 'thread_id', t.id, 'message_id', v_message, 'notify', v_notify,
    'user_id', t.user_id, 'kind', t.kind, 'subject', t.subject);
end;
$$;
revoke all on function public.support_post_message(text, uuid, uuid, uuid, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.support_post_message(text, uuid, uuid, uuid, text, text, text, text, text) to service_role;
