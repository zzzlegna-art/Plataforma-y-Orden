create table if not exists public.ai_automation_tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  instruction text not null,
  status text not null default 'pending',
  result jsonb,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.ai_automation_tasks enable row level security;

create policy "Users can view own AI tasks"
on public.ai_automation_tasks
for select
using (auth.uid() = user_id);

create policy "Users can create own AI tasks"
on public.ai_automation_tasks
for insert
with check (auth.uid() = user_id);
