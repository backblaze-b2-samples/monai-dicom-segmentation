<!-- last_verified: 2026-08-04 -->
# Feature: Segmentation

## Purpose
Run a pretrained MONAI zoo bundle over a study's volume on the auto-detected device and write the mask + overlays back to B2.

## Used By
- UI: `/studies/[id]` → "Run segmentation" — `apps/web/src/components/studies/study-detail.tsx`
- API: `POST /studies/{study_id}/segment`

## Core Functions
- `service.segmentation.segment_volume` (normalize → bundle download → sliding-window inference → render)
- `service.segmentation.resolve_device`
- `service.studies.run_segmentation`

## Canonical Files
- Pattern exemplar: `services/api/app/service/segmentation.py`
- `services/api/app/service/rendering.py`

## Inputs
- study_id: path param
- (from manifest) source volume, modality, model key

## Outputs
- `studies/<id>/processed/volume.nii.gz` (MONAI-normalized volume)
- `studies/<id>/masks/segmentation.nii.gz` (label map)
- `studies/<id>/preview/seg_NNN.png` (mask-overlay slices)
- Manifest update: status `segmented`, per-label voxel counts + volume in mL, device

## Flow
- Set status `processing` and persist the manifest
- Lazily import torch/monai; resolve device (CUDA → MPS → CPU, default CPU, `SEG_DEVICE` override)
- Download the bundle (first run) to `.bundle_cache/`, build the network from its config, load weights
- Normalize (CT window / MR z-norm) → `sliding_window_inference` → argmax mask
- Write processed/mask/overlays; compute label volumes; persist status `segmented`
- On failure: status `failed` + error, 500 to the client, run recorded in the manifest

## Edge Cases
- No GPU → CPU fallback (never hard-requires a GPU; runs a few minutes on CPU)
- Unknown model key → 400
- Bundle download failure → surfaced as a failed run
- Runs in a threadpool so the event loop is never blocked

## UX States
- Processing (live-polling banner) · Segmented (stats + overlay) · Failed (error alert)

## Verification
- Test files: `services/api/tests/test_studies.py` (routes, mocked pipeline)
- Live check: ingest a small CT NIfTI, run segmentation, confirm mask + overlay slices appear
- Default pre-PR verify command: `pnpm verify`
- Pass criteria: real mask + overlay artifacts written to B2; stats populated

## Related Docs
- [README.md](../../README.md)
- [ARCHITECTURE.md](../../ARCHITECTURE.md)
- [docs/app-workflows.md](../app-workflows.md)
