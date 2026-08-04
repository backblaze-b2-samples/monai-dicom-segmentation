"""Load imaging volumes (NIfTI + zipped DICOM) and de-identify DICOM PHI.

Split out of `service/segmentation.py` to keep that file under the 300-line
structural limit (mirrors how `repo/b2_object.py` was split from
`repo/b2_client.py`). No MONAI here — this is I/O + PHI stripping only. Every
heavy import (nibabel, pydicom, numpy) is LAZY so the module stays import-safe
without the scientific stack.
"""

from __future__ import annotations

import io
import os
import zipfile
from dataclasses import dataclass

# DICOM tags that carry protected health information (PHI). Cleared before any
# derived artifact is written; private tags are dropped wholesale.
_PHI_KEYWORDS = [
    "PatientName", "PatientID", "PatientBirthDate", "PatientSex", "PatientAge",
    "OtherPatientIDs", "OtherPatientNames", "ReferringPhysicianName",
    "InstitutionName", "InstitutionAddress", "AccessionNumber", "StudyID",
    "PerformingPhysicianName", "OperatorsName", "PatientAddress",
]


@dataclass
class LoadedVolume:
    volume: object      # numpy.ndarray (H, W, D), float32
    affine: object      # numpy.ndarray (4, 4)
    spacing: tuple      # (sx, sy, sz) in mm
    phi_tags_stripped: int = 0


def load_volume(data: bytes, source_format: str) -> LoadedVolume:
    if source_format == "nifti":
        return _load_nifti(data)
    if source_format == "dicom_zip":
        return _load_dicom_zip(data)
    raise ValueError(f"Unsupported source format: {source_format!r}")


def _ensure_3d(volume):
    import numpy as np

    arr = np.asarray(volume, dtype=np.float32)
    if arr.ndim == 4:
        arr = arr[..., 0]
    if arr.ndim == 2:
        arr = arr[..., np.newaxis]
    return arr


def _load_nifti(data: bytes) -> LoadedVolume:
    import tempfile

    import nibabel as nib
    import numpy as np

    suffix = ".nii.gz" if data[:2] == b"\x1f\x8b" else ".nii"
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(data)
        path = tmp.name
    try:
        img = nib.as_closest_canonical(nib.load(path))
        volume = _ensure_3d(np.asarray(img.get_fdata(dtype=np.float32)))
        zooms = img.header.get_zooms()[:3]
        spacing = tuple(float(z) for z in zooms) if len(zooms) == 3 else (1.0, 1.0, 1.0)
        affine = np.asarray(img.affine, dtype=np.float32)
    finally:
        os.unlink(path)
    return LoadedVolume(volume, affine, spacing, 0)


def _deidentify(ds) -> int:
    """Clear known PHI tags + drop private tags in place. Returns tags cleared."""
    cleared = 0
    for keyword in _PHI_KEYWORDS:
        if keyword in ds:
            if ds.get(keyword) not in (None, ""):
                cleared += 1
            try:
                ds[keyword].value = ""
            except Exception:
                del ds[keyword]
    before = len(list(ds))
    ds.remove_private_tags()
    cleared += max(0, before - len(list(ds)))
    return cleared


def _slice_position(ds) -> float:
    ipp = getattr(ds, "ImagePositionPatient", None)
    if ipp is not None:
        try:
            return float(ipp[2])
        except (TypeError, ValueError, IndexError):
            pass
    return float(getattr(ds, "InstanceNumber", 0) or 0)


def _rescaled_slice(ds):
    import numpy as np

    arr = ds.pixel_array.astype(np.float32)
    slope = float(getattr(ds, "RescaleSlope", 1.0) or 1.0)
    intercept = float(getattr(ds, "RescaleIntercept", 0.0) or 0.0)
    return arr * slope + intercept


def _load_dicom_zip(data: bytes) -> LoadedVolume:
    import numpy as np
    import pydicom

    phi_stripped = 0
    datasets = []
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        for name in archive.namelist():
            if name.endswith("/"):
                continue
            try:
                ds = pydicom.dcmread(io.BytesIO(archive.read(name)), force=True)
            except Exception:
                continue
            if "PixelData" not in ds:
                continue
            phi_stripped += _deidentify(ds)
            datasets.append(ds)
    if not datasets:
        raise ValueError("No readable DICOM image slices found in the archive")

    datasets.sort(key=_slice_position)
    volume = np.stack([_rescaled_slice(ds) for ds in datasets], axis=-1).astype(
        np.float32
    )
    first = datasets[0]
    pixel_spacing = getattr(first, "PixelSpacing", [1.0, 1.0])
    thickness = float(getattr(first, "SliceThickness", 1.0) or 1.0)
    spacing = (float(pixel_spacing[0]), float(pixel_spacing[1]), thickness)
    affine = np.diag([spacing[0], spacing[1], spacing[2], 1.0]).astype(np.float32)
    return LoadedVolume(volume, affine, spacing, phi_stripped)
