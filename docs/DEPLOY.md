# Instruções de deploy

Nada disto foi executado por mim: não tenho acesso ao teu projeto Supabase nem à Claude API. Segue por ordem.

## 1. Supabase (uma vez)

1. Cria um projeto (região UE). Em **Authentication → Providers → Email** deixa o email ligado e **desliga "Allow new users to sign up"**.
2. Em **Authentication → Email Templates → Magic Link** (é o template usado pelo código) garante que o corpo contém `{{ .Token }}` (ex.: `O teu código: {{ .Token }}`). Em **Authentication → URL Configuration** põe `https://eversonrubira.github.io/roadmap-ia/` como Site URL.
3. **Authentication → Users → Add user**: cria o teu utilizador (o único). Primeiro login na app → `bootstrap_owner()` cria o perfil e semeia as 8 competências; qualquer outro utilizador recebe `owner_already_exists`.
4. Aplica a migration: `supabase link --project-ref <ref> && supabase db push` (ou cola `supabase/migrations/20261116000000_learning_journey.sql` no SQL editor).
5. Anota **Project URL** e a chave **publishable** (`sb_publishable_…`) em Project Settings → API Keys.

## 2. Secrets das Edge Functions

```bash
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...          # só aqui; nunca no repositório nem no frontend
supabase secrets set ALLOWED_ORIGINS=https://eversonrubira.github.io   # (opcional) + ,http://localhost:4173 em dev
supabase secrets set CLAUDE_MODEL=claude-opus-5-5                       # (opcional) por omissão claude-opus-5-5
supabase secrets set LIMIT_ANALYSIS_PER_DAY=2 LIMIT_GENERATION_PER_DAY=5 LIMIT_EXPLANATION_PER_DAY=20   # (opcional)
```

`SUPABASE_URL`, `SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY` são injetadas pela plataforma nas funções. A `service_role` **nunca** vai para o browser nem para o Git.

## 3. Deploy das funções

```bash
supabase functions deploy analyse-learning-profile generate-next-step explain-recommendation
```

`supabase/config.toml` define `verify_jwt = false` porque as funções validam o JWT elas próprias (também funciona com chaves publishable). **Depois do primeiro deploy**, fixa a versão do SDK: `runtime.ts` importa `npm:@anthropic-ai/sdk` sem versão porque não a consegui verificar daqui — acrescenta `@<versão>` (e o mesmo para `@supabase/supabase-js`).

## 4. Frontend (GitHub Pages)

Edita `js/config.js` com a Project URL e a chave **publishable** (são públicas por desenho), faz commit e `push`. Não há build. Se o Pages já serve a branch `main` em `/`, basta fazer merge. Na primeira abertura:

1. Entra com o teu email → código.
2. Definições → define o objetivo e as horas por semana.
3. Definições → **Importar Roadmap antigo** (revê o resumo antes de confirmar).
4. Ecrã Agora → **Gerar recomendação**.

## 5. Rollback

* O Roadmap antigo está em `legacy/index.html` (servido em `/roadmap-ia/legacy/`) e na tag `roadmap-legacy` (`git push origin roadmap-legacy` para a publicares — não a empurrei).
* Para voltar: `git revert <commit-da-migração>` (ou `git checkout roadmap-legacy -- index.html sw.js manifest.webmanifest icons`). O estado antigo do `localStorage` **nunca é apagado** pela migração, e uma cópia integral fica em `legacy_backups`.
* Dados no Supabase: nada a desfazer; o PWA antigo não os usa.
* **Atenção ao portfólio:** o novo PWA já não escreve `roadmap-summary.json`. O portfólio continuará a mostrar o último valor (22 %, 5/23, 1/7) até adotares a projeção pública (`docs/PUBLIC-CONTRACT.md`). Isso é intencional (não toquei no bloco `#roadmap` nem em `learning-journey.html`).

## 6. Testes

```bash
npm test          # 44 testes: regras, schemas, handlers com fakes, i18n, migração, PWA, contraste
npm run test:sql  # migration + RLS num Postgres 16 temporário (requer Postgres local e root para criar utilizador)
npm run test:e2e  # Chromium + Supabase simulado (requer Playwright)
```
