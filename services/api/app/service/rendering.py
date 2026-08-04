"""Render axial slices of a volume (and a mask overlay) to PNG bytes.

Uses only numpy + Pillow (no matplotlib). Every heavy import is done lazily
inside a function so the API and test collection stay import-safe without the
scientific stack installed — see AGENTS.md / the build plan.
"""

from __future__ import annotations

import io

# Distinct RGB colors for label ids 1..N (id 0 = background, never tinted).
_PALETTE = [
    (239, 68, 68),   # red
    (34, 197, 94),   # green
    (59, 130, 246),  # blue
    (234, 179, 8),   # amber
    (168, 85, 247),  # purple
    (20, 184, 166),  # teal
    (249, 115, 22),  # orange
    (236, 72, 153),  # pink
]


def select_slice_indices(depth: int, max_n: int) -> list[int]:
    """Evenly spaced axial indices across `depth`, at most `max_n` of them."""
    if depth <= 0:
        return []
    n = min(max_n, depth)
    if n == 1:
        return [depth // 2]
    step = (depth - 1) / (n - 1)
    return [round(i * step) for i in range(n)]


def _to_uint8(slice2d):
    """Percentile-normalize a 2D float slice to 0-255 uint8 for display.

    Percentiles (not min/max) keep a few extreme voxels from washing out CT/MR
    contrast. Oriented for radiological display (rot90).
    """
    import numpy as np

    arr = np.asarray(slice2d, dtype=np.float32)
    lo, hi = np.percentile(arr, 1.0), np.percentile(arr, 99.0)
    if hi <= lo:
        hi = lo + 1.0
    arr = np.clip((arr - lo) / (hi - lo), 0.0, 1.0)
    return np.rot90((arr * 255.0).astype(np.uint8))


def _png_bytes(image) -> bytes:
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


def volume_slice_png(slice2d) -> bytes:
    """Grayscale PNG of one volume slice."""
    from PIL import Image

    return _png_bytes(Image.fromarray(_to_uint8(slice2d), mode="L"))


def overlay_slice_png(slice2d, mask2d, alpha: float = 0.45) -> bytes:
    """RGB PNG: grayscale volume slice with colored label overlay."""
    import numpy as np
    from PIL import Image

    gray = _to_uint8(slice2d)
    rgb = np.stack([gray, gray, gray], axis=-1).astype(np.float32)
    labels = np.rot90(np.asarray(mask2d))
    for label_id in np.unique(labels):
        if label_id <= 0:
            continue
        color = _PALETTE[(int(label_id) - 1) % len(_PALETTE)]
        selector = labels == label_id
        rgb[selector] = (1 - alpha) * rgb[selector] + alpha * np.array(
            color, dtype=np.float32
        )
    out = np.clip(rgb, 0, 255).astype(np.uint8)
    return _png_bytes(Image.fromarray(out, mode="RGB"))


def render_volume_previews(volume, max_n: int) -> list[bytes]:
    """Grayscale PNGs for evenly spaced axial slices of `volume` (H, W, D)."""
    import numpy as np

    vol = np.asarray(volume)
    indices = select_slice_indices(vol.shape[-1], max_n)
    return [volume_slice_png(vol[:, :, k]) for k in indices]


def render_overlay_previews(volume, mask, max_n: int) -> list[bytes]:
    """Colored mask-overlay PNGs for evenly spaced axial slices."""
    import numpy as np

    vol = np.asarray(volume)
    labels = np.asarray(mask)
    indices = select_slice_indices(vol.shape[-1], max_n)
    return [overlay_slice_png(vol[:, :, k], labels[:, :, k]) for k in indices]
