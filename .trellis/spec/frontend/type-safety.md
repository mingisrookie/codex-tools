# Type Safety

> Type safety patterns in this project.

---

## Overview

<!--
Document your project's type safety conventions here.

Questions to answer:
- What type system do you use?
- How are types organized?
- What validation library do you use?
- How do you handle type inference?
-->

(To be filled by the team)

---

## Type Organization

<!-- Where types are defined, shared types vs local types -->

(To be filled by the team)

---

## Validation

<!-- Runtime validation patterns (Zod, Yup, io-ts, etc.) -->

(To be filled by the team)

---

## Common Patterns

<!-- Type utilities, generics, type guards -->

(To be filled by the team)

## Scenario: Usage snapshot reset-credit contract

### 1. Scope / Trigger

- Trigger: account usage data now crosses Rust storage/service, Tauri JSON serialization, `src/types/app.ts`, and `AccountsGrid` rendering.
- Scope: Codex rate-limit reset cards only. Relay/API accounts must not render this module.

### 2. Signatures

- Rust: `UsageSnapshot.rate_limit_reset_credits: Option<RateLimitResetCreditsSnapshot>`.
- TypeScript: `UsageSnapshot.rateLimitResetCredits?: RateLimitResetCreditsSnapshot | null`.
- UI: `ResetCreditsInspector` accepts `RateLimitResetCreditsSnapshot | null`.

### 3. Contracts

- `RateLimitResetCreditsSnapshot` fields:
  - `fetchedAt: number`
  - `availableCount: number`
  - `nextExpiresAt?: number | null`
  - `credits: RateLimitResetCredit[]`
  - `error?: string | null`
- `RateLimitResetCredit` fields:
  - `id: string`
  - `grantedAt?: number | null`
  - `expiresAt: number`
- Epoch values are Unix seconds. UI formatting owns locale/time display.

### 4. Validation & Error Matrix

- Missing `rateLimitResetCredits` -> render nothing, preserving old stores.
- `error` present -> show local reset-card failure only; do not hide 5h/1week usage.
- `availableCount === 0` and no error -> show the empty reset-card message.
- Non-ChatGPT account -> do not render the reset-card module even if a stale field exists.

### 5. Good/Base/Bad Cases

- Good: available credits sorted by `expiresAt`; inspector shows count, nearest expiry, and an expandable full list.
- Base: old persisted usage snapshot has no reset-credit field; account page still renders.
- Bad: using WHAM summary counts as the source of truth. The UI count/details must come from the detailed reset-credit snapshot.

### 6. Tests Required

- Rust model deserialization defaults missing `rate_limit_reset_credits` to `None`.
- Rust usage mapper filters to `reset_type=codex_rate_limits`, `status=available`, unexpired credits and sorts by expiry.
- Frontend build must pass after every new cross-layer usage field.

### 7. Wrong vs Correct

#### Wrong

```ts
const count = account.usage?.credits?.balance;
```

#### Correct

```ts
const snapshot =
  account.sourceKind === "chatgpt" ? account.usage?.rateLimitResetCredits ?? null : null;
```

---

## Forbidden Patterns

<!-- any, type assertions, etc. -->

(To be filled by the team)
