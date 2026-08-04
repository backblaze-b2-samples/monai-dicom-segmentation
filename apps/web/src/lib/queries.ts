"use client";

import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import {
  ApiError,
  createStudy,
  deleteFile,
  deleteStudy,
  getDownloadUrl,
  getFileDetail,
  getFiles,
  getFileStats,
  getHealth,
  getPreviewUrl,
  getSliceUrl,
  getStudies,
  getStudy,
  getStudyStats,
  getUploadActivity,
  runSegmentation,
  updateStudy,
} from "@/lib/api-client";
import type {
  FileMetadata,
  FileMetadataDetail,
  Study,
  StudyStats,
  StudySummary,
} from "@monai-dicom-segmentation/shared";

// Single source of truth for query keys. Keep these tightly scoped so that
// invalidating "files" doesn't blow away unrelated caches, and so an IDE
// "find usages" of `qk.files` reveals every consumer.
export const qk = {
  all: ["b2"] as const,
  files: (prefix?: string, limit?: number) =>
    [...qk.all, "files", prefix ?? "", limit ?? 100] as const,
  stats: () => [...qk.all, "stats"] as const,
  uploadActivity: (days: number) =>
    [...qk.all, "stats", "activity", days] as const,
  preview: (key: string) => [...qk.all, "preview", key] as const,
  detail: (key: string) => [...qk.all, "detail", key] as const,
  health: () => [...qk.all, "health"] as const,
  studies: () => [...qk.all, "studies"] as const,
  study: (id: string) => [...qk.all, "study", id] as const,
  studyStats: () => [...qk.all, "study-stats"] as const,
};

export type Health = Awaited<ReturnType<typeof getHealth>>;

/**
 * Gate a query on something being open/visible. Deliberately the only option we
 * expose, so callers can't drift the caching policy per call site — the ⌘K
 * palette reuses `useFiles`' key (and therefore its cache) instead of fetching
 * its own private, smaller list.
 */
export interface QueryGate {
  enabled?: boolean;
}

export function useFiles(prefix = "", limit = 100, { enabled = true }: QueryGate = {}) {
  return useQuery<FileMetadata[], ApiError>({
    queryKey: qk.files(prefix, limit),
    queryFn: () => getFiles(prefix, limit),
    enabled,
  });
}

export function useFileStats({ enabled = true }: QueryGate = {}) {
  return useQuery({
    queryKey: qk.stats(),
    queryFn: getFileStats,
    enabled,
  });
}

export function useUploadActivity(days = 7) {
  return useQuery({
    queryKey: qk.uploadActivity(days),
    queryFn: () => getUploadActivity(days),
  });
}

// Presigned preview URL — only fetched when `enabled` is true (e.g., when
// the dialog opens for a specific file). Kept short-lived (60s) because
// the URL itself has a presigned expiry and is cheap to regenerate.
export function usePreviewUrl(key: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: qk.preview(key ?? ""),
    queryFn: () => getPreviewUrl(key as string),
    enabled: enabled && !!key,
    staleTime: 60_000,
  });
}

// Rich metadata for an already-stored file. The server recomputes it on demand
// (a full object download), so it's only fetched when `enabled` — i.e. the
// preview dialog is open AND the user expands "Detailed metadata". Kept
// short-lived like the preview URL; cheap correctness under key overwrites.
export function useFileDetail(key: string | undefined, enabled: boolean) {
  return useQuery<FileMetadataDetail, ApiError>({
    queryKey: qk.detail(key ?? ""),
    queryFn: () => getFileDetail(key as string),
    enabled: enabled && !!key,
    staleTime: 60_000,
  });
}

// Health poll for the top-of-app B2 banner. `retry: false` and letting a
// failed fetch leave `data` undefined keeps a down API silent (the
// per-component ErrorState covers that); the banner only reacts to an up API
// reporting b2_connected: false. Polls every 60s and on window focus.
export function useHealth() {
  return useQuery<Health>({
    queryKey: qk.health(),
    queryFn: getHealth,
    refetchInterval: 60_000,
    staleTime: 30_000,
    retry: false,
  });
}

/**
 * Drop a deleted object from every cached file list, plus its own cached
 * preview/detail entries.
 *
 * Invalidation alone is not enough: the refetch re-lists the whole bucket and
 * took 5-6s in practice, so the success toast fired while the row was still
 * listed — and using that stale row's Preview 404'd. Editing the cache makes
 * the row disappear with the toast; the invalidation that follows still
 * reconciles against the server.
 *
 * Exported for tests — the mutation below is its only production caller.
 */
export function dropDeletedFileFromCache(qc: QueryClient, fileKey: string) {
  qc.setQueriesData<FileMetadata[]>(
    // Partial key: matches qk.files(prefix, limit) for every prefix/limit.
    { queryKey: [...qk.all, "files"] },
    (previous) =>
      previous ? previous.filter((file) => file.key !== fileKey) : previous,
  );
  // A presigned URL for a deleted key can only 404 now.
  qc.removeQueries({ queryKey: qk.preview(fileKey) });
  qc.removeQueries({ queryKey: qk.detail(fileKey) });
}

/**
 * Fetch a download URL for one file.
 *
 * A mutation, not a query: it has a server side effect (it bumps the download
 * counter) and it must never be cached or replayed. Being a mutation is also
 * what gives the UI an honest pending state — the old code awaited the presign
 * inside a plain click handler, so a slow round trip left the screen completely
 * unchanged and a user could not tell a working download from a dead button.
 *
 * The caller performs the navigation (see `lib/browser-download.ts`) and gets
 * `isPending` / `variables` for the pending row.
 */
export function useDownloadUrl() {
  const qc = useQueryClient();
  return useMutation<{ url: string }, ApiError, FileMetadata>({
    mutationFn: (file) => getDownloadUrl(file.key),
    // The server counted a download, so the dashboard's "Total Downloads" is
    // now stale. Cheap: /files/stats reads a cached bucket listing.
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.stats() }),
  });
}

export function useDeleteFile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (fileKey: string) => deleteFile(fileKey),
    onSuccess: (_data, fileKey) => {
      // Remove the row immediately, then reconcile everything (lists, stats,
      // activity) against the server in the background.
      dropDeletedFileFromCache(qc, fileKey);
      qc.invalidateQueries({ queryKey: qk.all });
    },
  });
}

// --- Studies ---------------------------------------------------------------

// Poll while any study is mid-pipeline so the Library reflects a run started
// elsewhere (or from the detail page) without a manual refresh.
export function useStudies() {
  return useQuery<StudySummary[], ApiError>({
    queryKey: qk.studies(),
    queryFn: getStudies,
    refetchInterval: (query) =>
      query.state.data?.some((s) => s.status === "processing") ? 4000 : false,
  });
}

// One study. Polls while it is `processing` so the detail view flips to
// `segmented`/`failed` on its own when the run finishes.
export function useStudy(id: string | undefined, { enabled = true }: QueryGate = {}) {
  return useQuery<Study, ApiError>({
    queryKey: qk.study(id ?? ""),
    queryFn: () => getStudy(id as string),
    enabled: enabled && !!id,
    refetchInterval: (query) =>
      query.state.data?.status === "processing" ? 3000 : false,
  });
}

// Presigned inline URL for one preview slice PNG, keyed by (id, kind, index).
// Kept short-lived like the file preview URL; the presigned link outlives it.
export function useSliceUrl(
  id: string,
  kind: "volume" | "overlay",
  index: number,
  { enabled = true }: QueryGate = {}
) {
  return useQuery<{ url: string }, ApiError>({
    queryKey: [...qk.study(id), "slice", kind, index],
    queryFn: () => getSliceUrl(id, kind, index),
    enabled: enabled && !!id && index >= 0,
    staleTime: 4 * 60_000,
  });
}

export function useStudyStats({ enabled = true }: QueryGate = {}) {
  return useQuery<StudyStats, ApiError>({
    queryKey: qk.studyStats(),
    queryFn: getStudyStats,
    enabled,
  });
}

export function useCreateStudy() {
  const qc = useQueryClient();
  return useMutation<
    Study,
    ApiError,
    { file: File; label: string; modality: string; model: string }
  >({
    mutationFn: createStudy,
    onSuccess: (study) => {
      qc.setQueryData(qk.study(study.id), study);
      qc.invalidateQueries({ queryKey: qk.studies() });
      qc.invalidateQueries({ queryKey: qk.studyStats() });
    },
  });
}

export function useUpdateStudy() {
  const qc = useQueryClient();
  return useMutation<
    Study,
    ApiError,
    { id: string; label?: string; model?: string }
  >({
    mutationFn: ({ id, label, model }) => updateStudy(id, { label, model }),
    onSuccess: (study) => {
      qc.setQueryData(qk.study(study.id), study);
      qc.invalidateQueries({ queryKey: qk.studies() });
    },
  });
}

export function useDeleteStudy() {
  const qc = useQueryClient();
  return useMutation<{ deleted: boolean; id: string }, ApiError, string>({
    mutationFn: (id) => deleteStudy(id),
    onSuccess: (_data, id) => {
      qc.removeQueries({ queryKey: qk.study(id) });
      qc.invalidateQueries({ queryKey: qk.studies() });
      qc.invalidateQueries({ queryKey: qk.studyStats() });
    },
  });
}

export function useRunSegmentation() {
  const qc = useQueryClient();
  return useMutation<Study, ApiError, string>({
    mutationFn: (id) => runSegmentation(id),
    onSuccess: (study) => {
      qc.setQueryData(qk.study(study.id), study);
      qc.invalidateQueries({ queryKey: qk.studies() });
      qc.invalidateQueries({ queryKey: qk.studyStats() });
    },
  });
}
