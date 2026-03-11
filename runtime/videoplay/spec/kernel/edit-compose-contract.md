# Edit Compose Contract

> Owner Domain: `V-EDIT-*`

## V-EDIT-001 Input and Output Fields

Edit compose input/output required fields are authoritative in table source.

## V-EDIT-002 Timeline Ordering

Video track must be sorted by start time and overlap is forbidden.

## V-EDIT-003 AV Thresholds

AV drift and black-gap thresholds are mandatory gates.

## V-EDIT-004 Export Spec

Release master export codec/container contract is fixed.

## V-EDIT-005 Replay Consistency

Replay with same idempotency key cannot change output URI or timeline hash.
