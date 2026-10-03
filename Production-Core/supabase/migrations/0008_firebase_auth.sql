-- Sign-in moves to Firebase Auth; the data stays here.
-- The API verifies Firebase ID tokens and maps each Firebase uid to a stable UUID (uuid5), so every `user_id uuid`
-- column keeps its type. Those users do not exist in auth.users, so the foreign keys to auth.users are dropped.
-- The API connects with the database role, so row-level security policies on these tables are unaffected.
do $$
declare r record;
begin
    for r in
        select c.conrelid::regclass as tbl, c.conname
        from pg_constraint c
        where c.contype = 'f' and c.confrelid = 'auth.users'::regclass
          and c.connamespace = 'public'::regnamespace
    loop
        execute format('alter table %s drop constraint %I', r.tbl, r.conname);
    end loop;
end $$;

-- profiles were created by a trigger on auth.users; the API creates what it needs itself
drop trigger if exists on_auth_user_created on auth.users;
