<!-- last_verified: 2026-08-04 -->
# Feature: Slice Viewer

## Purpose
Review a study by scrubbing through server-rendered axial slices — volume grayscale and mask overlay — streamed from B2 presigned URLs.

## Used By
- UI: `/studies/[id]` — `apps/web/src/components/studies/slice-viewer.tsx`
- API: `GET /studies/{study_id}/slices/{kind}/{index}` (`kind` ∈ `volume` | `overlay`)

## Core Functions
- `service.studies.get_slice_url` (presigned inline URL for a preview PNG)
- `queries.useSliceUrl`

## Canonical Files
- Pattern exemplar: `apps/web/src/components/studies/slice-viewer.tsx`

## Inputs
- study_id, kind (`volume` | `overlay`), index (0-based)

## Outputs
- `{ url }` — a short-lived presigned GET URL (Content-Disposition inline) for the slice PNG

## Flow
- Viewer picks kind + slice index; `useSliceUrl` fetches the presigned URL
- The browser loads the PNG straight from B2 (credentials never leave the server)
- Slider scrubs slices; the volume/overlay toggle switches sets (overlay enabled only when segmented)

## Edge Cases
- Index out of range → 404
- Unknown kind → 400
- No overlay yet → toggle disabled with a hint to run segmentation
- Index clamped at render when switching to a smaller set (no out-of-range fetch)

## UX States
- Empty (no previews) · Loading (spinner) · Loaded (image + slider) · Error

## Verification
- Test files: `services/api/tests/test_studies.py::test_slice_url`
- Default pre-PR verify command: `pnpm verify`
- Pass criteria: presigned inline URLs returned; out-of-range/kind errors mapped

## Related Docs
- [README.md](../../README.md)
- [ARCHITECTURE.md](../../ARCHITECTURE.md)
- [docs/app-workflows.md](../app-workflows.md)
