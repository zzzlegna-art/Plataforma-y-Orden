-- ============================================================
-- Nexora (migración histórica) AI Agent
-- Memoria y seguimiento del agente de desarrollo
-- ============================================================

create table public.bodega_ai_tasks (
  id uuid primary key default gen_random_uuid(),
  request text not null,
  status text not null default 'pending'
    check (status = any(array['pending','analyzing','processing','completed','failed'])),
  priority text not null default 'normal'
    check (priority = any(array['low','normal','high','critical'])),
  created_by uuid references public.bodega_profiles(id),
  result text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.bodega_ai_changes (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.bodega_ai_tasks(id) on delete cascade,
  file_changed text,
  database_change text,
  commit_sha text,
  pull_request_url text,
  approved boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.bodega_ai_knowledge (
  id uuid primary key default gen_random_uuid(),
  topic text not null,
  content text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.bodega_ai_tasks enable row level security;
alter table public.bodega_ai_changes enable row level security;
alter table public.bodega_ai_knowledge enable row level security;

create policy bodega_ai_tasks_admin
on public.bodega_ai_tasks
for all
using (public.bodega_is_admin())
with check (public.bodega_is_admin());

create policy bodega_ai_changes_admin
on public.bodega_ai_changes
for all
using (public.bodega_is_admin())
with check (public.bodega_is_admin());

create policy bodega_ai_knowledge_admin
on public.bodega_ai_knowledge
for all
using (public.bodega_is_admin())
with check (public.bodega_is_admin());

create index bodega_ai_tasks_status_idx
on public.bodega_ai_tasks(status);

create index bodega_ai_changes_task_idx
on public.bodega_ai_changes(task_id);
