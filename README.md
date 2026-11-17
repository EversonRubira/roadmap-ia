# Learning Journey

Análise pessoal da minha evolução para AI Application Engineer. Mostra, no telemóvel, onde estou, qual é a maior lacuna relevante, a próxima ação e a evidência que mostrará que evoluí.

URL: https://eversonrubira.github.io/roadmap-ia/ · Roadmap antigo (todos os cursos): [`legacy/`](legacy/index.html)

## Como funciona

Os projetos e os estudos são **evidências**. Os cursos são **recursos**. A análise é feita pelo Claude, em conversa, lendo os repositórios pessoais autorizados. A app só mostra o resultado: é uma PWA só de leitura, sem backend, sem base de dados, sem login e sem chaves.

```
projetos + estudos → análise (Claude) → uma recomendação → aprendizagem ou implementação → nova evidência → nova análise
```

## Dados (versionados no GitHub)

```
data/competencias.json        modelo de 10 competências e critérios (escala 0 a 3)
data/cursos-feitos.json       só cursos confirmados (evidência de nível 1)
data/analises/AAAA-MM-DD.json fotografia histórica, não se edita depois de publicada
data/analises/latest.json     cópia da análise mais recente
```

Cada análise tem `previous` (a data da anterior), que a área Evolução segue para mostrar o que mudou. Para uma nova análise: pedir ao Claude, aprovar e ele grava o ficheiro datado e atualiza `latest.json` (devem ser idênticos; o teste verifica).

O nível mede a maturidade das evidências, não a pessoa. Sem percentagens nem pontuações.

## Testar localmente

```
npm test            # 20 testes unitários (dados, i18n, contraste, PWA)
npm run test:e2e    # Chromium: quatro áreas PT/EN, offline, instalação, mobile e desktop
python3 -m http.server 8000   # e abrir http://localhost:8000
```

Sem build nem dependências de runtime.

## Instalar no telemóvel

Abrir o URL no Chrome (Android: menu → Instalar aplicação) ou no Safari (iPhone: Partilhar → Adicionar ao ecrã principal). Depois da primeira abertura funciona offline com os últimos dados guardados; com ligação, uma análise nova aparece ao abrir.
