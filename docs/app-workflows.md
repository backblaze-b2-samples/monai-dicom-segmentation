<!-- last_verified: 2026-08-04 -->
# App Workflows

User journeys inside the application. The primary journey is the Study lifecycle;
the kept full-bucket file journeys follow.

## Ingest a Study

- User navigates to `/studies/new` (sidebar: **Ingest**)
- Drops or selects a NIfTI (`.nii`/`.nii.gz`) or a `.zip` of DICOM slices
- Chooses **modality** (CT/MR) and **model** (a finite Select of MONAI bundles);
  the create form surfaces safe defaults as description hints (default model
  `spleen_ct_segmentation`, modality CT) — guidance only, no autofill button
- On submit, the source lands in B2, DICOM PHI is stripped, and grayscale axial
  previews are rendered; the user is routed to the new study page (status `uploaded`)
- On failure: an error toast (e.g. unsupported file type)
- See: [Study Ingest](features/study-ingest.md)

## Run Segmentation & Review

- On `/studies/[id]`, the user clicks **Run segmentation**
- The study flips to `processing`; a banner explains the bundle download + on-device
  inference can take a few minutes on CPU, and the view polls itself
- When done, status becomes `segmented`: the slice viewer gains an **Overlay** toggle,
  and a stats table lists each structure's voxel count and physical volume (mL)
- The **slice viewer** scrubs axial slices (volume or mask overlay), each streamed
  from B2 via a short-lived presigned URL — credentials never reach the browser
- **Artifacts on B2** offers downloads of the source, processed volume, and mask
- On failure: status `failed` with the error surfaced in an alert
- See: [Segmentation](features/segmentation.md) · [Slice Viewer](features/slice-viewer.md)

## Manage Studies

- User navigates to `/studies` (sidebar: **Studies**) — the Library grid, scoped to
  the `studies/` prefix (distinct from the full-bucket `/files` browser)
- Each card shows a thumbnail, label, modality, model, and status, with an actions
  menu: view, run/re-run, **edit**, **delete**
- **Edit** (`/studies/[id]/edit`) pre-fills the label + model from the manifest
  (selectors, no default hints) and re-writes the manifest on save
- **Delete** confirms first, then removes only that study's `studies/<id>/` prefix
- See: [Study Library](features/study-library.md)

## View Dashboard

- User navigates to `/` (home)
- Stat cards show total studies, segmented studies, imaging bytes landed, and total
  artifacts on B2 (the write-amplification count)
- A Recent Studies table links each study to its page; a bucket-activity chart shows
  daily object counts
- Failures surface inline with Retry rather than misleading zeros
- See: [Dashboard](features/dashboard.md)

## Browse and Manage Files (kept full-bucket explorer)

- User navigates to `/files` — the non-removable full-bucket browser
- Loads the most recent objects (tree view, type icons); a notice states the cap if hit
- Clicking a file opens a preview with metadata + Download / Delete; the generic
  `/upload` page (reachable here and via ⌘K) adds raw files to the bucket
- See: [File Browser](features/file-browser.md)

## Change Preferences

- User navigates to `/settings`
- A banner states the page is mostly a demonstration: only Theme is wired for real
- Theme applies + persists (`next-themes`); the other fields persist to `localStorage`
  only and drive no behaviour
- See: [Settings](features/settings.md)
