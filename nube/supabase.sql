-- Nube del equipo para «Facturas de Proyectos» (Supabase).
-- Pégalo completo en Supabase → SQL Editor → New query → Run. Se puede correr más de una vez.

-- 1) Documentos: facturas, órdenes, pagos, proyectos y ajustes de la app.
create table if not exists public.docs (
  path text primary key,
  data jsonb,
  deleted boolean not null default false,
  updated_at timestamptz not null default clock_timestamp(),
  updated_by uuid default auth.uid()
);
create index if not exists docs_updated_at_idx on public.docs (updated_at);

-- La hora del cambio la pone la nube (no el teléfono), para que todos los teléfonos ordenen los cambios igual.
create or replace function public.docs_touch() returns trigger
language plpgsql as $$
begin
  new.updated_at := clock_timestamp();
  new.updated_by := auth.uid();
  return new;
end $$;
drop trigger if exists docs_touch on public.docs;
create trigger docs_touch before insert or update on public.docs
  for each row execute function public.docs_touch();

-- Solo los usuarios con cuenta (los que crees en Authentication → Users) pueden leer y escribir.
alter table public.docs enable row level security;
drop policy if exists "equipo lee" on public.docs;
drop policy if exists "equipo agrega" on public.docs;
drop policy if exists "equipo cambia" on public.docs;
create policy "equipo lee" on public.docs for select to authenticated using (true);
create policy "equipo agrega" on public.docs for insert to authenticated with check (true);
create policy "equipo cambia" on public.docs for update to authenticated using (true) with check (true);

-- 2) Archivos (fotos, PDF y XML de las facturas y órdenes): carpeta privada «archivos».
insert into storage.buckets (id, name, public) values ('archivos', 'archivos', false)
  on conflict (id) do nothing;
drop policy if exists "equipo lee archivos" on storage.objects;
drop policy if exists "equipo sube archivos" on storage.objects;
drop policy if exists "equipo cambia archivos" on storage.objects;
create policy "equipo lee archivos" on storage.objects for select to authenticated using (bucket_id = 'archivos');
create policy "equipo sube archivos" on storage.objects for insert to authenticated with check (bucket_id = 'archivos');
create policy "equipo cambia archivos" on storage.objects for update to authenticated using (bucket_id = 'archivos') with check (bucket_id = 'archivos');
