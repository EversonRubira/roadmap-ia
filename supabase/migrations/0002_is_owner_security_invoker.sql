-- is_owner passa a SECURITY INVOKER: corre com as permissões de quem chama (a política de profile já deixa o proprietário ler a sua linha).
-- Assim deixa de ser uma função privilegiada exposta na API e o advisor de segurança do Supabase fica sem avisos.
create or replace function public.is_owner() returns boolean
language sql stable security invoker set search_path = '' as $$
  select exists (select 1 from public.profile where user_id = (select auth.uid()))
$$;
