-- Notification system for review moderation results.
-- Run this in Supabase SQL Editor for the shared project.

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  review_id uuid references public.reviews(id) on delete cascade,
  type text not null check (type in ('review_approved', 'review_rejected')),
  title text not null,
  body text,
  is_read boolean not null default false,
  created_at timestamptz not null default now(),
  unique (review_id, type)
);

alter table public.notifications enable row level security;

drop policy if exists "Users can read own notifications" on public.notifications;
create policy "Users can read own notifications"
on public.notifications
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users can mark own notifications read" on public.notifications;
create policy "Users can mark own notifications read"
on public.notifications
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

revoke all on public.notifications from anon, authenticated;
grant select, update (is_read) on public.notifications to authenticated;

create or replace function public.create_review_status_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  notification_type text;
  notification_title text;
  notification_body text;
begin
  if new.user_id is null then
    return new;
  end if;

  if tg_op <> 'UPDATE' then
    return new;
  end if;

  if old.status is not distinct from new.status then
    return new;
  end if;

  if new.status = 'approved' then
    notification_type := 'review_approved';
    notification_title := '你的評論已通過審核';
    notification_body := coalesce(new.agency_name, '你提交的中介') || ' 的評論已發佈。';
  elsif new.status = 'rejected' then
    notification_type := 'review_rejected';
    notification_title := '你的評論未通過審核';
    notification_body := coalesce(new.agency_name, '你提交的中介') || ' 的評論未能發佈，如需了解原因可聯繫客服。';
  else
    return new;
  end if;

  insert into public.notifications (user_id, review_id, type, title, body)
  values (new.user_id, new.id, notification_type, notification_title, notification_body)
  on conflict (review_id, type) do nothing;

  return new;
end;
$$;

drop trigger if exists trg_review_status_notification on public.reviews;
create trigger trg_review_status_notification
after update of status on public.reviews
for each row
execute function public.create_review_status_notification();
