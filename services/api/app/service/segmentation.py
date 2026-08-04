"""The MONAI segmentation pipeline.

ALL heavy scientific imports (torch, monai, nibabel, pydicom, numpy) are done
LAZILY inside functions so the FastAPI app and pytest collection load without
them. Never move these imports to module top level.

Pipeline: load + de-identify (see `service/volume_io.py`) -> normalize ->
segment (pretrained MONAI zoo bundle, sliding-window inference on the
auto-detected device) -> render.
"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass
from pathlib import Path

from app.service.rendering import render_overlay_previews, render_volume_previews
from app.service.volume_io import load_volume
from app.types.studies import MAX_PREVIEW_SLICES, SEGMENTATION_MODELS

# Bundle weights are cached here across runs (gitignored). Override with
# SEG_BUNDLE_DIR to share a warm cache between processes.
_API_ROOT = Path(__file__).resolve().parents[2]  # services/api
_BUNDLE_DIR = Path(os.getenv("SEG_BUNDLE_DIR", str(_API_ROOT / ".bundle_cache")))


@dataclass
class SegmentationOutput:
    processed_nifti: bytes
    mask_nifti: bytes
    overlay_pngs: list
    labels: list        # list[dict]: label, name, voxels, volume_ml
    spacing: list
    shape: list
    device: str
    roi: tuple


# --- Device selection (CUDA -> Apple MPS -> CPU; default CPU) --------------

def resolve_device(override: str | None = None) -> str:
    """Pick the inference device. Runtime auto-detect, never GPU-required.

    Preference order for `auto`: CUDA, then Apple MPS, then CPU. An explicit
    `cpu`/`cuda`/`mps` is honored but still falls back to CPU when unavailable,
    so this never hard-requires a GPU. Source: `override`, else `$SEG_DEVICE`.
    """
    import torch

    pref = (override or os.getenv("SEG_DEVICE", "auto") or "auto").lower()

    def has_cuda() -> bool:
        return bool(torch.cuda.is_available())

    def has_mps() -> bool:
        backend = getattr(torch.backends, "mps", None)
        return bool(backend and backend.is_available())

    if pref == "cpu":
        return "cpu"
    if pref == "cuda":
        return "cuda" if has_cuda() else "cpu"
    if pref == "mps":
        return "mps" if has_mps() else "cpu"
    # auto
    if has_cuda():
        return "cuda"
    if has_mps():
        return "mps"
    return "cpu"


# --- Normalize / bundle / segment ------------------------------------------

def _normalized(volume, modality: str, model_key: str):
    """Intensity-normalize to [0, 1]. CT windows to the bundle's HU range; MR
    z-normalizes on nonzero voxels then rescales."""
    import numpy as np

    info = SEGMENTATION_MODELS[model_key]
    arr = np.asarray(volume, dtype=np.float32)
    if modality == "CT":
        arr = np.clip(arr, info.a_min, info.a_max)
        arr = (arr - info.a_min) / (info.a_max - info.a_min)
    else:
        nonzero = arr[arr != 0]
        if nonzero.size:
            arr = (arr - float(nonzero.mean())) / (float(nonzero.std()) or 1.0)
        arr = np.clip(arr, -5.0, 5.0)
        span = float(np.ptp(arr)) or 1.0
        arr = (arr - float(arr.min())) / span
    return arr.astype(np.float32)


def _load_state(weights: Path, device: str):
    import torch

    try:
        state = torch.load(str(weights), map_location=device, weights_only=True)
    except Exception:
        state = torch.load(str(weights), map_location=device, weights_only=False)
    if isinstance(state, dict):
        for key in ("model", "state_dict", "network"):
            inner = state.get(key)
            if isinstance(inner, dict):
                state = inner
                break
    return {k.replace("module.", "", 1): v for k, v in state.items()}


def _label_names_from_metadata(meta_path: Path) -> dict[int, str]:
    try:
        meta = json.loads(meta_path.read_text(encoding="utf-8"))
        channel_def = meta["network_data_format"]["outputs"]["pred"]["channel_def"]
        return {int(k): str(v) for k, v in channel_def.items()}
    except Exception:
        return {}


def _load_bundle_network(model_key: str, device: str):
    from monai.bundle import download
    from monai.bundle.config_parser import ConfigParser

    _BUNDLE_DIR.mkdir(parents=True, exist_ok=True)
    root = _BUNDLE_DIR / model_key
    weights = root / "models" / "model.pt"
    if not weights.exists():
        download(name=model_key, bundle_dir=str(_BUNDLE_DIR), source="monaihosting")

    parser = ConfigParser()
    parser.read_config(str(root / "configs" / "inference.json"))
    parser["bundle_root"] = str(root)
    label_names = _label_names_from_metadata(root / "configs" / "metadata.json")

    network = None
    for key in ("network_def", "network"):
        try:
            network = parser.get_parsed_content(key, instantiate=True)
            break
        except Exception:
            network = None
    if network is None:
        raise RuntimeError(f"Could not build a network from bundle {model_key!r}")

    network.load_state_dict(_load_state(weights, device))
    network.to(device).eval()
    return network, label_names


def _label_volumes(mask, spacing, label_names: dict[int, str]) -> list[dict]:
    import numpy as np

    voxel_ml = (spacing[0] * spacing[1] * spacing[2]) / 1000.0
    out: list[dict] = []
    for label_id in sorted(int(v) for v in np.unique(mask)):
        if label_id == 0:
            continue
        voxels = int((mask == label_id).sum())
        out.append(
            {
                "label": label_id,
                "name": label_names.get(label_id, f"label_{label_id}"),
                "voxels": voxels,
                "volume_ml": round(voxels * voxel_ml, 2),
            }
        )
    return out


def _to_nifti_bytes(array, affine) -> bytes:
    import tempfile

    import nibabel as nib
    import numpy as np

    image = nib.Nifti1Image(np.asarray(array), np.asarray(affine, dtype=np.float32))
    with tempfile.NamedTemporaryFile(suffix=".nii.gz", delete=False) as tmp:
        path = tmp.name
    try:
        nib.save(image, path)
        return Path(path).read_bytes()
    finally:
        os.unlink(path)


# --- Public pipeline entry points -----------------------------------------

def ingest_previews(data: bytes, source_format: str):
    """Load a volume and render its grayscale axial previews (no torch/monai).

    Returns (png_bytes_list, spacing, shape, phi_tags_stripped).
    """
    loaded = load_volume(data, source_format)
    previews = render_volume_previews(loaded.volume, MAX_PREVIEW_SLICES)
    return previews, list(loaded.spacing), list(loaded.volume.shape), loaded.phi_tags_stripped


def segment_volume(
    data: bytes,
    source_format: str,
    modality: str,
    model_key: str,
    device_override: str | None = None,
) -> SegmentationOutput:
    """Run the full segmentation pipeline. Returns processed + mask NIfTI bytes,
    overlay PNGs, and per-label physical volumes."""
    import numpy as np
    import torch
    from monai.inferers import sliding_window_inference

    if model_key not in SEGMENTATION_MODELS:
        raise ValueError(f"Unknown segmentation model: {model_key!r}")

    info = SEGMENTATION_MODELS[model_key]
    loaded = load_volume(data, source_format)
    device = resolve_device(device_override)
    network, label_names = _load_bundle_network(model_key, device)

    normalized = _normalized(loaded.volume, modality, model_key)
    tensor = torch.from_numpy(normalized).unsqueeze(0).unsqueeze(0).float().to(device)
    with torch.no_grad():
        logits = sliding_window_inference(tensor, info.roi, 1, network, overlap=0.25)
    mask = logits.argmax(dim=1).squeeze(0).to("cpu").numpy().astype(np.int16)

    return SegmentationOutput(
        processed_nifti=_to_nifti_bytes(normalized, loaded.affine),
        mask_nifti=_to_nifti_bytes(mask, loaded.affine),
        overlay_pngs=render_overlay_previews(loaded.volume, mask, MAX_PREVIEW_SLICES),
        labels=_label_volumes(mask, loaded.spacing, label_names),
        spacing=list(loaded.spacing),
        shape=[int(v) for v in mask.shape],
        device=device,
        roi=info.roi,
    )
