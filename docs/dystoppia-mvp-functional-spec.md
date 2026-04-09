# Dystoppia - MVP Functional Specification

## Status
Execution draft for the first platform MVP.

This document converts the roadmap into a build-oriented MVP specification.

Reference:

- strategy and phases: `docs/dystoppia-mvp-roadmap.md`

---

## 1. MVP Definition

## Goal

Ship Dystoppia as a controlled AI platform MVP with:

- a preserved landing page
- the existing Learning module kept alive as `Module 01`
- a new `Builder Workspace` as the first platform expansion
- strong security boundaries
- explicit cost accountability
- credit-based internal billing
- one privileged `master` user as the primary operator

## What the MVP proves

The MVP does not prove full autonomy.

It proves that Dystoppia can:

- receive a high-level request
- analyze it
- estimate viability
- calculate expected cost
- charge credits safely
- generate structured execution outputs
- log everything important

---

## 2. Product Surface

## 2.1 Public Surface

The public experience stays almost unchanged.

### Public pages preserved

- landing page
- login
- registration flow may remain in codebase but should be operationally restricted
- pricing page may remain visible, but public purchase is not required for MVP

### Public design rule

- keep current Dystoppia brand
- keep current landing styling
- avoid redesign work unless required for platform messaging

## 2.2 Private Surface

The private product area becomes the real MVP.

### Private MVP areas

- authenticated dashboard/workspace
- module selector
- Builder Workspace
- Learning module
- usage and credit visibility
- request history
- audit/admin visibility for the master user

---

## 3. Core MVP Modules

## Module A - Identity and Session

### Objective

Allow secure access with the simplest acceptable model.

### Functional requirements

- email + password login
- email verification
- secure session cookie
- logout
- session validation endpoint

### MVP behavior

- registration is closed or invite-only
- accounts are created intentionally
- only authorized users can enter the private workspace

### Security rules

- passwords hashed with strong hashing
- session cookies must be `HttpOnly`
- invalid sessions rejected server-side
- no privileged function should trust client state alone

### Role in MVP

This module is mandatory before any Builder functionality.

---

## Module B - Roles and Authorization

### Objective

Prevent the platform from becoming an unbounded execution system.

### Minimum role model

- `master`
- `customer`

Only `master` needs to be active in MVP.

### Functional requirements

- every protected route checks user identity
- every platform action checks role
- Builder Workspace is `master-only` in MVP
- dangerous actions are forbidden by default

### Authorization model

Use `deny by default`.

An action should only be allowed if:

- the user is authenticated
- the role allows the action
- the workflow type is allowlisted
- credits are sufficient when billing applies
- no approval gate is pending for the action

### Example action classes

- `read_only`
- `analysis_only`
- `billable_generation`
- `privileged_execution`

---

## Module C - Credit Ledger

### Objective

Create a trustworthy billing foundation.

### Principle

The user balance must not be inferred indirectly.

It must come from a real ledger.

### Functional requirements

- store every credit addition
- store every credit deduction
- store every adjustment
- store resulting balance snapshots or derive balance from ledger reliably
- support internal notes and source metadata

### MVP billing model

- prepaid credits
- credits are deducted per request or per billable step
- top-ups may be admin-managed in MVP

### Ledger event types

- `top_up`
- `deduction`
- `refund`
- `manual_adjustment`
- `reserved`
- `released`

### Minimum ledger fields

- user id
- event type
- amount
- balance after event
- currency reference if needed
- reason
- request linkage
- created at
- created by

### Important rule

No AI execution request should proceed if credit policy says the user cannot afford it.

---

## Module D - Cost Engine

### Objective

Estimate and record whether a request makes economic sense.

### Why this exists

Dystoppia is not only a software product.

It is also a unit-economics-sensitive system.

If a request costs more than the user pays, the platform loses money.

### Functional requirements

- estimate request cost before execution
- estimate provider usage per step
- store pricing assumptions used in the estimate
- compare estimated cost versus credit charge
- flag low-margin or negative-margin requests
- allow refusal or scope reduction when a request is not viable

### Cost engine outputs

Every Builder request should produce:

- estimated raw cost
- credit charge
- expected gross margin
- confidence level of estimate
- viability result:
  - `approved`
  - `approved_with_warning`
  - `reduce_scope`
  - `reject`

### Cost categories in MVP

- LLM token cost
- web/API research cost
- compute/runtime cost
- storage/database cost if applicable
- execution overhead buffer

### Pricing policy rule

The system should charge not only provider cost, but:

- provider cost
- operational overhead
- risk buffer
- target margin

---

## Module E - Usage Events

### Objective

Track what the platform used, not only what it charged.

### Functional requirements

- record LLM usage per request
- record tool or provider usage
- record estimated and actual cost when available
- associate usage with request id and user id
- distinguish internal test activity from customer activity

### Why this matters

Without usage events, Dystoppia cannot:

- calibrate prices
- understand real margins
- detect abuse
- explain consumption to users

---

## Module F - Audit Log

### Objective

Make sensitive actions observable and reviewable.

### Functional requirements

- log privileged actions
- log configuration changes
- log credit adjustments
- log request approvals/rejections
- log authentication-sensitive events

### Audit principles

- append-oriented
- immutable in practice
- human-readable event summaries
- machine-usable metadata

### Minimum audit fields

- actor id
- actor role
- event type
- target object
- request id
- metadata
- timestamp

---

## Module G - Approval Gates

### Objective

Prevent risky requests from auto-executing.

### MVP principle

The Builder Workspace may analyze and propose.

It must not automatically perform sensitive external actions.

### Functional requirements

- create approval checkpoints for risky workflows
- record decision status
- block execution when approval is missing
- present clear reason for the block

### Requests that should require approval in future phases

- infrastructure provisioning
- database creation
- domain operations
- advertising operations
- destructive changes
- expensive multi-step workflows

### MVP behavior

Most such actions should simply be marked as:

- `not available in MVP`
- `manual approval required`

---

## Module H - Builder Workspace

### Objective

Give the master user a private AI workspace for platform-grade requests.

### Core interaction

The user enters a high-level request, for example:

> "I want an app that scans another app, gets Reddit opinions, explains the business model, and estimates the probability of competing with it."

### MVP output model

The system should not jump directly to provisioning.

It should first produce a structured result with sections such as:

- request understanding
- assumptions
- business objective
- app concept summary
- feature decomposition
- software architecture proposal
- DevOps/deployment proposal
- economic viability summary
- estimated cost range
- competitive/risk notes
- recommended scope for MVP
- phased implementation plan

### Required skills expressed in product behavior

The Builder Workspace must explicitly demonstrate:

- software architecture skill
- software development skill
- DevOps skill
- budget/economic feasibility skill
- product management skill

### MVP limitations

- no unrestricted shell execution
- no uncontrolled provisioning
- no direct third-party account mutation
- no hidden background spending

---

## Module I - Learning Module Preservation

### Objective

Keep the current adaptive learning module operational as `Module 01`.

### MVP role

The learning module remains:

- a product feature
- a proof that Dystoppia already has a working module
- a testbed for usage, costing, auth, and billing patterns

### Non-goal

Do not let learning-module improvements delay platform foundations.

---

## 4. MVP Request Lifecycle

## Step 1 - Request intake

The authenticated master user submits a request in Builder Workspace.

System creates:

- `ExecutionRequest`
- initial status
- request trace id

## Step 2 - Safety and role check

System verifies:

- valid session
- user role
- action class
- workflow allowed in MVP

## Step 3 - Cost pre-check

System estimates:

- likely providers used
- expected cost
- required credits
- viability result

If not viable:

- reject
- or recommend smaller scope

## Step 4 - Credit handling

Depending on policy:

- reserve credits
- or deduct credits up front

The MVP should prefer reservation for larger requests and final deduction on completion when possible.

## Step 5 - Structured generation

System runs the request through the orchestration flow and produces:

- analysis
- architecture
- development plan
- DevOps plan
- economic summary

## Step 6 - Usage and audit persistence

System records:

- usage events
- cost events
- credit ledger events
- audit entries

## Step 7 - Result delivery

User sees:

- generated output
- estimated cost
- actual measured usage where available
- warnings
- approval status if any blocked action exists

---

## 5. Recommended MVP Data Additions

These are the minimum useful additions beyond the current learning-focused schema.

## User

Add:

- `role`
- `status`
- `isInternal`

## ExecutionRequest

Suggested fields:

- id
- userId
- module
- prompt
- normalizedIntent
- status
- actionClass
- viabilityStatus
- estimatedCostUsd
- estimatedCredits
- finalCostUsd
- finalCredits
- createdAt
- completedAt

## CreditLedger

Suggested fields:

- id
- userId
- requestId
- eventType
- amount
- balanceAfter
- reason
- metadataJson
- createdAt

## UsageEvent

Suggested fields:

- id
- userId
- requestId
- provider
- serviceType
- quantity
- unit
- estimatedCostUsd
- actualCostUsd
- metadataJson
- createdAt

## AuditLog

Suggested fields:

- id
- actorUserId
- actorRole
- eventType
- targetType
- targetId
- requestId
- metadataJson
- createdAt

## ApprovalGate

Suggested fields:

- id
- requestId
- gateType
- status
- requiredRole
- reason
- resolvedBy
- resolvedAt

---

## 6. MVP UI Requirements

## 6.1 Landing

- preserve current visual identity
- update copy only where needed to reflect platform vision
- avoid structural redesign

## 6.2 Private Home

Should expose:

- module access
- Builder entry point
- Learning entry point
- current credits
- recent requests
- warnings if viability or margin is poor

## 6.3 Builder Workspace Screen

Should contain:

- prompt input
- request history
- generated result panel
- cost and credits panel
- warnings panel
- blocked actions / approval state panel

## 6.4 Admin/Master Visibility

Must expose:

- separate internal usage reporting
- per-request cost visibility
- ledger history
- audit visibility

---

## 7. API Surface for MVP

Exact routes may change, but the MVP will likely need:

- `POST /api/builder/requests`
- `GET /api/builder/requests`
- `GET /api/builder/requests/:id`
- `POST /api/builder/estimate`
- `GET /api/credits/balance`
- `GET /api/credits/ledger`
- `POST /api/admin/credits/adjust`
- `GET /api/audit`
- `GET /api/usage`

The current auth/session APIs can remain and be extended.

---

## 8. Non-Goals for MVP

The following are explicitly not required to launch the MVP:

- public multi-tenant onboarding
- open self-service signup at scale
- enterprise IAM
- automatic VM creation
- automatic database creation
- live production provisioning
- domain registrar automation
- Meta Ads execution automation
- autonomous execution without approval boundaries

---

## 9. Security Baseline for MVP

These controls must exist from day one of the Builder Workspace:

- authentication required
- role checks required
- deny-by-default privileged actions
- allowlisted workflows only
- secrets outside code
- immutable-style audit trail
- credit enforcement before costly actions
- request tracing for every builder request

If a capability cannot be safely bounded, it should not be enabled in MVP.

---

## 10. Acceptance Criteria for MVP

The MVP is acceptable when all of the following are true:

- the landing remains visually intact
- master user can authenticate securely
- Builder Workspace accepts a request and returns structured output
- every request gets a viability assessment
- every billable request creates ledger events
- usage and cost are recorded
- risky actions are blocked or approval-gated
- learning module still works
- master reporting is separated from future customer reporting

---

## 11. Build Order

Recommended implementation order:

1. role model and master-only authorization
2. credit ledger
3. usage and audit events
4. cost engine
5. Builder request model and APIs
6. Builder Workspace UI
7. viability and approval rendering
8. reporting views for master user

---

## 12. Immediate Implementation Notes

### Technical posture

- keep the current app
- extend it instead of rewriting it
- treat Learning as the first platform module
- add the platform governance layer before adding autonomy

### Product posture

- do not sell "full autonomous company builder" yet
- sell controlled intelligence first
- earn the right to automate more later

### Business posture

- measure cost before scaling users
- validate margin before public rollout
- separate internal and external economics from the beginning
