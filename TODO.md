# TODO.md — fact-checker (BIAZ News Checker)

This plan is optimized for the hackathon demo **today** and a clean path to production **later**.  
Architecture: **Next.js Web** + **Node.js API** → **Autonomy root agent orchestrates** parallel validators → returns structured verdicts.  
Official hackathon tools (Weaviate, LlamaIndex, FriendliAI) are planned in later phases; Autonomy is used from Phase 1 (root-orchestrator).

---

## Progress
- [x] Base scaffolding: created `.gitignore`, `.dockerignore`, `.env.example`, and directories `api/`, `web/`, `scripts/`.
- [x] API skeleton: added `api/package.json`, `api/tsconfig.json`, base `src/` files (`server.ts`, `schema.ts`, `autonomy.ts`).

## Repo layout (target)
```
fact-checker/
├─ compose.yml                     # services: api + web (+ optional workers later)
├─ .env.example                    # public template with explanatory defaults
├─ api/
│  ├─ src/
│  │  ├─ server.ts                 # HTTP server (Express/Fastify) exposing /v1/check
│  │  ├─ autonomy.ts               # thin client for Autonomy HTTP endpoint
│  │  ├─ schema.ts                 # zod JSON schemas for requests/responses
│  │  └─ version.ts                # /healthz and /version endpoints
│  ├─ bin/
│  │  └─ demo.sh                   # CLI: read stdin, call /v1/check, stdout JSON/human
│  ├─ package.json
│  └─ tsconfig.json
├─ web/
│  ├─ app/                         # Next.js (App Router)
│  │  ├─ page.tsx                  # textarea + "Analyze" → results table
│  │  ├─ api-client.ts             # fetch wrapper to API baseURL
│  │  └─ components/ResultTable.tsx
│  ├─ package.json
│  └─ next.config.js
├─ scripts/
│  ├─ setup-autonomy.sh            # Option B: Provision/Deploy Autonomy zone + output URL
│  ├─ deploy.sh                    # local or remote deployment (with -m commit message)
│  └─ ports.sh                     # utilities for port checks / docker ps cut -c132-
├─ .dockerignore
├─ .gitignore
└─ README.md
```

> **Ports:** do not hard-code in `compose.yml`. Load from `.env`. Choose **rounded to 000** defaults (e.g. `API_PORT=8000`, `WEB_PORT=3000`).

---

## 0) Prerequisites
- Docker + Docker Compose
- Node.js 20+ / pnpm or npm
- Autonomy CLI installed and authenticated (`autonomy --help` shows commands; you are logged in)
- A server (optional for remote deploy), SSH access: `news.biaz.hurated.com`
- Nginx reverse-proxy **not** part of this repo (external), will map:
  - `https://api.news.biaz.hurated.com` → `localhost:${API_PORT}`
  - `https://news.biaz.hurated.com` → `localhost:${WEB_PORT}`

---

## 1) Create `.env` and `.env.example`
Create **`.env.example`** with explanatory defaults:
```
# Ports must be rounded to 000
API_PORT=8000
WEB_PORT=3000

# Autonomy integration (root agent orchestrator)
AUTONOMY_CLUSTER_ID=
AUTONOMY_ZONE_ID=
AUTONOMY_AGENT_URL=      # final public HTTP of the root agent endpoint (from Autonomy zone)
AUTONOMY_API_KEY=        # if required; otherwise leave empty

# Feature toggles for hackathon
ENABLE_SOURCE_LIST=false
MAX_FACTS=50
```

> Copy `.env.example` to `.env` and fill **only secrets** locally. Do **not** commit `.env` (add to `.gitignore`).

---

## 2) Setup Autonomy Cluster & Zone (human or scripted)

### Option A — Manual (CLI)
1. **Enroll / confirm cluster**  
   ```bash
   autonomy cluster enroll
   autonomy cluster show
   ```
2. **Initialize a zone** (use template `hello` or a `dispatcher` template if available)  
   ```bash
   mkdir autonomy-root && cd autonomy-root
   autonomy zone init --init hello
   # or: autonomy zone init --init build-trust/ockam-cluster-template-hello
   ```
3. **Adjust the generated `images/main/main.py`** to run a **root dispatcher agent** that:
   - Accepts an article payload via HTTP
   - Extracts atomic facts
   - Spawns child workers to validate each fact in parallel
   - Aggregates and returns results
4. **Deploy the zone**  
   ```bash
   autonomy zone deploy
   ```
5. **Open HTTP inlet** (if not auto-created)  
   ```bash
   autonomy zone inlet http --to main-pod:80
   ```
6. **Locate the public HTTP URL** printed by deploy output (or from zone info) and set:
   - `AUTONOMY_AGENT_URL="https://<...>.cluster.autonomy.computer"` in `.env`

> Keep logs open in another terminal if useful: `autonomy zone inlet logs` (or per docs).

### Option B — Scripted (`scripts/setup-autonomy.sh`)
We will provide a script that:
- Verifies Autonomy CLI availability
- Initializes a **dispatcher**-flavored zone into `autonomy-root/`
- Patches `autonomy.yaml` to **expose HTTP** from `main-pod`
- Deploys the zone and scrapes the **public URL** from CLI output
- Writes it into `.env` (`AUTONOMY_AGENT_URL=...`)

**Run:**
```bash
./scripts/setup-autonomy.sh
# On success, it prints and writes AUTONOMY_AGENT_URL=...
```

> During the hackathon, **Option A** might be faster if you already have an agent demo. Use **Option B** for repeatability later.

---

## 3) API service (Node.js / TypeScript)

### 3.1 Create endpoint `/v1/check`
- Input JSON:
```json
{
  "input": "string (article or fact)",
  "options": {
    "maxFacts": 50,
    "returnSources": false
  }
}
```
- Output JSON shape (Zod schema in `schema.ts`):
```json
{
  "facts": [
    {
      "text": "short fact",
      "sourcesChecked": 23,
      "sources": [ { "url": "…", "judgement": 0.0 to 1.0 } ],  // optional if returnSources=true
      "score": 0.0 to 1.0,   // aggregate per fact
      "reasoning": "optional short explanation"
    }
  ],
  "aggregate": {
    "score": 0.0 to 1.0,     // overall piece score
    "factsCount": 12
  },
  "meta": {
    "durationMs": 1234,
    "engine": "autonomy-root-orchestrator",
    "version": "git hash or semver"
  }
}
```

### 3.2 Wire to Autonomy
- Implement `api/src/autonomy.ts` with a single function:
```ts
export async function runFactCheck(article: string, opts: { maxFacts: number; returnSources: boolean }): Promise<AutonomyResult> {
  // POST to `${process.env.AUTONOMY_AGENT_URL}/check` with {article, opts}
  // include Authorization header if AUTONOMY_API_KEY exists
}
```
- The **root agent** in Autonomy must expose an HTTP route (e.g. `/check`) that implements:
  1. Extract atomic facts
  2. Fork workers for each fact
  3. Each worker queries sources (initially stubs; later: web / citations / Weaviate)
  4. Combine per-source judgments → per-fact score (0..1), then overall aggregate

> If Autonomy’s HTTP surface differs, adapt the client accordingly. Keep **Node API shape stable**.

### 3.3 Health & Version
- `/healthz` returns 200 + minimal JSON
- `/version` returns git sha + package version

---

## 4) CLI (`api/bin/demo.sh`)
A POSIX shell script (no deps) that:
- Reads **stdin** (article or single fact)
- Has `-h|--help`, `--json`, `--host`, `--port`
- Default human-readable output; JSON when `--json`
- Returns non-zero exit code on error (and prints to **stderr**)

**Examples:**
```bash
# Human readable
echo "Some article text..." | api/bin/demo.sh

# JSON
cat article.txt | api/bin/demo.sh --json

# Point to a different local port
echo "X" | api/bin/demo.sh --host localhost --port 8000
```

---

## 5) Web app (Next.js, App Router)
- Minimal UI: big textarea + “Analyze” button
- Shows:
  - **List of extracted facts**
  - **Number of sources checked** (toggle “Show sources” if `ENABLE_SOURCE_LIST=true`)
  - **Per-fact score** (0–100%)
  - **Aggregate score** for the entire piece
- UX niceties:
  - Loading state; streaming later if available
  - Copy JSON button
  - Simple badge colors for score ranges (e.g., <40% red, 40–70% amber, >70% green)

**API from web:** `POST ${API_BASE_URL}/v1/check` with `{input, options}`

**Config:** `API_BASE_URL` derived from env at build or via proxy in compose.

---

## 6) Docker & Compose

### 6.1 `.env.example`
```
API_PORT=8000
WEB_PORT=3000
AUTONOMY_AGENT_URL=
AUTONOMY_API_KEY=

ENABLE_SOURCE_LIST=false
MAX_FACTS=50
```

### 6.2 `compose.yml` (sketch)
```yaml
services:
  api:
    build: ./api
    env_file: .env
    ports:
      - "${API_PORT}:${API_PORT}"
    environment:
      - PORT=${API_PORT}
    restart: unless-stopped

  web:
    build: ./web
    env_file: .env
    ports:
      - "${WEB_PORT}:${WEB_PORT}"
    environment:
      - PORT=${WEB_PORT}
      - API_BASE_URL=http://api:${API_PORT}
    depends_on:
      - api
    restart: unless-stopped
```
> **Note:** No hard-coded ports. All via `.env`. **Rounded to 000** by convention.

**Build & run locally:**
```bash
docker compose build && docker compose up -d
```

**Check used ports on remote host:**
```bash
ssh news.biaz.hurated.com docker ps | cut -c132-
```

---

## 7) Deployment script (`scripts/deploy.sh`)

### Behavior
- If local Docker daemon is available → **local deploy**:  
  `docker compose build && docker compose up -d`
- Else → **remote deploy** to `news.biaz.hurated.com` in `~/fact-checker/`:
  1. Optionally stage+commit when `-m "message"` is provided
  2. `git push` (assumes remote is configured)
  3. `scp .env news.biaz.hurated.com:fact-checker/`
  4. `ssh news.biaz.hurated.com 'cd fact-checker && git pull && docker compose build && docker compose up -d'`

### Usage
```bash
# local (docker present)
scripts/deploy.sh

# local with commit
scripts/deploy.sh -m "feat: initial MVP deploy"

# force remote (if desired, we can add a --remote flag)
scripts/deploy.sh --remote -m "fix: configure API_BASE_URL"
```

---

## 8) Scoring logic (initial → later)

### Initial (hackathon MVP)
- **Source fetching** can be stubbed (e.g., a small whitelist of reputable endpoints, or a mock).  
- Per-source judgment = LLM heuristic (0..1); per-fact score = **mean** of source judgments.  
- Aggregate piece score = **mean of per-fact scores**.

### Later improvements
- Weighted by **source reputation** (static list first; later dynamic via Weaviate)
- **Diversity penalty** (avoid over-weighting many sources from same domain)
- **Contradiction detection** (LlamaIndex tools / agent planning to compare sources)
- Confidence intervals: show `score ± stderr` when N sources is small

---

## 9) Integrations roadmap (post-MVP but still hackathon-aligned)

- **Weaviate**: store facts & verdicts (`Fact` class, `Source` class, `Claim` class), enable fast lookups and contradiction clusters across time.
- **LlamaIndex**: use agents & tools to:
  - Extract atomic facts reliably
  - Construct retrieval pipelines and verifiers
  - Normalize per-source evidence
- **FriendliAI**: cheap/fast inference for per-source judgment or summarization in workers.

> These can be toggled by env: `USE_WEAVIATE=true`, `USE_LLAMAINDEX=true`, `USE_FRIENDLI=true` (default false for MVP).

---

## 10) Testing

### Unit
- `api/src/schema.test.ts` for strict I/O contracts
- `api/src/autonomy.test.ts` mock Autonomy responses

### E2E
- `demo.sh` (stdin → API → Autonomy → JSON)
- Web smoke test: paste article → see results table

**Examples:**
```bash
echo "NASA announced water found on the Moon in 2024." | api/bin/demo.sh --json \
  | jq '.facts | length, .aggregate.score'

curl -s -X POST "http://localhost:${API_PORT}/v1/check" \
  -H "Content-Type: application/json" \
  -d '{"input":"OpenAI acquired XYZ.","options":{"maxFacts":50,"returnSources":true}}' | jq
```

---

## 11) Security & Ops
- Do **not** log user article content in production logs by default (toggle with `SAFE_LOG=false` during dev).
- Rate limiting on API (`/v1/check`).
- Timeouts and retries calling `AUTONOMY_AGENT_URL`.
- Clear error surfaces: API returns `{ error: { code, message } }` on non-200 from Autonomy.

---

## 12) Deliverables & Demos (per phase)

### Phase 0 — Local stub demo (**<1 hr**)
- `demo.sh` calls local API which returns **stubbed extraction + scores** (no Autonomy yet)
- Web UI renders list of facts, per-fact score, aggregate score

**Done when:** `echo "text" | demo.sh` prints readable summary **and** navigating to `http://localhost:${WEB_PORT}` works.

### Phase 1 — Autonomy root orchestrator (**today**)
- Autonomy zone deployed; `.env` has `AUTONOMY_AGENT_URL`
- API forwards to Autonomy `/check`
- Parallel validation visible in Autonomy logs
- Web UI shows **sources count** per fact

**Done when:** end-to-end path shows non-stub scores, performance scales with facts.

### Phase 2 — Real sources & basic weighting (**today / tomorrow**)
- Introduce a small set of reputable sources + simple web retrieval (or cached corpora)
- Compute **weighted per-fact score** using source weights
- Add toggle **“Show sources (N)”**

### Phase 3 — Vector memory + agentic reasoning (post-hackathon or stretch)
- Weaviate persistence for claims & evidence
- LlamaIndex agent tools for contradiction checks
- FriendliAI for low-latency judgments
- Add **export JSON** / **share link**

---

## 13) Scripts (details)

### `api/bin/demo.sh` (spec)
```bash
#!/usr/bin/env bash
set -euo pipefail

host="localhost"
port="${API_PORT:-8000}"
as_json=false

usage() {
  cat <<EOF
Usage: demo.sh [--json] [--host HOST] [--port PORT]
Reads input from stdin and sends to /v1/check.
Options:
  --json           Output raw JSON
  --host HOST      API host (default: localhost)
  --port PORT      API port (default: from API_PORT env or 8000)
  -h, --help       Show this help
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --json) as_json=true; shift ;;
    --host) host="$2"; shift 2 ;;
    --port) port="$2"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown arg: $1" >&2; usage; exit 1 ;;
  esac
done

input="$(cat)"
if [[ -z "${input}" ]]; then
  echo "No input provided on stdin" >&2
  exit 2
fi

resp="$(curl -s -X POST "http://${host}:${port}/v1/check" \
  -H "Content-Type: application/json" \
  -d "{\"input\": $(jq -Rs . <<< \"$input\"), \"options\": {\"maxFacts\": ${MAX_FACTS:-50}, \"returnSources\": ${ENABLE_SOURCE_LIST:-false}}}")"

if $as_json; then
  echo "$resp"
else
  # Pretty human output (jq required)
  echo "$resp" | jq -r '
    "Facts: \(.facts | length)\n" +
    (.facts[] | "- \(.text) | sources: \(.sourcesChecked) | score: \((.score*100|round))%") +
    "\n\nAggregate score: \((.aggregate.score*100|round))%\n"
  '
fi
```

### `scripts/deploy.sh` (spec)
- Detect Docker:
  ```bash
  if docker info >/dev/null 2>&1; then
    # local
    docker compose build && docker compose up -d
  else
    # remote
    # optional -m commit message
    # push, copy .env, ssh and compose
  fi
  ```
- Support `-m "message"` to `git add -A && git commit -m "$message"` before pushing.
- Allow `--remote` to force remote path.

### `scripts/ports.sh` (spec)
```bash
#!/usr/bin/env bash
ssh news.biaz.hurated.com docker ps | cut -c132-
```

---

## 14) Definition of Done (hackathon)
- `docker compose up -d` brings **API+Web** alive using **.env** ports (000-rounded).
- `demo.sh` works from stdin → prints **facts, per-fact scores, aggregate**.
- Autonomy zone live; `.env` has `AUTONOMY_AGENT_URL` and requests flow through it.
- Web UI renders results; optional **Show sources** toggle works.
- `scripts/deploy.sh` can deploy locally; remote deploy path documented.

---

## 15) Nice-to-have (if time permits)
- Source reputation registry (`data/sources.yaml`) and editor in web UI
- “Why” button per fact (short rationale excerpt)
- Download **Report.json** / **CSV**
- Minimal auth key for API to avoid abuse

---

## Notes
- Reverse-proxy/Nginx and DNS are **out of scope** for this repo — handled separately.
- Autonomy portal URLs and secrets go to `.env`; never commit them.
- Keep each phase demo-able. Commit small, working increments.
