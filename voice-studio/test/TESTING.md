# Voice Studio Testing Guide

## Test Layers

| Layer | Type | What it tests | Runtime needed |
|-------|------|---------------|----------------|
| Unit tests | `test/unit/*.test.ts` | Pure logic (no I/O, no LLM) | No |
| Layer 2 scripts | `test/scripts/step*.ts` | Real LLM calls via runtime gRPC | Yes |

---

## Unit Tests

```bash
cd nimi-mods/voice-studio
pnpm test
```

Covers:
- `chapter-split.test.ts` — chapter splitting (Chinese/English/Roman numerals)
- `character-tier.test.ts` — character tier classification (major/supporting/minor)
- `synthesis-queue.test.ts` — synthesis scheduler (concurrency/retry/cancel)

No runtime or API key required.

---

## Layer 2 Tests (Runtime Token API)

These scripts call the nimi runtime's gRPC service to make real LLM requests via Token API.

### Prerequisites

1. **Running nimi runtime** on `127.0.0.1:46371` (or custom `NIMI_RUNTIME_ENDPOINT`)
2. **Cloud provider API key** — passed via one of two modes:

#### Mode A: Inline Key-Source (recommended for testing)

Pass the API key directly via gRPC metadata. No runtime-side configuration needed.

```bash
export NIMI_API_KEY="sk-your-api-key"
export NIMI_PROVIDER_TYPE="dashscope"    # or: openai, anthropic, deepseek, gemini, kimi, etc.
export NIMI_MODEL_ID="qwen-plus"         # model name for the provider
# export NIMI_PROVIDER_ENDPOINT="..."    # optional, uses provider default
```

#### Mode B: Runtime-Config

Start the runtime with cloud provider env vars pre-configured:

```bash
NIMI_RUNTIME_CLOUD_DASHSCOPE_API_KEY=sk-xxx ./nimi serve
# Then set model ID with provider prefix:
export NIMI_MODEL_ID="dashscope/qwen-plus"
```

In this mode, don't set `NIMI_API_KEY` — the runtime uses its own env-configured providers.

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `NIMI_RUNTIME_ENDPOINT` | `127.0.0.1:46371` | Runtime gRPC address |
| `NIMI_MODEL_ID` | `cloud/default` | Model ID (use provider prefix for Mode B) |
| `NIMI_API_KEY` | (empty) | API key for inline mode. If set, enables Mode A |
| `NIMI_PROVIDER_TYPE` | `dashscope` | Provider type for inline mode |
| `NIMI_PROVIDER_ENDPOINT` | (empty) | Custom provider endpoint (optional) |

### Test Pipeline

The tests form a sequential pipeline. Each step reads the previous step's output.

#### Step 2: Novel Analysis

Reads a `.txt` file, splits into chapters, calls LLM to extract segments and characters.

```bash
npx tsx test/scripts/step2-analyze.ts /path/to/your-novel.txt
```

- Input: plain text file (`.txt`)
- Output: `test/output/step2-result-{filename}.json`
- Contains: segments, characters, chapter analysis results

If no file is provided, uses `test/samples/short-story.txt`.

#### Step 3: Voice Casting

Reads step2 output, classifies character tiers, calls LLM to recommend voices.

```bash
npx tsx test/scripts/step3-cast.ts test/output/step2-result-{filename}.json
```

- Input: step2 result JSON
- Output: `test/output/step3-result-{filename}.json`
- Contains: classified characters, voice castings

#### Step 4: Synthesis

Reads step2 + step3 output, synthesizes first chapter with mock TTS.

```bash
npx tsx test/scripts/step4-synthesize.ts \
  test/output/step2-result-{filename}.json \
  test/output/step3-result-{filename}.json
```

- Input: step2 + step3 result JSONs
- Output: `test/output/step4-result-{filename}.json`
- Uses mock TTS (no real TTS endpoint needed)
- Contains: synthesis job status, segment results

### Full Pipeline Example

```bash
cd nimi-mods/voice-studio

# Set credentials (Mode A)
export NIMI_API_KEY="sk-your-dashscope-key"
export NIMI_PROVIDER_TYPE="dashscope"
export NIMI_MODEL_ID="qwen-plus"

# Run pipeline
npx tsx test/scripts/step2-analyze.ts ~/novels/my-novel.txt
npx tsx test/scripts/step3-cast.ts test/output/step2-result-my-novel.json
npx tsx test/scripts/step4-synthesize.ts \
  test/output/step2-result-my-novel.json \
  test/output/step3-result-my-novel.json
```

---

## How Token API Routing Works

```
test script (node-grpc)
    │
    ├─ Mode A (NIMI_API_KEY set):
    │   gRPC metadata: x-nimi-key-source=inline, x-nimi-provider-api-key=xxx
    │   └─ Runtime reads metadata → creates RemoteTarget → calls cloud provider
    │
    └─ Mode B (no NIMI_API_KEY):
        connectorId='', no metadata
        └─ Runtime falls back to env-configured cloud providers
    │
    ▼
Go Runtime (gRPC server)
    │
    ▼
Cloud Provider (DashScope / OpenAI / Anthropic / ...)
```

**Note:** Desktop uses Tauri IPC to its own embedded runtime (not your standalone runtime).
The desktop's connectors are stored in the Tauri-managed runtime's ConnectorStore. Your standalone
runtime is a separate process and needs its own API key configuration via env vars or inline metadata.

---

## Troubleshooting

### "runtime sdk client unavailable"
Runtime is not reachable. Check `NIMI_RUNTIME_ENDPOINT` and ensure the runtime is running.

### "AI_PROVIDER_UNAVAILABLE"
Runtime has no cloud provider configured. Use Mode A (inline key-source) or start
runtime with `NIMI_RUNTIME_CLOUD_*` env vars.

### "AI_REQUEST_CREDENTIAL_MISSING"
Mode A: `NIMI_PROVIDER_TYPE` is missing or the provider requires an explicit endpoint.

### "AI_ROUTE_FALLBACK_DENIED"
Model ID prefix doesn't match token-api route. Use a `cloud/` or provider-prefixed model ID
(e.g., `dashscope/qwen-plus`, `openai/gpt-4o`).

### No runtime logs for desktop Token API
Desktop uses its own Tauri-embedded runtime (via Tauri IPC), not your standalone runtime.
This is expected behavior.
