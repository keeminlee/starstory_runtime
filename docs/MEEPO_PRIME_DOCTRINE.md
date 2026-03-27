# Meepo Prime — Doctrine

> Meepo Prime is no longer only a deferred observability layer; it is now the bounded, human-supervised developmental intelligence through which Starstory may gradually evolve into a self-maintaining, information-first system.

## Status

**Bounded MVP incubation.**

This document defines the intelligence hierarchy, information-first engineering philosophy, and build-loop governance that together form the Meepo Prime doctrine.

Parts I and II (hierarchy, information-first) carry forward from the original north-star spec.
Parts III–V (activation, build loop, convergence) are new as of March 2026.

---

# Part I — Intelligence Hierarchy

Meepo is not a single flat bot identity.

It is a **hierarchical intelligence system** composed of three layers:

1. **Campaign Witness** — Diegetic Persona Meepos
2. **Guild Companion** — Meta-Meepo
3. **Application Steward + Developmental Intelligence** — Meepo Prime

Each layer has:

- its own **scope**
- its own **identity and tone**
- its own **hot memory**
- optional **broker access** to lower memory layers

The purpose of this structure is:

- identity coherence
- scalable memory boundaries
- clean product semantics
- long-term extensibility

---

## Layer 1 — Diegetic Persona Meepo

**Role:** The campaign witness.

A diegetic Meepo exists inside a specific campaign world and participates in canon/showtime interactions.

**Scope:**

```
(guild_id, campaign_slug, persona_id)
```

**Responsibilities:**

- in-world narrative participation
- campaign continuity support
- session recall and recap
- character memory
- story thread tracking

**Hot Memory:** Campaign-scoped long-term memory — events, characters, plot threads, past sessions, artifacts, relationships.

**Routing Rule:** Diegetic personas **always route first to their own personal long-term memory**. They do not default to broader memory pools.

**Design Principle:** A diegetic persona should feel like a **true witness of that story**, not a general-purpose bot with filters.

---

## Layer 2 — Meta-Meepo

**Role:** The guild companion.

Meta-Meepo represents the ambient, out-of-character version of Meepo that interacts with the Discord community.

**Scope:**

```
guild_id
```

**Responsibilities:**

- guild-wide ambient interaction
- out-of-character discussion
- community memory
- campaign discovery
- social continuity

**Hot Memory:** Guild-level long-term memory — guild culture, recurring players, shared jokes, campaign roster, community questions, guild operational history.

**Routing Rule:** Meta-Meepo routes first to **guild-level memory**, but may optionally access `persona_memory(guild_id, campaign_slug)` when a query requires campaign-specific context.

**Design Principle:** Meta-Meepo remembers the **community around the stories**, not just one story.

---

## Layer 3 — Meepo Prime

**Role:** The application steward **and** developmental intelligence.

Meepo Prime operates at application scope. It is responsible for:

### Stewardship (original role)

- system observability
- cross-guild insight
- operational debugging
- memory inspection
- system analytics
- architecture awareness

### Developmental Intelligence (expanded role)

- operator/workflow intelligence for the builder
- spec intake and delegation
- bounded self-building maintainer loops
- human-in-the-loop architectural apprenticeship
- retrospective processing and audit artifact generation

**Scope:**

```
application-wide
```

**Hot Memory:** Application-level long-term memory — deployment history, usage patterns, guild adoption, debugging context, operational incidents, architecture evolution, **build-loop specs, PR artifacts, retrospective traces, task provenance**.

**Routing Rule:** Meepo Prime routes first to **app-wide memory**, then may broker access to:

```
guild_memory(guild_id)
persona_memory(guild_id, campaign_slug)
```

**Interface:** Initially CLI/terminal and/or a dedicated developer surface. Future migration targets include web admin console and developer tooling dashboard.

Important distinction:

- Prime's **interface** may live anywhere (CLI, guild, web)
- Prime's **memory scope** remains **application-wide**

---

## Memory Routing Doctrine

Every Meepo layer has a **deterministic hot memory source**.

```
Diegetic Persona:  hot_memory = campaign/persona memory
Meta-Meepo:        hot_memory = guild memory
Meepo Prime:       hot_memory = application memory
```

Higher layers may **broker access** into lower layers when appropriate.

Memory must **not collapse into a single flat retrieval pool**, as that would weaken:

- persona identity
- narrative continuity
- retrieval precision
- system clarity

### Memory Hierarchy

```
Meepo Prime (application)
   │
   ├── Meta-Meepo (guild_id)
   │        │
   │        ├── Persona Meepo (guild_id + campaign_slug)
   │        ├── Persona Meepo
   │        └── Persona Meepo
   │
   ├── Meta-Meepo (guild_id)
   │        ├── Persona Meepo
   │        └── Persona Meepo
   │
   └── Meta-Meepo (guild_id)
```

Each layer has its own identity, its own hot memory, and controlled access downward.

---

## Runtime & Namespace Doctrine

**Runtime container:** `guild_id` — Discord interactions, voice presence, and bot runtime behavior are fundamentally guild-scoped. One active voice presence per guild.

**Narrative namespace:** `campaign_slug` — Campaigns represent narrative namespaces inside a guild. All durable narrative data (sessions, memories, events, recaps, characters, artifacts) should include `campaign_slug`.

**Session model:**

- **Ambient sessions** — Meta-Meepo interaction (`scope: guild_id`, `mode: ambient`). Guild-global, out-of-character, shared across campaigns.
- **Canon/showtime sessions** — Diegetic campaign participation (`scope: guild_id + campaign_slug`, `mode: canon`). Max 1 active voice-bound showtime session per guild (Discord constraint).

---

## Compact Hierarchy Summary

```
Diegetic Persona Meepo:
    scope = campaign
    hot memory = campaign/persona memory
    role = story witness

Meta-Meepo:
    scope = guild
    hot memory = guild memory
    role = community companion

Meepo Prime:
    scope = application
    hot memory = app-wide memory
    role = system steward + developmental intelligence
    status = bounded MVP incubation
```

---

# Part II — Information-First Engineering Doctrine

## Core Insight

Historically, software systems treated observability as a debugging tool.

In an AI-native environment, observability becomes something more powerful:

> **A structured information substrate that compounds across the lifetime of the system.**

Features may come and go.

But **information accumulates.**

Therefore:

> **Structured operational information is treated as durable system capital.**

---

## The Regime Change

Before AI-assisted development:

```
structure = expensive
features = cheap
```

In an AI-assisted environment:

```
structure ≈ cheap
features ≈ cheap
```

AI agents dramatically reduce the cost of enforcing conventions, generating structured logging, propagating context, refactoring code, and maintaining system invariants.

Because structure is cheaper to maintain, the optimal strategy shifts:

> **Maintain structural hygiene continuously rather than retrofitting it later.**

---

## Speculative Information Substrates

Not all speculation is equal.

**Speculative features:**

```
build feature → maybe useful → maybe abandoned
```

Value is uncertain.

**Speculative information:**

```
build feature → feature may fail → but structured information persists
```

Information can compound across many iterations. Even if a feature fails, the system may still learn: operational behavior, failure modes, usage patterns, system interactions, architectural opportunities.

> **Capturing structured information has positive expected value across many trials.**

---

## Information Compounds

A system without structured information capture:

```
feature → failure → knowledge lost
feature → success → partial learning
```

A system with structured information capture:

```
feature → structured traces
feature → structured traces
→ over time: structured traces → system learning
```

Information becomes **compound interest for system understanding**.

---

## AI-Readable Systems Doctrine

> **If an AI can reliably parse and reason about the system's operational state, then humans can reason about it reliably as well.**

Therefore operational traces must be: structured, scoped, attributable, machine-legible, and queryable.

---

## Scope Hierarchy

```
Application scope
Guild scope
Campaign scope
Session scope
Interaction scope
```

Structured traces must preserve scope boundaries. Example context envelope:

```
trace_id, interaction_id, guild_id, campaign_slug, session_id, persona_id
scope_level, surface, action_type, actor_user_id, runtime_origin, timestamp
```

Not all fields must exist for every event, but the schema should remain **consistent and extensible**.

---

## Narrative vs Operational vs Build-Loop Memory

Meepo maintains three forms of memory. These must remain conceptually distinct.

**Narrative Memory** — Campaign-facing story artifacts: sessions, recaps, character updates, events, campaign timelines, narrative summaries. Represents **story continuity**.

**Operational Memory** — System-facing operational traces: session lifecycle events, runtime failures, command invocations, artifact generation attempts, rate limiting, configuration mutations, worker tasks, recovery behavior. Represents **system continuity**.

**Build-Loop Memory** — Development-facing provenance artifacts: specs, branch/PR metadata, implementation summaries, retrospective traces, task lineage. Represents **developmental continuity**. This is the new third memory lane that Prime introduces.

---

## Engineering Principles

### 1. Operational traces are first-class infrastructure

Logs are not merely debugging output. They are **structured system knowledge**.

### 2. Structured information compounds

Features may be temporary. Information persists. Structured traces have **long-term value even when features do not**.

### 3. Scope boundaries must remain explicit

All meaningful operations should preserve `guild_id`, `campaign_slug`, `session_id`. No silent scope fallback.

### 4. Features are written as candidate structure

Not every feature will become infrastructure. But features should be implemented cleanly enough that they **can evolve into infrastructure if needed**. This requires clear boundaries, structured events, explicit scope, small modules, and readable intent.

### 5. Simplicity in structure enables complexity in behavior

Avoid premature generalization, speculative frameworks, and excessive abstraction. Prioritize simple primitives, clear boundaries, and consistent instrumentation.

### 6. Build artifacts are first-class operational memory

Every Prime build loop must generate audit artifacts. Specs, branch/PR outputs, retrospectives, and task traces are not ephemeral — they are **structured provenance** that compounds into developmental intelligence. Self-building without provenance is disallowed.

---

# Part III — Prime MVP Activation

## What Changed

The original doctrine said:

> Build the information substrate first. Intelligence can come later.

The new position is:

> Build the information substrate and the first bounded intelligence loop together.

Prime is no longer deferred. It is entering **bounded MVP incubation**.

The reason: Prime is becoming the path by which Starstory itself evolves. The self-building loop is not a future luxury — it is the mechanism through which the builder (Keemin) and the system co-develop Starstory's next phase.

---

## Prime MVP Scope

The MVP is deliberately small. It is a **personal operator assistant** for Keemin with these capabilities:

1. **Session control** — Start/end operator work sessions with clear boundaries
2. **Spec intake** — Accept and structure implementation specs
3. **Bounded delegation** — Route specs to agent implementation within defined constraints
4. **Artifact capture** — Store specs, branch metadata, summaries, and retrospective traces
5. **Human review gate** — All outputs require human review before merging into canon

The MVP does **not** include:

- cross-guild observability (stewardship role comes later)
- autonomous deployment
- unsupervised code merging
- full memory broker access to Starstory layers

---

## Activation Criteria (Satisfied)

The original doc listed criteria for revisiting Prime. These are now met:

- ~~Meepo is active across many guilds~~ — Not yet, but no longer a prerequisite.
- ~~cross-guild observability becomes necessary~~ — Not the trigger.
- **developer workflows benefit from AI-assisted system introspection** — Yes. This is the trigger.
- The builder requires a structured operator loop to manage Starstory's development velocity.

Prime is activated not by product scale, but by **developmental necessity**.

---

# Part IV — Prime Build-Loop Doctrine

## The Loop

The Prime build loop is a human-supervised, artifact-generating development cycle:

```
┌─────────────────────────────────────────────────┐
│  1. Human authors or refines spec               │
│     └─→ structured spec artifact                │
│                                                 │
│  2. Prime delegates bounded implementation      │
│     └─→ agent works within defined constraints  │
│                                                 │
│  3. Agent returns branch + PR + summary         │
│     └─→ implementation return packet            │
│                                                 │
│  4. Prime stores audit artifacts                │
│     └─→ spec, diff summary, trace, metadata     │
│                                                 │
│  5. Keemin reviews, edits, merges               │
│     └─→ human judgment gate (non-negotiable)    │
│                                                 │
│  6. Merged work becomes new canon               │
│     └─→ system state advances                   │
│                                                 │
│  7. Retrospective artifacts generated           │
│     └─→ what changed, what was learned,         │
│         what to try next                        │
└─────────────────────────────────────────────────┘
```

## Governance Rules

1. **Human-in-the-loop is mandatory.** No merged code without Keemin's explicit approval. Prime delegates and records; it does not autonomously ship.

2. **Self-building without provenance is disallowed.** Every build-loop cycle must produce traceable artifacts: the input spec, the implementation summary, and the retrospective. If a cycle cannot produce these, it did not happen.

3. **Scope must be bounded per cycle.** Each delegation must have a clear, small scope. Prime does not receive open-ended mandates. Large work is decomposed into bounded specs before delegation.

4. **Artifacts are append-only.** Build-loop memory is a ledger, not a mutable store. Specs may be superseded but not deleted. This preserves the audit trail that makes the loop trustworthy.

5. **Canon advances only through the merge gate.** The agent's output is a proposal. The human's merge is the commitment. The retrospective is the learning. All three are recorded.

## Artifact Types

| Artifact | Purpose | Lifecycle |
|----------|---------|-----------|
| **Spec** | Structured implementation intent | Created by human, refined by Prime, immutable once delegated |
| **Branch/PR** | Implementation output | Created by agent, reviewed by human |
| **Implementation summary** | What the agent did and why | Generated at PR creation |
| **Retrospective** | What changed, what was learned, what to try next | Generated after merge or rejection |
| **Task trace** | Lineage linking spec → branch → review → outcome | Append-only provenance chain |

---

# Part V — Convergence Doctrine

## Repo Placement

Prime begins life in a **separate incubation repo**.

This is an engineering decision, not an architectural one. The reasons:

- Starstory's runtime is Discord-native, guild-scoped, multi-tenant. Prime is single-user, operator-scoped, CLI/web-native. These are different runtime shapes.
- Embedding Prime inside Starstory would mean fighting the host architecture from day one.
- Separate repos preserve Starstory's product integrity and deployment safety.
- A small, fast-moving incubation repo maximizes iteration speed for the MVP.

## Architectural Convergence

Separate repo does **not** mean separate destiny.

Prime is architecturally convergent with Starstory. The convergence path:

1. **Pattern reuse now** — Prime copies proven patterns from Starstory (observability context, env policy, atomic writes, logger, session lifecycle patterns) without package-level coupling.

2. **Shared vocabulary later** — As Prime matures and begins to operate on Starstory, shared types and conventions may emerge. These can be extracted into a small shared package if genuinely needed — not before.

3. **Operational integration eventually** — Prime's long-term role is to become Starstory's operating intelligence: the layer that helps maintain, evolve, and observe the Starstory system. This means Prime and Starstory converge at the operational level even if they remain separate at the repo level.

## What Convergence Does Not Mean

- It does not mean merging the repos.
- It does not mean sharing a database or deployment surface.
- It does not mean Prime inherits Starstory's guild/campaign data model.
- It does not mean refactoring Starstory to "prepare" for Prime.

Convergence means Prime is **built with awareness of Starstory's architecture** and is **designed to eventually operate on it**.

## The Long-Term Shape

```
Starstory (meepo-bot repo)
    ├── Persona Meepos — campaign witnesses
    ├── Meta-Meepo — guild companions
    ├── Web Observatory — session/campaign archive
    └── Information substrate — structured traces, operational memory

Meepo Prime (meepo-prime repo)
    ├── Operator intelligence — Keemin's workflow assistant
    ├── Build-loop engine — spec → delegate → review → merge
    ├── Retrospective processor — audit artifacts, learning traces
    ├── Stewardship lane — system observation (future)
    └── Application memory — build-loop provenance, operational history
```

Prime reads Starstory. Prime operates on Starstory. Prime does not live inside Starstory.

---

# Vision Statement

Meepo evolves into a layered intelligence system:

- **Persona Meepos** remember stories.
- **Meta-Meepo** remembers communities.
- **Meepo Prime** remembers the ecosystem — and helps build it.

This architecture preserves narrative integrity while allowing Meepo to scale from a single campaign tool into a self-maintaining, information-first platform.

---

# One-Sentence Doctrine

> Meepo Prime is the bounded, human-supervised developmental intelligence through which Starstory may gradually evolve into a self-maintaining, information-first system.
