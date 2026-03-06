# Meepo Hierarchical Architecture — North Star Spec

## Status
**North star only.**  
This document describes the intended long-term architecture of Meepo’s intelligence and memory model.  
It exists to guide architectural decisions today, **not to define immediate implementation work**.

Active development of higher layers (especially **Meepo Prime**) is intentionally deferred until real usage scale makes them useful.

---

# Core Product Thesis

Meepo is not a single flat bot identity.

Instead, Meepo is a **hierarchical intelligence system** composed of three layers:

1. **Campaign Witness** — Diegetic Persona Meepos  
2. **Guild Companion** — Meta-Meepo  
3. **Application Steward** — Meepo Prime

Each layer has:

- its own **scope**
- its own **identity and tone**
- its own **hot memory**
- optional **broker access** to lower memory layers

The purpose of this structure is **not architectural elegance alone**, but:

- identity coherence
- scalable memory boundaries
- clean product semantics
- long-term extensibility

---

# Layer 1 — Diegetic Persona Meepo

## Role
The **campaign witness**.

A diegetic Meepo exists inside a specific campaign world and participates in canon/showtime interactions.

## Scope

```
(guild_id, campaign_slug, persona_id)
```

## Responsibilities

- in-world narrative participation
- campaign continuity support
- session recall and recap
- character memory
- story thread tracking

## Hot Memory

Campaign-scoped long-term memory.

Examples:

- campaign events
- characters
- unresolved plot threads
- past sessions
- artifacts and narrative objects
- character relationships

## Routing Rule

Diegetic personas **always route first to their own personal long-term memory**.

They do not default to broader memory pools.

## Design Principle

A diegetic persona should feel like a **true witness of that story**, not a general-purpose bot with filters.

---

# Layer 2 — Meta-Meepo

## Role
The **guild companion**.

Meta-Meepo represents the ambient, out-of-character version of Meepo that interacts with the Discord community.

## Scope

```
guild_id
```

## Responsibilities

- guild-wide ambient interaction
- out-of-character discussion
- community memory
- campaign discovery
- social continuity

## Hot Memory

Guild-level long-term memory.

Examples:

- guild culture
- recurring players
- shared jokes
- campaign roster and activity
- community questions
- guild-level operational history

## Routing Rule

Meta-Meepo routes first to **guild-level memory**, but may optionally access:

```
persona_memory(guild_id, campaign_slug)
```

when a query requires campaign-specific context.

## Design Principle

Meta-Meepo remembers the **community around the stories**, not just one story.

---

# Layer 3 — Meepo Prime

## Role
The **application steward**.

Meepo Prime is a dev-only intelligence layer responsible for overseeing the entire Meepo ecosystem.

This layer is **not currently implemented** and is intentionally deferred.

## Scope

```
application-wide
```

## Responsibilities

Potential future responsibilities:

- system observability
- cross-guild insight
- operational debugging
- memory inspection
- system analytics
- architecture awareness

## Hot Memory

Application-level long-term memory.

Examples:

- deployment history
- usage patterns
- guild adoption
- debugging context
- operational incidents
- architecture evolution

## Routing Rule

Meepo Prime routes first to **app-wide memory**, then may broker access to:

```
guild_memory(guild_id)
persona_memory(guild_id, campaign_slug)
```

## Interface

Initial interface may be a **dedicated developer Discord guild**.

Important distinction:

- Prime’s **interface** may live in a guild
- Prime’s **memory scope** remains **application-wide**

Future migration target:

- web admin console
- developer tooling dashboard

---

# Runtime Doctrine

## Runtime Container

```
guild_id
```

Discord interactions, voice presence, and bot runtime behavior are fundamentally **guild-scoped**.

Examples:

- voice connection
- channel bindings
- interaction routing
- awaken state
- session lifecycle

Because of Discord constraints:

```
only one active voice presence per guild
```

---

# Narrative Namespace

## Campaign Identifier

```
campaign_slug
```

Campaigns represent narrative namespaces **inside a guild**.

They should appear in durable narrative data such as:

- sessions
- memories
- events
- recaps
- characters
- artifacts

This allows multiple campaigns to coexist inside one Discord guild without mixing narrative histories.

---

# Session Model

## Ambient Sessions

Ambient sessions represent **Meta-Meepo interaction**.

Properties:

```
scope: guild_id
mode: ambient
```

Characteristics:

- guild-global
- out-of-character
- persistent conversational presence
- shared across campaigns

Purpose:

- maintain community interaction
- provide guild memory
- allow cross-campaign discussion

---

## Canon / Showtime Sessions

Canon sessions represent **diegetic campaign participation**.

Properties:

```
scope: guild_id + campaign_slug
mode: canon
```

Constraints:

```
max 1 active voice-bound showtime session per guild
```

Reason:

Discord voice constraints.

Even though canon sessions include `campaign_slug`, runtime voice presence is still governed by `guild_id`.

---

# Memory Routing Doctrine

Every Meepo layer has a **deterministic hot memory source**.

## Diegetic Persona

```
hot_memory = campaign/persona memory
```

## Meta-Meepo

```
hot_memory = guild memory
```

## Meepo Prime

```
hot_memory = application memory
```

Higher layers may **broker access** into lower layers when appropriate.

Memory should **not collapse into a single flat retrieval pool**, as that would weaken:

- persona identity
- narrative continuity
- retrieval precision
- system clarity

---

# Memory Hierarchy

Conceptual structure:

```
Meepo Prime
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

Each layer has:

- its own identity
- its own hot memory
- controlled access downward

---

# Deferred Work

The following systems are **not currently being built**:

- Meepo Prime runtime
- cross-guild orchestration tools
- Prime memory pipelines
- advanced cross-persona retrieval policies
- app-level AI observability tooling

These will be revisited **only if real adoption makes them useful**.

---

# Present-Day Architectural Guidance

Current development should:

- treat `guild_id` as the runtime container
- include `campaign_slug` in durable narrative artifacts
- maintain separation between ambient and canon behavior
- avoid assuming one campaign per guild
- preserve the concept of layered memory scopes

Current development should **not**:

- implement Meepo Prime prematurely
- overengineer cross-layer memory routing
- flatten memory into one universal retrieval layer

---

# Activation Criteria for Meepo Prime

Revisit Prime development when one or more become true:

- Meepo is active across many guilds
- cross-guild observability becomes necessary
- debugging across deployments becomes difficult
- a web admin console is introduced
- developer workflows benefit from AI-assisted system introspection

Until then:

```
Meepo Prime remains a north star concept.
```

---

# Compact Doctrine Summary

```
Runtime container: guild_id
Narrative namespace: campaign_slug

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
    role = system steward
    status = deferred
```

---

# Vision Statement

Meepo ultimately evolves into a layered intelligence system:

- **Persona Meepos** remember stories.  
- **Meta-Meepo** remembers communities.  
- **Meepo Prime** remembers the ecosystem.

This architecture preserves narrative integrity while allowing Meepo to scale from a single campaign tool into a broader platform.

# MEEPO PRIME — Information-First Architecture Doctrine

## Status

**North star doctrine.**

This document does **not** define an immediate feature roadmap.  
Instead, it establishes the **engineering philosophy** that guides Meepo’s architecture as the system evolves toward a future **Meepo Prime layer**.

Meepo Prime itself remains **deferred**.

What we build now is the **information substrate** that would eventually allow such a system to exist.

---

# Core Insight

Historically, software systems treated observability as a debugging tool.

In an AI-native environment, observability becomes something more powerful:

> **A structured information substrate that compounds across the lifetime of the system.**

Features may come and go.

But **information accumulates.**

Therefore:

> **Structured operational information is treated as durable system capital.**

---

# The Regime Change

Before AI-assisted development:

```
structure = expensive
features = cheap
```

Engineering teams often prioritized shipping features quickly, even if structure suffered.

In an AI-assisted environment:

```
structure ≈ cheap
features ≈ cheap
```

AI agents dramatically reduce the cost of:

- enforcing conventions
- generating structured logging
- propagating context
- refactoring code
- maintaining system invariants

Because structure is cheaper to maintain, the optimal strategy shifts:

> **Maintain structural hygiene continuously rather than retrofitting it later.**

---

# Speculative Information Substrates

Not all speculation is equal.

## Speculative Features

```
build feature
→ maybe useful
→ maybe abandoned
```

Value is uncertain.

## Speculative Information

```
build feature
→ feature may fail
→ but structured information persists
```

Information can compound across many iterations.

Even if a feature fails, the system may still learn:

- operational behavior
- failure modes
- usage patterns
- system interactions
- architectural opportunities

Therefore:

> **Capturing structured information has positive expected value across many trials.**

This philosophy is called **Speculative Information Substrates**.

---

# Information Compounds

A system that does not capture structured information behaves like this:

```
feature → failure → knowledge lost
feature → success → partial learning
```

A system with structured information capture behaves like this:

```
feature → structured traces
feature → structured traces
feature → structured traces
```

Over time:

```
structured traces → system learning
```

Information becomes **compound interest for system understanding**.

---

# AI-Readable Systems

Meepo adopts the following doctrine:

> **If an AI can reliably parse and reason about the system’s operational state, then humans can reason about it reliably as well.**

Therefore operational traces must be:

- structured
- scoped
- attributable
- machine-legible
- queryable

This design principle is called **AI-Readable Systems Doctrine**.

---

# Scope Hierarchy

Meepo operates across three major scopes.

```
Application scope
Guild scope
Campaign scope
Session scope
Interaction scope
```

Structured traces must preserve scope boundaries.

Example context envelope:

```
trace_id
interaction_id
guild_id
campaign_slug
session_id
persona_id

scope_level
surface
action_type
actor_user_id
runtime_origin
timestamp
```

Not all fields must exist for every event, but the schema should remain **consistent and extensible**.

---

# Narrative vs Operational Memory

Meepo maintains two different forms of memory.

## Narrative Memory

Campaign-facing story artifacts:

- sessions
- recaps
- character updates
- events
- campaign timelines
- narrative summaries

This memory represents **story continuity**.

## Operational Memory

System-facing operational traces:

- session lifecycle events
- runtime failures
- command invocations
- artifact generation attempts
- rate limiting
- configuration mutations
- worker tasks
- recovery behavior

This memory represents **system continuity**.

These two forms of memory must remain conceptually distinct.

---

# Relationship to Meepo Prime

Meepo Prime is the **future application-level steward** of the system.

Prime would operate at **application scope** and potentially use the information substrate to:

- inspect system behavior
- analyze operational history
- detect anomalies
- assist with debugging
- summarize cross-guild behavior
- guide architectural evolution

Prime becomes possible **only if the underlying system emits structured traces**.

Therefore the present goal is **not building Prime**, but building the **information substrate Prime would rely on**.

---

# Meepo Intelligence Hierarchy

The system evolves toward a layered intelligence structure.

```
Meepo Prime
   │
   ├── Meta-Meepo (guild scope)
   │        │
   │        ├── Persona Meepo (campaign scope)
   │        ├── Persona Meepo
   │        └── Persona Meepo
```

Responsibilities:

### Persona Meepo

Scope:
```
guild_id + campaign_slug
```

Remembers:
- story continuity
- characters
- events
- campaign narrative

### Meta-Meepo

Scope:
```
guild_id
```

Remembers:
- guild culture
- campaign roster
- recurring players
- guild activity
- operational continuity

### Meepo Prime (future)

Scope:
```
application
```

Remembers:
- system behavior
- cross-guild patterns
- operational incidents
- architecture evolution

---

# Information-First Engineering Doctrine

Meepo adopts the following engineering principles.

## 1. Operational traces are first-class infrastructure

Logs are not merely debugging output.

They are **structured system knowledge**.

---

## 2. Structured information compounds

Features may be temporary.

Information persists.

Therefore structured traces have **long-term value even when features do not**.

---

## 3. Scope boundaries must remain explicit

All meaningful operations should preserve:

```
guild_id
campaign_slug
session_id
```

No silent scope fallback.

---

## 4. Features are written as candidate structure

Not every feature will become infrastructure.

But features should be implemented cleanly enough that they **can evolve into infrastructure if needed**.

This requires:

- clear boundaries
- structured events
- explicit scope
- small modules
- readable intent

---

## 5. Simplicity in structure enables complexity in behavior

The system should avoid:

- premature generalization
- speculative frameworks
- excessive abstraction

Instead it should prioritize:

```
simple primitives
clear boundaries
consistent instrumentation
```

---

# Long-Term Vision

Over time the system will accumulate a large structured information substrate.

Possible future capabilities include:

- automatic anomaly detection
- AI-assisted debugging
- operational pattern discovery
- system behavior summaries
- cross-guild insights
- architectural guidance

These capabilities are not immediate goals.

They are **emergent properties** of a system that captures structured information consistently.

---

# Summary

Meepo adopts an **Information-First Engineering philosophy**.

```
features may be temporary
information compounds
```

Therefore the system prioritizes:

- structured operational traces
- explicit scope boundaries
- machine-legible system behavior
- clean architectural hygiene

This substrate enables future system intelligence, including the potential emergence of **Meepo Prime**.

But Prime itself remains a **north star concept**, not a present implementation.

```
build the substrate
the intelligence can come later
```

---