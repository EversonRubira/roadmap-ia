# Contrato da projeção pública (v1)

O portfólio e `learning-journey.html` consomem **apenas** a view `public_journey`, sem login:

```
GET {SUPABASE_URL}/rest/v1/public_journey?select=*
apikey: {SUPABASE_PUBLISHABLE_KEY}
```

Devolve um array com **uma** linha (vazio se ainda não houver perfil). Só leitura: `INSERT/UPDATE/DELETE` por `anon` falham (testado).

```jsonc
{
  "contract_version": 1,
  "preferred_public_language": "pt-PT",            // "pt-PT" | "en-GB"
  "current_focus": {                                 // null se nenhuma competência em foco estiver pública
    "slug": "evals-reliability",
    "name": { "pt-PT": "Evals & Reliability", "en-GB": "Evals & Reliability" }
  },
  "current_focus_description": { "pt-PT": "…", "en-GB": "…" },   // texto escrito à mão; valores podem ser null
  "applied_competencies": [                          // só is_public = true E status = 'applied'
    { "slug": "…", "name": { "pt-PT": "…", "en-GB": "…" }, "description": { "pt-PT": "…", "en-GB": "…" } }
  ],
  "next_direction": { "pt-PT": "…", "en-GB": "…" },               // texto escrito à mão; pode ser null
  "public_evidence": [                               // só visibility = 'public' e não-cliente
    { "id": "uuid", "competency": "slug", "type": "implementation",
      "title": { "pt-PT": "…", "en-GB": null }, "description": { "pt-PT": null, "en-GB": null },
      "url": "https://…" | null, "occurred_at": "2026-11-16" }
  ],
  "last_updated_at": "2026-11-16T12:00:00Z"
}
```

Regras para o consumidor:

* Escolhe o idioma da página (`pt-PT`/`en-GB`); se `title[lang]` for `null`, **mostra o outro idioma com `lang="…"` correto ou omite o campo** — não traduzas.
* Trata `null` e arrays vazios como "ainda nada público"; não inventes texto.
* Cria o DOM com `textContent`; nunca `innerHTML` com estes campos.
* `contract_version` só muda em alterações incompatíveis. Ignora campos desconhecidos.
* Nunca contém: notas privadas, repositórios, clientes, confiança, gaps, objetivo, recomendações (incluindo rejeitadas), feedback, custos, histórico, nada não marcado como público.
* Cache sugerido: pedido no carregamento da página; opcionalmente `sessionStorage` por 5 min.

Pré-visualização no PWA: Percurso → "Pré-visualizar o que é público" (faz exatamente este pedido, sem sessão).
