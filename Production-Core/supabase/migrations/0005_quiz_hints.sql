-- Hints used on a question: each one lowers the mastery credit for a correct answer.
alter table quiz_items add column if not exists hints_used int not null default 0;
