"""Domain models for imaging Studies.

A Study is one imaging volume plus its processing lifecycle. The canonical
record is the `study.json` manifest stored in B2 under `studies/<id>/`; these
models are the (de)serialization contract for it and for the HTTP API.

This module is import-safe: it pulls in no heavy scientific stack (torch, monai,
nibabel, pydicom). Those live only inside functions in `service/segmentation.py`.
"""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

# Lifecycle states. `uploaded` (source landed + volume previews rendered) ->
# `processing` (segmentation running) -> `segmented` (mask + overlays written) |
# `failed` (pipeline error; `error` explains).
StudyStatus = Literal["uploaded", "processing", "segmented", "failed"]

Modality = Literal["CT", "MR"]

# Accepted upload container formats.
SourceFormat = Literal["nifti", "dicom_zip"]

# --- Finite, selectable MONAI zoo bundles ---------------------------------
# The create/edit forms render this as a Select (finite options), never free
# text. Each entry is a real bundle on the MONAI model zoo; the CT intensity
# window (a_min/a_max) and sliding-window ROI come from the bundle's own
# published inference config. Keep this list in sync with
# `packages/shared/src/types.ts` SEGMENTATION_MODELS.


class ModelInfo(BaseModel):
    key: str
    name: str
    modality: Modality
    description: str
    roi: tuple[int, int, int]
    a_min: float
    a_max: float


SEGMENTATION_MODELS: dict[str, ModelInfo] = {
    "spleen_ct_segmentation": ModelInfo(
        key="spleen_ct_segmentation",
        name="Spleen CT (UNet)",
        modality="CT",
        description="Single-organ spleen segmentation. Canonical MONAI demo; "
        "modest CPU cost.",
        roi=(96, 96, 96),
        a_min=-57.0,
        a_max=164.0,
    ),
    "swin_unetr_btcv_segmentation": ModelInfo(
        key="swin_unetr_btcv_segmentation",
        name="Multi-organ CT (Swin UNETR, BTCV)",
        modality="CT",
        description="13 abdominal organs via Swin UNETR. Heavier on CPU.",
        roi=(96, 96, 96),
        a_min=-175.0,
        a_max=250.0,
    ),
}

DEFAULT_MODEL = "spleen_ct_segmentation"
DEFAULT_MODALITY: Modality = "CT"

# Max evenly-spaced axial slices rendered per preview set (volume + overlay).
MAX_PREVIEW_SLICES = 24


class LabelVolume(BaseModel):
    """Physical volume of one segmented label."""

    label: int
    name: str
    voxels: int
    volume_ml: float


class SegmentationResult(BaseModel):
    """Outcome of one segmentation run, embedded in the manifest."""

    model: str
    device: str
    labels: list[LabelVolume]
    mask_key: str
    roi: tuple[int, int, int]


class SliceInfo(BaseModel):
    kind: Literal["volume", "overlay"]
    index: int
    key: str


class StudyCreate(BaseModel):
    """Form fields for creating a study (the file is a separate multipart part)."""

    label: str = Field(min_length=1, max_length=120)
    modality: Modality = DEFAULT_MODALITY
    model: str = DEFAULT_MODEL


class StudyUpdate(BaseModel):
    """Editable metadata. Both fields optional; only provided ones change."""

    label: str | None = Field(default=None, min_length=1, max_length=120)
    model: str | None = None


class StudySummary(BaseModel):
    """Compact record for the Library grid (one per study.json)."""

    id: str
    label: str
    modality: Modality
    model: str
    status: StudyStatus
    created_at: datetime
    updated_at: datetime
    source_filename: str
    source_format: SourceFormat
    size_bytes: int
    size_human: str
    num_volume_slices: int
    num_overlay_slices: int
    thumbnail_key: str | None = None
    error: str | None = None


class StudyStats(BaseModel):
    """Dashboard aggregates over the `studies/` prefix."""

    total_studies: int
    segmented_studies: int
    # Source imaging bytes landed (the raw volumes), separate from derived data.
    source_bytes: int
    source_bytes_human: str
    # Every object under studies/ — surfaces the write-amplification story:
    # one source fans out into processed + mask + N previews + manifest.
    total_objects: int
    total_size_bytes: int
    total_size_human: str


class Study(StudySummary):
    """Full manifest — the source of truth persisted as `study.json`."""

    source_key: str
    processed_key: str | None = None
    mask_key: str | None = None
    volume_slice_keys: list[str] = Field(default_factory=list)
    overlay_slice_keys: list[str] = Field(default_factory=list)
    spacing: list[float] | None = None
    shape: list[int] | None = None
    phi_tags_stripped: int = 0
    segmentation: SegmentationResult | None = None
