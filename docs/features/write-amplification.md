<!-- last_verified: 2026-08-04 -->
# Feature: Write Amplification / Artifact Lineage

## Purpose
Show the B2 story this sample tells: one source volume fans out into many derived objects, all versioned under a single per-study prefix.

## Used By
- UI: dashboard "Artifacts on B2" stat, study "Artifacts on B2" card
- API: `GET /studies/stats`, `GET /files-by-key/download` (artifact downloads)

## Core Functions
- `repo.b2_object.put_bytes` / `list_prefix_objects` / `delete_prefix`
- `service.studies.get_study_stats`

## Canonical Files
- Pattern exemplar: `services/api/app/service/studies.py`
- `services/api/app/repo/b2_object.py`

## Inputs
- none (aggregates over the `studies/` prefix)

## Outputs
- Per study under `studies/<id>/`: `source/<file>`, `processed/volume.nii.gz`,
  `masks/segmentation.nii.gz`, `preview/vol_NNN.png`, `preview/seg_NNN.png`, `study.json`
- Stats: source bytes landed vs. total artifact bytes + object count

## Flow
- Ingest writes source + previews + manifest (already 1 → many)
- Segment adds processed volume + mask + overlay previews + a manifest update
- The dashboard/study surfaces the object count so the fan-out is visible
- A study delete removes the whole prefix in one scoped batch delete

## Edge Cases
- Scoped delete guards against an empty prefix (never a bucket-wide wipe)
- B2 buckets are versioned — re-running a study writes new object versions

## UX States
- Not applicable (aggregate/informational)

## Verification
- Test files: `services/api/tests/test_studies.py::test_create_study`, `::test_delete_study_is_scoped`
- Default pre-PR verify command: `pnpm verify`
- Pass criteria: every artifact lands under one prefix; delete is scoped to it

## Related Docs
- [README.md](../../README.md)
- [ARCHITECTURE.md](../../ARCHITECTURE.md)
- [docs/SECURITY.md](../SECURITY.md)
