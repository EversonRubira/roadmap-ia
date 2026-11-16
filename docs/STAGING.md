# Guia de staging: Supabase + Claude + telemóvel

Objetivo: pôr o Learning Journey a funcionar **a sério** num projeto Supabase de teste ("staging"), com uma chamada real à Claude API, **sem tocar no site em produção** (`https://eversonrubira.github.io/roadmap-ia/` continua a mostrar o Roadmap antigo até fazeres merge).

Tempo estimado: 60–90 minutos. Custo estimado: Supabase grátis; Claude ≈ alguns cêntimos por execução do teste.

> Os nomes dos menus do Supabase mudam de vez em quando. Se um nome não for exatamente igual, procura o parecido (indico alternativas). Em cada passo há um "✅ Como confirmar": **não avances se a confirmação falhar** (no fim há uma tabela de erros comuns).

## 0. O que vais precisar

| Coisa | Onde obter |
|---|---|
| Conta GitHub (já tens) | — |
| Terminal | Mac: app "Terminal". Windows: instala o **Git for Windows** e usa "Git Bash". Linux: o teu terminal |
| **Node.js 20 ou mais recente** | https://nodejs.org → botão "LTS" → instalar. ✅ `node -v` mostra `v20…` ou superior |
| **Git** | Mac: `git --version` (instala as ferramentas se pedir). Windows: vem com o Git for Windows |
| Cartão para créditos da Anthropic | passo 6 (podes pôr só 5 USD) |

Descarrega o código da branch de teste (não é a `main`):

```bash
git clone https://github.com/EversonRubira/roadmap-ia.git
cd roadmap-ia
git checkout claude/learning-journey-adaptive-52jxfp
ls supabase/migrations
```

✅ O `ls` mostra `20261116000000_learning_journey.sql`. **Todos os comandos abaixo correm dentro desta pasta `roadmap-ia`.**

---

## 1. Criar o projeto Supabase

1. Abre https://supabase.com → **Sign in** → **Continue with GitHub**.
2. Clica **New project** (se pedir, cria primeiro uma *Organization*: nome livre, tipo *Personal*, plano *Free*).
3. Preenche:
   * **Name:** `learning-journey-staging`
   * **Database Password:** clica **Generate a password** e **guarda-a** no teu gestor de passwords (vais precisar dela no passo 3).
   * **Region:** uma da Europa (ex.: *West EU (Ireland)* ou *Central EU (Frankfurt)*).
4. Clica **Create new project**. Espera 1–3 minutos.

✅ **Como confirmar:** abre-se o painel do projeto sem mensagem "Setting up". O endereço do browser é `https://supabase.com/dashboard/project/XXXXXXXX`; o `XXXXXXXX` é o teu **Project ref** (anota-o).

### Copiar os 3 valores que vais usar

Menu da esquerda → **Project Settings** (ícone de engrenagem) → **API Keys** (em versões antigas: **API**).

| Valor | Onde está | Aparência | Vai para… |
|---|---|---|---|
| **Project URL** | Project Settings → **Data API** (ou **API**) → *Project URL* | `https://XXXXXXXX.supabase.co` | `js/config.js` e scripts |
| **Publishable key** | **API Keys** → separador *Publishable and secret API keys* → *Publishable key* | `sb_publishable_…` | `js/config.js` (é pública) |
| **Secret key** | mesma página → *Secret keys* → **Create new secret key** (ou revelar a existente) | `sb_secret_…` | **só** no terminal, só para o teste do passo 8. **Nunca** em ficheiros, Git ou mensagens |

> Se o teu painel só mostrar as chaves antigas ("Legacy API keys": `anon` e `service_role`), funcionam da mesma forma: `anon` = publishable, `service_role` = secret.

✅ **Como confirmar:** tens anotados o URL (começa por `https://` e termina em `.supabase.co`) e a chave publishable (começa por `sb_publishable_`).

---

## 2. Instalar o CLI do Supabase e ligá-lo ao projeto

Não precisas de instalar nada globalmente: usa-se `npx`.

```bash
npx supabase@latest --version
```

✅ Imprime um número de versão (a primeira vez descarrega o programa; responde `y` se perguntar).

```bash
npx supabase@latest login
```

Abre o browser → **Authorize**. ✅ O terminal diz `You are now logged in`.

```bash
npx supabase@latest link --project-ref XXXXXXXX
```

(troca `XXXXXXXX` pelo teu Project ref). Pede a **Database Password** do passo 1.

✅ **Como confirmar:** termina sem erro (`Finished supabase link`). Surge a pasta `supabase/.temp/` (já está no `.gitignore`).

---

## 3. Criar as tabelas (migration)

```bash
npx supabase@latest db push
```

Mostra a migration `20261116000000_learning_journey.sql` e pergunta `Do you want to push these migrations?` → escreve `Y` e Enter.

✅ **Como confirmar:** termina com `Finished supabase db push`. No painel: **Table Editor** (menu esquerdo) lista tabelas como `competencies`, `evidence`, `recommendations`, `analysis_runs`… (13 no total).

**Plano B (se o `db push` falhar com erro de ligação):** painel → **SQL Editor** → **New query** → abre o ficheiro `supabase/migrations/20261116000000_learning_journey.sql` num editor de texto, copia **tudo**, cola na query → **Run**. ✅ Aparece `Success. No rows returned`. (Usa só um dos dois métodos; se usares o SQL Editor, nunca corras depois o `db push` dessa mesma migration.)

Confirmação extra (SQL Editor → New query → Run):

```sql
select count(*) from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE';
```

✅ Devolve `13`.

> O aviso "Security Definer View" sobre `public_journey` nos *Advisors* é **esperado**: essa vista é a única coisa que o público lê, por desenho.

---

## 4. Criar o teu utilizador (o único)

1. Menu esquerdo → **Authentication** → **Users**.
2. Clica **Add user** → **Create new user**.
3. **Email:** o **mesmo email com que fizeste a conta Supabase** (importante: o envio de emails de teste só funciona para membros do projeto, ver passo 5).
4. **Password:** põe uma palavra-passe longa qualquer (nunca a vais usar; o login é por código).
5. Marca **Auto Confirm User**. Clica **Create user**.

✅ **Como confirmar:** o utilizador aparece na lista de *Users* com o teu email.

---

## 5. Configurar a autenticação (3 coisas: sign-ups, código por email, template)

### 5.1 Desligar novos registos (muito importante)

**Authentication** → **Sign In / Providers** (em versões antigas: **Providers**) → bloco **User Signups** ou o fornecedor **Email**:

* Desliga **Allow new users to sign up**. Clica **Save**.

✅ Fica desligado depois de recarregares a página. (Assim ninguém além de ti consegue criar conta. Mesmo que ligasse, a base de dados só aceita um dono.)

### 5.2 Email ligado e código de 6 dígitos

Na mesma página → **Email** → deve estar **Enable Email provider** ligado. Deixa **Email OTP Length = 6** (valor por omissão) e **Email OTP Expiration** como está. Desliga **Confirm email** se existir (não interfere, o utilizador já está confirmado).

### 5.3 Template do email: tem de mostrar o código

O email por omissão só tem um link; a app precisa do **código**.

**Authentication** → **Emails** (em versões antigas: **Email Templates**) → separador **Magic link** (ou *Magic Link*):

* **Subject:** `O teu código de acesso`
* **Message body** (apaga o que lá está e cola):

```html
<h2>Learning Journey</h2>
<p>O teu código de acesso:</p>
<p style="font-size:28px;letter-spacing:6px"><strong>{{ .Token }}</strong></p>
<p>Se não pediste este código, ignora este email.</p>
```

Clica **Save**.

✅ **Como confirmar:** o *Preview* mostra um número grande (o `{{ .Token }}`). **O `{{ .Token }}` tem de estar lá**; sem ele, não há código.

### 5.4 URL do site (opcional mas recomendado)

**Authentication** → **URL Configuration** → **Site URL:** `https://eversonrubira.github.io/roadmap-ia/` → **Save**.

> **Limite de emails:** o servidor de email grátis do Supabase envia **poucos emails por hora** e **só para membros da organização do projeto**. Por isso o email do passo 4 tem de ser o teu. Se vires "rate limit exceeded", espera uma hora ou usa o teste com `SUPABASE_SECRET_KEY` (passo 8), que não envia email.

---

## 6. Criar a chave da Claude API e guardá-la (ANTHROPIC_API_KEY)

### 6.1 Criar a chave

1. https://console.anthropic.com → entra (ou cria conta).
2. **Settings** → **Billing** (ou *Plans & Billing*) → adiciona um método de pagamento e **5 USD de créditos**. Define um **limite de gastos mensal** baixo (ex.: 10 USD) em **Settings → Limits**.
3. **Settings** → **API Keys** → **Create Key** → nome `learning-journey-staging` → **Create**.
4. **Copia a chave agora** (`sk-ant-…`): só é mostrada uma vez. Guarda-a no gestor de passwords.

✅ A chave aparece na lista de *API Keys* (só os últimos caracteres).

### 6.2 Guardá-la no Supabase (nunca no Git, nunca no frontend)

Painel Supabase → menu esquerdo **Edge Functions** → separador/botão **Secrets** (em algumas versões: **Edge Functions → Manage secrets**, ou **Project Settings → Edge Functions**) → **Add new secret**:

| Name | Value |
|---|---|
| `ANTHROPIC_API_KEY` | a chave `sk-ant-…` |
| `ALLOWED_ORIGINS` | `https://eversonrubira.github.io,http://localhost:8000` |

(`ALLOWED_ORIGINS` diz quais os sites que podem chamar as funções. `http://localhost:8000` é para o teste local; o do telemóvel acrescenta-se no passo 10.)

Opcional: `CLAUDE_MODEL` (por omissão `claude-opus-5-5`; para gastar menos nos testes podes pôr `claude-sonnet-5-5`).

**Save**.

✅ **Como confirmar** (terminal):

```bash
npx supabase@latest secrets list
```

Mostra `ANTHROPIC_API_KEY` e `ALLOWED_ORIGINS` (só os nomes e um *digest*; nunca o valor).

---

## 7. Publicar as Edge Functions

```bash
npx supabase@latest functions deploy
```

(publica as três: `analyse-learning-profile`, `generate-next-step`, `explain-recommendation`). Se aparecer um erro a falar de **Docker**, corre `npx supabase@latest functions deploy --use-api`.

✅ **Como confirmar:**

* O terminal diz `Deployed Functions on project XXXXXXXX: analyse-learning-profile, …`.
* Painel → **Edge Functions** → lista as 3 com estado ativo.
* Teste de segurança (substitui `URL` e `CHAVE`; em Mac/Linux/Git Bash):

```bash
curl -i -X POST "URL/functions/v1/generate-next-step" -H "apikey: CHAVE" -H "Content-Type: application/json" -d "{}"
```

  Deve responder **`HTTP/2 401`** com `{"error":{"code":"missing_token"}}`. Isso prova que a função recusa quem não tem sessão.

---

## 8. Teste real automático (Supabase + Claude)

Este script faz tudo por ti: confirma que visitantes não leem nada, faz login, cria as competências, **chama a Claude a sério**, verifica a resposta e o custo registado.

Define as variáveis **no terminal** (não ficam em nenhum ficheiro). Troca os valores:

**Mac / Linux / Git Bash:**

```bash
export SUPABASE_URL="https://XXXXXXXX.supabase.co"
export SUPABASE_PUBLISHABLE_KEY="sb_publishable_..."
export OWNER_EMAIL="o-teu-email@exemplo.com"
export SUPABASE_SECRET_KEY="sb_secret_..."
node scripts/staging-smoke.mjs
```

**Windows PowerShell:**

```powershell
$env:SUPABASE_URL="https://XXXXXXXX.supabase.co"
$env:SUPABASE_PUBLISHABLE_KEY="sb_publishable_..."
$env:OWNER_EMAIL="o-teu-email@exemplo.com"
$env:SUPABASE_SECRET_KEY="sb_secret_..."
node scripts/staging-smoke.mjs
```

(Sem `SUPABASE_SECRET_KEY`: corre sem ela, espera o email com o código de 6 dígitos e volta a correr com `OTP_CODE=123456`.)

Opções: `--full` (testa também a análise completa, +1 chamada à Claude), `--both-languages` (gera também em inglês, +1 chamada), `--language=en-GB`.

✅ **Como confirmar:** o fim do output é `N ok, 0 falhas` e vês algo como:

```
  ✓ recomendação gerada pela Claude e validada
     título : Criar …
     custo  : modelo claude-opus-5-5 · 1800 in / 600 out · ~US$ 0.02 · 7000 ms
  ✓ segunda chamada reutiliza a ativa (custo zero)
```

No painel → **Table Editor** → `analysis_runs`: uma linha `generation` com `status = ok`, tokens e custo. Em `recommendations`: uma linha `active`.

### Se algo falhar

| Sintoma | Causa provável | O que fazer |
|---|---|---|
| `Signups not allowed for otp` | email com erro de escrita / utilizador não criado | repete o passo 4 com o email exato |
| `Error sending magic link email` / rate limit | limite do email grátis | usa `SUPABASE_SECRET_KEY` (não envia email) |
| `código de login gerado (admin)` falha | a chave secret não serve para gerar códigos | apaga `SUPABASE_SECRET_KEY`, corre o script, copia o código do email e volta a correr com `OTP_CODE=…` |
| código inválido | template sem `{{ .Token }}` ou código expirado | passo 5.3 |
| `function … invalid_token` logo no login | `SUPABASE_URL` com `/` a mais ou chave trocada | confirma os 3 valores do passo 1 |
| `internal_error` | falta secret ou migration | `npx supabase@latest secrets list`; passo 3 |
| `llm_unavailable` | chave Anthropic inválida, sem créditos ou modelo sem acesso | painel → Edge Functions → `generate-next-step` → **Logs**: a linha `llm_error: 401/402/404 …` diz qual; define `CLAUDE_MODEL=claude-sonnet-5-5` se for o modelo |
| `invalid_model_output` | a Claude devolveu algo fora das regras (é rejeitado e **não** é guardado) | repete; se persistir, envia-me a linha de `analysis_runs.error_code` |
| `quota_exceeded` | já gastaste as 5 gerações de hoje | SQL Editor: `delete from public.analysis_runs;` (só em staging) |

Para repetir o teste do zero (apaga só recomendações e contadores): SQL Editor → `delete from public.recommendations; delete from public.analysis_runs;` → Run.

---

## 9. Configurar a PWA e testar no computador

### 9.1 Ligar a app ao projeto

Abre `js/config.js` num editor e preenche **só estas duas linhas** (valores públicos):

```js
SUPABASE_URL: "https://XXXXXXXX.supabase.co",
SUPABASE_PUBLISHABLE_KEY: "sb_publishable_...",
```

Não faças commit disto para a branch (é só para os testes). Para não te esqueceres: `git update-index --assume-unchanged js/config.js`.

### 9.2 Servir a app localmente

```bash
python3 -m http.server 8000
```

(Windows sem Python: `npx serve -l 8000 .`). Deixa o terminal aberto. Abre **http://localhost:8000/** no browser.

✅ Vês o ecrã **Entrar** (e não "Falta configurar o Supabase").

### 9.3 Percorrer a app

1. Escreve o teu email → **Enviar código** → copia o código de 6 dígitos do email → **Entrar**. ✅ Aparece o ecrã **Agora** com "Ainda sem recomendação" e a navegação em baixo.
2. Canto superior direito → ícone de definições → escreve o **Objetivo profissional** e as **horas por semana** → **Guardar**.
3. Definições → **Importar Roadmap antigo**. Como o localhost é outra "origem", não encontra o progresso antigo. Faz assim: abre numa nova aba `https://eversonrubira.github.io/roadmap-ia/` (ainda é a app antiga) → *Backup do progresso* → **Copiar backup** → volta ao novo → **Colar backup** → **Rever** → confirma o resumo → **Importar**. ✅ "Importação concluída." e, no painel, `learning_resources` com ~50 linhas e `legacy_backups` com 1.
4. Ecrã **Agora** → **Gerar recomendação**. ✅ Em poucos segundos aparece **PRÓXIMA ETAPA** com título, motivo, esforço e evidência esperada.
5. **Porquê esta etapa?** → escolhe uma pergunta. ✅ Resposta num painel.
6. Botão **EN** no topo. ✅ Toda a interface fica em inglês e aparece o aviso "This recommendation was written in Português" + botão **Generate in this language**.
7. **Aceitar etapa** → **Registar avanço** → **Concluir etapa**. ✅ Volta a "Ainda sem recomendação".
8. Percurso → **Pré-visualizar o que é público**. ✅ Mostra o JSON que um visitante veria (listas vazias: nada é público por omissão).

---

## 10. Testar no telemóvel

A instalação como PWA e o service worker **exigem HTTPS**. O jeito mais simples sem alterar o site real é um túnel temporário.

### 10.1 Túnel HTTPS temporário (Cloudflare, grátis, sem conta)

Instala o `cloudflared`:

* Mac: `brew install cloudflared` · Windows: `winget install --id Cloudflare.cloudflared` · Linux: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/

Com o `python3 -m http.server 8000` ainda a correr (passo 9.2), noutro terminal:

```bash
cloudflared tunnel --url http://localhost:8000
```

✅ Imprime um endereço `https://qualquer-coisa.trycloudflare.com`. **Copia-o.** (Muda sempre que reinicias.)

### 10.2 Autorizar esse endereço

Painel Supabase → **Edge Functions → Secrets** → edita `ALLOWED_ORIGINS` para:
`https://eversonrubira.github.io,http://localhost:8000,https://qualquer-coisa.trycloudflare.com` (sem `/` no fim) → **Save**. Espera ~1 minuto.

### 10.3 Abrir no telemóvel

1. No telemóvel, abre o endereço do túnel. ✅ Vês **Entrar**.
2. Faz login com o código por email (iPhone: o teclado sugere o código vindo do email).
3. **Gerar recomendação**. ✅ Aparece uma recomendação. (Se vires "Sem ligação" ou erro: confirma o passo 10.2.)
4. **Instalar:** iPhone → botão Partilhar → **Adicionar ao ecrã principal**. Android/Chrome → menu ⋮ → **Instalar aplicação**. ✅ Abre em ecrã inteiro, sem barra do browser.
5. **Offline:** com a app aberta e já carregada, ativa o **modo avião** e abre a app. ✅ Mostra os dados com a faixa **Offline · Últimos dados sincronizados em …** e os botões de ação ficam desativados (nada parece guardado sem ligação).
6. Desativa o modo avião e volta a tocar numa ação. ✅ Funciona.
7. **Sessão:** fecha a app e abre outra vez. ✅ Continua com sessão. Definições → **Terminar sessão** → volta a **Entrar**.

> Esta app instalada é **só de teste** (outro endereço = outra app). Apaga-a do telemóvel no fim. A app real que usas hoje **não é afetada**.

### 10.4 Lista de verificação final

- [ ] Login por código no telemóvel
- [ ] Recomendação gerada na Claude, em PT e em EN
- [ ] Acesso sem sessão a `https://XXXXXXXX.supabase.co/rest/v1/evidence` (com `apikey`) devolve erro (nada legível)
- [ ] Offline mostra a faixa e não deixa gravar
- [ ] `analysis_runs` mostra tokens e custo; `ANTHROPIC_API_KEY` só existe nos Secrets

---

## 11. Arrumar no fim

* Fecha o túnel (Ctrl+C) e o servidor local.
* Remove o endereço do túnel de `ALLOWED_ORIGINS`.
* Apaga a chave `sb_secret_…` se a criaste só para isto (Project Settings → API Keys) e, se quiseres, a chave Anthropic de teste.
* Para repor `js/config.js`: `git update-index --no-assume-unchanged js/config.js && git checkout js/config.js`.
* **Não faças merge em `main`** enquanto não aprovares o resultado; o merge publica a nova app no endereço real (e a sessão do Roadmap antigo deixa de existir). Para produção repete este guia com um projeto Supabase de produção e `ALLOWED_ORIGINS=https://eversonrubira.github.io`.
