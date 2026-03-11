# Segmentation Contract

> Owner Domain: `V-SEG-*`

## V-SEG-001 Input Constraints

Segmentation input must satisfy required field set and monotonic turn order.

## V-SEG-002 Policy Bounds

Episode duration and turn count policies are bounded by table constraints.

## V-SEG-003 Determinism

Same input turns plus policy hash must produce identical segmentation output.

## V-SEG-004 Event Grounding

`sourceEventIds` must come only from source turns in the segmented window.
