-- Revocable, expiring read-only links a student can give a teacher or parent. Only the token's hash is stored.
create table if not exists progress_shares (
    id             uuid primary key default gen_random_uuid(),
    user_id        uuid not null references auth.users(id) on delete cascade,
    token_hash     text not null unique,
    label          text not null default '',
    created_at     timestamptz not null default now(),
    expires_at     timestamptz not null,
    revoked_at     timestamptz,
    last_viewed_at timestamptz,
    views          int not null default 0
);
create index if not exists progress_shares_user_idx on progress_shares (user_id, created_at desc);
alter table progress_shares enable row level security;
create policy progress_shares_owner on progress_shares for select using (auth.uid() = user_id);
