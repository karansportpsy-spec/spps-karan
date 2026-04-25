alter table if exists public.practitioners enable row level security;

drop policy if exists practitioners_self on public.practitioners;
create policy practitioners_self
  on public.practitioners
  for all
  using (auth.uid() = id)
  with check (auth.uid() = id);
