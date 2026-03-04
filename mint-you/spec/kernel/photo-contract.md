# Photo Trust Contract

> Owner Domain: `MY-PHOTO-*`

## MY-PHOTO-001 Storage Via Existing Field

The user's real photo is stored as `referenceImageUrl` on the agent profile. No dedicated photo storage is introduced. The platform uses this field for avatar generation; the mod layers access control on top.

## MY-PHOTO-002 Private By Default

`referenceImageUrl` is not exposed to other users or agents by default. The mod intercepts read access and returns `null` unless a mutual authorization exists between the requesting user and the photo owner.

**Platform dependency:** This rule requires `hook.agent-profile.read` — a hook dispatch point on agent profile read paths. The desktop app currently calls `realm.raw.request(...)` directly without hook dispatch. Before this rule can be enforced at runtime, the desktop/runtime layer must expose an agent-profile read hook that mods can intercept. Until the hook is available, the mod must degrade gracefully: store authorization state, but photo filtering cannot be enforced client-side. The creation flow and authorization state machine operate independently of the hook and are implementable immediately.

## MY-PHOTO-003 Mutual Authorization Required

Photo reveal requires bilateral consent. User A sends a photo-reveal request to User B. User B explicitly accepts or declines. Only when both A→B and B→A authorizations exist does either user gain access to the other's `referenceImageUrl`.

## MY-PHOTO-004 Agent Isolation

Agents never access, reference, or reason about `referenceImageUrl`. Photo data does not enter prompt context, DNA fields, or any agent behavioral pipeline. Photo trust is strictly a user-to-user social layer.

## MY-PHOTO-005 Revocable Access

Either user may revoke photo authorization at any time. Revocation is immediate and unilateral — the revoking user's photo becomes hidden from the other party regardless of the other party's authorization state.

## MY-PHOTO-006 Optional Upload

Photo upload is optional at any point — during agent creation or after. An agent without a `referenceImageUrl` functions normally; incoming photo-reveal requests targeting a user with no photo return a "no photo available" status rather than an error.

## MY-PHOTO-007 Authorization State Machine

Authorization between two users (A, B) follows a fixed state machine:

```
NONE → A_REQUESTED → MUTUAL (if B accepts) → NONE (if either revokes)
                   → DECLINED  (if B declines) → NONE (cooldown expires)
```

- `NONE`: No request pending, no access.
- `A_REQUESTED`: A has sent a request. B has not responded. A cannot see B's photo. B cannot see A's photo.
- `MUTUAL`: Both parties authorized. Both can see each other's `referenceImageUrl`.
- `DECLINED`: B explicitly declined. A cannot re-request for a cooldown period (defined by mod config, default 24h).

The state is stored per user-pair, scoped to the world where the agents coexist.
