# Dystoppia - MVP Implementation Plan

## Status
Technical execution draft.

This document translates the MVP functional specification into a concrete implementation plan.

References:

- roadmap: `docs/dystoppia-mvp-roadmap.md`
- functional spec: `docs/dystoppia-mvp-functional-spec.md`

---

## 1. Implementation Objective

Build the first controlled platform MVP on top of the existing Dystoppia app.

The implementation must:

- preserve the landing and current brand
- preserve the Learning module
- add a master-only Builder Workspace
- add role-based protection
- add a real credit ledger
- add usage, cost, and audit tracking
- add a cost viability layer before expensive generation

---

## 2. Delivery Principles

### Principle 1

Extend the current app. Do not rewrite it.

### Principle 2

Governance lands before autonomy.

### Principle 3

Any expensive action must be explainable in terms of:

- who triggered it
- why it ran
- what it cost
- what was charged

### Principle 4

If a feature cannot be bounded safely, it does not enter the MVP.

---

## 3. Build Sequence

Recommended execution order:

1. schema foundation
2. role model and authorization
3. ledger and balance mechanics
4. usage, cost, and audit events
5. cost engine
6. builder request persistence
7. builder APIs
8. private dashboard and Builder UI
9. reporting surface for master user
10. landing copy adjustments

This order should be preserved as much as possible.

---

## 4. Workstream A - Schema and Persistence

## Objective

Create the minimum platform data model without destabilizing the Learning module.

## 4.1 Changes to existing `User`

Add fields such as:

- `role String @default("customer")`
- `status String @default("active")`
- `isInternal Boolean @default(false)`

Suggested role values:

- `master`
- `customer`

Suggested status values:

- `active`
- `disabled`
- `invited`

## 4.2 New model: `ExecutionRequest`

Purpose:

- store Builder requests
- central object for audit, usage, and billing association

Suggested fields:

- `id`
- `userId`
- `module`
- `prompt`
- `normalizedIntent`
- `requestClass`
- `actionClass`
- `status`
- `viabilityStatus`
- `estimatedCostUsd`
- `estimatedCredits`
- `finalCostUsd`
- `finalCredits`
- `resultJson`
- `warningsJson`
- `createdAt`
- `updatedAt`
- `completedAt`

Suggested enums represented as strings for MVP:

- request class:
  - `builder`
  - `learning`
- action class:
  - `read_only`
  - `analysis_only`
  - `billable_generation`
  - `privileged_execution`
- status:
  - `pending`
  - `estimating`
  - `approved`
  - `rejected`
  - `running`
  - `completed`
  - `failed`
- viability:
  - `approved`
  - `approved_with_warning`
  - `reduce_scope`
  - `reject`

## 4.3 New model: `CreditLedger`

Purpose:

- source of truth for credits

Suggested fields:

- `id`
- `userId`
- `requestId?`
- `eventType`
- `amount`
- `balanceAfter`
- `reason`
- `metadataJson?`
- `createdByUserId?`
- `createdAt`

Event types:

- `top_up`
- `reserved`
- `released`
- `deduction`
- `refund`
- `manual_adjustment`

## 4.4 New model: `UsageEvent`

Purpose:

- track provider and tool usage

Suggested fields:

- `id`
- `userId`
- `requestId`
- `provider`
- `serviceType`
- `quantity`
- `unit`
- `estimatedCostUsd`
- `actualCostUsd`
- `metadataJson?`
- `createdAt`

Examples:

- Anthropic input/output token usage
- OpenAI TTS usage
- future web research provider usage

## 4.5 New model: `AuditLog`

Purpose:

- security and business traceability

Suggested fields:

- `id`
- `actorUserId?`
- `actorRole?`
- `eventType`
- `targetType?`
- `targetId?`
- `requestId?`
- `metadataJson?`
- `createdAt`

## 4.6 New model: `ApprovalGate`

Purpose:

- record blocked or gated actions

Suggested fields:

- `id`
- `requestId`
- `gateType`
- `status`
- `requiredRole`
- `reason`
- `resolvedByUserId?`
- `resolvedAt?`
- `createdAt`

Suggested values:

- gate type:
  - `infra_provision`
  - `db_create`
  - `domain_operation`
  - `ads_operation`
  - `expensive_execution`
- status:
  - `pending`
  - `approved`
  - `rejected`
  - `not_available_in_mvp`

## 4.7 Optional MVP model: `ProviderPricingSnapshot`

Purpose:

- freeze the assumptions used for cost estimation

Can be introduced now or shortly after MVP if needed.

## Definition of done for Workstream A

- schema updated
- migration generated
- migration reviewed
- no existing Learning flow broken
- all new models accessible via Prisma client

---

## 5. Workstream B - Authorization Layer

## Objective

Introduce role-aware server authorization, not only authentication.

## 5.1 New auth utilities

Add helpers such as:

- `requireUser`
- `requireRole("master")`
- `assertAllowedAction({ role, actionClass, module })`

## 5.2 Protection rules

Builder routes:

- `master` only

Admin credit adjustment routes:

- `master` only

Audit and usage reporting routes:

- `master` only

Learning routes:

- authenticated user
- current logic preserved

## 5.3 Closed-registration posture

For MVP:

- registration endpoint can remain
- public access should be operationally disabled or restricted
- only explicitly allowed accounts should exist

## Definition of done for Workstream B

- new protected routes enforce role checks server-side
- non-master user cannot access Builder APIs
- denied actions return explicit forbidden responses

---

## 6. Workstream C - Credit Ledger Mechanics

## Objective

Make credits real and enforceable.

## 6.1 Core ledger service

Create service functions such as:

- `getCurrentBalance(userId)`
- `appendLedgerEvent(...)`
- `reserveCredits(userId, amount, requestId)`
- `releaseReservedCredits(...)`
- `deductCredits(...)`
- `adjustCredits(...)`

## 6.2 Balance policy

For MVP, two acceptable implementations:

### Option A

Store only ledger and derive balance by aggregation.

### Option B

Store ledger plus `balanceAfter` snapshots on every event.

Recommendation:

Use ledger with `balanceAfter` snapshot for simplicity and audit clarity.

## 6.3 Credit flow for Builder requests

Recommended flow:

1. estimate credits
2. reserve credits
3. execute request
4. calculate final charge
5. convert reservation into final deduction
6. release unused remainder if necessary

For very small requests, direct deduction is acceptable.

## Definition of done for Workstream C

- balance endpoint returns trustworthy value
- insufficient balance blocks execution
- ledger history is queryable
- manual credit top-up works for master testing

---

## 7. Workstream D - Usage, Cost, and Audit Services

## Objective

Create platform observability for business and security events.

## 7.1 Usage event writer

Implement services to write:

- LLM token usage
- estimated cost
- actual cost if known
- provider metadata

## 7.2 Cost event pattern

Two valid paths:

### Path A

Store costs inside `UsageEvent` only.

### Path B

Add a dedicated `CostEvent` model later.

Recommendation:

Keep MVP simple and store cost details in `UsageEvent`.

## 7.3 Audit event writer

Audit at least:

- login success/failure when relevant
- role-protected route access denied
- credit adjustments
- builder request created
- builder request rejected by viability
- builder request completed
- approval gate created

## Definition of done for Workstream D

- new events are persisted for all Builder requests
- audit records exist for sensitive operations
- master can review event history through API

---

## 8. Workstream E - Cost Engine

## Objective

Estimate whether a request is economically acceptable before execution.

## 8.1 Cost engine inputs

Inputs may include:

- request prompt
- likely workflow type
- likely provider/model
- rough complexity classification
- expected token range
- expected tool usage

## 8.2 First MVP implementation

Do not overengineer this.

Use a deterministic rules-based estimator first.

### Suggested first version

- classify request into complexity tiers:
  - `small`
  - `medium`
  - `large`
  - `unsafe_or_unknown`
- map each tier to:
  - estimated token range
  - estimated provider cost
  - overhead buffer
  - credit charge
  - viability rule

### Example outputs

- `approved`
- `approved_with_warning`
- `reduce_scope`
- `reject`

## 8.3 Margin logic

At minimum, compute:

- estimated raw cost
- overhead factor
- safety factor
- final credit charge

### MVP rule

If confidence is low and estimated margin is weak, do not auto-approve.

## Definition of done for Workstream E

- Builder requests receive cost estimate before generation
- requests can be rejected or scope-reduced
- estimate is stored on `ExecutionRequest`

---

## 9. Workstream F - Builder Orchestration API

## Objective

Create the first platform-grade request flow.

## 9.1 New endpoints

Suggested endpoints:

- `POST /api/builder/requests`
- `GET /api/builder/requests`
- `GET /api/builder/requests/:id`
- `POST /api/builder/estimate`

## 9.2 `POST /api/builder/requests` responsibilities

- authenticate user
- require `master` role
- classify request
- run viability estimate
- reserve or deduct credits
- generate structured Builder response
- write usage, ledger, and audit events
- persist final request result

## 9.3 Structured response contract

The response should be JSON-friendly and stable.

Suggested result sections:

- `requestUnderstanding`
- `assumptions`
- `recommendedScope`
- `architecture`
- `developmentPlan`
- `devopsPlan`
- `businessNotes`
- `competitiveAssessment`
- `costSummary`
- `warnings`
- `nextSteps`

## 9.4 LLM prompt policy

The Builder prompt should instruct the system to behave as a multi-skill planning engine with emphasis on:

- software architecture
- development
- DevOps
- cost awareness
- scope control

It should explicitly avoid pretending to have executed actions it did not execute.

## Definition of done for Workstream F

- request can be submitted
- viability is computed
- structured result is persisted
- credits are affected
- all related events are recorded

---

## 10. Workstream G - Private UI and Builder Workspace

## Objective

Expose the new platform MVP inside the existing app.

## 10.1 Private home/dashboard

Add a private landing/dashboard after login with:

- module cards
- credit balance
- recent Builder requests
- recent Learning activity
- warnings for low credits or weak margins

## 10.2 Module switcher

Introduce a simple module navigation:

- `Builder`
- `Learning`

No need for full workspace complexity yet.

## 10.3 Builder Workspace UI

Minimum UI sections:

- prompt input
- submit button
- recent request list
- active request result panel
- viability summary panel
- credits/cost panel
- warnings panel

## 10.4 Result rendering

Render results in distinct cards/sections, not a single raw blob.

Recommended sections:

- understanding
- architecture
- development
- DevOps
- economics
- risks
- next steps

## Definition of done for Workstream G

- master user can access Builder screen
- requests can be created from UI
- results are readable and persistent
- costs and warnings are visible

---

## 11. Workstream H - Reporting Surface

## Objective

Give the master user operational visibility.

## 11.1 Master reporting needs

At minimum expose:

- current balance
- ledger history
- request history
- estimated vs actual cost where possible
- internal usage totals

## 11.2 Separate internal reporting

Internal reporting should be separate from future external reporting.

For MVP this can simply mean:

- only master data exists
- APIs and UI already assume internal reporting is a distinct surface

## Definition of done for Workstream H

- master can inspect historical consumption
- master can inspect which requests were expensive
- master can inspect credit movements

---

## 12. Workstream I - Landing and Messaging

## Objective

Update product messaging without redesigning the site.

## Changes allowed

- copy updates
- one or two positioning sentences
- feature/module wording adjustments

## Changes not allowed

- broad visual redesign
- structural rework of the landing page
- departure from current Dystoppia identity

## Messaging direction

Position Dystoppia as:

- an AI execution platform
- with an approved Learning module
- expanding into Builder capabilities

Avoid claiming:

- full autonomous company creation
- fully automatic infrastructure orchestration
- unrestricted external execution

---

## 13. Suggested File-Level Implementation Map

This is a suggested mapping, not a rigid rule.

## Backend

- `prisma/schema.prisma`
- new migration files under `prisma/migrations`
- `lib/authGuard.ts`
- new `lib/authorization.ts`
- new `lib/credits.ts` or extend existing one
- new `lib/costEngine.ts`
- new `lib/audit.ts`
- new `lib/builder.ts`
- new builder routes under `app/api/builder/...`
- new reporting routes under `app/api/credits/...`, `app/api/usage/...`, `app/api/audit/...`

## Frontend

- new private dashboard page
- new Builder page, likely under `app/builder/page.tsx`
- new Builder components for:
  - request form
  - request history
  - cost summary
  - result sections
  - warnings
- small landing copy updates in existing landing components

---

## 14. Milestone Plan

## Milestone 1 - Governance foundation

Includes:

- schema additions
- role model
- authorization helpers
- credit ledger basics

Exit condition:

- platform can safely distinguish master and non-master capabilities

## Milestone 2 - Request accounting foundation

Includes:

- usage events
- audit events
- cost engine
- request persistence

Exit condition:

- a Builder request can be estimated, recorded, and traced end to end

## Milestone 3 - Builder MVP

Includes:

- Builder APIs
- Builder UI
- request history
- cost and warning display

Exit condition:

- master user can use the Builder productively

## Milestone 4 - Reporting and polish

Includes:

- internal reporting surface
- landing copy alignment
- final safety checks

Exit condition:

- MVP is presentable and operationally understandable

---

## 15. Risk Notes

## Risk 1 - Trying to automate too much too early

Mitigation:

- Builder is analysis-first in MVP

## Risk 2 - Incorrect credit logic

Mitigation:

- real ledger
- auditability
- reserve/deduct pattern

## Risk 3 - Weak margin estimation

Mitigation:

- deterministic estimator first
- internal-only usage first
- separate master reporting

## Risk 4 - Security gaps from route sprawl

Mitigation:

- centralized authorization helpers
- master-only Builder access

## Risk 5 - Scope explosion

Mitigation:

- preserve landing
- preserve Learning
- ship Builder as structured planning tool before execution tool

---

## 16. Acceptance Checklist

The implementation is ready for MVP validation when:

- schema migrations are stable
- master role exists and is enforced
- Builder requests persist correctly
- cost estimate is shown before or alongside execution
- ledger records are created reliably
- usage and audit events exist
- Builder results are structured and useful
- landing remains visually aligned
- Learning module still works

---

## 17. Immediate Build Backlog

The first backlog slice should be:

1. update Prisma schema with role, execution request, ledger, usage, audit, approval gate
2. create migration and verify compatibility
3. add authorization helpers and master-only gate
4. implement ledger service
5. implement cost engine
6. implement Builder request service and first route
7. build Builder page and result renderer
8. add reporting endpoints and master history views
9. update landing copy lightly

---

## 18. Recommendation

Start implementation with governance and accounting, not the flashy AI UI.

That means:

- schema first
- authorization second
- ledger third
- Builder fourth

This sequence gives Dystoppia a safe platform backbone and prevents the MVP from becoming an expensive prototype with weak business controls.
