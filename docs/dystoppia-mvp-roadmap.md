# Dystoppia - MVP Roadmap and Expansion Plan

## Status
Draft for immediate execution.

This document repositions Dystoppia from a single adaptive learning app into a broader AI execution platform.

The current learning product remains approved as `Module 01`.

The priority now is not to ship the full vision. The priority is to ship a controlled MVP with strong foundations, then document the expansions in an ordered way.

---

## 1. Strategic Decision

### What Dystoppia becomes

Dystoppia becomes a robust AI platform centered on an orchestration LLM capable of:

- understanding a user's goal from a single prompt
- planning execution steps
- calling specialized tools and APIs
- creating and coordinating application resources
- generating new apps and operational assets
- helping with real-world business tasks such as research, domains, ads, and go-to-market support

### What does not change

- Project name: `Dystoppia`
- Domain: `www.dystoppia.com`
- Home page visual identity: keep `100%` of the styling and effectively `99.99%` of the landing structure
- Current adaptive learning flow remains valid as the first approved module

### Core principle

The product ambition is large, but the MVP must be small, controlled, auditable, and safe.

---

## 2. Product Positioning

### Short version

Dystoppia is not only a learning app.

Dystoppia is an AI execution platform that can:

- think
- plan
- generate
- provision
- monitor
- estimate cost
- account for every action taken

### Example target use case

User prompt:

> "I want an app that scans another app and brings me Reddit opinions about it, its business model, and the probability of competing with it."

Expected Dystoppia behavior in future phases:

1. Understand the request.
2. Break it into research, analysis, product design, technical architecture, and execution.
3. Generate the app plan.
4. Create implementation artifacts.
5. Potentially provision infrastructure.
6. Potentially assist with domain setup and launch operations.

This is the long-term direction, not the MVP scope.

---

## 2.1 Core Platform Skills

These are not optional accessories.

They are core capability pillars that Dystoppia must develop over time.

## Founder-defined essential skills

### 1. DevOps

Dystoppia must understand and assist with:

- infrastructure provisioning plans
- deployment workflows
- CI/CD structure
- environments and secrets handling
- observability and rollback strategy
- runtime reliability and operational safety

### 2. Software Development

Dystoppia must understand and assist with:

- application design
- feature decomposition
- implementation planning
- code generation
- debugging support
- testing strategy
- delivery sequencing

### 3. Software Architecture

Dystoppia must understand and assist with:

- system design
- module boundaries
- service decomposition
- event and data flow
- scalability tradeoffs
- resilience and maintainability

### 4. Budget and Economic Feasibility

This is critical.

Dystoppia must be able to determine when a request is economically viable.

The platform must identify cases where:

- infrastructure is too expensive
- API consumption is too expensive
- expected customer payment does not justify execution
- margin becomes too thin or negative
- the safest answer is to refuse, reduce scope, or redesign the solution

This capability should behave like an internal budget professional or technical estimator.

It should answer questions such as:

- "Does this app make economic sense?"
- "Will this request cost more than the user pays?"
- "What is the cheapest architecture that still works?"
- "Should this be rejected, simplified, or priced differently?"

## Additional skills Dystoppia will need

### 5. Product Management

Needed for:

- turning vague requests into scoped deliverables
- defining MVP cuts
- feature prioritization
- translating ambition into build order

### 6. Technical Research and Competitive Intelligence

Needed for:

- competitor analysis
- business model breakdown
- user sentiment research
- market positioning
- evidence gathering from external sources

### 7. Cost Engineering and Pricing Design

Needed for:

- pricing requests correctly
- mapping provider cost to credits
- creating healthy margin models
- preventing underpriced usage patterns

### 8. Security Engineering

Needed for:

- permission boundaries
- secrets protection
- auditability
- abuse prevention
- safe execution design

### 9. QA and Reliability Engineering

Needed for:

- test strategy
- regression prevention
- workflow validation
- confidence before execution

### 10. Data and Analytics

Needed for:

- usage measurement
- cost measurement
- funnel visibility
- product learning
- per-user and per-request profitability analysis

### 11. Platform Operations

Needed for:

- request governance
- incident handling
- failure recovery
- operational playbooks
- approval workflows

### 12. Business Operations

Needed for future phases involving:

- domain setup support
- launch operations
- ads workflow assistance
- vendor integration decisions

## Skill priority for MVP

The first capability stack for the MVP should be:

1. Security Engineering
2. Budget and Economic Feasibility
3. Cost Engineering and Pricing Design
4. Software Architecture
5. Software Development
6. DevOps
7. Product Management

This ordering matters because:

- unsafe execution kills the product
- bad economics kills the business
- architecture mistakes multiply cost
- implementation and DevOps only create value if the first three are under control

---

## 3. MVP Now

## Objective

Ship a controlled first version that proves the new platform direction without opening the full attack surface.

## MVP Positioning

For now, Dystoppia should behave as:

- a protected AI workspace
- with one `master user`
- with credit-based usage
- with strict execution limits
- with full cost visibility
- without unrestricted public self-service

## MVP Scope

### Included now

- Keep current landing page almost unchanged
- Keep current learning module available as `Module 01`
- Add a new core concept: `AI Workspace / Builder`
- Accept free-form high-level prompts from the master user
- Convert prompt into structured outputs:
  - request understanding
  - execution plan
  - app specification
  - business analysis
  - risk analysis
  - implementation backlog
- Track every LLM/API call and every billable action
- Implement credit ledger
- Implement master-only authentication and authorization
- Introduce a secure execution boundary for actions that touch external systems

### Explicitly out of scope for MVP

- open public signup
- broad multi-user support
- automatic VM creation in production without approval gates
- automatic database creation for end users
- automatic domain connection to GoDaddy/Namecheap
- automatic Meta Ads campaign creation
- autonomous resource provisioning without human confirmation
- complex role hierarchy for organizations and teams

---

## 4. What Must Start Now

## 4.1 Security starts now

Security is not a "later improvement" for this product.

Because Dystoppia aims to:

- spend money through APIs
- create resources
- potentially touch infrastructure
- potentially interact with third-party platforms

the minimum security model must begin in the MVP.

### Minimum security baseline for MVP

- single master account only
- deny-by-default authorization model
- all privileged actions gated by explicit allowlists
- no raw arbitrary shell access from user prompts
- no arbitrary infrastructure provisioning directly from prompts
- audit log for every privileged action
- usage ledger for every paid action
- secrets only through secure secret storage
- clear distinction between:
  - read-only actions
  - analysis actions
  - billable actions
  - privileged execution actions

### Security conclusion

External users can wait.

Security foundations should not wait.

---

## 4.2 Credits and payment start now

If the user can only use Dystoppia through credits, then billing cannot be treated as a future add-on.

For MVP, the simplest acceptable model is:

- prepaid credits
- every action consumes credits based on measured cost
- margin is applied on top of estimated or observed infrastructure/API cost

### MVP billing model

- internal or admin-managed credit top-up is acceptable for first release
- public self-service checkout can be phase 2 if needed
- every credit consumption event must create a ledger record
- user balance must never rely only on derived summaries

### Billing conclusion

For the MVP, the must-have is not "beautiful pricing pages".

The must-have is a correct ledger and trustworthy cost accounting.

---

## 5. MVP User Model

## Primary user now

- `Master User`

This user is the operator, owner, and privileged internal account.

## Why this matters

The master user needs separate accounting because this account is not a normal customer account.

Its usage must be reported independently for:

- internal testing
- margin validation
- prompt R&D
- operational overhead
- LLM cost calibration

## Recommendation

Create at least these account classes in the model now:

- `master`
- `customer`

Even if only `master` is active in the MVP.

---

## 6. MVP Architecture Recommendation

## High-level architecture

For the MVP, Dystoppia should be split into five layers:

### 1. Experience Layer

- existing landing page
- authenticated workspace
- module switcher
- request submission UI
- ledger and usage visibility UI

### 2. Orchestration Layer

- receives the user prompt
- classifies the request
- decides whether it is:
  - research only
  - planning
  - generation
  - privileged action request
- produces structured plans, not blind execution

### 3. Tooling Layer

- adapters for LLMs
- web research
- internal module calls
- future third-party connectors

### 4. Governance Layer

- auth
- authorization
- credit checks
- cost estimation
- billing ledger
- audit logs
- approval gates

### 5. Execution Layer

- strictly controlled actions
- no unrestricted infrastructure creation in MVP
- only approved workflows may execute

---

## 7. MVP Functional Breakdown

## Module 01 - Learning

Status:

- already approved
- remains in the platform

Role in MVP:

- proves the product already has one real module
- helps validate ledger, auth, billing, and observability patterns

## Module 02 - Builder Workspace

Status:

- MVP target

What it should do now:

- accept natural language product requests
- generate:
  - app concept breakdown
  - feature list
  - technical architecture
  - business model notes
  - competitive intensity estimate
  - execution roadmap
- present results as a structured workspace

What it should not do yet:

- execute dangerous provisioning flows automatically
- mutate production infrastructure directly

---

## 8. Cost Accountability Model

This is one of the hardest parts of the platform and should be designed explicitly.

## Goal

Know, with enough confidence, the cost and margin of each user request.

## Cost categories

Every request may incur one or more of these:

- LLM input token cost
- LLM output token cost
- web research/API cost
- TTS/STT cost
- compute/runtime cost
- storage/database cost
- third-party automation cost
- human review cost when applicable

## MVP approach

Use a pragmatic accounting model:

### 1. Measured cost when available

Use provider-reported usage whenever possible.

### 2. Estimated cost when direct measurement is not available

Use pricing tables plus local estimates.

### 3. Margin layer

Every billable action should compute:

- raw estimated cost
- safety buffer
- target margin
- credits charged

### 4. Separate internal reporting

Master user reports must be isolated from customer reports.

---

## 9. Data Model Additions Recommended Now

The current schema is strong for the learning app, but the platform expansion needs new entities.

## Add now or plan immediately

- `Account`
- `UserRole`
- `CreditLedger`
- `CreditBalance`
- `UsageEvent`
- `CostEvent`
- `ExecutionRequest`
- `ExecutionPlan`
- `ExecutionStep`
- `ApprovalGate`
- `AuditLog`
- `ProviderPricingSnapshot`

## Minimum additions for MVP

- `User.role`
- `CreditLedger`
- `UsageEvent`
- `AuditLog`
- `ExecutionRequest`

---

## 10. Authentication, Registration, Authorization

## Recommendation for MVP

Use the minimally simple and minimally secure model:

### Authentication

- email + password
- email verification
- secure session cookie
- optional TOTP later

### Registration

- closed registration for now
- only admin-created or explicitly allowed accounts

### Authorization

- role-based access control
- `master` role required for builder/orchestration MVP
- privileged actions need explicit permission checks

### Why this is the best tradeoff now

It is simpler than enterprise IAM, but much safer than open public access while the product is still defining execution boundaries.

---

## 11. Phased Delivery

## Phase 0 - Immediate foundation

Do now.

- freeze visual identity of landing page
- define platform positioning in docs
- define MVP scope and non-goals
- introduce role model with `master`
- introduce credit ledger
- introduce usage and audit logging
- define privileged action policy

## Phase 1 - MVP launch

Ship now.

- master-only login
- builder workspace
- prompt -> structured plan flow
- cost estimation per request
- credit deduction
- request history
- separate master reporting
- learning module preserved

## Phase 2 - Safe expansion

After MVP validation.

- managed top-up/payment flow
- limited external users
- customer accounts
- stronger reporting dashboards
- first safe third-party connectors

## Phase 3 - Controlled execution platform

Only after governance is stable.

- approval-based provisioning
- template-based app generation
- template-based database creation
- domain-assistance workflows
- marketing-assistance workflows

## Phase 4 - Advanced autonomy

Only after repeated operational proof.

- controlled VM creation
- controlled infra orchestration
- multi-step autonomous execution with hard approval checkpoints
- organization/team accounts

---

## 12. Product Priorities

## Priority now

1. Security baseline
2. Budget and economic feasibility logic
3. Role and authorization model
4. Credit ledger and cost accounting
5. Builder workspace MVP
6. Preserve learning module

## Not priority now

1. public growth loops
2. external self-service onboarding
3. autonomous infra creation
4. broad connector ecosystem
5. advanced multi-tenant collaboration

---

## 13. Final Recommendation

The correct move is:

- `MVP now`
- `security now`
- `public users later`

In other words:

Dystoppia should launch first as a controlled, high-trust, master-operated AI platform with measured credits, auditability, and strong execution boundaries.

Only after the platform proves:

- cost visibility
- operational stability
- safe authorization boundaries
- predictable unit economics

should it open itself to external customers and more powerful automation.

---

## 14. Immediate Next Build Track

If execution starts right now, the next implementation track should be:

1. Add `master` role and close down access to the new builder flow.
2. Create a proper credit ledger instead of relying only on plan/rate-limit counters.
3. Create usage, cost, and audit event tables.
4. Add a viability layer that estimates whether a request is economically acceptable before execution.
5. Build the first `Builder Workspace` request flow with structured outputs only.
6. Keep all dangerous actions behind manual approval and explicit allowlists.
7. Leave external-user growth and self-service registration for the next phase.
