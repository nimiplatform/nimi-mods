# Presence Contract

> Owner Domain: `T-PRES-*`

## T-PRES-001 Presence States

Presence states are fixed: `composing|paused|active|idle|away`.

## T-PRES-002 Transition Table

Presence transitions are authoritative in `tables/presence-transitions.yaml`.

## T-PRES-003 Initiative Reset

Initiative events must reset idle and away timers.

## T-PRES-004 Audit Reporting

Every state change emits presence report event.
