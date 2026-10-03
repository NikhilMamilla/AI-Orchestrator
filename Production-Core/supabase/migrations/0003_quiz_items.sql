-- Server-held check questions. The keyed answer lives only here: no RLS policy exists, so users can
-- never read `answer_index` through the Supabase client; only the backend (service connection) can.
create table if not exists quiz_items (
    id            uuid primary key default gen_random_uuid(),
    user_id       uuid not null references auth.users(id) on delete cascade,
    doc_id        text not null references documents(id) on delete cascade,
    chunk_id      text,
    question      text not null,
    options       jsonb not null,
    answer_index  smallint not null check (answer_index between 0 and 3),
    explanation   text not null default '',
    notes         jsonb not null default '[]',
    generated_by  text not null default 'llm',
    created_at    timestamptz not null default now(),
    answered_at   timestamptz,
    chosen_index  smallint,
    correct       boolean
);
create index if not exists quiz_items_user_idx on quiz_items (user_id, created_at desc);
alter table quiz_items enable row level security;   -- intentionally no policies (backend-only)
