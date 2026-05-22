---
name: docs-search
description: Use when the user asks how a library/API/tool works, requests docs for a named service, or asks about current models/versions/endpoints. Routes via api-registry to Context7 or WebFetch for authoritative answers.
---

# docs-search — Routing

**Your job is to answer API/library questions using registered authoritative sources, not training data.**

## Flow

1. Identify the service name in the user's question.

2. Invoke `/api-registry:docs <name> <remaining query>`.

3. Return the routed answer with its citation.

4. If the registered sources disagree with what your training data says, defer to the registered source and surface the disagreement:
   > *"Training data says X, but registered docs (<url>) say Y as of <last_checked>. Using Y."*

## Rules

- Never answer from training data when a registered `docs_url` exists.
- If the service is not in the registry, prompt the user to add it first — do NOT fall back to training data silently.
- If both Context7 and WebFetch fail, return: `⚠️ Authoritative sources unreachable. See <docs_url> directly.` and stop.

## When this skill fires

- "How do I <X> in <service>?"
- "What's the current <service> API for <task>?"
- "Which <service> models support <feature>?"
- "Latest <service> changelog"
- "<service> deprecated <feature>"
