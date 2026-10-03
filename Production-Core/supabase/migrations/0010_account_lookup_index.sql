-- "Forgot password" looks an account up by the keyed hash of its email (api/v1/auth.py, /auth/account-check).
-- Without this index that lookup scans every learner profile.
create index if not exists student_profiles_account_email_idx
    on student_profiles ((data -> 'patterns' -> 'account' ->> 'email_hash'));
