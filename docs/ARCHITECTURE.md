# Learning Journey — arquitetura

## Diagnóstico do estado anterior (roadmap-ia-v1)

| Item | Encontrado |
|---|---|
| Stack | HTML + CSS + JS num único `index.html` (718 linhas), sem build, sem dependências, sem framework |
| PWA | `manifest.webmanifest` (`id`/`start_url`/`scope` = `./`), `sw.js` com cache `roadmap-ia-v1`, stale-while-revalidate |
| Persistência | `localStorage["roadmap-ia-v1"] = {done:[ids], at:{id:timestamp}}`; `DEFAULT_DONE = ["ea-b1","ea-1-1"]` |
| Catálogo | 54 itens (23 `core`, `opt`, `skip`, `cp`) em 5 grupos (`ea`, `an`, `ar`, `at`, `av`); 7 fases fixas |
| Backup | Copiar/restaurar JSON no ecrã |
| Integração com o portfólio | `PUT` do `roadmap-summary.json` em `eversonrubira/eversonrubira.github.io` via GitHub API, com um **Personal Access Token guardado em `localStorage["roadmap-gh-token"]`** |
| Supabase | não existia |
| PT/EN | o PWA era só PT. O portfólio principal está noutro repositório e **não foi inspecionado** (fora do âmbito de acesso desta sessão) |

Dois riscos do legado, resolvidos ou documentados:

1. O token do GitHub vivia em `localStorage`, que na origem `eversonrubira.github.io` é **partilhada com o portfólio e com `learning-journey.html`**. O novo PWA não sincroniza por token; a migração oferece remover o token deste dispositivo. **Revoga o token em GitHub → Settings → Developer settings.**
2. O `sw.js` antigo apagava *todas* as caches da origem. O novo só apaga as com prefixo `roadmap-ia-` e `lj-`.

## Visão geral

```
PWA (GitHub Pages, /roadmap-ia/)  ──JWT──►  Supabase Auth (email + password)
        │                                    Supabase Postgres (RLS)  ◄── fonte única de verdade
        └── Edge Functions (valida JWT) ──►  Claude API (ANTHROPIC_API_KEY só aqui)
                                             public_journey (view)  ──►  Portfólio / learning-journey.html (anon, só leitura)
```

* Frontend: ES modules nativos, **sem build e sem dependências**. **`@supabase/supabase-js` oficial, versão fixa 2.119.0, vendorizado** em `js/vendor/` (sem CDN, compatível com a CSP `script-src 'self'`, guardado pelo service worker; SHA-256 verificado por teste). Trata Auth (email + password), sessão persistente (`localStorage["lj-auth"]`), refresh automático, PostgREST e Edge Functions. `js/api.js` é só uma camada fina que mantém a interface da app e converte erros do SDK em códigos curtos. Todo o DOM é criado com `textContent` (`js/dom.js`); não existe `innerHTML`, por isso texto devolvido pelo modelo nunca é interpretado como HTML (um teste garante-o).
* Login: **email + password** (sem registos novos; um só utilizador criado no painel). Escolhido em vez de código/magic link para não depender de SMTP e porque o magic link abre no browser, não na PWA instalada.
* Estado: `js/store.js`. Nenhuma alteração aparece como guardada antes de o servidor responder; offline só lê.

## Modelo de dados (`supabase/migrations/20261116000000_learning_journey.sql`)

`profiles`, `competencies`, `evidence`, `learning_resources`, `learning_steps` (+ `learning_step_logs`), `recommendations`, `recommendation_feedback`, `competency_assessments`, `repositories`, `repository_analyses`, `analysis_runs`, `legacy_backups`, e a view `public_journey`.

Decisões que se desviam da especificação, com motivo:

* **Estado vs foco**: `status` ∈ {exploring, developing, applied} e `is_current_focus` é um booleano separado (no máximo um, índice parcial único). Com "Foco atual" como quarto estado, marcar o foco apagava a informação de a competência já estar Aplicada.
* **Candidatos e recomendações na mesma tabela** (`recommendations.status = 'candidate'` → `'active'`): evita duplicar `competency/kind/score`.
* **Texto gerado por idioma**: cada recomendação/avaliação tem `language`. Mudar o idioma da interface nunca mistura línguas: a recomendação ativa mostra um aviso e um botão "Gerar neste idioma" (gasta uma geração).
* **Sem enums Postgres**: `text + check` (alterar um valor é uma migration de uma linha).
* Evidência: `is_client_work` e `share_with_ai` (constraint `evidence_client_private`: cliente ⇒ privada e nunca enviada à IA). `share_with_ai` é `false` por omissão: **a IA só lê o texto de evidências explicitamente autorizadas**; das restantes só recebe o tipo.
* Idempotência: `legacy_id` (recursos) e `source_key` (evidências), com índices únicos **não parciais** (PostgREST precisa deles para `on_conflict`).

## Regras determinísticas (`supabase/functions/_shared/candidates.ts`)

Cada evidência pertence a um grupo: **teoria** (curso), **prática** (implementação, produção, projeto pessoal, experiência, experimento), **qualidade** (testes, avaliação de LLM, documentação, decisão arquitetural), **showcase** (pública/apresentação).

| Falta | Tipo | `actionType` permitido |
|---|---|---|
| teoria e prática | Aprender (e Aplicar, que pode valer mais que outro curso) | course, documentation / project, improvement |
| só prática | Aplicar | project, improvement |
| prática sem qualidade | Consolidar | improvement, documentation, project |
| prática+qualidade sem showcase | Demonstrar | demonstration, documentation |

Fatores (0–1): `knowledge_gap`, `professional_relevance`, `project_applicability`, `evidence_value`, `estimated_effort`, `recent_recommendations`, `user_feedback`, combinados por pesos fixos (`WEIGHTS`). **A pontuação só serve para ordenar candidatos; não é uma medida científica, não é mostrada ao utilizador e não avalia a pessoa.** Feedback:

* `already_known` / "já domino" → deixa de sugerir Aprender/Aplicar nessa competência.
* rejeitar "não relevante" → penaliza a competência; "não se aplica" → penaliza competência+tipo; "esforço excessivo" → encarece o esforço desse tipo; "outra área" → penalização suave; "avaliação incorreta" → **bloqueia a competência até ser revista**.
* `deferred` pesa 7 dias; resto decai a metade ao fim de 30.

Uma competência **nunca** sobe a Aplicada só por um curso: `capSuggestedStatus` rebaixa qualquer sugestão "applied" sem prática+qualidade.

## Edge Functions

| Função | Claude? | Quota/dia | Faz |
|---|---|---|---|
| `analyse-learning-profile` `mode:"candidates"` | não | — | recalcula candidatos (regras) |
| `analyse-learning-profile` `mode:"full"` | sim | 2 | candidatos + sugestões de avaliação por competência |
| `generate-next-step` | sim | 5 | recebe só os 3 melhores candidatos; devolve uma recomendação; reutiliza a ativa se válida e no mesmo idioma |
| `explain-recommendation` | sim | 20 | 5 perguntas fixas (não é chat); respostas em cache por pergunta+idioma |

Todas: validam o JWT no servidor (`auth.getUser`), recusam origens fora de `ALLOWED_ORIGINS`, usam o cliente com o JWT do utilizador para **ler** (a RLS aplica-se) e o service role só para escrever saídas de IA e quotas. Erros saem como `{error:{code}}`, sem stack. A API recebe o JSON Schema (sem `min/max`, que a API não aceita) e **a resposta é revalidada com o schema completo mais regras de negócio** (`output-rules.ts`: `candidateId` tem de ser um dos candidatos enviados, `competencyId` igual ao do candidato, recursos só do catálogo, idioma igual ao pedido, `min ≤ max`) antes de persistir. Falhas ficam em `analysis_runs` com `error_code` e nada é guardado.

Registo por chamada: modelo, tokens de entrada/saída, custo estimado, latência, estado, data (`analysis_runs`; nunca exposto na projeção pública). A IA não corre ao abrir a app: só por ação explícita (gerar, alternativa, rejeitar, "já domino", adiar, atualizar, reanalisar).

JSON Schemas: `supabase/functions/_shared/schemas.ts` (`RECOMMENDATION_SCHEMA`, `ASSESSMENT_SCHEMA`, `EXPLANATION_SCHEMA`).

## Internacionalização

`js/i18n.js` + `js/locales/{pt-PT,en-GB}.js`, chaves semânticas (`nav.now`, `recommendation.accept`…). Idioma: preferência guardada → idioma do navegador (`pt*` → pt-PT, resto en-GB) → alteração manual permanente (localStorage imediato + `profiles.preferred_language`). Datas com `Intl` nos locales `pt-PT`/`en-GB`. Um teste garante que as duas línguas têm exatamente as mesmas chaves e placeholders e que todas as chaves usadas no código existem. O pedido a Claude diz o idioma no prompt; nunca se traduz depois.
