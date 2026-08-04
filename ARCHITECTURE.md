<!-- last_verified: 2026-08-04 -->
# Architecture

MONAI DICOM Segmentation is a medical-imaging pipeline on the B2 starter spine.
The **Study** domain (ingest → segment → review) sits on top of the kept starter
scaffolding (bucket explorer, upload, dashboard, UI kit).

## Components

- **apps/web/** — Next.js 16 frontend (App Router, Tailwind v4, shadcn/ui)
  - Studies Library (`/studies`) — a grid scoped to the `studies/` prefix
  - Study ingest (`/studies/new`), slice viewer + actions (`/studies/[id]`), edit (`/studies/[id]/edit`)
  - Dashboard restated around study metrics; kept full-bucket File Browser + Upload
  - Dark mode via `next-themes`
- **services/api/** — FastAPI backend (layered architecture)
  - Study CRUD + segmentation over B2 (`runtime/studies.py`, `service/studies.py`)
  - The MONAI pipeline in `service/segmentation.py` (heavy imports LAZY) + `service/volume_io.py` (I/O + DICOM de-identification) + `service/rendering.py` (slice PNGs)
  - Kept file upload/listing/deletion, metadata extraction, B2 S3 integration via boto3
  - Health, structured JSON logging, Prometheus metrics
- **packages/shared/** — TypeScript type definitions mirroring the Pydantic models

## MONAI Segmentation Pipeline

- `service/segmentation.py` holds the pipeline: load → normalize → download a
  pretrained MONAI zoo bundle → `sliding_window_inference` → render overlays.
- **Heavy imports (torch, monai, nibabel, pydicom, numpy) are done LAZILY inside
  functions.** The FastAPI app and pytest collection load without the ML stack;
  the invariant is what keeps `pnpm verify` credential- and torch-free.
- Device is auto-detected (CUDA → Apple MPS → CPU, default CPU; `SEG_DEVICE`
  override) — no GPU is ever required.
- The heavy `POST /studies/{id}/segment` runs in Starlette's threadpool so a
  multi-minute CPU run never blocks the event loop.

## Backend Layering

The API follows a strict layered architecture:

```
types/     Pydantic models — no logic, no imports from other layers
  |
config/    Settings (pydantic-settings) — depends only on types
  |
repo/      Data access (boto3 B2 client) — no business logic
  |
service/   Business logic — calls repo, returns types
  |
runtime/   FastAPI routes — calls service, never repo directly
```

### Layering Rules

1. Dependencies flow downward only: `types` -> `config` -> `repo` -> `service` -> `runtime`
2. No backward imports (e.g., service must not import from runtime)
3. `boto3` only allowed in `repo/` layer
4. All boundary data uses Pydantic models (no raw dicts across layers)
5. Each file stays under 300 lines

### Directory Structure

```
services/api/
  main.py                  App entrypoint, middleware, router registration
  app/
    types/                 Pydantic models (FileMetadata, UploadStats, etc.)
    config/                Settings loaded from environment
    repo/                  B2 S3 client (data access layer)
    service/               Business logic (upload, files, metadata)
    runtime/               FastAPI route handlers
  tests/                   pytest tests (structural + integration)
```

## Boundary Invariants

- **No external SDK leakage**: `boto3` is only imported in `app/repo/`. All other layers interact with B2 through the repo interface.
- **No raw dicts at boundaries**: All data crossing layer boundaries uses typed Pydantic models.
- **No cross-layer mutable state**: Configuration is read-only after init, and no mutable state is shared *between* layers. Intra-layer caches/counters (the listing cache in `repo/list_cache.py`, the B2 connectivity cache in `repo/b2_client.py`, the download counter in `repo/counter.py`, the rate-limit and metrics state in `runtime/`) are module-local and guarded by a `threading.Lock`. The listing cache also owns the only background thread in the app: a stale entry is served immediately while that thread re-scans (stale-while-revalidate), and `main.lifespan` warms it once at startup so no user pays for the cold full-bucket scan.
- **Validated inputs**: All HTTP inputs validated by FastAPI/Pydantic. File keys reject empty and path-traversal patterns; optional prefix confinement via `ALLOWED_KEY_PREFIX` (off by default).

## Deployment

- **Local dev** — `pnpm dev` runs both services via `concurrently`
  - Web: `localhost:3000`
  - API: `localhost:8000`
- **Railway** — two services from the same repository: `web` builds from the
  repository root because it consumes `packages/shared`; `api` builds from
  `services/api`. The versioned per-service configs and the human-approved
  staging/production contract live in [infra/railway/README.md](infra/railway/README.md).
- **Vercel** — the web app runs well on Vercel. The **segmentation API does not
  fit serverless Python**: the torch/monai stack and multi-minute inference
  exceed Function size/time limits. Deploy the API to a container/VM host
  (Railway, Fly.io, a GPU box) instead. The rebranded templates in
  [infra/railway/README.md](infra/railway/README.md) and
  [infra/vercel/README.md](infra/vercel/README.md) note this caveat.

External provisioning and deployment remain explicit user-approved actions.

## Data Stores

- **Backblaze B2** — object storage (S3-compatible API); no application database.
- Each study is a self-contained prefix; `study.json` is the source of truth:
  ```
  studies/<id>/study.json                 manifest (metadata + status + artifact keys + stats)
  studies/<id>/source/<filename>          raw uploaded volume
  studies/<id>/processed/volume.nii.gz    MONAI-normalized volume
  studies/<id>/masks/segmentation.nii.gz  segmentation mask
  studies/<id>/preview/vol_NNN.png        grayscale axial previews (at ingest)
  studies/<id>/preview/seg_NNN.png        mask-overlay previews (after segment)
  ```
- Listing scans each manifest (`list_prefix_objects`), not raw keys; stats and
  the full-bucket explorer use `list_objects_v2` / `head_object`.

## External Services

- **Backblaze B2 S3 API** — file storage, retrieval, deletion, presigned URLs

## Trust Boundaries

See [docs/SECURITY.md](docs/SECURITY.md) for full security documentation.

- **Frontend -> API** — CORS-restricted to configured origins. `CORSMiddleware` is registered LAST in `main.py` (outermost) so it wraps **every** response, including uncaught-exception 500s — otherwise the browser would block error responses and the UI would only see an opaque "network error". See [docs/RELIABILITY.md](docs/RELIABILITY.md#error-handling). A per-IP rate-limit middleware sits inner to CORS; see [docs/SECURITY.md](docs/SECURITY.md#rate-limiting).
- **API -> B2** — authenticated via application keys, signature v4
- **Client -> B2** — presigned URLs for download (10-min expiry, forced attachment)

## Data Flows

- **Ingest**: Browser -> `POST /studies` (multipart) -> validate -> write source -> lazily load volume (nibabel/pydicom) + de-identify DICOM -> render previews -> write manifest (`uploaded`)
- **Segment**: Browser -> `POST /studies/{id}/segment` (threadpool) -> normalize -> download bundle + inference -> write processed/mask/overlays -> manifest (`segmented`) with per-label volumes
- **Review**: Browser -> `GET /studies/{id}/slices/{kind}/{index}` -> presigned inline URL -> browser loads the PNG from B2
- **List/Delete**: `GET /studies` scans manifests; `DELETE /studies/{id}` removes only that prefix
- **Kept file flows**: `POST /upload`, `GET /files`, `GET /files/{key}/download`, `DELETE /files/{key}` (full-bucket explorer)

## Observability

- Structured JSON logging on all requests with `request_id`
- Request timing middleware (logs duration per request; also the catch-all that converts uncaught exceptions to a typed JSON 500)
- `/metrics` endpoint (Prometheus format: request count, latency, upload count)
- `/health` endpoint (B2 connectivity check)

## API Contract

- Checked-in OpenAPI artifact: `docs/api/openapi.json`
- Export/check command: `pnpm contract:export` / `pnpm contract:check`
- FastAPI freshness test: `services/api/tests/test_openapi_contract.py`
- Frontend route drift test: `apps/web/src/lib/api-contract.test.ts`

The frontend client keeps a small `API_CLIENT_ROUTES` registry in
`apps/web/src/lib/api-client.ts`. Tests compare that registry to the checked-in
OpenAPI artifact so route changes fail loudly before the hand-written client can
silently drift from FastAPI. `GET /metrics` is intentionally server-only.

## Canonical Files

- Layered API handler: `services/api/app/runtime/studies.py`
- Service orchestration: `services/api/app/service/studies.py`
- MONAI pipeline (lazy ML): `services/api/app/service/segmentation.py`, `service/volume_io.py`, `service/rendering.py`
- B2 data access (repo layer): `services/api/app/repo/b2_client.py`, `repo/b2_object.py`
- Pydantic models: `services/api/app/types/` (`studies.py`, `files.py`, `upload.py`, `stats.py`, `formatting.py`)
- Config (pydantic-settings): `services/api/app/config/settings.py`
- Structural tests: `services/api/tests/test_structure.py`
- OpenAPI contract: `docs/api/openapi.json`
- OpenAPI exporter: `services/api/scripts/export_openapi.py`
- Frontend API client: `apps/web/src/lib/api-client.ts`
- Shared TypeScript types: `packages/shared/src/types.ts`

## Core Features

- [Study Ingest](docs/features/study-ingest.md)
- [Segmentation](docs/features/segmentation.md)
- [Slice Viewer](docs/features/slice-viewer.md)
- [Study Library](docs/features/study-library.md)
- [Write Amplification](docs/features/write-amplification.md)
- [File Browser](docs/features/file-browser.md) · [Dashboard](docs/features/dashboard.md) · [Metadata Extraction](docs/features/metadata-extraction.md)

## References

- [docs/SECURITY.md](docs/SECURITY.md) — security principles and implementation
- [docs/RELIABILITY.md](docs/RELIABILITY.md) — reliability expectations
- [AGENTS.md](AGENTS.md) — architectural invariants and agent instructions
