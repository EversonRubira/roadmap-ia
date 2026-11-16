# Segurança

## Políticas RLS (resumo; ver o fim da migration)

| Tabela | `anon` | `authenticated` (dono) |
|---|---|---|
| `profiles` | nada | SELECT/UPDATE da própria linha; sem INSERT/DELETE (o perfil nasce em `bootstrap_owner()`) |
| `competencies`, `evidence`, `learning_resources`, `repositories`, `learning_steps`, `learning_step_logs`, `legacy_backups` | nada | CRUD só em `user_id = auth.uid()` **e** `is_owner()` |
| `recommendations`, `recommendation_feedback`, `competency_assessments`, `analysis_runs`, `repository_analyses` | nada | **só SELECT**; escrita por Edge Functions (service role) ou funções `SECURITY DEFINER` que verificam `auth.uid()` |
| `public_journey` (view) | **SELECT** | SELECT |

* `revoke all … from anon, authenticated` + `grant` explícitos + `alter default privileges`: tabelas futuras nascem fechadas.
* `reserve_ai_quota`, `activate_recommendation`, `seed_competencies`: só `service_role`.
* O browser não consegue fabricar recomendações, avaliações nem registos de custo. Verificado em `tests/sql/10_rls_tests.sql` (anon: `permission denied` em tudo exceto a view; intruso autenticado não vê nem escreve nada; `update`/`delete` do intruso afetam 0 linhas).

## Checklist

- [x] Nenhuma chave secreta no repositório nem no frontend (teste de bundle; só a publishable em `config.js`)
- [x] `ANTHROPIC_API_KEY` só em secrets das Edge Functions; o browser nunca fala com a Claude API (E2E verifica os hosts contactados)
- [x] JWT validado no servidor em todas as funções; CORS restrito a `ALLOWED_ORIGINS`
- [x] Respostas de erro com código curto, sem stack nem mensagens do fornecedor
- [x] Saída do modelo validada (schema + regras) antes de persistir; nunca renderizada como HTML (`textContent` apenas)
- [x] Prompts: dados do utilizador em `<data>` tratados como dados; só se envia texto de evidências com `share_with_ai`; trabalho de cliente nunca
- [x] Quotas atómicas por dia (Lisboa) com lock consultivo; custo/tokens/latência registados
- [x] Projeção pública sem notas, confiança, gaps, objetivo, recomendações, feedback, repositórios, custos
- [x] CSP no `index.html` (`script-src 'self'`, `connect-src` só `self` e `*.supabase.co`)
- [ ] **Tu:** desligar sign-ups no Supabase Auth (passo 1.1 de `DEPLOY.md`)
- [ ] **Tu:** revogar o Personal Access Token do GitHub usado pelo Roadmap antigo
- [ ] **Tu:** definir limite de gasto no painel da Anthropic

## Riscos residuais (honestos)

1. **Origem partilhada.** `eversonrubira.github.io` é uma só origem para o PWA, o portfólio e `learning-journey.html`. `localStorage` (sessão Supabase e snapshot offline) é legível por *qualquer* script dessa origem: um XSS no portfólio ou um script de terceiros dá acesso à sessão do dono. A RLS não ajuda contra a sessão do próprio dono. Mitigações: não carregar scripts de terceiros nessas páginas; tokens de acesso curtos (1 h por omissão); a solução forte é um domínio próprio para o PWA (origem isolada).
2. O snapshot offline contém dados privados em `localStorage` (mesma origem). É apagado ao terminar sessão.
3. `public_journey` expõe `source_url` das evidências públicas: só marques como públicas as que o podem ser.
4. `reserve_ai_quota` conta tentativas falhadas (gastam tokens); um erro repetido pode esgotar a quota diária.
5. O JWT de um dono comprometido pode gastar a quota diária da Claude API; o teto de gasto na Anthropic é a defesa final.
