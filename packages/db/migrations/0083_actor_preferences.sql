-- How each person likes the app to behave — page size, theme, default
-- landing page. One flexible bucket rather than a column per preference,
-- same reasoning as lookup_value.meta.
alter table actor add column preferences jsonb not null default '{}'::jsonb;
