<!-- last_verified: 2026-08-04 -->
# Feature: Study Library

## Purpose
Browse imaging studies as a grid scoped to the `studies/` prefix — the sample-specific explorer, distinct from the full-bucket `/files` browser.

## Used By
- UI: `/studies` — `apps/web/src/components/studies/study-library.tsx`
- API: `GET /studies`, `GET /studies/{study_id}`, `PATCH /studies/{study_id}`, `DELETE /studies/{study_id}`

## Core Functions
- `service.studies.list_studies` (scans each `studies/<id>/study.json` manifest)
- `queries.useStudies`, `useUpdateStudy`, `useDeleteStudy`, `useRunSegmentation`

## Canonical Files
- Pattern exemplar: `apps/web/src/components/studies/study-library.tsx`
- `apps/web/src/components/studies/study-card.tsx`

## Inputs
- none (list) / study_id (get, update, delete)

## Outputs
- List of `StudySummary` (newest first): label, modality, model, status, thumbnail
- Per-card actions: view, run/re-run, edit, delete (scoped to `studies/<id>/`)

## Flow
- Library mounts → `useStudies` lists summaries (polls while any study is `processing`)
- Each card shows the first volume preview as a thumbnail (its own presigned URL)
- Actions route to the study/edit pages or fire run/delete mutations

## Edge Cases
- Empty → empty state with an "Ingest a volume" CTA
- Unreadable manifest → skipped (not fatal to the list)
- Delete confirms first; only that study's prefix is removed — never bucket-wide

## UX States
- Empty · Loading (skeleton grid) · Error · Loaded (grid)

## Verification
- Test files: `services/api/tests/test_studies.py` (list, delete-scoped, update)
- Default pre-PR verify command: `pnpm verify`
- Pass criteria: list reflects manifests; delete removes exactly one prefix

## Related Docs
- [README.md](../../README.md)
- [ARCHITECTURE.md](../../ARCHITECTURE.md)
- [docs/features/file-browser.md](file-browser.md)
