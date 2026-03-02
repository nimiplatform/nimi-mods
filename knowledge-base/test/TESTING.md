# Knowledge Base Testing Guide

## Test Scripts

| Script | What it tests | Runtime needed |
|--------|---------------|----------------|
| `test/scripts/step1-embedding.ts` | Embedding generation + self-retrieval | Yes |
| `test/scripts/step2-rag-chat.ts` | Full RAG pipeline: chunk → embed → retrieve → chat | Yes |

---

## Prerequisites

1. **Running nimi runtime** on `127.0.0.1:46371` (or custom `NIMI_RUNTIME_ENDPOINT`)
2. **Cloud provider API key** with embedding + chat model access

---

## API Key Configuration

### Mode A: Inline Key-Source (recommended for testing)

Pass the API key directly via gRPC metadata. No runtime-side configuration needed.

```bash
export NIMI_API_KEY="sk-your-api-key"
export NIMI_PROVIDER_TYPE="openai"                          # or: anthropic, deepseek, gemini, dashscope
export NIMI_EMBEDDING_MODEL_ID="text-embedding-3-small"     # embedding model
export NIMI_CHAT_MODEL_ID="cloud/default"                   # chat model (step2 only)
# export NIMI_PROVIDER_ENDPOINT="..."                       # optional custom endpoint
```

### Mode B: Runtime-Config

Start the runtime with cloud provider env vars pre-configured:

```bash
NIMI_RUNTIME_CLOUD_OPENAI_API_KEY=sk-xxx ./nimi serve
# Then set model IDs with provider prefix:
export NIMI_EMBEDDING_MODEL_ID="openai/text-embedding-3-small"
export NIMI_CHAT_MODEL_ID="openai/gpt-4o"
```

In this mode, don't set `NIMI_API_KEY` — the runtime uses its own env-configured providers.

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `NIMI_RUNTIME_ENDPOINT` | `127.0.0.1:46371` | Runtime gRPC address |
| `NIMI_API_KEY` | (empty) | API key for inline mode. If set, enables Mode A |
| `NIMI_PROVIDER_TYPE` | `openai` | Provider type for inline mode |
| `NIMI_PROVIDER_ENDPOINT` | (empty) | Custom provider endpoint (optional) |
| `NIMI_EMBEDDING_MODEL_ID` | `text-embedding-3-small` | Embedding model ID |
| `NIMI_CHAT_MODEL_ID` | `cloud/default` | Chat model ID (step2 only) |

---

## Step 1: Embedding Verification

Tests that the embedding pipeline works: document loading, chunking, batch embedding, and self-retrieval.

```bash
cd nimi-mods/knowledge-base
npx tsx test/scripts/step1-embedding.ts [path-to-doc.md]
```

- Input: Markdown document (default: `test/samples/sample-doc.md`)
- Output: Console — embedding dimensions, self-retrieval top-5 results
- Pass criteria: chunk[0] returns as top result with score ~1.0

### Example Output

```
=== KB Step 1: Embedding Test ===
Runtime:  127.0.0.1:46371
Provider: openai
KeyMode:  inline
Embed:    text-embedding-3-small

Reading: test/samples/sample-doc.md
Chunks:  12 chunks (avg 487 tokens)

Embedding 12 chunks...
  chunk[0]  dim=1536  first5=[0.0124, -0.0341, ...]
  chunk[1]  dim=1536  first5=[0.0082, -0.0215, ...]
  ...
All 12 chunks embedded successfully. (2.1s)

Self-retrieval test (query = chunk[0] text):
  #1  chunk-0  score=1.000  "..."
  #2  chunk-1  score=0.823  "..."
  #3  chunk-4  score=0.756  "..."

Embedding pipeline verified.
```

---

## Step 2: RAG Multi-turn Chat

Full RAG pipeline: loads documents, enters an interactive REPL with retrieval-augmented answers.

```bash
cd nimi-mods/knowledge-base
npx tsx test/scripts/step2-rag-chat.ts [path-to-doc.md]
```

- Input: Markdown document (default: `test/samples/sample-doc.md`)
- Output: Interactive REPL with RAG-augmented answers

### REPL Commands

| Command | Description |
|---------|-------------|
| `/quit`, `/exit` | Exit the REPL |
| `/docs` | Show loaded document chunk stats |
| `/history` | Print conversation history |
| `/clear` | Clear conversation history |
| `/add <path>` | Load and embed an additional document |

### Example Session

```
=== KB Step 2: RAG Multi-turn Chat ===
Runtime:  127.0.0.1:46371
Provider: openai
KeyMode:  inline
Chat:     cloud/default
Embed:    text-embedding-3-small

Loading: test/samples/sample-doc.md
Parsed 12 chunks, embedding... done (2.1s)

> What is the main topic of this document?
[rewrite: n/a (first turn)]
[search: 5 chunks, best=0.89]

The main topic of this document is the Nimi platform...

References:
  [1] chunk-2 (score=0.89): "..."
  [2] chunk-5 (score=0.82): "..."

> Can you elaborate on that?
[rewrite: "What specific details are discussed about the Nimi platform?"]
[search: 5 chunks, best=0.85]

Based on the document...

> /quit
Goodbye.
```

---

## Full Pipeline Example

```bash
cd nimi-mods/knowledge-base

# Set credentials (Mode A, OpenAI)
export NIMI_API_KEY="sk-your-openai-key"
export NIMI_PROVIDER_TYPE="openai"
export NIMI_EMBEDDING_MODEL_ID="text-embedding-3-small"
export NIMI_CHAT_MODEL_ID="cloud/default"

# Step 1: Verify embeddings work
npx tsx test/scripts/step1-embedding.ts

# Step 2: Interactive RAG chat
npx tsx test/scripts/step2-rag-chat.ts
```

---

## How Token API Routing Works

```
test script (node-grpc)
    |
    +- Mode A (NIMI_API_KEY set):
    |   gRPC metadata: x-nimi-key-source=inline, x-nimi-provider-api-key=xxx
    |   -> Runtime reads metadata -> creates RemoteTarget -> calls cloud provider
    |
    +- Mode B (no NIMI_API_KEY):
        connectorId='', no metadata
        -> Runtime falls back to env-configured cloud providers
    |
    v
Go Runtime (gRPC server)
    |
    v
Cloud Provider (OpenAI / Anthropic / Gemini / DashScope / ...)
```

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
(e.g., `openai/gpt-4o`, `dashscope/qwen-plus`).

### Embedding errors
Ensure the embedding model ID matches your provider. For OpenAI, use `text-embedding-3-small`
or `text-embedding-3-large`. For DashScope, use `text-embedding-v3`.

### NIMI_API_KEY not set
Both scripts require `NIMI_API_KEY` for inline mode. If you prefer runtime-config mode,
start the runtime with the appropriate `NIMI_RUNTIME_CLOUD_*` env vars and leave
`NIMI_API_KEY` unset.
