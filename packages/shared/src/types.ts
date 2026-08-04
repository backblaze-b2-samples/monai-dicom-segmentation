export type FileStatus = "uploading" | "complete" | "error";

export interface FileMetadata {
  key: string;
  filename: string;
  folder: string;
  size_bytes: number;
  size_human: string;
  content_type: string;
  uploaded_at: string;
  url: string | null;
}

export interface FileMetadataDetail {
  filename: string;
  size_bytes: number;
  size_human: string;
  mime_type: string;
  extension: string;
  md5: string;
  sha256: string;
  uploaded_at: string;
  /** Set when a format-specific extractor was skipped or failed (e.g. an image
   *  above the decompression-bomb decode limit). Core fields stay exact. */
  metadata_warning: string | null;
  // Image-specific
  image_width: number | null;
  image_height: number | null;
  exif: Record<string, string> | null;
  // PDF-specific
  pdf_pages: number | null;
  pdf_author: string | null;
  pdf_title: string | null;
  // Audio/Video
  duration_seconds: number | null;
  codec: string | null;
  bitrate: number | null;
}

export interface FileUploadResponse {
  key: string;
  filename: string;
  size_bytes: number;
  size_human: string;
  content_type: string;
  uploaded_at: string;
  url: string | null;
  metadata: FileMetadataDetail | null;
}

export interface DailyUploadCount {
  date: string;
  uploads: number;
}

export interface UploadStats {
  total_files: number;
  total_size_bytes: number;
  total_size_human: string;
  uploads_today: number;
  total_downloads: number;
}

// --- Studies (imaging segmentation domain) --------------------------------

export type StudyStatus = "uploaded" | "processing" | "segmented" | "failed";
export type Modality = "CT" | "MR";
export type SourceFormat = "nifti" | "dicom_zip";

export interface LabelVolume {
  label: number;
  name: string;
  voxels: number;
  volume_ml: number;
}

export interface SegmentationResult {
  model: string;
  device: string;
  labels: LabelVolume[];
  mask_key: string;
  roi: [number, number, number];
}

export interface SliceInfo {
  kind: "volume" | "overlay";
  index: number;
  key: string;
}

export interface StudySummary {
  id: string;
  label: string;
  modality: Modality;
  model: string;
  status: StudyStatus;
  created_at: string;
  updated_at: string;
  source_filename: string;
  source_format: SourceFormat;
  size_bytes: number;
  size_human: string;
  num_volume_slices: number;
  num_overlay_slices: number;
  thumbnail_key: string | null;
  error: string | null;
}

export interface Study extends StudySummary {
  source_key: string;
  processed_key: string | null;
  mask_key: string | null;
  volume_slice_keys: string[];
  overlay_slice_keys: string[];
  spacing: number[] | null;
  shape: number[] | null;
  phi_tags_stripped: number;
  segmentation: SegmentationResult | null;
}

export interface StudyStats {
  total_studies: number;
  segmented_studies: number;
  source_bytes: number;
  source_bytes_human: string;
  total_objects: number;
  total_size_bytes: number;
  total_size_human: string;
}

export interface StudyModelOption {
  key: string;
  name: string;
  modality: Modality;
  description: string;
}

// Mirror of services/api/app/types/studies.py SEGMENTATION_MODELS. Finite,
// selectable set for the create/edit forms (never free text).
export const SEGMENTATION_MODELS: StudyModelOption[] = [
  {
    key: "spleen_ct_segmentation",
    name: "Spleen CT (UNet)",
    modality: "CT",
    description:
      "Single-organ spleen segmentation. Canonical MONAI demo; modest CPU cost.",
  },
  {
    key: "swin_unetr_btcv_segmentation",
    name: "Multi-organ CT (Swin UNETR, BTCV)",
    modality: "CT",
    description: "13 abdominal organs via Swin UNETR. Heavier on CPU.",
  },
];

export const MODALITY_OPTIONS: Modality[] = ["CT", "MR"];
export const DEFAULT_STUDY_MODEL = "spleen_ct_segmentation";
export const DEFAULT_STUDY_MODALITY: Modality = "CT";
