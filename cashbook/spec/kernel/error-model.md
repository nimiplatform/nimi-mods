# Error Model

> Owner Domain: `CSB-ERR-*`

## CSB-ERR-001 Reason Code Source

Reason code registry is authoritative in `tables/reason-codes.yaml`.

## CSB-ERR-002 Structured Envelope

Failures must expose parseable `reasonCode + actionHint`.

## CSB-ERR-003 Fail-Close Boundaries

Invalid input/schema/amount must fail-close and must not persist as valid transaction.

## CSB-ERR-004 STT Failure Isolation

Voice transcription failure must not block text input mode. User is informed and may retry voice or switch to text.
