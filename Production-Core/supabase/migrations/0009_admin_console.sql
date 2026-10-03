-- Admin console: announcements learners see on their dashboard, and an audit log of admin actions.
-- Only the API (database role) reads or writes these; row-level security is on with no policies, so the public
-- anon/authenticated roles get nothing. No learner data lives here: `actor` is the admin's own email.

create table if not exists announcements (
    id          bigserial primary key,
    text        text not null check (char_length(text) between 1 and 280),
    level       text not null default 'info' check (level in ('info', 'warning')),
    created_by  text not null,
    created_at  timestamptz not null default now(),
    expires_at  timestamptz not null,
    retracted_at timestamptz
);
create index if not exists announcements_live on announcements (expires_at) where retracted_at is null;

create table if not exists admin_audit (
    id          bigserial primary key,
    actor       text not null,
    action      text not null,
    detail      jsonb not null default '{}',
    created_at  timestamptz not null default now()
);
create index if not exists admin_audit_recent on admin_audit (created_at desc);

alter table announcements enable row level security;
alter table admin_audit enable row level security;
