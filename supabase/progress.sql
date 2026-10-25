-- Таблица прогресса игроков для аккаунтов (src/cloud.ts). Выполнена в SQL Editor проекта Supabase
-- temny-rubezh 2026-10-25. RLS: каждый игрок читает и пишет только свою строку.
create table progress (user_id uuid primary key references auth.users on delete cascade, data jsonb not null, updated_at timestamptz default now());
alter table progress enable row level security;
create policy own_row on progress for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
