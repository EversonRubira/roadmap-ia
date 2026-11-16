# Deploy, secrets e rollback

> Primeiro teste real: segue **[STAGING.md](STAGING.md)** (passo a passo, assume zero experiência com Supabase).
> Produção = repetir o mesmo guia com um projeto Supabase de produção e depois fazer merge.

## Versões fixas

| Peça | Versão | Onde |
|---|---|---|
| `@supabase/supabase-js` (browser) | **2.119.0** (bundle UMD vendorizado, SHA-256 em `js/vendor/README.md`) | `js/vendor/`, `index.html`, `sw.js` |
| `@supabase/supabase-js` (Edge Functions) | **2.119.0** | `supabase/functions/_shared/runtime.ts` (`npm:…@2.119.0`) |
| `@anthropic-ai/sdk` (Edge Functions) | **1.8.0** | `supabase/functions/_shared/runtime.ts` (`npm:…@1.8.0`) |

`npm test` falha se as versões deixarem de coincidir ou se o ficheiro vendorizado for alterado. Atualizar é sempre um ato deliberado (instruções em `js/vendor/README.md`).

## Secrets das Edge Functions

| Nome | Obrigatório | Valor |
|---|---|---|
| `ANTHROPIC_API_KEY` | sim | chave da Anthropic (só aqui; nunca no Git nem no frontend) |
| `ALLOWED_ORIGINS` | sim | origens do PWA separadas por vírgula, ex.: `https://eversonrubira.github.io` (staging: + `http://localhost:8000` e o URL do túnel) |
| `CLAUDE_MODEL` | não | por omissão `claude-opus-5-5` |
| `LIMIT_ANALYSIS_PER_DAY` / `LIMIT_GENERATION_PER_DAY` / `LIMIT_EXPLANATION_PER_DAY` | não | 2 / 5 / 20 |

`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` são injetadas pela plataforma. A `service_role`/`secret key` nunca vai para o browser nem para o Git.

## Rollback

* O Roadmap antigo está em `legacy/index.html` e na tag `roadmap-legacy` (local; `git push origin roadmap-legacy` para a publicar).
* Voltar atrás: `git revert <commit>` ou `git checkout roadmap-legacy -- index.html sw.js manifest.webmanifest icons`. A migração nunca apaga o `localStorage` antigo e guarda cópia em `legacy_backups`.
* O novo PWA já não escreve `roadmap-summary.json`; o portfólio mantém o último valor até adotares `docs/PUBLIC-CONTRACT.md`.

## Testes

```bash
npm test               # 50 testes unitários (regras, schemas, handlers, i18n, migração, PWA, contraste, versões)
npm run test:sql       # migration + RLS num Postgres 16 temporário
npm run test:e2e       # Chromium + Supabase simulado (64 verificações)
npm run smoke:staging  # TESTE REAL: Supabase de staging + Claude (ver STAGING.md)
```
