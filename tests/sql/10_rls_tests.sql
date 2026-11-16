-- Testes de comportamento: RLS, projeção pública, quotas e fluxo de recomendação.
\set owner '''11111111-1111-1111-1111-111111111111'''
\set intruder '''22222222-2222-2222-2222-222222222222'''

create function pg_temp.expect_fail(sql text, needle text) returns void language plpgsql as $$
begin
  begin execute sql; exception when others then
    if sqlerrm ilike '%' || needle || '%' then return; end if;
    raise exception 'esperava "%" mas veio: %', needle, sqlerrm;
  end;
  raise exception 'devia ter falhado: %', sql;
end $$;
grant execute on function pg_temp.expect_fail(text,text) to public;

-- 1. bootstrap do proprietário -------------------------------------------------
set role authenticated; select set_config('request.jwt.claim.sub', :owner, false);
select public.bootstrap_owner();
do $$ begin assert (select count(*) from competencies) = 8, 'seed: 8 competências'; end $$;
do $$ begin assert (select count(*) from competencies where status='exploring' and not is_public and not is_current_focus) = 8, 'defaults seguros'; end $$;
select public.bootstrap_owner(); -- idempotente

-- 2. outro utilizador autenticado nunca vira proprietário ---------------------
select set_config('request.jwt.claim.sub', :intruder, false);
select pg_temp.expect_fail('select public.bootstrap_owner()', 'owner_already_exists');
do $$ begin assert (select count(*) from competencies) = 0, 'intruso não vê competências'; end $$;
do $$ begin assert (select count(*) from profiles) = 0, 'intruso não vê perfil'; end $$;
select pg_temp.expect_fail($$insert into evidence (user_id, competency_id, evidence_type, title_pt)
  values ('11111111-1111-1111-1111-111111111111', gen_random_uuid(), 'course', 'x')$$, 'row-level security');
select pg_temp.expect_fail($$select public.accept_recommendation(gen_random_uuid())$$, 'forbidden');

-- 3. anon: nada de tabelas; só a projeção pública ------------------------------
reset role; set role anon; select set_config('request.jwt.claim.sub', '', false);
select pg_temp.expect_fail('select * from public.evidence', 'permission denied');
select pg_temp.expect_fail('select * from public.competencies', 'permission denied');
select pg_temp.expect_fail('select * from public.recommendations', 'permission denied');
select pg_temp.expect_fail('select * from public.analysis_runs', 'permission denied');
select pg_temp.expect_fail('select * from public.profiles', 'permission denied');
select pg_temp.expect_fail($$insert into public.evidence (title_pt) values ('x')$$, 'permission denied');
select pg_temp.expect_fail('select public.bootstrap_owner()', 'permission denied');
select pg_temp.expect_fail($$update public.competencies set is_public = true$$, 'permission denied');
select pg_temp.expect_fail($$delete from public.evidence$$, 'permission denied');
do $$ begin assert (select count(*) from public_journey) = 1, 'anon lê a projeção'; end $$;
do $$ begin assert (select jsonb_array_length(public_evidence) from public_journey) = 0, 'sem evidência pública ainda'; end $$;
do $$ begin assert (select jsonb_array_length(applied_competencies) from public_journey) = 0, 'sem competências públicas'; end $$;

-- 4. proprietário: evidência privada vs pública --------------------------------
reset role; set role authenticated; select set_config('request.jwt.claim.sub', :owner, false);
insert into evidence (user_id, competency_id, evidence_type, title_pt, title_en, description_pt, visibility, source_key)
  select auth.uid(), id, 'implementation', 'SEGREDO privado', 'PRIVATE secret', 'nota privada', 'private', 'k1'
  from competencies where slug='evals-reliability';
insert into evidence (user_id, competency_id, evidence_type, title_pt, title_en, visibility)
  select auth.uid(), id, 'tests', 'AI Test Triage', 'AI Test Triage', 'public'
  from competencies where slug='evals-reliability';
select pg_temp.expect_fail($$insert into evidence (user_id, competency_id, evidence_type, title_pt, visibility, is_client_work)
  select auth.uid(), id, 'production', 'Cliente X', 'public', true from competencies limit 1$$, 'evidence_client_private');
select pg_temp.expect_fail($$insert into evidence (user_id, competency_id, evidence_type, title_pt, share_with_ai, is_client_work)
  select auth.uid(), id, 'production', 'Cliente Y', true, true from competencies limit 1$$, 'evidence_client_private');
select pg_temp.expect_fail($$insert into evidence (user_id, competency_id, evidence_type, title_pt, source_key)
  select auth.uid(), id, 'course', 'dup', 'k1' from competencies limit 1$$, 'duplicate key');
select pg_temp.expect_fail($$insert into evidence (user_id, competency_id, evidence_type) select auth.uid(), id, 'course' from competencies limit 1$$, 'evidence_has_title');
do $$ begin assert (select visibility from evidence where title_pt='SEGREDO privado') = 'private'; end $$;
do $$ begin assert (select recommendation_stale from profiles) , 'evidência marca recomendação como desatualizada'; end $$;

select public.set_current_focus('evals-reliability');
select public.set_current_focus('retrieval');
do $$ begin assert (select count(*) from competencies where is_current_focus) = 1 and
                   (select slug from competencies where is_current_focus) = 'retrieval', 'um só foco'; end $$;
select public.set_current_focus('evals-reliability');
update competencies set is_public = true, status='applied' where slug in ('evals-reliability');
update profiles set public_next_direction_pt = 'Avaliações reproduzíveis', public_next_direction_en = 'Reproducible evaluations';

reset role; set role anon;
do $$ declare j public_journey; begin
  select * into j from public_journey;
  assert jsonb_array_length(j.public_evidence) = 1, 'só 1 evidência pública';
  assert j.public_evidence->0->'title'->>'pt-PT' = 'AI Test Triage';
  assert j.applied_competencies->0->>'slug' = 'evals-reliability';
  assert j.current_focus->>'slug' = 'evals-reliability';
  assert j.next_direction->>'en-GB' = 'Reproducible evaluations';
  assert row_to_json(j)::text not ilike '%SEGREDO%' and row_to_json(j)::text not ilike '%PRIVATE secret%', 'nada de privado na projeção';
  assert row_to_json(j)::text not ilike '%confidence%' and row_to_json(j)::text not ilike '%gaps%', 'sem campos internos';
end $$;
-- competências não públicas ficam fora
reset role; set role authenticated; select set_config('request.jwt.claim.sub', :owner, false);
update competencies set is_public = false where slug='evals-reliability';
reset role; set role anon;
do $$ begin assert (select jsonb_array_length(applied_competencies) from public_journey) = 0 and (select current_focus from public_journey) is null; end $$;

-- 5. IA: o browser não consegue fabricar saídas -------------------------------
reset role; set role authenticated; select set_config('request.jwt.claim.sub', :owner, false);
select pg_temp.expect_fail($$insert into recommendations (user_id, competency_id, kind, status, title, reason, language)
  select auth.uid(), id, 'learn', 'active', 't', 'r', 'pt-PT' from competencies limit 1$$, 'permission denied');
select pg_temp.expect_fail($$insert into analysis_runs (user_id, kind) values (auth.uid(), 'generation')$$, 'permission denied');
select pg_temp.expect_fail($$select public.reserve_ai_quota(auth.uid(), 'generation', 5)$$, 'permission denied');

-- 6. quotas (service role) -----------------------------------------------------
reset role; set role service_role;
do $$ declare u uuid := '11111111-1111-1111-1111-111111111111'; begin
  perform public.reserve_ai_quota(u,'analysis',2);
  perform public.reserve_ai_quota(u,'analysis',2);
  begin perform public.reserve_ai_quota(u,'analysis',2); assert false, 'terceira devia falhar';
  exception when others then assert sqlerrm = 'quota_exceeded', sqlerrm; end;
  perform public.reserve_ai_quota(u,'generation',5); -- quotas independentes por tipo
end $$;

-- 7. fluxo de recomendação ----------------------------------------------------
insert into recommendations (user_id, competency_id, kind, status, title, reason, language, action_type, estimated_hours_min, estimated_hours_max)
  select '11111111-1111-1111-1111-111111111111', id, 'apply', 'active', 'Criar avaliação', 'porque sim', 'pt-PT', 'project', 4, 6
  from competencies where slug='evals-reliability';
select pg_temp.expect_fail($$insert into recommendations (user_id, competency_id, kind, status, title, reason, language)
  select '11111111-1111-1111-1111-111111111111', id, 'learn', 'active', 't', 'r', 'pt-PT' from competencies limit 1$$, 'recommendations_one_active');
insert into recommendations (user_id, competency_id, kind, score)
  select '11111111-1111-1111-1111-111111111111', id, 'learn', 1.5 from competencies where slug='retrieval';

reset role; set role authenticated; select set_config('request.jwt.claim.sub', :owner, false);
update profiles set recommendation_stale = false;
select pg_temp.expect_fail($$select public.record_feedback((select id from recommendations where status='candidate'), 'rejected')$$, 'invalid_state');
select public.record_feedback((select id from recommendations where status='active'), 'rejected', 'already_know', 'nota');
do $$ begin assert (select status from recommendations where title='Criar avaliação') = 'rejected'; end $$;
select pg_temp.expect_fail($$select public.record_feedback((select id from recommendations where status='rejected' limit 1), 'deferred')$$, 'invalid_state');
select pg_temp.expect_fail($$insert into recommendation_feedback (user_id, recommendation_id, feedback, reason)
  select auth.uid(), id, 'deferred', 'not_relevant' from recommendations limit 1$$, 'permission denied');

reset role; set role service_role;
update recommendations set status='active', title='Segunda', reason='r', language='en-GB' where status='candidate';
reset role; set role authenticated; select set_config('request.jwt.claim.sub', :owner, false);
select public.accept_recommendation((select id from recommendations where status='active'));
do $$ begin assert (select count(*) from learning_steps where status='in_progress') = 1; end $$;
select pg_temp.expect_fail($$select public.accept_recommendation((select id from recommendations where status='accepted'))$$, 'not_found');
select public.complete_step((select id from learning_steps where status='in_progress'), 'feito');
do $$ begin assert (select status from recommendations where title='Segunda') = 'completed';
            assert (select count(*) from learning_step_logs) = 1;
            assert (select recommendation_stale from profiles), 'concluir etapa marca desatualizado'; end $$;

-- 7b. activate_recommendation (service role): atómica e inacessível ao browser
reset role; set role authenticated; select set_config('request.jwt.claim.sub', :owner, false);
select pg_temp.expect_fail($$select public.activate_recommendation(auth.uid(), gen_random_uuid(), null, '{}'::jsonb, null)$$, 'permission denied');
reset role; set role service_role;
insert into recommendations (user_id, competency_id, kind, score) select '11111111-1111-1111-1111-111111111111', id, 'apply', 2 from competencies where slug='agents-tools';
insert into recommendations (user_id, competency_id, kind, score) select '11111111-1111-1111-1111-111111111111', id, 'learn', 1 from competencies where slug='retrieval';
select public.activate_recommendation('11111111-1111-1111-1111-111111111111',
  (select id from recommendations where status='candidate' order by score desc limit 1), null,
  '{"language":"pt-PT","title":"A","reason":"r","actionType":"project","estimatedHours":{"min":2,"max":3},"expectedEvidence":["x"],"acceptanceCriteria":["y"],"learningResources":[],"confidence":"low"}', null);
select public.activate_recommendation('11111111-1111-1111-1111-111111111111',
  (select id from recommendations where status='candidate' limit 1), (select id from recommendations where status='active'),
  '{"language":"pt-PT","title":"B","reason":"r","actionType":"course","estimatedHours":{"min":2,"max":3},"expectedEvidence":["x"],"acceptanceCriteria":["y"],"learningResources":[],"confidence":"low"}', null);
do $$ begin assert (select title from recommendations where status='active') = 'B' and
                   (select count(*) from recommendations where status='active') = 1 and
                   (select status from recommendations where title='A') = 'superseded'; end $$;
select pg_temp.expect_fail($$select public.activate_recommendation('11111111-1111-1111-1111-111111111111', gen_random_uuid(), null, '{}'::jsonb, null)$$, 'candidate_not_found');
reset role; set role authenticated; select set_config('request.jwt.claim.sub', :owner, false);

-- 8. correção manual prevalece sobre IA ---------------------------------------
select public.correct_assessment('evals-reliability','developing','medium');
do $$ begin assert (select assessment_source from competencies where slug='evals-reliability') = 'user'; end $$;

-- 9. intruso não escreve nas linhas do proprietário -----------------------------
select set_config('request.jwt.claim.sub', :intruder, false);
update competencies set status='applied';            -- 0 linhas visíveis
update profiles set professional_goal='hack';
delete from evidence;
select set_config('request.jwt.claim.sub', :owner, false);
do $$ begin assert (select status from competencies where slug='evals-reliability') = 'developing';
            assert (select professional_goal from profiles) is null;
            assert (select count(*) from evidence) = 2; end $$;
