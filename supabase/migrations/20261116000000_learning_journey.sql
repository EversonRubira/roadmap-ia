-- ============================================================================
-- Learning Journey — schema inicial
--
-- Princípios:
--   * Uma única pessoa (o proprietário) escreve. Todas as tabelas com dados
--     pessoais têm RLS ligada e só aceitam `authenticated` + `user_id = auth.uid()`
--     + `is_owner()`.
--   * `anon` (visitantes, portfólio) não tem acesso a NENHUMA tabela. Só lê a
--     view `public_journey`, que é derivada exclusivamente de dados marcados
--     como públicos.
--   * Saídas de IA (recommendations, competency_assessments, analysis_runs) só
--     são escritas por Edge Functions (service role, depois de validar o JWT) ou
--     por funções SECURITY DEFINER que verificam `auth.uid()`. O browser não
--     consegue fabricá-las.
--   * Desligar "Allow new users to sign up" no Supabase Auth (ver docs/DEPLOY.md).
--     A RLS é a segunda barreira, não a única.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Utilitários
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
create table public.profiles (
  id                          uuid primary key references auth.users(id) on delete cascade,
  is_owner                    boolean not null default true,
  preferred_language          text not null default 'pt-PT' check (preferred_language in ('pt-PT','en-GB')),
  public_language             text not null default 'pt-PT' check (public_language in ('pt-PT','en-GB')),
  professional_goal           text check (char_length(professional_goal) <= 1000),   -- privado
  weekly_hours                smallint not null default 5 check (weekly_hours between 1 and 80),
  -- textos públicos escritos manualmente (nunca derivados de notas privadas)
  public_focus_description_pt text check (char_length(public_focus_description_pt) <= 400),
  public_focus_description_en text check (char_length(public_focus_description_en) <= 400),
  public_next_direction_pt    text check (char_length(public_next_direction_pt) <= 200),
  public_next_direction_en    text check (char_length(public_next_direction_en) <= 200),
  recommendation_stale        boolean not null default true,  -- há informação nova desde a última recomendação
  legacy_migrated_at          timestamptz,                    -- roadmap-ia-v1 importado
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);
-- sistema pessoal: no máximo um perfil
create unique index profiles_single_owner on public.profiles ((true));
create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

create or replace function public.is_owner()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and is_owner)
$$;

-- ---------------------------------------------------------------------------
-- competencies
-- ---------------------------------------------------------------------------
create table public.competencies (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references public.profiles(id) on delete cascade,
  slug                  text not null check (slug ~ '^[a-z0-9-]+$'),
  name_pt               text not null,
  name_en               text not null,
  description_pt        text not null,
  description_en        text not null,
  status                text not null default 'exploring' check (status in ('exploring','developing','applied')),
  is_current_focus      boolean not null default false,
  assessment_confidence text check (assessment_confidence in ('low','medium','high')),
  assessment_source     text not null default 'default' check (assessment_source in ('default','ai','user')),
  gaps                  jsonb not null default '{}'::jsonb,   -- {"pt-PT":[...],"en-GB":[...]} (gerado por idioma)
  criteria_pt           text[] not null default '{}',          -- o que demonstraria a competência
  criteria_en           text[] not null default '{}',
  priority_weight       smallint not null default 3 check (priority_weight between 1 and 5), -- relevância profissional
  sort_order            smallint not null,
  is_public             boolean not null default false,        -- nada é público sem decisão explícita
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (user_id, slug)
);
create unique index competencies_one_focus on public.competencies (user_id) where is_current_focus;
create index competencies_user_order on public.competencies (user_id, sort_order);
create trigger competencies_touch before update on public.competencies
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- repositories (fonte futura de evidências; nada é analisado automaticamente)
-- ---------------------------------------------------------------------------
create table public.repositories (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.profiles(id) on delete cascade,
  full_name        text not null check (full_name ~ '^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$'),
  url              text,
  repo_visibility  text not null default 'private' check (repo_visibility in ('private','public')),
  is_client_work   boolean not null default false,
  analysis_allowed boolean not null default false,   -- autorização explícita para enviar conteúdo a Claude
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (user_id, full_name),
  constraint repo_client_never_analysed check (not (is_client_work and analysis_allowed))
);
create trigger repositories_touch before update on public.repositories
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- learning_resources (cursos antigos e futuros: catálogo, não lista obrigatória)
-- ---------------------------------------------------------------------------
create table public.learning_resources (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.profiles(id) on delete cascade,
  legacy_id         text,                    -- id do roadmap-ia-v1 (ex.: "ea-1-1"); chave de idempotência
  title             text not null,
  provider          text not null,
  url               text,
  hours             smallint check (hours > 0),
  resource_type     text not null default 'course' check (resource_type in ('course','documentation','book','video','other')),
  competency_slugs  text[] not null default '{}',
  status            text not null default 'available' check (status in ('available','completed','dismissed')),
  completed_at      timestamptz,
  legacy_note       text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint resource_completed_has_date check (status <> 'completed' or completed_at is not null)
);
-- índice único NÃO parcial: PostgREST precisa dele para `on_conflict` (NULLs não colidem entre si)
create unique index learning_resources_legacy on public.learning_resources (user_id, legacy_id);
create trigger learning_resources_touch before update on public.learning_resources
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- evidence
-- ---------------------------------------------------------------------------
create table public.evidence (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references public.profiles(id) on delete cascade,
  competency_id       uuid not null references public.competencies(id) on delete cascade,
  evidence_type       text not null check (evidence_type in (
                        'implementation','course','documentation','production','architecture_decision',
                        'presentation','experiment','tests','llm_evaluation','personal_project','professional_experience')),
  title_pt            text check (char_length(title_pt) between 1 and 200),
  title_en            text check (char_length(title_en) between 1 and 200),
  description_pt      text check (char_length(description_pt) <= 1000),
  description_en      text check (char_length(description_en) <= 1000),
  source_url          text check (source_url is null or source_url ~* '^https?://'),
  repository_id       uuid references public.repositories(id) on delete set null,
  learning_resource_id uuid references public.learning_resources(id) on delete set null,
  occurred_at         date not null default current_date,
  visibility          text not null default 'private' check (visibility in ('private','public')),
  verification_status text not null default 'self_declared' check (verification_status in ('self_declared','from_source','verified')),
  is_client_work      boolean not null default false,
  share_with_ai       boolean not null default false,  -- só evidência autorizada é enviada a Claude
  source_key          text,                            -- idempotência (ex.: "legacy:ea-1-1")
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint evidence_has_title check (title_pt is not null or title_en is not null),
  -- trabalho de clientes: sempre privado e nunca enviado a Claude
  constraint evidence_client_private check (not is_client_work or (visibility = 'private' and not share_with_ai))
);
create unique index evidence_source_key on public.evidence (user_id, source_key);
create index evidence_user_comp on public.evidence (user_id, competency_id);
create index evidence_public on public.evidence (user_id) where visibility = 'public';
create trigger evidence_touch before update on public.evidence
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- analysis_runs: registo de custo/uso de Claude + contador de quotas
-- (escrita só por service role)
-- ---------------------------------------------------------------------------
create table public.analysis_runs (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.profiles(id) on delete cascade,
  kind           text not null check (kind in ('analysis','generation','explanation')),
  status         text not null default 'pending' check (status in ('pending','ok','error')),
  model          text,
  input_tokens   integer,
  output_tokens  integer,
  cost_usd       numeric(10,6),
  latency_ms     integer,
  error_code     text,           -- código curto; nunca stack traces
  created_at     timestamptz not null default now()
);
create index analysis_runs_quota on public.analysis_runs (user_id, kind, created_at desc);

-- reserva atómica de quota diária (dia de Lisboa). Só service_role pode executar.
create or replace function public.reserve_ai_quota(p_user uuid, p_kind text, p_limit integer)
returns uuid language plpgsql security definer set search_path = public as $$
declare used integer; rid uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user::text || ':' || p_kind, 0));
  select count(*) into used from public.analysis_runs
   where user_id = p_user and kind = p_kind
     and (created_at at time zone 'Europe/Lisbon')::date = (now() at time zone 'Europe/Lisbon')::date;
  if used >= p_limit then
    raise exception 'quota_exceeded' using errcode = 'P0001';
  end if;
  insert into public.analysis_runs (user_id, kind) values (p_user, p_kind) returning id into rid;
  return rid;
end $$;

-- ---------------------------------------------------------------------------
-- recommendations (candidatos determinísticos + recomendação gerada)
-- ---------------------------------------------------------------------------
create table public.recommendations (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references public.profiles(id) on delete cascade,
  competency_id       uuid not null references public.competencies(id) on delete cascade,
  kind                text not null check (kind in ('learn','apply','consolidate','demonstrate')),
  status              text not null default 'candidate' check (status in (
                        'candidate','active','accepted','rejected','deferred','already_known','completed','superseded')),
  score               numeric(6,3) not null default 0,   -- SÓ ordena candidatos; não é verdade científica
  score_factors       jsonb not null default '{}'::jsonb,
  -- conteúdo gerado (null enquanto for apenas candidato)
  language            text check (language in ('pt-PT','en-GB')),
  title               text,
  reason              text,
  action_type         text check (action_type in ('course','documentation','project','improvement','demonstration')),
  estimated_hours_min smallint check (estimated_hours_min >= 0),
  estimated_hours_max smallint check (estimated_hours_max >= estimated_hours_min),
  expected_evidence   jsonb,
  acceptance_criteria jsonb,
  learning_resources  jsonb,
  confidence          text check (confidence in ('low','medium','high')),
  explanations        jsonb not null default '{}'::jsonb,  -- cache de explain-recommendation
  run_id              uuid references public.analysis_runs(id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint rec_generated_complete check (
    status = 'candidate' or (title is not null and reason is not null and language is not null))
);
-- no máximo uma recomendação ativa (um único bloco principal na tela Agora)
create unique index recommendations_one_active on public.recommendations (user_id) where status = 'active';
create index recommendations_user_status on public.recommendations (user_id, status, score desc);
create trigger recommendations_touch before update on public.recommendations
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- recommendation_feedback
-- ---------------------------------------------------------------------------
create table public.recommendation_feedback (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.profiles(id) on delete cascade,
  recommendation_id uuid not null references public.recommendations(id) on delete cascade,
  feedback          text not null check (feedback in ('accepted','rejected','deferred','already_known','completed')),
  reason            text check (reason in ('already_know','not_relevant','not_applicable','too_much_effort','other_area','wrong_assessment','other')),
  note              text check (char_length(note) <= 500),   -- privado
  created_at        timestamptz not null default now(),
  constraint reason_only_for_rejected check (reason is null or feedback = 'rejected')
);
create index recommendation_feedback_user on public.recommendation_feedback (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- learning_steps (etapa em andamento) e registos de avanço
-- ---------------------------------------------------------------------------
create table public.learning_steps (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.profiles(id) on delete cascade,
  recommendation_id uuid references public.recommendations(id) on delete set null,
  competency_id     uuid not null references public.competencies(id) on delete cascade,
  title             text not null,
  language          text not null check (language in ('pt-PT','en-GB')),
  status            text not null default 'in_progress' check (status in ('in_progress','completed','abandoned')),
  started_at        timestamptz not null default now(),
  completed_at      timestamptz,
  updated_at        timestamptz not null default now()
);
-- sem gestor de tarefas: uma etapa em andamento de cada vez
create unique index learning_steps_one_in_progress on public.learning_steps (user_id) where status = 'in_progress';
create trigger learning_steps_touch before update on public.learning_steps
  for each row execute function public.touch_updated_at();

create table public.learning_step_logs (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  step_id    uuid not null references public.learning_steps(id) on delete cascade,
  note       text not null check (char_length(note) between 1 and 1000),   -- privado
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- competency_assessments: sugestões da IA, sempre sujeitas a confirmação
-- ---------------------------------------------------------------------------
create table public.competency_assessments (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.profiles(id) on delete cascade,
  competency_id  uuid not null references public.competencies(id) on delete cascade,
  language       text not null check (language in ('pt-PT','en-GB')),
  suggested_status     text not null check (suggested_status in ('exploring','developing','applied')),
  suggested_confidence text not null check (suggested_confidence in ('low','medium','high')),
  found          jsonb not null default '[]'::jsonb,    -- evidências reconhecidas (texto)
  missing        jsonb not null default '[]'::jsonb,    -- evidências em falta (texto)
  state          text not null default 'suggested' check (state in ('suggested','accepted','corrected','dismissed')),
  run_id         uuid references public.analysis_runs(id) on delete set null,
  created_at     timestamptz not null default now()
);
create index competency_assessments_comp on public.competency_assessments (user_id, competency_id, created_at desc);

-- ---------------------------------------------------------------------------
-- repository_analyses (reservado: análise futura de repositórios autorizados)
-- ---------------------------------------------------------------------------
create table public.repository_analyses (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles(id) on delete cascade,
  repository_id uuid not null references public.repositories(id) on delete cascade,
  summary       jsonb not null default '{}'::jsonb,
  run_id        uuid references public.analysis_runs(id) on delete set null,
  created_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- legacy_backups: cópia integral do estado roadmap-ia-v1 antes de migrar
-- ---------------------------------------------------------------------------
create table public.legacy_backups (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  source     text not null default 'roadmap-ia-v1',
  payload    jsonb not null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Sinalizar "informação nova" (nunca chama Claude por si só)
-- ---------------------------------------------------------------------------
create or replace function public.mark_recommendation_stale()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.profiles set recommendation_stale = true where id = new.user_id and not recommendation_stale;
  return new;
end $$;

create trigger evidence_marks_stale after insert on public.evidence
  for each row execute function public.mark_recommendation_stale();
create trigger steps_complete_marks_stale after update of status on public.learning_steps
  for each row when (new.status = 'completed') execute function public.mark_recommendation_stale();

create or replace function public.mark_stale_on_goal_change()
returns trigger language plpgsql as $$
begin
  if new.professional_goal is distinct from old.professional_goal
     or new.weekly_hours is distinct from old.weekly_hours then
    new.recommendation_stale = true;
  end if;
  return new;
end $$;
create trigger profiles_goal_stale before update on public.profiles
  for each row execute function public.mark_stale_on_goal_change();

-- ---------------------------------------------------------------------------
-- Seed das competências (executado por bootstrap_owner)
-- ---------------------------------------------------------------------------
create or replace function public.seed_competencies(p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.competencies
    (user_id, slug, name_pt, name_en, description_pt, description_en, criteria_pt, criteria_en, priority_weight, sort_order)
  values
  (p_user,'llm-integration','LLM Integration','LLM Integration',
   'Integrar modelos de linguagem em aplicações: chamadas à API, saídas estruturadas, streaming, tratamento de erros e custos.',
   'Integrate language models into applications: API calls, structured outputs, streaming, error handling and cost.',
   array['Integrar uma API de LLM num serviço real com tratamento de erros e limites','Validar saídas estruturadas com um schema','Registar tokens, latência e custo por chamada'],
   array['Integrate an LLM API into a real service with error and limit handling','Validate structured outputs against a schema','Log tokens, latency and cost per call'],
   5, 1),
  (p_user,'context-engineering','Context Engineering','Context Engineering',
   'Decidir o que entra no contexto do modelo: instruções, exemplos, memória, resumos e controlo do tamanho e do custo.',
   'Decide what goes into the model context: instructions, examples, memory, summaries, and control of size and cost.',
   array['Desenhar prompts versionados com instruções e exemplos justificados','Gerir o tamanho do contexto (cortes, resumos, caching)','Documentar o que o modelo recebe e porquê'],
   array['Design versioned prompts with justified instructions and examples','Manage context size (trimming, summaries, caching)','Document what the model receives and why'],
   4, 2),
  (p_user,'retrieval','Retrieval','Retrieval',
   'Recuperar informação relevante para o modelo: embeddings, pesquisa semântica, RAG e avaliação da qualidade da recuperação.',
   'Retrieve relevant information for the model: embeddings, semantic search, RAG and retrieval quality evaluation.',
   array['Construir um pipeline de RAG sobre dados reais','Medir a qualidade da recuperação com exemplos esperados','Documentar limitações e falhas conhecidas'],
   array['Build a RAG pipeline over real data','Measure retrieval quality against expected examples','Document known limitations and failures'],
   4, 3),
  (p_user,'agents-tools','Agents & Tools','Agents & Tools',
   'Dar ferramentas a modelos e orquestrar fluxos de agentes: tool use, MCP, grafos de estado e limites de autonomia.',
   'Give tools to models and orchestrate agent flows: tool use, MCP, state graphs and autonomy limits.',
   array['Implementar um agente com ferramentas próprias e limites explícitos','Expor ou consumir um servidor MCP','Tratar falhas de ferramentas e loops'],
   array['Implement an agent with custom tools and explicit limits','Expose or consume an MCP server','Handle tool failures and loops'],
   5, 4),
  (p_user,'evals-reliability','Evals & Reliability','Evals & Reliability',
   'Medir e melhorar a fiabilidade de funcionalidades com LLM: datasets, avaliações reproduzíveis, regressões e baselines.',
   'Measure and improve the reliability of LLM features: datasets, reproducible evaluations, regressions and baselines.',
   array['Criar um dataset de avaliação versionado','Definir resultados esperados e executar regressão de forma reproduzível','Documentar falhas, limitações e baseline'],
   array['Create a versioned evaluation dataset','Define expected results and run regressions reproducibly','Document failures, limitations and a baseline'],
   5, 5),
  (p_user,'safety-control','Safety & Control','Safety & Control',
   'Limitar o que a IA pode fazer: validação de entradas e saídas, injeção de prompts, permissões, privacidade e confirmação humana.',
   'Limit what AI can do: input and output validation, prompt injection, permissions, privacy and human confirmation.',
   array['Modelar ameaças de um sistema com agentes ou ferramentas','Aplicar o princípio do menor privilégio e confirmação humana','Testar cenários de injeção de prompts'],
   array['Threat-model a system with agents or tools','Apply least privilege and human confirmation','Test prompt-injection scenarios'],
   4, 6),
  (p_user,'production-ai','Production AI','Production AI',
   'Operar funcionalidades de IA em produção: observabilidade, custos, limites, versões de modelos e resposta a incidentes.',
   'Operate AI features in production: observability, cost, limits, model versions and incident response.',
   array['Monitorizar uma funcionalidade com LLM em produção (traces, custo, latência)','Definir limites e alertas de custo','Gerir a mudança de versões de modelo com testes de regressão'],
   array['Monitor an LLM feature in production (traces, cost, latency)','Set cost limits and alerts','Manage model version changes with regression tests'],
   4, 7),
  (p_user,'ai-native-engineering','AI-Native Software Engineering','AI-Native Software Engineering',
   'Usar IA no fluxo de engenharia de software com critério: especificação, revisão, testes, segurança e governança do código gerado.',
   'Use AI in the software engineering workflow with judgement: specification, review, testing, security and governance of generated code.',
   array['Documentar um fluxo de desenvolvimento assistido por IA com revisão e testes','Definir regras de qualidade para código gerado','Medir o impacto do fluxo num projeto real'],
   array['Document an AI-assisted development workflow with review and testing','Define quality rules for generated code','Measure the workflow impact on a real project'],
   3, 8)
  on conflict (user_id, slug) do nothing;
end $$;

-- ---------------------------------------------------------------------------
-- Funções de aplicação (SECURITY DEFINER só onde indispensável; todas
-- verificam auth.uid() e is_owner())
-- ---------------------------------------------------------------------------

-- Primeiro login do proprietário: cria o perfil e semeia as competências.
-- Falha se já existir um perfil (outro utilizador nunca se torna proprietário).
create or replace function public.bootstrap_owner()
returns uuid language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if exists (select 1 from public.profiles where id = uid) then
    return uid;  -- idempotente para o próprio proprietário
  end if;
  if exists (select 1 from public.profiles) then
    raise exception 'owner_already_exists' using errcode = '42501';
  end if;
  insert into public.profiles (id) values (uid);
  perform public.seed_competencies(uid);
  return uid;
end $$;

-- Define o foco atual (no máximo uma competência).
create or replace function public.set_current_focus(p_slug text)
returns void language plpgsql security invoker set search_path = public as $$
begin
  if not public.is_owner() then raise exception 'forbidden' using errcode = '42501'; end if;
  update public.competencies set is_current_focus = false where user_id = auth.uid() and is_current_focus;
  if p_slug is not null then
    update public.competencies set is_current_focus = true where user_id = auth.uid() and slug = p_slug;
    if not found then raise exception 'unknown_competency'; end if;
  end if;
end $$;

-- Correção manual de avaliação (prevalece sobre a IA).
create or replace function public.correct_assessment(p_slug text, p_status text, p_confidence text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_owner() then raise exception 'forbidden' using errcode = '42501'; end if;
  update public.competencies
     set status = p_status, assessment_confidence = p_confidence, assessment_source = 'user'
   where user_id = auth.uid() and slug = p_slug;
  if not found then raise exception 'unknown_competency'; end if;
  update public.competency_assessments a set state = 'corrected'
   where a.user_id = auth.uid() and a.state = 'suggested'
     and a.competency_id = (select id from public.competencies where user_id = auth.uid() and slug = p_slug);
end $$;

-- Aceitar sugestão de avaliação da IA.
create or replace function public.accept_assessment(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare a public.competency_assessments;
begin
  if not public.is_owner() then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into a from public.competency_assessments where id = p_id and user_id = auth.uid() and state = 'suggested';
  if not found then raise exception 'not_found'; end if;
  update public.competencies
     set status = a.suggested_status, assessment_confidence = a.suggested_confidence, assessment_source = 'ai',
         gaps = jsonb_set(coalesce(gaps,'{}'::jsonb), array[a.language], a.missing, true)
   where id = a.competency_id and user_id = auth.uid();
  update public.competency_assessments set state = 'accepted' where id = p_id;
end $$;

create or replace function public.dismiss_assessment(p_id uuid)
returns void language sql security definer set search_path = public as $$
  update public.competency_assessments set state = 'dismissed'
   where id = p_id and user_id = auth.uid() and state = 'suggested' and public.is_owner();
$$;

-- Feedback sobre uma recomendação (atualiza o estado, regista a razão).
create or replace function public.record_feedback(p_rec uuid, p_feedback text, p_reason text default null, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare r public.recommendations;
begin
  if not public.is_owner() then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into r from public.recommendations where id = p_rec and user_id = auth.uid();
  if not found then raise exception 'not_found'; end if;
  if r.status not in ('active','accepted') then raise exception 'invalid_state'; end if;
  if p_feedback = 'accepted' or p_feedback = 'completed' then
    raise exception 'use_dedicated_function';
  end if;
  insert into public.recommendation_feedback (user_id, recommendation_id, feedback, reason, note)
    values (auth.uid(), p_rec, p_feedback, p_reason, p_note);
  update public.recommendations set status = p_feedback where id = p_rec;
  update public.profiles set recommendation_stale = true where id = auth.uid();
end $$;

-- Aceitar a recomendação ativa: cria a etapa em andamento.
create or replace function public.accept_recommendation(p_rec uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare r public.recommendations; sid uuid;
begin
  if not public.is_owner() then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into r from public.recommendations where id = p_rec and user_id = auth.uid() and status = 'active';
  if not found then raise exception 'not_found'; end if;
  if exists (select 1 from public.learning_steps where user_id = auth.uid() and status = 'in_progress') then
    raise exception 'step_already_in_progress';
  end if;
  insert into public.recommendation_feedback (user_id, recommendation_id, feedback) values (auth.uid(), p_rec, 'accepted');
  update public.recommendations set status = 'accepted' where id = p_rec;
  insert into public.learning_steps (user_id, recommendation_id, competency_id, title, language)
    values (auth.uid(), r.id, r.competency_id, r.title, r.language) returning id into sid;
  return sid;
end $$;

-- Concluir a etapa em andamento.
create or replace function public.complete_step(p_step uuid, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare s public.learning_steps;
begin
  if not public.is_owner() then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into s from public.learning_steps where id = p_step and user_id = auth.uid() and status = 'in_progress';
  if not found then raise exception 'not_found'; end if;
  if p_note is not null and length(trim(p_note)) > 0 then
    insert into public.learning_step_logs (user_id, step_id, note) values (auth.uid(), p_step, p_note);
  end if;
  update public.learning_steps set status = 'completed', completed_at = now() where id = p_step;
  if s.recommendation_id is not null then
    insert into public.recommendation_feedback (user_id, recommendation_id, feedback)
      values (auth.uid(), s.recommendation_id, 'completed');
    update public.recommendations set status = 'completed' where id = s.recommendation_id;
  end if;
end $$;

-- Troca atómica da recomendação ativa (só Edge Functions, via service role).
-- Preenche o candidato escolhido, substitui a ativa anterior e limpa o aviso de "informação nova".
create or replace function public.activate_recommendation(p_user uuid, p_id uuid, p_replace uuid, p_content jsonb, p_run uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_replace is not null then
    update public.recommendations set status = 'superseded'
     where id = p_replace and user_id = p_user and status = 'active';
  end if;
  update public.recommendations set
      status = 'active',
      language = p_content->>'language',
      title = p_content->>'title',
      reason = p_content->>'reason',
      action_type = p_content->>'actionType',
      estimated_hours_min = (p_content->'estimatedHours'->>'min')::smallint,
      estimated_hours_max = (p_content->'estimatedHours'->>'max')::smallint,
      expected_evidence = p_content->'expectedEvidence',
      acceptance_criteria = p_content->'acceptanceCriteria',
      learning_resources = p_content->'learningResources',
      confidence = p_content->>'confidence',
      run_id = p_run
   where id = p_id and user_id = p_user and status = 'candidate';
  if not found then raise exception 'candidate_not_found'; end if;
  update public.profiles set recommendation_stale = false where id = p_user;
end $$;

-- ---------------------------------------------------------------------------
-- Projeção pública (contrato v1)
-- View sem security_invoker: corre com os privilégios do dono e por isso ignora
-- a RLS das tabelas base. É o ÚNICO ponto de leitura para `anon`. Só inclui:
--   * competências com is_public = true
--   * evidências com visibility = 'public'
--   * textos públicos escritos à mão no perfil
-- Nunca inclui: notas, confiança, gaps, objetivos, recomendações, feedback,
-- repositórios, custos, histórico.
-- ---------------------------------------------------------------------------
create or replace view public.public_journey with (security_barrier = true) as
select
  1 as contract_version,
  p.public_language as preferred_public_language,
  (select jsonb_build_object(
            'slug', c.slug,
            'name', jsonb_build_object('pt-PT', c.name_pt, 'en-GB', c.name_en))
     from public.competencies c
    where c.user_id = p.id and c.is_public and c.is_current_focus
    limit 1) as current_focus,
  jsonb_build_object('pt-PT', p.public_focus_description_pt, 'en-GB', p.public_focus_description_en)
    as current_focus_description,
  (select coalesce(jsonb_agg(jsonb_build_object(
            'slug', c.slug,
            'name', jsonb_build_object('pt-PT', c.name_pt, 'en-GB', c.name_en),
            'description', jsonb_build_object('pt-PT', c.description_pt, 'en-GB', c.description_en))
          order by c.sort_order), '[]'::jsonb)
     from public.competencies c
    where c.user_id = p.id and c.is_public and c.status = 'applied') as applied_competencies,
  jsonb_build_object('pt-PT', p.public_next_direction_pt, 'en-GB', p.public_next_direction_en) as next_direction,
  (select coalesce(jsonb_agg(jsonb_build_object(
            'id', e.id,
            'competency', c.slug,
            'type', e.evidence_type,
            'title', jsonb_build_object('pt-PT', e.title_pt, 'en-GB', e.title_en),
            'description', jsonb_build_object('pt-PT', e.description_pt, 'en-GB', e.description_en),
            'url', e.source_url,
            'occurred_at', e.occurred_at)
          order by e.occurred_at desc, e.created_at desc), '[]'::jsonb)
     from public.evidence e join public.competencies c on c.id = e.competency_id
    where e.user_id = p.id and e.visibility = 'public' and not e.is_client_work) as public_evidence,
  greatest(
    p.updated_at,
    coalesce((select max(c.updated_at) from public.competencies c where c.user_id = p.id and c.is_public), p.updated_at),
    coalesce((select max(e.updated_at) from public.evidence e where e.user_id = p.id and e.visibility = 'public'), p.updated_at)
  ) as last_updated_at
from public.profiles p
where p.is_owner;

-- ---------------------------------------------------------------------------
-- Privilégios
-- ---------------------------------------------------------------------------
revoke all on all tables    in schema public from anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;
alter default privileges in schema public revoke all on tables    from anon, authenticated;
alter default privileges in schema public revoke all on functions from public, anon, authenticated;

-- leitura pública apenas da projeção
grant select on public.public_journey to anon, authenticated;

-- proprietário autenticado (a RLS filtra por linha)
grant select, insert, update, delete on
  public.profiles, public.competencies, public.evidence, public.learning_resources,
  public.repositories, public.learning_steps, public.learning_step_logs, public.legacy_backups
  to authenticated;
-- saídas de IA: só leitura direta; escrita via service role / funções
grant select on public.recommendations, public.recommendation_feedback,
  public.competency_assessments, public.analysis_runs, public.repository_analyses to authenticated;

grant execute on function public.is_owner(), public.bootstrap_owner(), public.set_current_focus(text),
  public.correct_assessment(text,text,text), public.accept_assessment(uuid), public.dismiss_assessment(uuid),
  public.record_feedback(uuid,text,text,text), public.accept_recommendation(uuid),
  public.complete_step(uuid,text) to authenticated;
-- só service_role (Edge Functions depois de validar o JWT)
grant execute on function public.reserve_ai_quota(uuid,text,integer), public.seed_competencies(uuid),
  public.activate_recommendation(uuid,uuid,uuid,jsonb,uuid) to service_role;
grant all on all tables in schema public to service_role;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.profiles               enable row level security;
alter table public.competencies           enable row level security;
alter table public.evidence               enable row level security;
alter table public.learning_resources     enable row level security;
alter table public.repositories           enable row level security;
alter table public.repository_analyses    enable row level security;
alter table public.recommendations        enable row level security;
alter table public.recommendation_feedback enable row level security;
alter table public.learning_steps         enable row level security;
alter table public.learning_step_logs     enable row level security;
alter table public.competency_assessments enable row level security;
alter table public.analysis_runs          enable row level security;
alter table public.legacy_backups         enable row level security;

-- profiles: o próprio perfil (criação só via bootstrap_owner(), que é SECURITY DEFINER)
create policy profiles_select on public.profiles for select to authenticated using (id = auth.uid() and is_owner);
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid() and is_owner) with check (id = auth.uid() and is_owner);
-- sem policy de INSERT/DELETE para authenticated => negado

-- tabelas geridas pelo proprietário (CRUD completo nas próprias linhas)
do $$
declare t text;
begin
  foreach t in array array['competencies','evidence','learning_resources','repositories','learning_step_logs','legacy_backups','learning_steps']
  loop
    execute format('create policy %I_owner_all on public.%I for all to authenticated
                    using (user_id = auth.uid() and public.is_owner())
                    with check (user_id = auth.uid() and public.is_owner())', t, t);
  end loop;
  -- tabelas só de leitura para o browser (escritas por service role / funções)
  foreach t in array array['recommendations','recommendation_feedback','competency_assessments','analysis_runs','repository_analyses']
  loop
    execute format('create policy %I_owner_select on public.%I for select to authenticated
                    using (user_id = auth.uid() and public.is_owner())', t, t);
  end loop;
end $$;
