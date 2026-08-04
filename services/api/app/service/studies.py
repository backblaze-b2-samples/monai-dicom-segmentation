"""Study CRUD + segmentation orchestration over B2.

The `study.json` manifest under `studies/<id>/` is the source of truth. This
layer validates input, writes source + derived artifacts to B2 under the study's
own prefix, and is the ONLY place that composes repo I/O with the segmentation
pipeline. Heavy work is delegated to `service.segmentation` (lazy torch/monai).
"""

from __future__ import annotations

import logging
import re
import uuid
from datetime import UTC, datetime

from app.repo import (
    delete_prefix,
    get_object_bytes,
    get_presigned_url,
    list_prefix_objects,
    put_bytes,
)
from app.service import segmentation
from app.service.upload import sanitize_filename
from app.types.formatting import humanize_bytes
from app.types.studies import (
    SEGMENTATION_MODELS,
    LabelVolume,
    SegmentationResult,
    Study,
    StudyStats,
    StudySummary,
)

logger = logging.getLogger(__name__)

STUDIES_PREFIX = "studies/"
_ID_RE = re.compile(r"^[a-f0-9]{12,40}$")
_VALID_MODALITIES = {"CT", "MR"}
_VALID_SLICE_KINDS = {"volume", "overlay"}


class StudyValidationError(Exception):
    def __init__(self, detail: str):
        self.detail = detail
        super().__init__(detail)


class StudyNotFoundError(Exception):
    def __init__(self, detail: str = "Study not found"):
        self.detail = detail
        super().__init__(detail)


class StudyProcessingError(Exception):
    def __init__(self, detail: str):
        self.detail = detail
        super().__init__(detail)


def _manifest_key(study_id: str) -> str:
    return f"{STUDIES_PREFIX}{study_id}/study.json"


def _validate_id(study_id: str) -> None:
    if not _ID_RE.fullmatch(study_id or ""):
        raise StudyNotFoundError()


def _detect_source_format(filename: str) -> str:
    lower = filename.lower()
    if lower.endswith(".nii") or lower.endswith(".nii.gz"):
        return "nifti"
    if lower.endswith(".zip"):
        return "dicom_zip"
    raise StudyValidationError(
        "Unsupported file type. Upload a NIfTI volume (.nii/.nii.gz) or a .zip "
        "of DICOM (.dcm) files."
    )


def _source_content_type(source_format: str, filename: str) -> str:
    if source_format == "dicom_zip":
        return "application/zip"
    return "application/gzip" if filename.lower().endswith(".gz") else "application/octet-stream"


def _write_previews(study_id: str, pngs: list[bytes], stem: str) -> list[str]:
    keys: list[str] = []
    for index, png in enumerate(pngs):
        key = f"{STUDIES_PREFIX}{study_id}/preview/{stem}_{index:03d}.png"
        put_bytes(key, png, "image/png")
        keys.append(key)
    return keys


def _persist(study: Study) -> Study:
    put_bytes(
        _manifest_key(study.id),
        study.model_dump_json().encode("utf-8"),
        "application/json",
    )
    return study


def create_study(
    file_data: bytes, filename: str, label: str, modality: str, model: str
) -> Study:
    """Validate + land a new study: source + volume previews + manifest."""
    if not file_data:
        raise StudyValidationError("Uploaded file is empty")
    if modality not in _VALID_MODALITIES:
        raise StudyValidationError(f"Modality must be one of {sorted(_VALID_MODALITIES)}")
    if model not in SEGMENTATION_MODELS:
        raise StudyValidationError(f"Unknown model. Choose one of {list(SEGMENTATION_MODELS)}")

    source_format = _detect_source_format(filename)
    safe_name = sanitize_filename(filename)
    study_id = uuid.uuid4().hex
    now = datetime.now(UTC)

    source_key = f"{STUDIES_PREFIX}{study_id}/source/{safe_name}"
    put_bytes(source_key, file_data, _source_content_type(source_format, safe_name))

    # Render volume previews on ingest (no torch/monai — just nibabel/pydicom).
    previews, spacing, shape, phi_stripped = segmentation.ingest_previews(
        file_data, source_format
    )
    volume_slice_keys = _write_previews(study_id, previews, "vol")

    study = Study(
        id=study_id,
        label=label,
        modality=modality,  # type: ignore[arg-type]
        model=model,
        status="uploaded",
        created_at=now,
        updated_at=now,
        source_filename=safe_name,
        source_format=source_format,  # type: ignore[arg-type]
        size_bytes=len(file_data),
        size_human=humanize_bytes(len(file_data)),
        num_volume_slices=len(volume_slice_keys),
        num_overlay_slices=0,
        thumbnail_key=volume_slice_keys[0] if volume_slice_keys else None,
        source_key=source_key,
        volume_slice_keys=volume_slice_keys,
        spacing=spacing,
        shape=[int(v) for v in shape],
        phi_tags_stripped=phi_stripped,
    )
    logger.info(
        "Study created: id=%s format=%s slices=%d phi_stripped=%d",
        study_id, source_format, len(volume_slice_keys), phi_stripped,
    )
    return _persist(study)


def list_studies() -> list[StudySummary]:
    """Scan `studies/*/study.json` and return summaries, newest first."""
    summaries: list[StudySummary] = []
    for obj in list_prefix_objects(STUDIES_PREFIX):
        if not obj["Key"].endswith("/study.json"):
            continue
        try:
            summaries.append(
                StudySummary.model_validate_json(get_object_bytes(obj["Key"]))
            )
        except Exception:
            logger.warning("Skipping unreadable manifest: %s", obj["Key"])
    summaries.sort(key=lambda s: s.created_at, reverse=True)
    return summaries


def get_study(study_id: str) -> Study:
    _validate_id(study_id)
    try:
        data = get_object_bytes(_manifest_key(study_id))
    except RuntimeError as e:
        raise StudyNotFoundError() from e
    return Study.model_validate_json(data)


def update_study(study_id: str, label: str | None, model: str | None) -> Study:
    study = get_study(study_id)
    if label is not None:
        study.label = label
    if model is not None:
        if model not in SEGMENTATION_MODELS:
            raise StudyValidationError(
                f"Unknown model. Choose one of {list(SEGMENTATION_MODELS)}"
            )
        study.model = model
    study.updated_at = datetime.now(UTC)
    return _persist(study)


def delete_study(study_id: str) -> None:
    """Delete every object under `studies/<id>/` — SCOPED, never bucket-wide."""
    _validate_id(study_id)
    deleted = delete_prefix(f"{STUDIES_PREFIX}{study_id}/")
    logger.info("Study deleted: id=%s objects=%d", study_id, deleted)


def run_segmentation(study_id: str) -> Study:
    """Run the MONAI pipeline for a study and persist the derived artifacts."""
    study = get_study(study_id)
    study.status = "processing"
    study.updated_at = datetime.now(UTC)
    study.error = None
    _persist(study)

    try:
        source = get_object_bytes(study.source_key)
        result = segmentation.segment_volume(
            source, study.source_format, study.modality, study.model
        )
        base = f"{STUDIES_PREFIX}{study_id}"
        processed_key = f"{base}/processed/volume.nii.gz"
        mask_key = f"{base}/masks/segmentation.nii.gz"
        put_bytes(processed_key, result.processed_nifti, "application/gzip")
        put_bytes(mask_key, result.mask_nifti, "application/gzip")
        overlay_keys = _write_previews(study_id, result.overlay_pngs, "seg")

        study.status = "segmented"
        study.processed_key = processed_key
        study.mask_key = mask_key
        study.overlay_slice_keys = overlay_keys
        study.num_overlay_slices = len(overlay_keys)
        study.spacing = result.spacing
        study.shape = result.shape
        study.segmentation = SegmentationResult(
            model=study.model,
            device=result.device,
            mask_key=mask_key,
            roi=result.roi,
            labels=[LabelVolume(**label) for label in result.labels],
        )
        study.updated_at = datetime.now(UTC)
        logger.info(
            "Segmentation done: id=%s device=%s labels=%d",
            study_id, result.device, len(result.labels),
        )
        return _persist(study)
    except Exception as e:
        study.status = "failed"
        study.error = str(e)
        study.updated_at = datetime.now(UTC)
        _persist(study)
        logger.exception("Segmentation failed: id=%s", study_id)
        raise StudyProcessingError(str(e)) from e


def get_slice_url(study_id: str, kind: str, index: int) -> str:
    if kind not in _VALID_SLICE_KINDS:
        raise StudyValidationError(f"kind must be one of {sorted(_VALID_SLICE_KINDS)}")
    study = get_study(study_id)
    keys = study.volume_slice_keys if kind == "volume" else study.overlay_slice_keys
    if index < 0 or index >= len(keys):
        raise StudyNotFoundError("Slice index out of range")
    return get_presigned_url(keys[index], disposition="inline")


def get_study_stats() -> StudyStats:
    summaries = list_studies()
    objects = list_prefix_objects(STUDIES_PREFIX)
    source_bytes = sum(o["Size"] for o in objects if "/source/" in o["Key"])
    total_bytes = sum(o["Size"] for o in objects)
    return StudyStats(
        total_studies=len(summaries),
        segmented_studies=sum(1 for s in summaries if s.status == "segmented"),
        source_bytes=source_bytes,
        source_bytes_human=humanize_bytes(source_bytes),
        total_objects=len(objects),
        total_size_bytes=total_bytes,
        total_size_human=humanize_bytes(total_bytes),
    )
