-- In-app notifications and agency follows.
-- Run this in Supabase SQL Editor for the shared project.

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  review_id uuid references public.reviews(id) on delete cascade,
  type text not null,
  title text not null,
  body text,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.notifications drop constraint if exists notifications_review_id_type_key;
alter table public.notifications drop constraint if exists notifications_type_check;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'notifications_type_check'
      and conrelid = 'public.notifications'::regclass
  ) then
    alter table public.notifications
      add constraint notifications_type_check
      check (type in ('review_approved', 'review_rejected', 'followed_agency_review'));
  end if;
end $$;

create unique index if not exists notifications_user_review_type_uidx
on public.notifications (user_id, review_id, type);

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

create table if not exists public.agency_follows (
  user_id uuid not null references auth.users(id) on delete cascade,
  agency_id text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, agency_id)
);

alter table public.agency_follows enable row level security;

drop policy if exists "Users can read own agency follows" on public.agency_follows;
create policy "Users can read own agency follows"
on public.agency_follows
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users can insert own agency follows" on public.agency_follows;
create policy "Users can insert own agency follows"
on public.agency_follows
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Users can delete own agency follows" on public.agency_follows;
create policy "Users can delete own agency follows"
on public.agency_follows
for delete
to authenticated
using (auth.uid() = user_id);

revoke all on public.agency_follows from anon, authenticated;
grant select, insert, delete on public.agency_follows to authenticated;

create or replace function public.create_review_status_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op <> 'UPDATE' then
    return new;
  end if;

  if old.status is not distinct from new.status then
    return new;
  end if;

  if new.status = 'approved' then
    if new.user_id is not null then
      insert into public.notifications (user_id, review_id, type, title, body)
      values (
        new.user_id,
        new.id,
        'review_approved',
        '你的評論已通過審核',
        coalesce(new.agency_name, '你提交的中介') || ' 的評論已發佈。'
      )
      on conflict (user_id, review_id, type) do nothing;
    end if;

    insert into public.notifications (user_id, review_id, type, title, body)
    select
      f.user_id,
      new.id,
      'followed_agency_review',
      '你關注的中介有新評論',
      coalesce(new.agency_name, '你關注的中介') || ' 有一則新評論已發佈。'
    from public.agency_follows f
    where f.agency_id = new.agency_id::text
      and (new.user_id is null or f.user_id <> new.user_id)
    on conflict (user_id, review_id, type) do nothing;

  elsif new.status = 'rejected' and new.user_id is not null then
    insert into public.notifications (user_id, review_id, type, title, body)
    values (
      new.user_id,
      new.id,
      'review_rejected',
      '你的評論未通過審核',
      coalesce(new.agency_name, '你提交的中介') || ' 的評論未能發佈，如需了解原因可聯繫客服。'
    )
    on conflict (user_id, review_id, type) do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_review_status_notification on public.reviews;
create trigger trg_review_status_notification
after update of status on public.reviews
for each row
execute function public.create_review_status_notification();
