-- Learning Journey, Fase 1. Modelo mínimo para um único utilizador (o proprietário).
-- Regra de acesso: só quem é o proprietário (linha única em profile) lê ou escreve. O papel anon não tem acesso a nada.

create table public.profile (
  singleton  boolean primary key default true check (singleton),   -- garante no máximo uma linha
  user_id    uuid not null unique references auth.users (id) on delete cascade,
  objective  text not null,
  created_at timestamptz not null default now()
);

create table public.courses (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  platform      text,
  competency_id text,
  status        text not null check (status in ('planned', 'in_progress', 'completed')),
  completed_on  date,
  created_at    timestamptz not null default now()
);

create table public.learning_history (
  id          uuid primary key default gen_random_uuid(),
  occurred_on date not null default current_date,
  note        text not null,
  created_at  timestamptz not null default now()
);

create table public.analyses (
  id         uuid primary key default gen_random_uuid(),
  lang       text not null check (lang in ('pt-PT', 'en-GB')),
  basis      text not null default 'studies_history',   -- mais tarde: 'studies_history_github'
  model      text not null,
  result     jsonb not null,
  created_at timestamptz not null default now()
);
create index analyses_created_at_idx on public.analyses (created_at desc);

-- O proprietário é quem tem a linha em profile. Função segura e estável para as políticas.
create function public.is_owner() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profile where user_id = (select auth.uid()))
$$;
revoke all on function public.is_owner() from public, anon;
grant execute on function public.is_owner() to authenticated;

alter table public.profile          enable row level security;
alter table public.courses          enable row level security;
alter table public.learning_history enable row level security;
alter table public.analyses         enable row level security;

-- profile: o primeiro utilizador autenticado cria a sua linha (a constraint singleton impede uma segunda).
create policy profile_select on public.profile for select to authenticated using (user_id = (select auth.uid()));
create policy profile_insert on public.profile for insert to authenticated with check (user_id = (select auth.uid()));
create policy profile_update on public.profile for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy courses_owner on public.courses          for all to authenticated using (public.is_owner()) with check (public.is_owner());
create policy history_owner on public.learning_history for all to authenticated using (public.is_owner()) with check (public.is_owner());
create policy analyses_owner on public.analyses        for all to authenticated using (public.is_owner()) with check (public.is_owner());

revoke all on public.profile, public.courses, public.learning_history, public.analyses from anon;
