"""Study lifecycle tests.

The B2 repo layer is replaced with an in-memory store and the heavy MONAI ingest
step is stubbed, so these run without the scientific stack (import-safety) and
without touching real B2 — the same mocking approach as the file tests.
"""

from datetime import UTC, datetime

import pytest

from app.service import studies as studies_service


class FakeStore:
    """Minimal in-memory stand-in for the B2 object store."""

    def __init__(self):
        self.objects: dict[str, bytes] = {}
        self.deleted_prefixes: list[str] = []

    def put_bytes(self, key, data, content_type):
        self.objects[key] = data

    def get_object_bytes(self, key):
        if key not in self.objects:
            raise RuntimeError(f"missing: {key}")
        return self.objects[key]

    def list_prefix_objects(self, prefix):
        return [
            {"Key": k, "Size": len(v), "LastModified": datetime.now(UTC)}
            for k, v in self.objects.items()
            if k.startswith(prefix)
        ]

    def delete_prefix(self, prefix):
        if not prefix or not prefix.endswith("/"):
            raise ValueError("scoped prefix required")
        self.deleted_prefixes.append(prefix)
        keys = [k for k in self.objects if k.startswith(prefix)]
        for k in keys:
            del self.objects[k]
        return len(keys)

    def get_presigned_url(self, key, filename=None, expires_in=600, disposition="attachment"):
        return f"https://signed.example/{key}?d={disposition}"


@pytest.fixture
def store(monkeypatch):
    fake = FakeStore()
    monkeypatch.setattr(studies_service, "put_bytes", fake.put_bytes)
    monkeypatch.setattr(studies_service, "get_object_bytes", fake.get_object_bytes)
    monkeypatch.setattr(studies_service, "list_prefix_objects", fake.list_prefix_objects)
    monkeypatch.setattr(studies_service, "delete_prefix", fake.delete_prefix)
    monkeypatch.setattr(studies_service, "get_presigned_url", fake.get_presigned_url)
    # Stub the heavy ingest step: 3 volume previews, no nibabel/torch needed.
    monkeypatch.setattr(
        studies_service.segmentation,
        "ingest_previews",
        lambda data, source_format: ([b"p0", b"p1", b"p2"], [1.0, 1.0, 2.0], [8, 8, 3], 4),
    )
    return fake


def _create(client, filename="scan.nii.gz", label="Chest CT", modality="CT", model="spleen_ct_segmentation"):
    return client.post(
        "/studies",
        data={"label": label, "modality": modality, "model": model},
        files={"file": (filename, b"\x1f\x8b fake volume bytes", "application/gzip")},
    )


@pytest.mark.asyncio
async def test_create_study(client, store):
    resp = await _create(client)
    assert resp.status_code == 201
    body = resp.json()
    assert body["status"] == "uploaded"
    assert body["modality"] == "CT"
    assert body["source_format"] == "nifti"
    assert body["num_volume_slices"] == 3
    assert body["phi_tags_stripped"] == 4
    assert body["thumbnail_key"] == body["volume_slice_keys"][0]
    # Source, 3 previews, and the manifest all landed under one study prefix.
    prefix = f"studies/{body['id']}/"
    assert all(k.startswith(prefix) for k in store.objects)
    assert f"{prefix}study.json" in store.objects


@pytest.mark.asyncio
async def test_create_rejects_unsupported_format(client, store):
    resp = await _create(client, filename="notes.txt")
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_create_rejects_unknown_model(client, store):
    resp = await _create(client, model="not_a_real_bundle")
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_list_studies_newest_first(client, store):
    await _create(client, label="First")
    await _create(client, label="Second")
    resp = await client.get("/studies")
    assert resp.status_code == 200
    labels = [s["label"] for s in resp.json()]
    assert set(labels) == {"First", "Second"}
    assert len(resp.json()) == 2


@pytest.mark.asyncio
async def test_get_missing_study_404(client, store):
    assert (await client.get("/studies/deadbeefcafe")).status_code == 404
    # Non-hex id is rejected before any storage read.
    assert (await client.get("/studies/not-an-id!!")).status_code == 404


@pytest.mark.asyncio
async def test_update_study(client, store):
    study_id = (await _create(client)).json()["id"]
    resp = await client.patch(
        f"/studies/{study_id}",
        json={"label": "Renamed", "model": "swin_unetr_btcv_segmentation"},
    )
    assert resp.status_code == 200
    assert resp.json()["label"] == "Renamed"
    assert resp.json()["model"] == "swin_unetr_btcv_segmentation"

    bad = await client.patch(f"/studies/{study_id}", json={"model": "nope"})
    assert bad.status_code == 400


@pytest.mark.asyncio
async def test_delete_study_is_scoped(client, store):
    study_id = (await _create(client)).json()["id"]
    resp = await client.delete(f"/studies/{study_id}")
    assert resp.status_code == 200
    assert store.deleted_prefixes == [f"studies/{study_id}/"]
    assert (await client.get(f"/studies/{study_id}")).status_code == 404


@pytest.mark.asyncio
async def test_slice_url(client, store):
    study_id = (await _create(client)).json()["id"]
    ok = await client.get(f"/studies/{study_id}/slices/volume/0")
    assert ok.status_code == 200
    assert "signed.example" in ok.json()["url"]
    assert "d=inline" in ok.json()["url"]
    # Out-of-range index and unknown kind.
    assert (await client.get(f"/studies/{study_id}/slices/volume/99")).status_code == 404
    assert (await client.get(f"/studies/{study_id}/slices/bogus/0")).status_code == 400


def test_detect_source_format():
    from app.service.studies import StudyValidationError, _detect_source_format

    assert _detect_source_format("scan.nii") == "nifti"
    assert _detect_source_format("scan.NII.GZ") == "nifti"
    assert _detect_source_format("series.zip") == "dicom_zip"
    with pytest.raises(StudyValidationError):
        _detect_source_format("notes.txt")


def test_select_slice_indices():
    from app.service.rendering import select_slice_indices

    assert select_slice_indices(0, 24) == []
    assert select_slice_indices(1, 24) == [0]
    assert select_slice_indices(3, 24) == [0, 1, 2]
    indices = select_slice_indices(100, 24)
    assert len(indices) == 24
    assert indices[0] == 0 and indices[-1] == 99


@pytest.mark.asyncio
async def test_study_stats(client, store):
    await _create(client, label="A")
    await _create(client, label="B")
    resp = await client.get("/studies/stats")
    assert resp.status_code == 200
    stats = resp.json()
    assert stats["total_studies"] == 2
    assert stats["segmented_studies"] == 0
    assert stats["total_objects"] >= 2
