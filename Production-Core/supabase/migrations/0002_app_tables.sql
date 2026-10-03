-- Domain on documents (concept map colouring), learner profile document, code submissions.
alter table documents add column if not exists domain text not null default 'foundations';

-- The learner profile is a nested document (mastery list, learning style, patterns, goal), so JSONB
-- is the natural fit; row-level security still scopes it to its owner.
create table if not exists student_profiles (
    user_id    uuid primary key references auth.users(id) on delete cascade,
    data       jsonb not null default '{}',
    updated_at timestamptz not null default now()
);

create table if not exists code_submissions (
    id         bigint generated always as identity primary key,
    user_id    uuid not null references auth.users(id) on delete cascade,
    language   text not null,
    source_code text not null check (length(source_code) <= 100000),
    stdin      text,
    stdout     text,
    stderr     text,
    status     text,
    status_id  integer,
    created_at timestamptz not null default now()
);
create index if not exists code_submissions_user_idx on code_submissions (user_id, created_at desc);

alter table student_profiles  enable row level security;
alter table code_submissions  enable row level security;
create policy "own student profile" on student_profiles for all to authenticated
    using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own submissions" on code_submissions for select to authenticated using (user_id = auth.uid());
-- inserts happen only through the backend (service connection), after server-side validation.
