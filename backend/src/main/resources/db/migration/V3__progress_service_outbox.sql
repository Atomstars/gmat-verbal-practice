create schema if not exists progress_service;

create table integration_outbox (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  aggregate_type text not null,
  aggregate_id text not null,
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  occurred_at timestamptz not null default now(),
  available_at timestamptz not null default now(),
  processed_at timestamptz,
  dead_lettered_at timestamptz,
  attempts integer not null default 0 check (attempts >= 0),
  last_error text
);
create index integration_outbox_pending_idx
  on integration_outbox (available_at, occurred_at)
  where processed_at is null and dead_lettered_at is null;

create table progress_service.user_progress (
  user_id uuid not null,
  question_id text not null,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  correct_count integer not null default 0 check (correct_count between 0 and attempt_count),
  last_answer text check (last_answer is null or last_answer in ('A','B','C','D','E')),
  last_result boolean,
  last_time_ms integer,
  last_attempted_at timestamptz,
  question_type text check (question_type is null or question_type in ('RC','CR','PS','DS')),
  subtype text,
  chapter text,
  difficulty text,
  question_text text,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, question_id)
);
create index progress_service_user_time_idx
  on progress_service.user_progress (user_id, last_attempted_at desc);
create index progress_service_user_result_idx
  on progress_service.user_progress (user_id, last_result, last_attempted_at desc);

create table progress_service.user_study_state (
  user_id uuid primary key,
  daily jsonb not null default '{}'::jsonb check (jsonb_typeof(daily) = 'object'),
  adaptive jsonb not null default '{}'::jsonb check (jsonb_typeof(adaptive) = 'object'),
  activity jsonb not null default '{}'::jsonb check (jsonb_typeof(activity) = 'object'),
  legacy_migrated_at timestamptz,
  updated_at timestamptz not null default now()
);

create table progress_service.processed_events (
  event_id uuid primary key,
  event_type text not null,
  aggregate_type text not null,
  aggregate_id text not null,
  unique (event_type, aggregate_type, aggregate_id),
  processed_at timestamptz not null default now()
);

-- Preserve all existing progress while transferring ownership to the new service.
insert into progress_service.user_progress(
  user_id,question_id,attempt_count,correct_count,last_answer,last_result,last_time_ms,last_attempted_at,
  question_type,subtype,chapter,difficulty,question_text,metadata,created_at,updated_at)
select p.user_id,p.question_id,p.attempt_count,p.correct_count,p.last_answer,p.last_result,p.last_time_ms,
  p.last_attempted_at,q.type,q.subtype,q.chapter,q.difficulty,q.question,p.metadata,p.created_at,p.updated_at
from public.user_progress p
left join public.questions q on q.id=p.question_id
on conflict (user_id,question_id) do nothing;

insert into progress_service.user_study_state(user_id,daily,adaptive,activity,legacy_migrated_at,updated_at)
select user_id,daily,adaptive,activity,legacy_migrated_at,updated_at
from public.user_study_state
on conflict (user_id) do nothing;

alter table integration_outbox enable row level security;
alter table progress_service.user_progress enable row level security;
alter table progress_service.user_study_state enable row level security;
alter table progress_service.processed_events enable row level security;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on integration_outbox from anon';
    execute 'revoke all on all tables in schema progress_service from anon';
    execute 'revoke usage on schema progress_service from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on integration_outbox from authenticated';
    execute 'revoke all on all tables in schema progress_service from authenticated';
    execute 'revoke usage on schema progress_service from authenticated';
  end if;
end $$;
