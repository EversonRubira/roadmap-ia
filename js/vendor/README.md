# Código de terceiros (vendorizado)

| Ficheiro | Origem | Versão | SHA-256 |
|---|---|---|---|
| `supabase-js-2.119.0.umd.js` | `@supabase/supabase-js` → `dist/umd/supabase.js` (MIT, ver `supabase-js.LICENSE`) | **2.119.0** | `a867edbcfb029370aeec7223dd6180b560b621fbe3bc64c6584fb0369d1b7bce` |

Porquê vendorizado e não por CDN: a app não tem build; a CSP só permite `script-src 'self'`; o service worker guarda-o para uso offline; e não depende de um CDN de terceiros com a sessão do dono em memória.

Para atualizar (de propósito, nunca automaticamente):

```bash
npm pack @supabase/supabase-js@<nova-versão> && tar xzf supabase-supabase-js-*.tgz
cp package/dist/umd/supabase.js js/vendor/supabase-js-<nova-versão>.umd.js
sha256sum js/vendor/supabase-js-<nova-versão>.umd.js     # atualizar a tabela acima
```

Depois altera a versão em `index.html`, `sw.js` e `supabase/functions/_shared/runtime.ts` (têm de coincidir: `npm test` verifica-o) e remove o ficheiro antigo.
