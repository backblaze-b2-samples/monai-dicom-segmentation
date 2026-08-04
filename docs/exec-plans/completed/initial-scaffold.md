# Build plan — `monai-dicom-segmentation`

Source of truth for the delta: the fresh clone at
`.claude/scratch/vcsk-aae303a3-92ec-407d-a672-c0f62d353382/` (vibe-coding-starter-kit).

## 1. Purpose

`monai-dicom-segmentation` is a B2 sample for **medical-imaging researchers and data
engineers** who need to land large DICOM/NIfTI volumes in object storage, run
reproducible **MONAI** segmentation over them, and keep every derived artifact
(normalized volumes, organ/lesion masks, slice previews) next to the source data.

The app manages **Studies** — one imaging volume plus its processing lifecycle. You
ingest a volume, the pipeline normalizes it with MONAI transforms and runs a
pretrained MONAI segmentation bundle on-device (CPU by default, GPU auto-detected),
and the results — processed volume, mask, and rendered slice previews — are written
back to B2 under the study's own prefix. A slice viewer renders volume + mask overlay
straight from B2 for review or downstream training. The story it tells about B2:
**heavy, fast-landing scientific data with write-amplification** — one source volume
fans out into a processed volume, a mask, N preview slices, and a manifest, all via
the S3-compatible API with a custom user-agent and standard `B2_*` env vars. Runs on
local OSS only — **B2 credentials are the sole secret; no second API key**.

## 2. Architecture delta from vibe-coding-starter-kit

The starter kit is the ceiling. We keep its whole spine (Next.js + FastAPI + boto3-to-B2,
react-query wiring, shadcn UI kit, bucket explorer, dashboard, settings, tests harness)
and add the Studies domain on top; we trim almost nothing (low-churn, keeps the mature
test suite green).

### KEEP (as-is or lightly rebranded)
- **`services/api/app/repo/b2_client.py`** — boto3 S3 client, list-cache, presign,
  stats. Extend (not replace) with byte-level put/get + prefix listing helpers.
- **Generic upload path** (`/upload` endpoint, `service/upload.py`, `runtime/upload.py`
  + their tests) — feeds the full-bucket explorer. Left intact to avoid breaking the
  contract/e2e test suite; reframed in copy as "add raw files to the bucket".
- **Bucket explorer** (`/files` page, `components/files/*`, `runtime/files.py`,
  `service/files.py`, list-cache) — **NON-REMOVABLE per skill.** Full-bucket browse
  stays exactly as-is. This is the mandated "keep the bucket explorer".
- **Dashboard** (`/`, `components/dashboard/*`) — kept; stats re-pointed at studies.
- **Settings** (`/settings`, `components/settings/settings-form.tsx`) — kept; it's also
  our form-UX exemplar (selectors for finite fields + `FormDescription` default hints).
- **Design system** (`/design`), **UI kit** (`components/ui/*`), layout, health banner,
  theme, command palette, react-query, metrics/ratelimit middleware, all test scaffolding.
- **Infra** (`infra/railway`, `infra/vercel`) — kept, rebranded. (Heavy torch/monai
  will not fit serverless Vercel Python; note this in infra README as a caveat, don't
  rebuild.)

### TRIM (remove from starter)
- **Nothing structural.** Only content edits: rewrite README / feature docs / app copy
  from a generic file-manager to the imaging pipeline. Delete starter-specific completed
  exec-plans under `docs/exec-plans/completed/*` (keep the `active/.gitkeep` +
  `completed/` dir; our scaffold plan lands in `completed/initial-scaffold.md`).
- The generic upload page stays but is demoted from the primary CTA (Studies is primary).

### ADD (new for monai-dicom-segmentation)
Primary entity = **Study**. B2 layout, all under one prefix (write-amplification):
```
studies/<id>/study.json                 # manifest: metadata + status + artifact keys + stats
studies/<id>/source/<filename>          # raw uploaded volume (.nii/.nii.gz or DICOM .zip)
studies/<id>/processed/volume.nii.gz    # MONAI-normalized volume
studies/<id>/masks/segmentation.nii.gz  # segmentation mask (NIfTI label map)
studies/<id>/preview/vol_000.png ...    # rendered grayscale axial slices (at ingest)
studies/<id>/preview/seg_000.png ...    # rendered mask-overlay slices (at segment)
```
`study.json` is the source of truth; the Library lists studies by scanning
`studies/*/study.json` (not by parsing keys).

**Backend (`services/api/app/`):**
- `types/studies.py` — pydantic models: `Study`, `StudyCreate`, `StudySummary`,
  `StudyStatus` (`uploaded|processing|segmented|failed`), `SegmentationResult`
  (per-label voxel counts + physical volume in mL), `SliceInfo`.
- `service/studies.py` — study CRUD over B2: create-from-upload (validate medical
  formats, write source + manifest, render volume previews), list, get, update
  (label + model, re-writes manifest), delete (scoped delete of the `studies/<id>/`
  prefix only — never bucket-wide). Lazy imports for anything heavy.
- `service/segmentation.py` — **the MONAI pipeline**, all heavy imports (`torch`,
  `monai`, `nibabel`, `pydicom`) done **lazily inside functions** so the FastAPI app
  and test collection never load torch. Steps:
  1. **Load** — NIfTI via nibabel; DICOM series via a `.zip` of `.dcm` files
     (pydicom / MONAI reader) → volume array + affine/spacing.
  2. **De-identify** — for DICOM inputs, strip PHI tags (PatientName/ID/BirthDate,
     private tags) before anything is stored (compliance angle for "regulated data").
  3. **Normalize** — MONAI transforms: `Orientation(RAS)`, `Spacing` resample,
     `ScaleIntensityRange` (CT window) / intensity normalization. Write
     `processed/volume.nii.gz`.
  4. **Segment** — `monai.bundle` download + inference with a pretrained bundle,
     `sliding_window_inference`, on the auto-detected device. Write
     `masks/segmentation.nii.gz`.
  5. **Render** — up to N (default 24) evenly-spaced axial slices → grayscale PNG
     (volume) + colored-overlay PNG (mask) via numpy + Pillow (no matplotlib). Write
     under `preview/`. Update manifest with stats + status=`segmented`.
  - **Device** (`deployment: local`, hard rule): auto-detect **CUDA → MPS → CPU**,
    default CPU; overridable via `SEG_DEVICE` (`auto|cpu|cuda|mps`).
  - Model default: **`spleen_ct_segmentation`** (UNet, CT, single organ — canonical
    MONAI demo, modest CPU cost). Finite selectable set (see form UX).
- `repo/b2_client.py` — add `put_bytes(key, data, content_type)`, `get_bytes(key)`,
  `list_prefix_objects(prefix)`; invalidate list-cache on writes/deletes as existing
  code does.
- `runtime/studies.py` — router:
  `POST /studies` (multipart: file + label + modality + model → create),
  `GET /studies` (list summaries), `GET /studies/{id}` (full manifest),
  `PATCH /studies/{id}` (edit label/model), `DELETE /studies/{id}` (scoped),
  `POST /studies/{id}/segment` (run pipeline; `run_in_threadpool`, generous timeout),
  `GET /studies/{id}/slices/{kind}/{index}` (presigned URL for a preview PNG,
  `kind ∈ volume|overlay`). Sync `def` handlers (blocking boto3/torch → threadpool),
  mirroring `runtime/files.py`'s documented rationale.
- Wire the router in `main.py`; keep the startup B2-config validation, updated to the
  renamed env vars (below).

**Frontend (`apps/web/src/`):**
- `/studies` — **Library** = sample-specific asset explorer **scoped to `studies/`**
  (grid of study cards: first preview thumbnail, status badge, label, model; actions
  view/run/edit/delete). This is the mandated scoped explorer, distinct from `/files`.
- `/studies/new` — **CREATE** form: file dropzone (`.nii/.nii.gz/.zip`), `label`
  (free text), `modality` **Select** (CT / MR), `model` **Select** (finite bundle
  list). Follows the settings-form exemplar: finite fields use `Select`; CREATE form
  surfaces safe defaults as placeholder/`FormDescription` (default model
  `spleen_ct_segmentation`, modality `CT`, label hint) — guidance only, no autofill button.
- `/studies/[id]` — **READ** = the **slice viewer** (Serve/Query step): axial slice
  slider, volume/overlay toggle (presigned PNGs from B2), study metadata, segmentation
  stats table, and the **RUN** ("Run segmentation") / **EDIT** / **DELETE** /
  download-artifacts actions.
- `/studies/[id]/edit` (or an edit dialog) — **EDIT** form: `label` + `model` Select,
  pre-filled from the manifest (edit forms use selectors, no default-hint).
- Dashboard `/` — restat: total studies, segmented count, total imaging bytes, storage.
- Sidebar nav: **Dashboard · Studies · Ingest · Files · Settings** (+ Design System
  under Reference). "Files" keeps the bucket explorer; "Studies" is the Library.
- `lib/queries.ts` / `lib/api-client.ts` — add study queries/mutations
  (`useStudies`, `useStudy`, `useCreateStudy`, `useUpdateStudy`, `useDeleteStudy`,
  `useRunSegmentation`, slice-URL query) alongside the kept file queries.
- `packages/shared/src/types.ts` — add `Study`, `StudySummary`, `StudyStatus`,
  `SegmentationResult`, `SliceInfo` mirroring the pydantic models.

**Primary-entity lifecycle audit (Study):** create ✅ (`/studies/new`), read ✅
(`/studies/[id]` viewer), edit ✅ (edit form/dialog), delete ✅ (Library + detail),
run ✅ (`/studies/[id]` → segment). **No omitted verbs** → `omitted_ui_verbs: []`.

## 3. B2 surface (S3-compatible only — no b2-native)
- `head_bucket` (health), `put_object` (source, processed, mask, preview PNGs, manifest),
  `get_object` (read volume/mask/manifest for pipeline + viewer), `list_objects_v2`
  (Library scan + bucket explorer + stats), `delete_object` (scoped study delete),
  `generate_presigned_url` (slice PNG + artifact download/preview).
- **No b2-native API anywhere.** Custom user-agent set on the single S3 client
  (`user_agent_extra`), standard `B2_*` env vars. Compliant with parent CLAUDE.md.

## 4. Key features (seed README + `docs/features/*`)
1. **DICOM/NIfTI ingest to B2** — upload a volume; source + manifest land under the
   study prefix; volume previews rendered on ingest. `deployment: local`, no external API.
2. **MONAI normalization + de-identification** — MONAI transforms (orient/resample/
   intensity) + DICOM PHI stripping; processed volume written to B2. `deployment: local`.
3. **Pretrained MONAI bundle segmentation** — organ/lesion mask via a MONAI zoo bundle,
   sliding-window inference, **CPU-default / GPU auto-detect**. `deployment: local`;
   external provider **none**; cost **$0** (weights pulled free from the MONAI zoo);
   env key **none** (B2 only).
4. **Slice viewer from B2** — server-rendered axial slices + mask overlay streamed from
   B2 presigned URLs; volume/overlay toggle + slider.
5. **Write-amplification / artifact lineage** — one source → processed + mask + N
   previews + manifest, all under `studies/<id>/`; Library surfaces the lineage.
6. **Full-bucket explorer** (kept from starter) — browse every object, download, delete.

**External API provider:** none. Every heavy feature is `deployment: local`
(on-device MONAI/torch). No provider key, no Genblaze (the description names no
Genblaze/genblaze-* stack and is explicitly "B2 credentials only"). CPU-default /
GPU-autodetect hard rule applies to features 1–4.

## 5. Doc transforms
- **README.md** — rewrite around the imaging pipeline: what it is, the Study lifecycle,
  the B2 layout diagram, MONAI bundle notes, device selection, quickstart (install deps,
  fill `.env` with B2 creds, `pnpm setup`, run), CPU-cost caveat, "get a test volume"
  note (small public CT NIfTI or a synthetic volume). Keep the "Built on Backblaze B2"
  framing and *why B2* (heavy scientific data, write-amplification, versioned raw+derived).
- `docs/features/*` — replace `dashboard/file-browser/file-upload/metadata-extraction/
  settings` docs: KEEP `file-browser` (bucket explorer) + `settings`; REWRITE `dashboard`
  for study stats; REPLACE `file-upload` → `study-ingest`; ADD `segmentation`,
  `slice-viewer`, `study-library`, `write-amplification`. Use `_template.md`.
- `docs/SECURITY.md`, `docs/RELIABILITY.md`, `AGENTS.md`, `ARCHITECTURE.md`,
  `PRODUCT.md` — rebrand + note the medical-data / de-identification stance and that
  the demo is single-tenant/unauthenticated (same disclaimer as starter; add "not for
  real PHI without auth + tenant scoping").
- Delete starter `docs/exec-plans/completed/*`; skill drops our plan into
  `docs/exec-plans/completed/initial-scaffold.md` on PASS.

## 6. Rename table (every identifier)
| From (starter) | To (this sample) |
|---|---|
| dir/repo `vibe-coding-starter-kit` | `monai-dicom-segmentation` |
| npm scope `@vibe-coding-starter-kit/shared` | `@monai-dicom-segmentation/shared` |
| root `package.json` name `vibe-coding-starter-kit` | `monai-dicom-segmentation` |
| `apps/web` pkg name / imports of `@vibe-coding-starter-kit/shared` | `@monai-dicom-segmentation/shared` |
| `APP_NAME` "OSS Starter Kit" | "MONAI DICOM Segmentation" |
| `APP_DESCRIPTION` | "Medical imaging segmentation pipeline powered by MONAI and Backblaze B2" |
| FastAPI `title` "OSS Starter Kit API" | "MONAI DICOM Segmentation API" |
| `user_agent_extra` `b2ai-oss-start` | `b2ai-monai-dicom-segmentation` |
| UTM `utm_content=b2ai-oss-start` | `utm_content=b2ai-monai-dicom-segmentation` |
| Railway/Vercel image+app slugs `vibe-coding-starter-kit` | `monai-dicom-segmentation` |
| openapi.json `title`/refs | regenerate after rename (`scripts/export_openapi.py`) |

### Env-var rename → **Standard #3** (starter deviates — must fix)
| Starter | Standard #3 (target) |
|---|---|
| `B2_KEY_ID` / `b2_key_id` | `B2_APPLICATION_KEY_ID` / `b2_application_key_id` |
| `B2_APPLICATION_KEY` | `B2_APPLICATION_KEY` (unchanged) |
| `B2_BUCKET_NAME` | `B2_BUCKET_NAME` (unchanged) |
| `B2_ENDPOINT` / `b2_endpoint` | derive from **`B2_REGION`** → `https://s3.<region>.backblazeb2.com` (add `b2_region: str = "us-west-004"`, expose `b2_endpoint` as a computed property) |
| `b2_public_url` / `B2_PUBLIC_URL` | `B2_PUBLIC_URL_BASE` / `b2_public_url_base` (optional) |

**Files that reference the deprecated env names (update every one):**
`.env.example`, `services/api/app/config/settings.py`,
`services/api/app/repo/b2_client.py`, `services/api/main.py`
(`REQUIRED_B2_SETTINGS` + `PLACEHOLDER_VALUES`), `scripts/doctor.mjs`,
`README.md`, `docs/SECURITY.md`, `infra/railway/README.md`, `infra/vercel/README.md`,
and any test that asserts on them (grep `b2_key_id|B2_KEY_ID|b2_endpoint|b2_public_url`).
`.env.example` must list the Standard-#3 names with **placeholder** values only
(never real secrets — the hook blocks `K00…`/`005…`).

## 7. Dependencies (services/api/requirements.txt — bounded pins; regen requirements.lock)
Unbounded ML deps are a false green (boot+tests pass, marquee ML breaks on clean
install) — **pin upper bounds** and regenerate the lock (`docs/dev-workflows.md`
#python-dependency-updates); `tests/test_dependency_lock.py` enforces `>=` inputs.
```
# --- MONAI segmentation pipeline (local ML) ---
monai>=1.4.0,<1.5.0
torch>=2.4.0,<2.9.0            # CPU wheel by default; device auto-detected at runtime
nibabel>=5.2.0,<6.0.0
pydicom>=2.4.0,<4.0.0
scikit-image>=0.24.0,<0.26.0
scipy>=1.13.0,<2.0.0
huggingface-hub>=0.24.0,<1.0.0   # bundle download (pin — unbounded hf_hub is a false green)
requests>=2.31.0,<3.0.0
numpy>=1.26.0,<2.0.0             # <2 for MONAI/skimage/torch stack compat
```
Pillow already present (slice PNG rendering). No matplotlib. If the default bundle needs
`einops`/`fire`/`pyyaml`, add them bounded — but the spleen UNet bundle should not.
Builder must run `pnpm --filter ... test:api`, `pnpm lint`, `pnpm build`, and
regenerate `requirements.lock` so the dependency-lock test passes.

## Build guardrails for the sub-agent
- Do **not** re-clone; build from the provided scratch tree. Strip `.git`.
- Keep heavy imports (`torch`/`monai`/`nibabel`/`pydicom`) **lazy** (inside functions),
  never at module import time — the API must boot and tests must collect without torch.
- Segmentation is the only heavy step; it runs in `run_in_threadpool` behind
  `POST /studies/{id}/segment`. The frontend shows a pending/progress state.
- All study deletes are **scoped to `studies/<id>/`** — never bucket-wide.
- Commit per increment (backend, frontend, docs) so a mid-build death is recoverable.
- Verify parent-CLAUDE.md standards before finishing: S3-only, custom UA, Standard-#3
  env names; `pnpm lint` + `pnpm build` + `test:api` green; `requirements.lock` regenerated.
