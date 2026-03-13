# music-score Kernel Contracts

Rule IDs use the `MS-<DOMAIN>-NNN` format.

| Contract | Domain | Description |
|----------|--------|-------------|
| [capability-contract.md](capability-contract.md) | CAP | UI capability boundaries |
| [pipeline-contract.md](pipeline-contract.md) | PIPE | Audio transcription pipeline states |
| [acceptance-contract.md](acceptance-contract.md) | ACC | Acceptance gates |

## Tables (authoritative facts)

| Table | Source |
|-------|--------|
| [tables/capabilities.yaml](tables/capabilities.yaml) | Capability declarations |
| [tables/pipeline-states.yaml](tables/pipeline-states.yaml) | Pipeline state machine |
| [tables/acceptance-cases.yaml](tables/acceptance-cases.yaml) | Acceptance test cases |
