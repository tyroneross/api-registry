---
name: api-registry
description: Use BEFORE writing API config, env setup, auth, LLM client init, or debugging an external service. Returns authoritative source URLs, latest version, and deprecation warnings. Triggers on any named library/API/tool.
---

# api-registry — Activation

**You MUST consult the registry before emitting API configuration or diagnosing API failures.** Training data for rapidly changing APIs (Groq models, better-auth config, Supabase, Vercel, Railway, Next.js) goes stale within days.

## Flow

1. **Identify the service.** Extract the name from the user's request (`better-auth`, `groq`, `supabase`, etc.).

2. **Check the registry:**
   ```bash
   tsx ${CLAUDE_PLUGIN_ROOT}/scripts/lookup.ts <name>
   ```

3. **If found:**
   - Surface `vendor_url`, `docs_url`, `changelog_url`, `latest_version`, `last_checked` inline.
   - If `deprecated_notes` is set, render a 🚨 WARNING block BEFORE writing any config.
   - If `last_checked` > 14 days, remind user to `/api-registry:refresh <name>` OR proceed but flag uncertainty.
   - Use `/api-registry:docs <name> <query>` for any non-trivial config question.

4. **If not found:**
   - Propose: `<name> isn't in the registry. Add it via /api-registry:add <name>?`
   - If user declines, proceed BUT prepend a one-line caveat: `⚠️ No registered source for <name>; answer may reflect stale training data.`

5. **Never** emit config code that cites training-data recall when a registered `docs_url` exists. Always route through `/api-registry:docs`.

## When this skill fires

- User mentions configuring, installing, setting up, debugging, or using any named library/API/tool.
- User pastes an env-key or error mentioning a vendor name.
- User asks about models, versions, pricing, or capabilities of a provider.
- Build-loop, debugger, or research skills are about to touch an external service.

## What this skill does NOT do

- Does not answer the user's question directly — it routes to the right tool.
- Does not fabricate URLs. If lookup returns nothing, it does not guess.
- Does not modify the registry without user approval.
