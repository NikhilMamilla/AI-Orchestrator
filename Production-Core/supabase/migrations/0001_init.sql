-- Kiddoo schema for Supabase (Postgres 15+). Paste into the SQL editor or run with the Supabase CLI.
-- Knowledge tables are written ONLY by the backend (service role / direct DB connection);
-- end users can read them but never write. User tables are protected by row-level security.

create extension if not exists vector;

-- ───────────── knowledge base (RAG) ─────────────
create table if not exists documents (
    id            text primary key,
    title         text not null,
    source        text not null,
    level         smallint not null check (level between 1 and 3),
    prerequisites text[] not null default '{}',
    tags          text[] not null default '{}',
    content_hash  text not null,
    version       integer not null default 1,
    updated_at    timestamptz not null default now()
);

create table if not exists chunks (
    id           text primary key,
    doc_id       text not null references documents(id) on delete cascade,
    parent_id    text,
    kind         text not null check (kind in ('section', 'passage')),
    heading_path text not null,
    text         text not null,
    text_hash    text not null,
    ordinal      integer not null,
    level        smallint not null,
    tags         text not null default '',
    embedding    vector(384),
    fts          tsvector generated always as (
                     setweight(to_tsvector('english', heading_path), 'A') ||
                     setweight(to_tsvector('english', text), 'B') ||
                     setweight(to_tsvector('english', tags), 'C')) stored
);
create index if not exists chunks_doc_idx    on chunks (doc_id);
create index if not exists chunks_parent_idx on chunks (parent_id);
create index if not exists chunks_hash_idx   on chunks (text_hash) where kind = 'passage';
create index if not exists chunks_fts_idx    on chunks using gin (fts);
create index if not exists chunks_vec_idx    on chunks using hnsw (embedding vector_cosine_ops)
    where kind = 'passage';

-- Dense retrieval: cosine similarity (1 - distance), optional level / document filters.
create or replace function match_chunks_dense(
    query_embedding vector(384), k int default 30, max_level int default null, doc_ids text[] default null)
returns table (id text, score float8)
language sql stable as $$
    select c.id, 1 - (c.embedding <=> query_embedding) as score
    from chunks c
    where c.kind = 'passage' and c.embedding is not null
      and (max_level is null or c.level <= max_level)
      and (doc_ids is null or c.doc_id = any(doc_ids))
    order by c.embedding <=> query_embedding
    limit k
$$;

-- Sparse retrieval: Postgres full-text search with ts_rank_cd (cover-density ranking).
-- Uses an OR query built from sanitized tokens so one missing word does not zero the result.
create or replace function match_chunks_bm25(
    query_text text, k int default 30, max_level int default null, doc_ids text[] default null)
returns table (id text, score float8)
language sql stable as $$
    with q as (
        select to_tsquery('english', nullif(string_agg(quote_literal(t), ' | '), '')) as tsq
        from (select distinct lower(m[1]) as t
              from regexp_matches(query_text, '([A-Za-z0-9_]{2,})', 'g') as m) toks
    )
    select c.id, ts_rank_cd(c.fts, q.tsq, 32)::float8 as score
    from chunks c, q
    where q.tsq is not null and c.kind = 'passage' and c.fts @@ q.tsq
      and (max_level is null or c.level <= max_level)
      and (doc_ids is null or c.doc_id = any(doc_ids))
    order by score desc
    limit k
$$;

alter table documents enable row level security;
alter table chunks    enable row level security;
create policy "knowledge readable by signed-in users" on documents for select to authenticated using (true);
create policy "knowledge readable by signed-in users" on chunks    for select to authenticated using (true);
-- no insert/update/delete policies: only the service role (which bypasses RLS) can write.

-- ───────────── learners ─────────────
create table if not exists profiles (
    user_id        uuid primary key references auth.users(id) on delete cascade,
    display_name   text,
    level          text not null default 'beginner' check (level in ('beginner', 'intermediate', 'advanced')),
    style          text not null default 'default',
    goal           text,
    created_at     timestamptz not null default now()
);

create table if not exists concept_mastery (
    user_id     uuid not null references auth.users(id) on delete cascade,
    doc_id      text not null references documents(id) on delete cascade,
    mastery     real not null default 0 check (mastery between 0 and 1),
    attempts    integer not null default 0,
    correct     integer not null default 0,
    next_review timestamptz,                  -- spaced repetition (SM-2 style) due date
    updated_at  timestamptz not null default now(),
    primary key (user_id, doc_id)
);

create table if not exists sessions (
    id          uuid primary key default gen_random_uuid(),
    user_id     uuid not null references auth.users(id) on delete cascade,
    doc_id      text references documents(id),
    started_at  timestamptz not null default now(),
    ended_at    timestamptz,
    summary     jsonb not null default '{}'
);
create index if not exists sessions_user_idx on sessions (user_id, started_at desc);

create table if not exists interactions (
    id          bigint generated always as identity primary key,
    session_id  uuid not null references sessions(id) on delete cascade,
    user_id     uuid not null references auth.users(id) on delete cascade,
    kind        text not null check (kind in ('question', 'answer', 'hint', 'feedback')),
    payload     jsonb not null default '{}',     -- never stores secrets; answers keep citation ids only
    created_at  timestamptz not null default now()
);
create index if not exists interactions_session_idx on interactions (session_id, created_at);

-- Agent activity feed (what the Orchestrator/Analyst decided and why) - real, not mocked.
create table if not exists agent_events (
    id          bigint generated always as identity primary key,
    user_id     uuid not null references auth.users(id) on delete cascade,
    session_id  uuid references sessions(id) on delete cascade,
    agent       text not null,
    message     text not null,
    meta        jsonb not null default '{}',
    created_at  timestamptz not null default now()
);
create index if not exists agent_events_user_idx on agent_events (user_id, created_at desc);

-- Per-request RAG telemetry (no raw queries or answers: lengths, timings, status only).
create table if not exists rag_requests (
    request_id  text primary key,
    user_id     uuid references auth.users(id) on delete set null,
    status      text not null,
    confidence  real,
    total_ms    real,
    stages      jsonb not null default '[]',
    meta        jsonb not null default '{}',
    created_at  timestamptz not null default now()
);

alter table profiles        enable row level security;
alter table concept_mastery enable row level security;
alter table sessions        enable row level security;
alter table interactions    enable row level security;
alter table agent_events    enable row level security;
alter table rag_requests    enable row level security;

create policy "own profile"      on profiles        for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own mastery"      on concept_mastery for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own sessions"     on sessions        for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own interactions" on interactions    for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own agent events" on agent_events    for select to authenticated using (user_id = auth.uid());
-- rag_requests: no policies -> backend-only.

-- Auto-create a profile when a user signs up.
create or replace function handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin
    insert into profiles (user_id, display_name)
    values (new.id, coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)))
    on conflict do nothing;
    return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function handle_new_user();
