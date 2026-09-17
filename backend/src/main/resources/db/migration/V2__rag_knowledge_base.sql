create table knowledge_chunks (
  id text primary key,
  question_id text references questions(id) on delete cascade,
  title text not null,
  content text not null,
  source_label text not null,
  content_type text not null check (content_type in ('worked_question','lesson','strategy','reference')),
  embedding vector(384) not null,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  active boolean not null default true,
  search_vector tsvector generated always as (to_tsvector('english', content)) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index knowledge_chunks_embedding_hnsw_idx
  on knowledge_chunks using hnsw (embedding vector_cosine_ops);
create index knowledge_chunks_search_gin_idx on knowledge_chunks using gin (search_vector);
create index knowledge_chunks_question_idx on knowledge_chunks (question_id);

-- Bootstrap the trusted teaching corpus from verified questions and official
-- explanations. Dedicated lesson/strategy chunks can be added through the same table.
insert into knowledge_chunks(id, question_id, title, content, source_label, content_type, embedding, metadata)
select
  'question:' || q.id,
  q.id,
  coalesce(nullif(q.title, ''), q.type || ' worked question'),
  concat_ws(E'\n\n',
    'Question type: ' || q.type,
    case when q.chapter is not null then 'Chapter: ' || q.chapter end,
    case when q.subtype is not null then 'Subtype: ' || q.subtype end,
    case when q.passage is not null then 'Passage: ' || q.passage end,
    'Question: ' || q.question,
    'Answer choices: ' || q.options::text,
    'Official answer: ' || q.correct_answer,
    case when q.official_explanation is not null then 'Official explanation: ' || q.official_explanation end
  ),
  q.bank || ':' || q.id,
  'worked_question',
  e.embedding,
  jsonb_build_object('type', q.type, 'difficulty', q.difficulty, 'bank', q.bank)
from questions q
join question_embeddings e on e.question_id = q.id
where q.active and q.published and q.correct_answer is not null
on conflict (id) do update set
  title = excluded.title,
  content = excluded.content,
  source_label = excluded.source_label,
  embedding = excluded.embedding,
  metadata = excluded.metadata,
  active = true,
  updated_at = now();

alter table knowledge_chunks enable row level security;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on knowledge_chunks from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on knowledge_chunks from authenticated';
  end if;
end $$;
