# SDD — KnowledgeGame

## Status
Em construção — sendo refinado iterativamente via perguntas.

---

## 1. Visão Geral

Aplicativo de aprendizado adaptativo baseado em perguntas. O usuário digita qualquer assunto e o app usa uma LLM para gerar dinamicamente os subitens e perguntas daquele assunto. O objetivo final é identificar o que o usuário sabe e o que não sabe, para guiar o aprendizado de forma personalizada.

---

## 2. Fluxo de Telas

### Página 1 — Busca
- Interface minimalista, inspirada no Google.com
- Campo de texto central onde o usuário digita o assunto (ex: "AZ-900", "mecânica de automóveis")
- Ao submeter, navega para a Página 2

### Página 2 — Sessão de Aprendizado
- **Dashboard lateral esquerdo:** lista os subitens do assunto com indicador de proficiência do usuário em cada um. Inicialmente todos aparecem como "vazio" (sem dados).
- **Painel direito:** lista dos subitens (overview)
- **Corpo central:** exibe as perguntas uma a uma

#### Tipos de pergunta suportados
- Multiple choice
- Single choice
- Fill-in-the-blank
- True/False
- Com ou sem tempo limite (definido pelo algoritmo adaptativo)

#### Mecânica Central — Conveyor Belt
Não existem sessões, baterias ou finais de jogo. O aprendizado é um **fluxo contínuo e infinito**:

- **Uma pergunta visível por vez** — nunca duas simultâneas
- O usuário pode parar a qualquer momento e retomar — o histórico persiste

#### Visualização da Esteira
No topo da Página 2, uma **fila visual horizontal** exibe as próximas perguntas em forma de cards minificados (apenas indicadores — sem revelar o conteúdo). O usuário enxerga quantas perguntas estão prontas à frente, criando senso de progresso e antecipação.

#### Configurações da Esteira (Settings)

| Opção | Label sugerido | Descrição | Default |
|---|---|---|---|
| 1 | **Queue Depth** | Maximum number of questions to keep ready in the queue at all times | 5 |
| 2 | **Refill Trigger** | Generate more questions when the queue drops to this number | 2 |

**Lógica de funcionamento:**
- O sistema mantém a fila sempre com até `Queue Depth` perguntas prontas
- Quando o número de perguntas restantes cai para `Refill Trigger`, uma nova geração via LLM é disparada em background — o usuário não percebe, não há loading
- Se a fila zerar antes da geração terminar, exibe um micro-loading discreto ("Preparing next question...")

#### Algoritmo Adaptativo (decisão arquitetural)
Abordagem híbrida: **estatística bayesiana + heurísticas de SM-2**

A cada resposta, o sistema atualiza um modelo por subitem com:
- Taxa de acerto histórica (acertos / total)
- Velocidade de resposta (tempo gasto vs. tempo médio)
- Padrão de erros (tipos de pegadinha que confundem o usuário)
- Intervalo desde a última vez que o subitem foi abordado

Com esses dados, o próximo prompt enviado à LLM inclui instruções como:
- *"O usuário erra consistentemente questões sobre [conceito X] — gere uma pergunta que confronte diretamente esse gap"*
- *"O usuário domina [subitem Y] — aumente a dificuldade ou mude o tipo de questão"*
- *"O usuário não vê [subitem Z] há 3 dias — gere uma questão de revisão de nível médio"*

#### Domain-Specific Prompt Templates
Cada assunto pode ter seu próprio estilo de prompt interno:
- **Certificações (AZ-900, AWS):** foco em cenários práticos e pegadinhas de prova
- **Mecânica / ciências:** foco em causa-efeito, cálculos, diagnóstico
- **Idiomas:** foco em contexto, uso natural, exemplos em frase
- O template é selecionado automaticamente com base na categoria do assunto detectada pela LLM na Página 1

---

## 3. Domain Model (DDD)

### Entidades principais

```
Topic
 └── Item (1..N)
      └── SubItem (1..N)
           └── Question (1..N)
```

| Entidade | Descrição | Exemplo |
|---|---|---|
| **Topic** | O assunto digitado pelo usuário na Página 1 | `AZ-900` |
| **Item** | Agrupamento principal gerado pela LLM | `Cloud Concepts` |
| **SubItem** | Tópico granular dentro de um Item | `IaaS vs PaaS vs SaaS` |
| **Question** | Pergunta gerada pela LLM, vinculada a um SubItem | `Which Azure service is IaaS?` |

### Regra de Mute
O usuário pode **silenciar** qualquer nível da hierarquia:
- Silenciar um **Topic** → exclui todos os seus Items/SubItems do conveyor belt
- Silenciar um **Item** → exclui todos os seus SubItems
- Silenciar um **SubItem** → exclui apenas aquele subitem

Subitens/Items silenciados continuam visíveis no dashboard com ícone de mute, mas não recebem novas perguntas. O algoritmo adaptativo os ignora enquanto estiverem silenciados.

---

## 4. Geração de Conteúdo

- **Motor:** LLM via API (ex: Claude, OpenAI)
- **O que é gerado dinamicamente:** subitens do assunto, perguntas, alternativas, resposta correta e explicação
- **Estratégia de carregamento:** progressivo (não gerar tudo de uma vez) para garantir UX fluida e tempo de resposta aceitável
- Streaming de respostas da LLM deve ser considerado para reduzir latência percebida

---

## 4. Persistência e Autenticação

- **Escopo atual (POC):** sem login, sem autenticação
- Progresso da sessão salvo localmente (localStorage)
- **Banco de dados necessário** para armazenar perguntas geradas pela LLM e reaproveitar em sessões futuras

**Decisão arquitetural — Banco de dados:**

| Camada | Tecnologia | Justificativa |
|---|---|---|
| Banco | PostgreSQL via Supabase | Free tier, fácil setup, API REST pronta, sem gerenciar servidor |
| ORM | Prisma | Type-safe, integração perfeita com Next.js + TypeScript |

### Estratégia de reaproveitamento de perguntas
- Toda pergunta gerada pela LLM é persistida com: enunciado, alternativas, resposta correta, explicação, assunto, subitem e metadados de dificuldade
- Antes de chamar a LLM, o sistema verifica se já existem perguntas suficientes no banco para o subitem solicitado
- Se sim: usa as do banco (zero latência de geração)
- Se não: gera via LLM e persiste para uso futuro

---

## 5. Stack Tecnológica

**Decisão arquitetural (POC):**

| Camada | Tecnologia | Justificativa |
|---|---|---|
| Framework | Next.js (React + TypeScript) | Suporte nativo a streaming, API routes para proteger a chave LLM, ecosistema maduro |
| Estilização | Tailwind CSS | Velocidade de prototipação, UI limpa sem overhead |
| LLM | Anthropic Claude API (`@anthropic-ai/sdk`) | Streaming de respostas, qualidade de geração, modelo mais capaz para POC |
| Estado | Zustand | Leve, simples, sem boilerplate — ideal para POC |
| Persistência | localStorage | Sem backend necessário no POC |
| Backend | Next.js API Routes | Apenas para intermediar chamadas LLM (ocultar API key) — sem servidor separado |

---

## 7. Gamificação (inspiração: Duolingo)

### Mecânicas de progresso
- **XP:** o usuário ganha XP a cada resposta correta; quantidade varia por dificuldade da pergunta
- **Streak:** contador de dias consecutivos de estudo
- **Vidas/Corações:** o usuário começa com N vidas por sessão; perde 1 a cada erro; sessão encerra ao zerar
- **Barra de progresso por subitem:** preenchida conforme acertos no subitem
- **Nível de proficiência por subitem:** Iniciante → Básico → Intermediário → Avançado → Expert

### Dashboard Esquerdo — Barra de Histórico por Subitem
Cada subitem exibe uma barra bicolor de progresso histórico acumulado:
- **Azul (`#60A5FA`):** % de acertos no subitem ao longo do tempo
- **Vermelho (`#F97316` laranja-avermelhado):** % de erros
- A barra reflete o histórico completo (não só a sessão atual), permitindo ao usuário identificar seus pontos fortes e fracos a longo prazo
- Colorblind-safe: as barras também exibem os percentuais em texto (ex: `73% ✓ · 27% ✗`)

### Algoritmo de repetição (decisão arquitetural)
Uso do algoritmo **SM-2** (base do Anki/SuperMemo):
- Cada par (usuário-anônimo + pergunta) tem um intervalo de revisão calculado
- Acertos aumentam o intervalo (pergunta volta mais tarde)
- Erros resetam o intervalo (pergunta volta logo)
- Sessões futuras priorizam perguntas com revisão vencida

### Feedback visual
- Animação de acerto/erro imediata (verde/vermelho)
- Exibição da resposta correta + explicação após cada resposta
- Celebração ao completar um subitem (confetti, XP ganho)
- Dashboard esquerdo atualiza em tempo real

---

## 8. Identidade Visual — Dystoppia

### Nome
**Dystoppia.com** — o nome duplo "pp" é intencional, marca registrada.

### Idioma
Todo o app em **inglês** (UI, textos, mensagens de erro, gamificação).

### Tema
Dark mode exclusivo (sem toggle light/dark no POC).

### Paleta de Cores (decisão arquitetural)

Inspiração: Linear, Raycast, Vercel — dark mode premium, minimalista, futurista.
Colorblind-proof: nunca depender apenas de vermelho/verde para comunicar estado. Todo feedback usa cor + ícone + forma.

| Token | Hex | Uso |
|---|---|---|
| `bg-base` | `#09090E` | Background principal |
| `bg-surface` | `#12121A` | Cards, painéis |
| `bg-elevated` | `#1C1C28` | Modais, dropdowns |
| `border` | `#2E2E40` | Bordas sutis |
| `primary` | `#818CF8` | Indigo-400 — ações principais, progresso |
| `accent` | `#38BDF8` | Sky-400 — destaques, links |
| `text-primary` | `#EEEEFF` | Texto principal |
| `text-muted` | `#9494B8` | Texto secundário |
| `feedback-error` | `#F97316` | Laranja — erro/resposta errada (colorblind safe) |
| `feedback-success` | `#60A5FA` | Azul claro — acerto (colorblind safe, não depende de verde) |
| `feedback-warning` | `#FBBF24` | Âmbar — alertas |
| `xp-gold` | `#FACC15` | XP, conquistas, streaks |

### Tipografia
- **Font:** `Inter` (padrão de mercado, altíssima legibilidade)
- Fallback: `system-ui`

### Acessibilidade
- Contraste mínimo WCAG AA em todos os textos
- Feedback de acerto/erro sempre com ícone + cor (nunca só cor)
- Focus rings visíveis para navegação por teclado

---

## 9. Transições e Loading States

### Página 1 → Página 2
Ao submeter o assunto, a transição deve ser memorável e comunicar que "algo inteligente está acontecendo":

- **Loading screen:** o campo de busca expande e se transforma em uma animação de partículas/neurônios se conectando (biblioteca: `framer-motion` + `tsparticles`)
- **Texto animado:** frases rotativas e irreverentes enquanto carrega, ex: *"Consultando o universo..."*, *"Treinando sinapses..."*, *"Lendo 10.000 páginas por você..."*
- **Transição para Página 2:** os subitens aparecem no dashboard esquerdo um a um via streaming (efeito typewriter), dando sensação de "pensamento ao vivo"
- As perguntas do corpo central começam a aparecer assim que o primeiro subitem estiver pronto — o usuário não espera tudo carregar

### Filosofia geral de UX
- Nunca mostrar spinner estático — sempre animação com propósito
- Skeleton screens para conteúdo ainda carregando
- Micro-animações em cada interação (hover, clique, acerto, erro)
- Biblioteca de animação: **Framer Motion** (padrão de mercado, usado no Linear, Vercel, Loom)

---

## 6. Settings — User Configurable

| Setting | Default | Description |
|---|---|---|
| Queue Depth | 5 | Max questions kept ready in the queue |
| Refill Trigger | 2 | Regenerate when queue drops to this number |

All other behavior (difficulty, pacing, subitem focus) is controlled by the adaptive algorithm — not exposed to the user.

---

## 10. Difficulty Progression

**Core pillar: always start from zero.** No assumptions about prior knowledge.

- Every SubItem begins at difficulty level **1 (super easy)**
- Questions at level 1: direct definitions, no ambiguity, no traps
- Difficulty increases only after consistent correct answers on that SubItem
- A single wrong answer can drop the difficulty back
- Scale: 1 (Intro) → 2 (Basic) → 3 (Intermediate) → 4 (Advanced) → 5 (Expert)
- The current difficulty level is passed to the LLM prompt so it generates questions calibrated to that level
- Users never skip levels — the system earns each step

---

## 11. Requisitos Não-Funcionais

- Everything in **English** (UI, labels, questions, feedback, settings)
- UX/UI efficiency is the top priority
- Progressive content loading — never block the user waiting for LLM
- Immediate visual feedback on every interaction
- Colorblind-accessible (color + icon always paired)
- WCAG AA contrast minimum
