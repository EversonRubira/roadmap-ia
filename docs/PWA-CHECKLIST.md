# Checklist PWA e GitHub Pages

Automático (`npm test`, `npm run test:e2e`):

- [x] `manifest.webmanifest` mantém `id`, `start_url`, `scope`, `display: standalone` e os 3 ícones → a instalação existente continua válida
- [x] Cache `lj-v2.1.0` ≠ `roadmap-ia-v1`; ao ativar, apaga caches antigas **próprias** e recarrega janelas abertas → a interface antiga não persiste
- [x] Estratégia rede-primeiro (4 s) para a app → nova versão assim que há ligação; offline serve cópia
- [x] Supabase/Functions não passam pelo service worker (nada autenticado fica em cache)
- [x] Todos os ficheiros do shell existem e todos os módulos JS estão listados (um 404 no `addAll` impediria a atualização)
- [x] Caminhos relativos; sem caminhos absolutos; funciona em `/roadmap-ia/`; refresh direto em `#/skills/...` (hash routing, não precisa de 404.html)
- [x] Offline: banner "Offline · Últimos dados sincronizados em …"; ações de escrita desativadas; nada parece guardado
- [x] 320 px sem scroll horizontal; alvos ≥ 44 px; contraste AA claro/escuro (WCAG 1.4.3 e 1.4.11); `prefers-reduced-motion`; `forced-colors`

Manual no telemóvel (não consigo fazê-lo daqui):

- [ ] Abrir a PWA já instalada → deve atualizar e recarregar sozinha para o Learning Journey (pode ser preciso abrir duas vezes se o sistema atrasar o service worker novo)
- [ ] Login por código no telemóvel (iOS: o teclado deve sugerir o código do email)
- [ ] Modo avião: abre com dados em cache e banner Offline
- [ ] Ícone/nome no ecrã inicial: o nome instalado pode manter "Roadmap IA" até reinstalares
- [ ] Leitor de ecrã (VoiceOver/TalkBack): anúncios de "A escolher a próxima etapa…" e erros via região `aria-live`
