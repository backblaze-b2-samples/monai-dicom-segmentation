<!-- last_verified: 2026-08-04 -->
# Feature: Study Ingest

## Purpose
Land a DICOM/NIfTI imaging volume in B2 as a new Study, de-identify DICOM PHI, and render volume previews on ingest.

## Used By
- UI: `/studies/new` — `apps/web/src/components/studies/study-create-form.tsx`
- API: `POST /studies` (multipart: file + label + modality + model)

## Core Functions
- `service.studies.create_study`
- `service.volume_io.load_volume` / `_deidentify`
- `service.segmentation.ingest_previews`

## Canonical Files
- Pattern exemplar: `services/api/app/service/studies.py`
- `services/api/app/runtime/studies.py`, `services/api/app/service/volume_io.py`

## Inputs
- file: `.nii` / `.nii.gz` (NIfTI) or `.zip` of `.dcm` (DICOM series) — multipart
- label: string (free text)
- modality: `CT` | `MR` (Select)
- model: MONAI bundle key (Select; default `spleen_ct_segmentation`)

## Outputs
- `studies/<id>/source/<filename>` (raw upload)
- `studies/<id>/preview/vol_NNN.png` (grayscale axial previews)
- `studies/<id>/study.json` (manifest, status `uploaded`)
- Side effect: DICOM PHI tags cleared before any derived artifact is written; count recorded in the manifest

## Flow
- Validate format (extension → `nifti` | `dicom_zip`), modality, and model
- Write source bytes to B2 under the study prefix
- `ingest_previews` lazily loads the volume (nibabel / pydicom), strips PHI for DICOM, renders previews
- Persist `study.json` and return the Study

## Edge Cases
- Unsupported extension → 400
- Empty file → 400
- Unreadable DICOM archive (no image slices) → surfaced as an ingest error
- Heavy imports (nibabel/pydicom) are lazy — the API boots without them

## UX States
- Idle (dropzone) · Submitting (`Ingesting...`) · Error toast

## Verification
- Test files: `services/api/tests/test_studies.py`
- Focused verify command: `cd services/api && .venv/bin/python -m pytest tests/test_studies.py`
- Default pre-PR verify command: `pnpm verify`
- Pass criteria: source + previews + manifest land under one `studies/<id>/` prefix

## Related Docs
- [README.md](../../README.md)
- [ARCHITECTURE.md](../../ARCHITECTURE.md)
- [docs/app-workflows.md](../app-workflows.md)
