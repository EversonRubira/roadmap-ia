// Catálogo dos cursos do Roadmap antigo (roadmap-ia-v1), usado SÓ para migração.
// Os cursos deixam de ser uma lista obrigatória: passam a recursos de aprendizagem que
// podem ser recomendados quando existe uma lacuna teórica na competência correspondente.
// "slugs" liga cada curso às competências (a primeira é a principal para a evidência).
// tag: core | opt | skip | cp  (apenas informativo; não define ordem nem obrigatoriedade).
export const LEGACY_KEY = "roadmap-ia-v1";
export const LEGACY_TOKEN_KEY = "roadmap-gh-token";
export const LEGACY_CATALOG = [
 {
  "id": "ea-b1",
  "title": "Pensamento computacional: fundamentos da computação e lógica de programação",
  "provider": "Alura",
  "hours": 8,
  "tag": "core",
  "slugs": [],
  "note": ""
 },
 {
  "id": "ea-b2",
  "title": "Python: Inteligência Artificial Aplicada",
  "provider": "Alura",
  "hours": 12,
  "tag": "opt",
  "slugs": [],
  "note": "Já usas Python nos teus projetos. Só conta para o certificado do nível."
 },
 {
  "id": "ea-1-1",
  "title": "LangChain e Python: criando ferramentas com a OpenAI",
  "provider": "Alura",
  "hours": 8,
  "tag": "core",
  "slugs": [
   "llm-integration"
  ],
  "note": ""
 },
 {
  "id": "ea-1-2",
  "title": "Arquiteturas RAG com LLMs: embeddings, busca semântica e criação de agentes com LangChain",
  "provider": "Alura",
  "hours": 8,
  "tag": "core",
  "slugs": [
   "retrieval"
  ],
  "note": ""
 },
 {
  "id": "ea-1-3",
  "title": "LangChain: Técnicas Avançadas de RAG",
  "provider": "Alura",
  "hours": 10,
  "tag": "core",
  "slugs": [
   "retrieval",
   "context-engineering"
  ],
  "note": ""
 },
 {
  "id": "ea-1-4",
  "title": "LangGraph: Orquestrando agentes e multiagentes",
  "provider": "Alura",
  "hours": 10,
  "tag": "core",
  "slugs": [
   "agents-tools"
  ],
  "note": ""
 },
 {
  "id": "ea-1-5",
  "title": "Protocolos e arquitetura para construção de agentes: MCP, A2A, AG-UI e Backend for Agents (BFA)",
  "provider": "Alura",
  "hours": 12,
  "tag": "core",
  "slugs": [
   "agents-tools"
  ],
  "note": ""
 },
 {
  "id": "ea-1-6",
  "title": "Clusterização: lidando com dados sem rótulo",
  "provider": "Alura",
  "hours": 8,
  "tag": "opt",
  "slugs": [],
  "note": "Machine Learning clássico. Só para fechar o certificado do nível."
 },
 {
  "id": "ea-1-7",
  "title": "NLP: aplicando processamento de linguagem natural para análise de sentimentos",
  "provider": "Alura",
  "hours": 10,
  "tag": "opt",
  "slugs": [],
  "note": "Machine Learning clássico. Só para fechar o certificado do nível."
 },
 {
  "id": "ea-1-cp",
  "title": "Checkpoint Engenharia de IA · Nível 1",
  "provider": "Alura",
  "hours": 2,
  "tag": "cp",
  "slugs": [],
  "note": ""
 },
 {
  "id": "ea-2-1",
  "title": "Redes Neurais: Deep Learning com PyTorch",
  "provider": "Alura",
  "hours": 6,
  "tag": "skip",
  "slugs": [],
  "note": ""
 },
 {
  "id": "ea-2-2",
  "title": "Treinando uma Rede Neural: Deep Learning com PyTorch",
  "provider": "Alura",
  "hours": 8,
  "tag": "skip",
  "slugs": [],
  "note": ""
 },
 {
  "id": "ea-2-3",
  "title": "Redes Neurais Recorrentes: Deep Learning com PyTorch",
  "provider": "Alura",
  "hours": 10,
  "tag": "skip",
  "slugs": [],
  "note": ""
 },
 {
  "id": "ea-2-4",
  "title": "Redes Neurais Convolucionais: Deep Learning com PyTorch",
  "provider": "Alura",
  "hours": 10,
  "tag": "skip",
  "slugs": [],
  "note": ""
 },
 {
  "id": "ea-2-5",
  "title": "Hugging Face: explorando e aplicando soluções com modelos de IA",
  "provider": "Alura",
  "hours": 10,
  "tag": "skip",
  "slugs": [],
  "note": ""
 },
 {
  "id": "ea-2-6",
  "title": "Modelos de Difusão: fundamentos e aplicações avançadas",
  "provider": "Alura",
  "hours": 16,
  "tag": "skip",
  "slugs": [],
  "note": ""
 },
 {
  "id": "ea-2-7",
  "title": "Transformers: fundamentos e prática com PyTorch",
  "provider": "Alura",
  "hours": 10,
  "tag": "skip",
  "slugs": [],
  "note": ""
 },
 {
  "id": "ea-2-cp",
  "title": "Checkpoint Engenharia de IA · Nível 2",
  "provider": "Alura",
  "hours": 2,
  "tag": "cp",
  "slugs": [],
  "note": ""
 },
 {
  "id": "ea-3-1",
  "title": "Inteligência artificial: preparação para o mercado",
  "provider": "Alura",
  "hours": 8,
  "tag": "opt",
  "slugs": [],
  "note": ""
 },
 {
  "id": "ea-3-2",
  "title": "Empreendendo com IA: da ideação ao modelo de negócio",
  "provider": "Alura",
  "hours": 6,
  "tag": "skip",
  "slugs": [],
  "note": ""
 },
 {
  "id": "ea-3-3",
  "title": "Observabilidade para LLMs: monitoramento e avaliação com LangFuse",
  "provider": "Alura",
  "hours": 12,
  "tag": "core",
  "slugs": [
   "production-ai",
   "evals-reliability"
  ],
  "note": "Monitorizar e avaliar aplicações com LLM."
 },
 {
  "id": "ea-3-4",
  "title": "Pipelines de IA em Cloud: Azure, AWS e GCP",
  "provider": "Alura",
  "hours": 10,
  "tag": "opt",
  "slugs": [
   "production-ai"
  ],
  "note": ""
 },
 {
  "id": "ea-3-5",
  "title": "MLFlow: gerenciamento de experimentos e integração com IA generativa",
  "provider": "Alura",
  "hours": 10,
  "tag": "skip",
  "slugs": [
   "production-ai"
  ],
  "note": ""
 },
 {
  "id": "ea-3-6",
  "title": "Integração contínua para LLMs: automatizando a avaliação de modelos com GitHub Actions e Deepeval",
  "provider": "Alura",
  "hours": 10,
  "tag": "core",
  "slugs": [
   "evals-reliability"
  ],
  "note": "Testes automáticos aplicados a LLMs."
 },
 {
  "id": "ea-3-7",
  "title": "Data Science: testando relações com Regressão Linear",
  "provider": "Alura",
  "hours": 8,
  "tag": "skip",
  "slugs": [],
  "note": ""
 },
 {
  "id": "ea-3-8",
  "title": "Hugging Face: transferindo aprendizado de modelos de NLP",
  "provider": "Alura",
  "hours": 8,
  "tag": "skip",
  "slugs": [],
  "note": ""
 },
 {
  "id": "ea-3-cp",
  "title": "Checkpoint Engenharia de IA · Nível 3",
  "provider": "Alura",
  "hours": 2,
  "tag": "cp",
  "slugs": [],
  "note": ""
 },
 {
  "id": "an-b1",
  "title": "Letramento em IA: competências essenciais e domínio crítico",
  "provider": "Alura",
  "hours": 6,
  "tag": "opt",
  "slugs": [],
  "note": "Conteúdo básico. Só para o certificado do nível."
 },
 {
  "id": "an-b2",
  "title": "Soft Skills na era da IA: Como fortalecer metacompetências",
  "provider": "Alura",
  "hours": 8,
  "tag": "opt",
  "slugs": [
   "ai-native-engineering"
  ],
  "note": "Só para o certificado do nível."
 },
 {
  "id": "an-1-1",
  "title": "Engenharia de software na era da IA: como usar IA no fluxo real de desenvolvimento",
  "provider": "Alura",
  "hours": 10,
  "tag": "core",
  "slugs": [
   "ai-native-engineering"
  ],
  "note": ""
 },
 {
  "id": "an-1-2",
  "title": "Engenharia de software na era da IA: trabalhando com legado, escala e múltiplos serviços",
  "provider": "Alura",
  "hours": 14,
  "tag": "core",
  "slugs": [
   "ai-native-engineering"
  ],
  "note": "Pré-requisito: o curso anterior."
 },
 {
  "id": "an-1-3",
  "title": "Engenharia de software na era da IA: segurança de aplicações com agentes, MCPs e código gerado por IA",
  "provider": "Alura",
  "hours": 10,
  "tag": "core",
  "slugs": [
   "safety-control",
   "ai-native-engineering"
  ],
  "note": "Segurança com agentes e MCP, tema útil para vagas de agentes."
 },
 {
  "id": "an-1-cp",
  "title": "Carreira AI-Native Software Engineering · Checkpoint Nível 1",
  "provider": "Alura",
  "hours": 2,
  "tag": "cp",
  "slugs": [],
  "note": ""
 },
 {
  "id": "an-2-1",
  "title": "Engenharia de software na era da IA: context engineering, workflows e controle de custo",
  "provider": "Alura",
  "hours": 10,
  "tag": "core",
  "slugs": [
   "context-engineering",
   "ai-native-engineering"
  ],
  "note": ""
 },
 {
  "id": "an-2-2",
  "title": "Engenharia de software na era da IA: MCP servers, tools e integrações para agentes de IA",
  "provider": "Alura",
  "hours": 18,
  "tag": "core",
  "slugs": [
   "agents-tools"
  ],
  "note": "MCP na prática. Faz antes do MCP Advanced Topics da Anthropic."
 },
 {
  "id": "an-2-3",
  "title": "Engenharia de software na era da IA: planejamento, automações e entrega em escala com agentes de IA",
  "provider": "Alura",
  "hours": 8,
  "tag": "core",
  "slugs": [
   "ai-native-engineering"
  ],
  "note": ""
 },
 {
  "id": "an-2-cp",
  "title": "Carreira AI-Native Software Engineering · Checkpoint Nível 2",
  "provider": "Alura",
  "hours": 2,
  "tag": "cp",
  "slugs": [],
  "note": ""
 },
 {
  "id": "an-3-1",
  "title": "IA na engenharia de software: guardrails de qualidade e estratégias de adoção",
  "provider": "Alura",
  "hours": 6,
  "tag": "opt",
  "slugs": [
   "ai-native-engineering"
  ],
  "note": "Curto e ligado a qualidade. Interessante como avulso."
 },
 {
  "id": "ar-b1",
  "title": "Arquitetura de Soluções: papel do arquiteto e pensamento sistêmico",
  "provider": "Alura",
  "hours": 10,
  "tag": "core",
  "slugs": [],
  "note": ""
 },
 {
  "id": "ar-1-1",
  "title": "Domain-Driven Design: modelagem tática e arquitetura orientada a negócio",
  "provider": "Alura",
  "hours": 10,
  "tag": "skip",
  "slugs": [],
  "note": "Já cobrido na Alura e no estágio (Hexagonal + DDD)."
 },
 {
  "id": "ar-1-2",
  "title": "Requisitos Não Funcionais: atributos de qualidade e priorização",
  "provider": "Alura",
  "hours": 10,
  "tag": "core",
  "slugs": [
   "production-ai"
  ],
  "note": ""
 },
 {
  "id": "ar-1-3",
  "title": "Decisões arquiteturais: ADRs, trade-offs e governança técnica",
  "provider": "Alura",
  "hours": 16,
  "tag": "core",
  "slugs": [],
  "note": "Material para ADRs nos projetos de portfólio."
 },
 {
  "id": "ar-1-4",
  "title": "Documentação Arquitetural: comunicação técnica e diagramas para stakeholders",
  "provider": "Alura",
  "hours": 10,
  "tag": "opt",
  "slugs": [],
  "note": ""
 },
 {
  "id": "ar-1-5",
  "title": "Microsserviços: migração de monólitos e modularização",
  "provider": "Alura",
  "hours": 10,
  "tag": "skip",
  "slugs": [],
  "note": "Já cobrido (Microsserviços com Spring Boot e RabbitMQ)."
 },
 {
  "id": "ar-1-6",
  "title": "Performance: decisão arquitetural, latência e cache",
  "provider": "Alura",
  "hours": 14,
  "tag": "opt",
  "slugs": [],
  "note": ""
 },
 {
  "id": "ar-1-cp",
  "title": "Checkpoint Arquitetura de Soluções com IA · Nível 1",
  "provider": "Alura",
  "hours": 12,
  "tag": "cp",
  "slugs": [],
  "note": ""
 },
 {
  "id": "ar-2-1",
  "title": "Cloud Native: arquitetura, multicloud e FinOps",
  "provider": "Alura",
  "hours": 10,
  "tag": "skip",
  "slugs": [],
  "note": "Rende mais com sistemas em produção."
 },
 {
  "id": "ar-2-2",
  "title": "Sistemas distribuídos: integrações resilientes e orientadas a eventos",
  "provider": "Alura",
  "hours": 10,
  "tag": "core",
  "slugs": [
   "production-ai"
  ],
  "note": ""
 },
 {
  "id": "ar-2-3",
  "title": "Segurança Arquitetural: modelagem de ameaças e Zero Trust",
  "provider": "Alura",
  "hours": 10,
  "tag": "core",
  "slugs": [
   "safety-control"
  ],
  "note": ""
 },
 {
  "id": "ar-2-4",
  "title": "Gestão de incidentes: arquitetura em cenários de crise",
  "provider": "Alura",
  "hours": 8,
  "tag": "skip",
  "slugs": [],
  "note": "Rende mais com sistemas em produção."
 },
 {
  "id": "at-1",
  "title": "Building with the Claude API",
  "provider": "Anthropic",
  "hours": null,
  "tag": "core",
  "slugs": [
   "llm-integration"
  ],
  "note": ""
 },
 {
  "id": "at-2",
  "title": "Introduction to MCP",
  "provider": "Anthropic",
  "hours": null,
  "tag": "core",
  "slugs": [
   "agents-tools"
  ],
  "note": "MCP assenta em tool use, por isso vem depois da Claude API."
 },
 {
  "id": "at-3",
  "title": "MCP Advanced Topics",
  "provider": "Anthropic",
  "hours": null,
  "tag": "core",
  "slugs": [
   "agents-tools",
   "safety-control"
  ],
  "note": ""
 },
 {
  "id": "av-1",
  "title": "Agentes de IA na AWS com Amazon Bedrock",
  "provider": "Alura",
  "hours": 18,
  "tag": "core",
  "slugs": [
   "agents-tools",
   "production-ai"
  ],
  "note": "Cobre a parte de AWS ligada a agentes e MCP, em vez de uma certificação genérica."
 }
];
