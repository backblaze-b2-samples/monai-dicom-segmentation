<!-- last_verified: 2026-08-04 -->
# MONAI DICOM Segmentation

Land large DICOM/NIfTI imaging volumes in object storage, run reproducible
**[MONAI](https://monai.io/)** segmentation over them on-device, and keep every
derived artifact — normalized volume, organ/lesion mask, and rendered slice
previews — next to the source data. Built on
**[Backblaze B2](https://www.backblaze.com/sign-up/ai-cloud-storage?utm_source=github&utm_medium=referral&utm_campaign=ai_artifacts&utm_content=b2ai-monai-dicom-segmentation)**
via the S3-compatible API.

This is a full-stack sample (Next.js 16 + FastAPI) for medical-imaging
researchers and data engineers. **Backblaze B2 credentials are the only secret —
there is no second API key.** The segmentation model runs locally (CPU by
default, GPU auto-detected) and its weights are pulled free from the MONAI model
zoo.

## Why B2 for imaging

Scientific imaging is heavy, fast-landing, and **write-amplifying**: one source
volume fans out into a processed volume, a segmentation mask, N preview slices,
and a JSON manifest. This sample stores all of it under a single per-study prefix
via the S3 API, with a custom user-agent and the standard `B2_*` env vars — so
the raw and derived data live together, versioned, and are cheap to keep:

```
studies/<id>/study.json                 # manifest: metadata + status + artifact keys + stats
studies/<id>/source/<filename>          # raw uploaded volume (.nii/.nii.gz or DICOM .zip)
studies/<id>/processed/volume.nii.gz    # MONAI-normalized volume
studies/<id>/masks/segmentation.nii.gz  # segmentation mask (NIfTI label map)
studies/<id>/preview/vol_000.png ...    # rendered grayscale axial slices (at ingest)
studies/<id>/preview/seg_000.png ...    # rendered mask-overlay slices (after segment)
```

`study.json` is the source of truth; the Library lists studies by scanning each
manifest, not by parsing keys.

## The Study lifecycle

A **Study** is one imaging volume plus its processing lifecycle:

1. **Ingest** (`Ingest` → `/studies/new`) — upload a NIfTI (`.nii`/`.nii.gz`) or a
   `.zip` of DICOM (`.dcm`) slices. The source lands in B2, DICOM PHI is stripped,
   and grayscale axial previews are rendered on ingest. Status: `uploaded`.
2. **Segment** (`Run segmentation` on the study page) — MONAI normalizes the
   volume, downloads a pretrained zoo bundle, and runs sliding-window inference on
   the auto-detected device. The processed volume, mask, and mask-overlay previews
   are written back to B2. Status: `processing` → `segmented` (or `failed`).
3. **Review** (`/studies/[id]`) — a slice viewer streams the volume and mask
   overlay from B2 presigned URLs; a stats table reports per-label voxel counts and
   physical volume in mL.
4. **Manage** — edit the label/model, re-run, download artifacts, or delete (a
   delete is scoped to that study's `studies/<id>/` prefix only — never bucket-wide).

## Models & device selection

The segmentation model is a finite, selectable set of MONAI zoo bundles (no free
text):

| Bundle | Modality | Notes |
|--------|----------|-------|
| `spleen_ct_segmentation` (default) | CT | Single-organ UNet. Canonical MONAI demo; modest CPU cost. |
| `swin_unetr_btcv_segmentation` | CT | 13 abdominal organs via Swin UNETR. Heavier on CPU. |

Inference **auto-detects the device**: CUDA → Apple MPS → CPU, defaulting to CPU.
Override with `SEG_DEVICE=auto|cpu|cuda|mps` in `.env`. No GPU is required.

> **CPU cost caveat:** the first run downloads the bundle weights, and CPU
> sliding-window inference on a full CT volume can take a few minutes. The study
> page shows a live `processing` state and updates itself when the run finishes.

## Quick Start

You need: Node.js >= 20, pnpm >= 9, Python >= 3.11, and a free **[Backblaze B2
account](https://www.backblaze.com/sign-up/ai-cloud-storage?utm_source=github&utm_medium=referral&utm_campaign=ai_artifacts&utm_content=b2ai-monai-dicom-segmentation)**.

### Supported local environments

Local scripts are supported on macOS, Linux, and WSL2. Native Windows is not
supported yet because the dev scripts use POSIX shell syntax and
`services/api/.venv/bin/*` paths; use WSL2 on Windows. The ML dependencies
(torch, monai, nibabel, pydicom, scikit-image, scipy) are sizeable — `pnpm run
setup` needs permission to download them.

### Setup

**1. Run setup**

```bash
pnpm run setup
```

This copies `.env.example` to `.env` only when `.env` does not already exist,
installs workspace dependencies from `pnpm-lock.yaml`, creates
`services/api/.venv` if missing, and installs the API's committed Python 3.11
resolution (including the MONAI/torch stack) from `services/api/requirements.lock`.
It is safe to rerun and never overwrites an existing `.env`.

> Use the `pnpm run` form: `setup` (like `doctor`) is a built-in pnpm command
> before pnpm 11, so bare `pnpm setup` would run pnpm's own command instead of
> this script.

**2. Add your B2 credentials**

Open `.env` and, from the [Backblaze B2
dashboard](https://secure.backblaze.com/b2_buckets.htm?utm_source=github&utm_medium=referral&utm_campaign=ai_artifacts&utm_content=b2ai-monai-dicom-segmentation):

1. **Create a bucket** and set `B2_BUCKET_NAME` to its unique name and `B2_REGION`
   to its region (e.g. `us-west-004`). The S3 endpoint is derived from the region
   (`https://s3.<region>.backblazeb2.com`) — no endpoint variable to set.
2. **Create an application key** with `Read and Write` permission:
   - **keyID** → `B2_APPLICATION_KEY_ID`
   - **applicationKey** → `B2_APPLICATION_KEY` *(shown once — paste it now)*

`B2_PUBLIC_URL_BASE` is optional (only used to build public object URLs for public
buckets). See docs for [creating a
bucket](https://www.backblaze.com/docs/cloud-storage-create-and-manage-buckets)
and [app keys](https://www.backblaze.com/docs/cloud-storage-create-and-manage-app-keys).

**3. Run it**

```bash
pnpm dev
```

Frontend at `localhost:3000`, API at `localhost:8000`. Interactive API docs
(Swagger UI) are at `localhost:8000/docs`, ReDoc at `/redoc`. `pnpm dev` runs the
preflight check first — catch setup gotchas any time with `pnpm run doctor`.

### Get a test volume

Any abdominal CT `.nii.gz` works with the default spleen bundle. Good sources:

- The **Medical Segmentation Decathlon** spleen task (`Task09_Spleen`) — grab one
  volume from `imagesTr/`, ingest it as modality **CT**, model
  `spleen_ct_segmentation`.
- Any anonymized DICOM CT series: zip the `.dcm` files into a single `.zip` and
  ingest that (PHI tags are stripped during processing).

## Building on this kit

This sample is built on the Backblaze B2 vibe-coding starter kit and keeps its
spine. When adapting it:

- **Keep** the UI kit (`apps/web/src/components/ui/` + design tokens in
  `globals.css` + `/design`) and the full-bucket **File Explorer** (`/files`) — the
  latter is the non-removable bucket browser, distinct from the studies-scoped
  **Library** (`/studies`).
- **Adapt** the Dashboard (`/`) — it is restated here around study metrics.
- **Rebrand** in one file: `apps/web/src/lib/app-config.ts` (`APP_NAME`,
  `APP_DESCRIPTION`).

Full contract: [AGENTS.md §2](AGENTS.md#2-building-on-this-starter-kit).

## Core Features

- [Study Ingest](docs/features/study-ingest.md) — DICOM/NIfTI upload to B2 with PHI stripping and on-ingest previews
- [Segmentation](docs/features/segmentation.md) — pretrained MONAI zoo bundle, sliding-window inference, CPU-default / GPU-autodetect
- [Slice Viewer](docs/features/slice-viewer.md) — server-rendered volume + mask-overlay slices streamed from B2 presigned URLs
- [Study Library](docs/features/study-library.md) — studies-scoped explorer over `studies/`, distinct from the full-bucket browser
- [Write Amplification](docs/features/write-amplification.md) — one source → processed + mask + previews + manifest, all under one prefix
- [File Browser](docs/features/file-browser.md) — the kept full-bucket explorer: list, preview, download, delete
- [Dashboard](docs/features/dashboard.md) — study stats and recent studies
- [Metadata Extraction](docs/features/metadata-extraction.md) — image/PDF metadata + checksums for bucket objects
- [Settings](docs/features/settings.md) · [Design System](docs/design-system.md)

## Tech Stack

- TypeScript, Next.js 16, React 19, Tailwind v4, shadcn/ui, Recharts, TanStack Query
- Python 3.11+, FastAPI, boto3, Pydantic v2, Pillow
- **MONAI + PyTorch** (segmentation), nibabel + pydicom (I/O + de-identification), scikit-image/scipy
- Backblaze B2 (S3-compatible object storage)
- pnpm workspaces (monorepo)

## Commands

| Command | What it does |
|---------|-------------|
| `pnpm run setup` | Idempotently copy `.env.example` to `.env` if missing, install workspace dependencies, create the backend venv, and install the locked API dependencies |
| `pnpm run doctor` | Preflight environment check (also runs automatically before `pnpm dev`) |
| `pnpm dev` | Start frontend + backend |
| `pnpm dev:web` | Frontend only |
| `pnpm dev:api` | Backend only |
| `pnpm contract:export` | Export deterministic FastAPI OpenAPI JSON to `docs/api/openapi.json` |
| `pnpm contract:check` | Verify the checked-in OpenAPI artifact and frontend API client route registry |
| `pnpm check:agent-docs` | Validate agent shims, command docs, CI claims, and `.env` ignore coverage |
| `pnpm verify` | Credential-free canonical non-live pre-PR suite — runs `check:agent-docs`, `verify:api`, then `verify:web` |
| `pnpm verify:api` | Backend half: API lint, API tests, structure tests |
| `pnpm verify:web` | Frontend half: web lint, web unit tests, web typecheck + build |
| `pnpm verify:full` | `pnpm run doctor`, then `pnpm verify`, then Playwright E2E; requires populated `.env`, local server/browser permission, port 3000 free, and Chromium installed |
| `pnpm build` | Build frontend |
| `pnpm lint` | Lint frontend |
| `pnpm lint:api` | Lint backend (ruff) |
| `pnpm test:web` | Run frontend unit tests (vitest) |
| `pnpm test:api` | Run backend tests |
| `pnpm check:structure` | Verify layering rules |
| `pnpm test:e2e` | Playwright E2E smoke tests |

Run `pnpm run setup` once before local development, and rerun it after pulling
dependency changes. If you add a Node dependency, run `pnpm install` to refresh
`pnpm-lock.yaml`; for an API dependency, follow the reviewed refresh workflow in
[docs/dev-workflows.md](docs/dev-workflows.md#python-dependency-updates). Run
`pnpm verify` before opening a PR; it needs `services/api/.venv` from setup and
neither B2 credentials nor a browser (the segmentation stack is imported lazily,
so tests run without it). Run `pnpm verify:full` when you can start the local app
stack and browser tests.

## Deployment

The segmentation pipeline needs the full torch/monai stack and real CPU/GPU time,
so it does **not** fit serverless Python (e.g. Vercel Functions). Deploy the API
to a container/VM host that allows heavy dependencies and long-running requests
(Railway, Fly.io, a GPU box, etc.) and the web app anywhere Next.js runs. The
kept infra templates ([infra/railway](infra/railway/README.md),
[infra/vercel](infra/vercel/README.md)) are rebranded starting points and note
this caveat. The API is unauthenticated and single-tenant — use a dedicated
bucket and least-privilege key. Deploying is a human-approved action; nothing here
performs one for you.

## Documentation Map

| Doc | Purpose |
|-----|---------|
| [AGENTS.md](AGENTS.md) | Agent table of contents — start here |
| [ARCHITECTURE.md](ARCHITECTURE.md) | System layout, layering, data flows, the MONAI pipeline |
| [docs/features/](docs/features/) | Feature docs (ingest, segmentation, slice viewer, library, browser, dashboard) |
| [docs/app-workflows.md](docs/app-workflows.md) | User journeys |
| [docs/dev-workflows.md](docs/dev-workflows.md) | Engineering workflows and testing |
| [docs/SECURITY.md](docs/SECURITY.md) | Security principles (incl. medical-data stance) |
| [docs/RELIABILITY.md](docs/RELIABILITY.md) | Reliability expectations |
| [docs/exec-plans/](docs/exec-plans/) | Execution plans and tech debt tracker |

## License

MIT License — see [LICENSE](LICENSE) for details.
