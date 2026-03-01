# Initiative Contract

> Owner Domain: `N-INIT-*`

## N-INIT-001 Trigger Neutrality

Initiative supports `UserTurn`, `AgentInitiative`, `SystemEvent` without bypass contracts.

## N-INIT-002 Presence-Aware Noop

Initiative tick is noop when presence is `composing` or `active`.

## N-INIT-003 Cooldown Behavior

Cooldown hit must no-fire and return `NARRATIVE_INITIATIVE_COOLDOWN_ACTIVE`.

## N-INIT-004 Fired Path

Fired initiative path must call `processTurn`.

## N-INIT-005 Initiative Audit

Every initiative decision emits auditable event.
