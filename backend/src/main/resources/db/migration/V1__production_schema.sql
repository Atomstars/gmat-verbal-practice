create extension if not exists vector;
create extension if not exists pgcrypto;

create table app_users (
  id uuid primary key,
  email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table questions (
  id text primary key,
  bank text not null check (bank in ('og','manhattan','quant')),
  type text not null check (type in ('RC','CR','PS','DS')),
  subtype text,
  chapter text,
  category text,
  difficulty text check (difficulty is null or difficulty in ('Easy','Medium','Hard')),
  title text,
  passage text,
  question text not null,
  options jsonb not null default '[]'::jsonb check (jsonb_typeof(options) = 'array'),
  format text not null default 'multiple_choice',
  diagram text,
  diagram_description text,
  correct_answer text check (correct_answer is null or correct_answer in ('A','B','C','D','E')),
  official_explanation text,
  source text,
  source_page integer,
  number integer,
  needs_review boolean not null default false,
  active boolean not null default true,
  published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index questions_filters_idx on questions (published, active, type, difficulty, bank);
create index questions_topic_idx on questions (chapter, subtype);

create table question_embeddings (
  question_id text primary key references questions(id) on delete cascade,
  embedding vector(384) not null,
  model text not null default 'sentence-transformers/all-MiniLM-L6-v2',
  model_version text not null default '1',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index question_embeddings_hnsw_idx on question_embeddings using hnsw (embedding vector_cosine_ops);

create table practice_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references app_users(id) on delete cascade,
  mode text not null default 'practice',
  filters jsonb not null default '{}'::jsonb check (jsonb_typeof(filters) = 'object'),
  question_ids text[] not null default '{}',
  submitted_question_ids text[] not null default '{}',
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  expires_at timestamptz not null default (now() + interval '24 hours')
);
create index practice_sessions_user_started_idx on practice_sessions (user_id, started_at desc);

create table question_attempts (
  id uuid primary key default gen_random_uuid(),
  client_attempt_id uuid not null unique,
  user_id uuid not null references app_users(id) on delete cascade,
  question_id text not null references questions(id),
  session_id uuid references practice_sessions(id) on delete set null,
  selected_answer text not null check (selected_answer in ('A','B','C','D','E')),
  is_correct boolean not null,
  time_ms integer check (time_ms is null or time_ms between 0 and 86400000),
  mode text not null default 'practice',
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  attempted_at timestamptz not null default now()
);
create index question_attempts_user_time_idx on question_attempts (user_id, attempted_at desc);
create index question_attempts_user_question_idx on question_attempts (user_id, question_id);

create table user_progress (
  user_id uuid not null references app_users(id) on delete cascade,
  question_id text not null references questions(id) on delete cascade,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  correct_count integer not null default 0 check (correct_count between 0 and attempt_count),
  last_answer text check (last_answer is null or last_answer in ('A','B','C','D','E')),
  last_result boolean,
  last_time_ms integer,
  last_attempted_at timestamptz,
  bookmarked boolean not null default false,
  review_after timestamptz,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, question_id)
);
create index user_progress_review_idx on user_progress (user_id, last_result, last_attempted_at desc);

create table user_study_state (
  user_id uuid primary key references app_users(id) on delete cascade,
  daily jsonb not null default '{}'::jsonb check (jsonb_typeof(daily) = 'object'),
  adaptive jsonb not null default '{}'::jsonb check (jsonb_typeof(adaptive) = 'object'),
  activity jsonb not null default '{}'::jsonb check (jsonb_typeof(activity) = 'object'),
  legacy_migrated_at timestamptz,
  updated_at timestamptz not null default now()
);

-- Defense in depth for Supabase-hosted PostgreSQL: only the Java database role
-- receives table grants. The browser's anon/authenticated roles get no Data API access.
alter table app_users enable row level security;
alter table questions enable row level security;
alter table question_embeddings enable row level security;
alter table practice_sessions enable row level security;
alter table question_attempts enable row level security;
alter table user_progress enable row level security;
alter table user_study_state enable row level security;
-- These roles exist on Supabase but not necessarily on a generic PostgreSQL host.
-- Dynamic checks keep this migration portable while denying Supabase Data API access.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on app_users, questions, question_embeddings, practice_sessions, question_attempts, user_progress, user_study_state from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on app_users, questions, question_embeddings, practice_sessions, question_attempts, user_progress, user_study_state from authenticated';
  end if;
end $$;
