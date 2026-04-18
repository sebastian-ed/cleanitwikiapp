create extension if not exists pgcrypto;

create schema if not exists app;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique,
  full_name text,
  department text,
  job_title text,
  role text not null default 'user' check (role in ('admin', 'user')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.spaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  description text,
  icon text default '📚',
  nav_order integer not null default 100,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces(id) on delete cascade,
  parent_id uuid references public.categories(id) on delete set null,
  name text not null,
  slug text not null,
  description text,
  icon text default '🗂️',
  nav_order integer not null default 100,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (space_id, slug)
);

create table if not exists public.pages (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces(id) on delete cascade,
  category_id uuid references public.categories(id) on delete set null,
  parent_page_id uuid references public.pages(id) on delete set null,
  title text not null,
  slug text not null,
  summary text,
  body_md text not null default '',
  icon text default '📄',
  cover_url text,
  status text not null default 'published' check (status in ('draft', 'published')),
  visibility text not null default 'internal' check (visibility in ('internal', 'public')),
  featured boolean not null default false,
  nav_order integer not null default 100,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (space_id, slug)
);

create table if not exists public.resources (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  kind text not null check (kind in ('file', 'link', 'video', 'image', 'embed')),
  status text not null default 'published' check (status in ('draft', 'published')),
  folder text default 'general',
  url text,
  preview_url text,
  storage_bucket text,
  storage_path text,
  mime_type text,
  size_bytes bigint,
  space_id uuid references public.spaces(id) on delete set null,
  linked_page_id uuid references public.pages(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

create index if not exists idx_categories_space_id on public.categories(space_id);
create index if not exists idx_pages_space_id on public.pages(space_id);
create index if not exists idx_pages_category_id on public.pages(category_id);
create index if not exists idx_pages_status on public.pages(status);
create index if not exists idx_resources_status on public.resources(status);
create index if not exists idx_resources_space_id on public.resources(space_id);
create index if not exists idx_resources_page_id on public.resources(linked_page_id);

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at
before update on public.profiles
for each row
execute function public.set_updated_at();

drop trigger if exists set_spaces_updated_at on public.spaces;
create trigger set_spaces_updated_at
before update on public.spaces
for each row
execute function public.set_updated_at();

drop trigger if exists set_categories_updated_at on public.categories;
create trigger set_categories_updated_at
before update on public.categories
for each row
execute function public.set_updated_at();

drop trigger if exists set_pages_updated_at on public.pages;
create trigger set_pages_updated_at
before update on public.pages
for each row
execute function public.set_updated_at();

drop trigger if exists set_resources_updated_at on public.resources;
create trigger set_resources_updated_at
before update on public.resources
for each row
execute function public.set_updated_at();


drop trigger if exists set_app_settings_updated_at on public.app_settings;
create trigger set_app_settings_updated_at
before update on public.app_settings
for each row
execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, role, is_active)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    'user',
    true
  )
  on conflict (id) do update
  set email = excluded.email,
      full_name = coalesce(public.profiles.full_name, excluded.full_name);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.handle_new_user();

create or replace function app.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and is_active = true
  );
$$;

create or replace function app.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and is_active = true
      and role = 'admin'
  );
$$;

grant usage on schema app to authenticated, anon;
grant execute on function app.is_active_user() to authenticated, anon;
grant execute on function app.is_admin() to authenticated, anon;

create or replace function public.update_my_profile(
  p_full_name text,
  p_department text,
  p_job_title text
)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.profiles;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  update public.profiles
  set full_name = nullif(trim(p_full_name), ''),
      department = nullif(trim(p_department), ''),
      job_title = nullif(trim(p_job_title), '')
  where id = auth.uid()
  returning * into v_row;

  return v_row;
end;
$$;

grant execute on function public.update_my_profile(text, text, text) to authenticated;

create or replace function public.bootstrap_first_admin()
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.profiles;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  if exists (
    select 1
    from public.profiles
    where role = 'admin'
      and is_active = true
  ) then
    raise exception 'Ya existe un administrador activo';
  end if;

  update public.profiles
  set role = 'admin',
      is_active = true
  where id = v_uid
  returning * into v_row;

  return v_row;
end;
$$;

grant execute on function public.bootstrap_first_admin() to authenticated;

alter table public.profiles enable row level security;
alter table public.spaces enable row level security;
alter table public.categories enable row level security;
alter table public.pages enable row level security;
alter table public.resources enable row level security;
alter table public.app_settings enable row level security;

-- profiles
drop policy if exists "profiles_select_self_or_admin" on public.profiles;
create policy "profiles_select_self_or_admin"
on public.profiles
for select
using (id = auth.uid() or app.is_admin());

drop policy if exists "profiles_update_admin" on public.profiles;
create policy "profiles_update_admin"
on public.profiles
for update
using (app.is_admin())
with check (app.is_admin());

-- spaces
drop policy if exists "spaces_read_active_users" on public.spaces;
create policy "spaces_read_active_users"
on public.spaces
for select
using (app.is_active_user());

drop policy if exists "spaces_admin_all" on public.spaces;
create policy "spaces_admin_all"
on public.spaces
for all
using (app.is_admin())
with check (app.is_admin());

-- categories
drop policy if exists "categories_read_active_users" on public.categories;
create policy "categories_read_active_users"
on public.categories
for select
using (app.is_active_user());

drop policy if exists "categories_admin_all" on public.categories;
create policy "categories_admin_all"
on public.categories
for all
using (app.is_admin())
with check (app.is_admin());

-- pages
drop policy if exists "pages_read_active_users" on public.pages;
create policy "pages_read_active_users"
on public.pages
for select
using (
  app.is_active_user()
  and (
    status = 'published'
    or app.is_admin()
  )
);

drop policy if exists "pages_admin_all" on public.pages;
create policy "pages_admin_all"
on public.pages
for all
using (app.is_admin())
with check (app.is_admin());

-- resources
drop policy if exists "resources_read_active_users" on public.resources;
create policy "resources_read_active_users"
on public.resources
for select
using (
  app.is_active_user()
  and (
    status = 'published'
    or app.is_admin()
  )
);

drop policy if exists "resources_admin_all" on public.resources;
create policy "resources_admin_all"
on public.resources
for all
using (app.is_admin())
with check (app.is_admin());

-- app settings
drop policy if exists "settings_read_active_users" on public.app_settings;
create policy "settings_read_active_users"
on public.app_settings
for select
using (app.is_active_user());

drop policy if exists "settings_admin_all" on public.app_settings;
create policy "settings_admin_all"
on public.app_settings
for all
using (app.is_admin())
with check (app.is_admin());

-- storage bucket (private)
insert into storage.buckets (id, name, public)
values ('wiki-assets', 'wiki-assets', false)
on conflict (id) do nothing;

drop policy if exists "wiki_assets_select_active_users" on storage.objects;
create policy "wiki_assets_select_active_users"
on storage.objects
for select
using (
  bucket_id = 'wiki-assets'
  and app.is_active_user()
);

drop policy if exists "wiki_assets_insert_admin" on storage.objects;
create policy "wiki_assets_insert_admin"
on storage.objects
for insert
with check (
  bucket_id = 'wiki-assets'
  and app.is_admin()
);

drop policy if exists "wiki_assets_update_admin" on storage.objects;
create policy "wiki_assets_update_admin"
on storage.objects
for update
using (
  bucket_id = 'wiki-assets'
  and app.is_admin()
)
with check (
  bucket_id = 'wiki-assets'
  and app.is_admin()
);

drop policy if exists "wiki_assets_delete_admin" on storage.objects;
create policy "wiki_assets_delete_admin"
on storage.objects
for delete
using (
  bucket_id = 'wiki-assets'
  and app.is_admin()
);

insert into public.spaces (name, slug, description, icon, nav_order)
values
  ('Recursos Humanos', 'rrhh', 'Recibos, licencias, altas, bajas, ART, políticas y dudas frecuentes.', '👥', 10),
  ('Operaciones', 'operaciones', 'Manual operario, instructivos por servicio, checklists y SOPs.', '🧽', 20),
  ('Seguridad y Calidad', 'seguridad-calidad', 'Capacitaciones, EPP, incidentes, auditorías y estándares.', '🦺', 30),
  ('Administración', 'administracion', 'Compras, proveedores, documentación fiscal y soporte interno.', '📊', 40)
on conflict (slug) do nothing;

insert into public.app_settings (key, value)
values (
  'branding',
  jsonb_build_object(
    'app_name', 'Clean It Wiki',
    'tagline', 'Base viva de conocimiento interno',
    'primary_color', '#1f6feb',
    'logo_text', 'CI',
    'home_title', 'Toda la operación en un solo punto de verdad',
    'home_copy', 'Centralizá RRHH, procedimientos, adjuntos, videos y capacitación operativa sin depender de chats ni archivos sueltos.'
  )
)
on conflict (key) do nothing;
