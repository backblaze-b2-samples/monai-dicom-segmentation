<!-- last_verified: 2026-08-04 -->
# Feature: Dashboard

## Purpose
Give an at-a-glance overview of the imaging studies and derived artifacts stored on the B2 bucket.

## Used By
- UI: `/` (dashboard) — `apps/web/src/app/page.tsx`
- API: `GET /studies/stats`, `GET /studies`, `GET /files/stats/activity`

## Core Functions
- `service.studies.get_study_stats`
- `queries.useStudyStats`, `queries.useStudies`

## Canonical Files
- Pattern exemplar: `apps/web/src/components/dashboard/stats-cards.tsx`
- `apps/web/src/components/dashboard/recent-studies.tsx`, `upload-chart.tsx`

## Inputs
- none (reads aggregates from the bucket)

## Outputs
- Stat cards: total studies, segmented studies, imaging bytes landed, total artifacts on B2
- Recent Studies table (newest first, links to the study page)
- Bucket activity chart (daily object counts)

## Flow
- Dashboard mounts → `useStudyStats` and `useStudies` fetch aggregates
- `get_study_stats` scans `studies/` once: manifests → counts; object sizes → bytes
- Cards + recent-studies table render; the chart reads `/files/stats/activity`

## Edge Cases
- API unreachable → inline `ErrorState` with Retry (never renders misleading zeros)
- Empty bucket → zeros + an empty recent-studies state

## UX States
- Empty · Loading (skeletons + `LoadingNotice`) · Error

## Verification
- Test files: `services/api/tests/test_studies.py::test_study_stats`
- Focused verify command: `pnpm --filter @monai-dicom-segmentation/web test`
- Default pre-PR verify command: `pnpm verify`
- Pass criteria: stats reflect the studies in the bucket; failures surface inline

## Related Docs
- [README.md](../../README.md)
- [ARCHITECTURE.md](../../ARCHITECTURE.md)
- [docs/app-workflows.md](../app-workflows.md)
