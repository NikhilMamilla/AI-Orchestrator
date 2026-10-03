-- Which concept each wrong option was taken from: choosing it reveals what the learner confuses the topic with.
alter table quiz_items add column if not exists option_sources jsonb not null default '[]';
