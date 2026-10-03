-- Questions the evidence gate refused. Deliberately has NO user column: admins see topics, not people.
create table if not exists content_gaps (
    id         bigserial primary key,
    question   text not null check (char_length(question) <= 300),
    created_at timestamptz not null default now()
);
create index if not exists content_gaps_created_idx on content_gaps (created_at desc);
alter table content_gaps enable row level security;     -- no policies: only the server (service connection) can read or write
