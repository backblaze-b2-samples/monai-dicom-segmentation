"""Study lifecycle HTTP routes.

Handlers stay thin: they translate service exceptions into HTTP status codes and
offload blocking work (B2 I/O, preview rendering, and the heavy MONAI pipeline)
to Starlette's threadpool so a slow segmentation never stalls the event loop —
same rationale as `runtime/files.py`.
"""

import logging

from fastapi import APIRouter, Form, HTTPException, UploadFile
from fastapi.concurrency import run_in_threadpool

from app.service.studies import (
    StudyNotFoundError,
    StudyProcessingError,
    StudyValidationError,
    create_study,
    delete_study,
    get_slice_url,
    get_study,
    get_study_stats,
    list_studies,
    run_segmentation,
    update_study,
)
from app.types.studies import (
    DEFAULT_MODALITY,
    DEFAULT_MODEL,
    Study,
    StudyStats,
    StudySummary,
    StudyUpdate,
)

logger = logging.getLogger(__name__)

router = APIRouter()

# SECURITY: these routes are intentionally UNAUTHENTICATED and single-tenant
# (see docs/SECURITY.md). Deletes are scoped to one study's prefix, but there is
# no per-user isolation — a multi-tenant clone must add auth AND scope studies to
# the caller. Do not point this at real PHI without both.

# Upload ceiling for imaging volumes. Volumes are large; keep this generous but
# bounded so a single request can't exhaust memory.
_MAX_UPLOAD_BYTES = 512 * 1024 * 1024  # 512 MB


@router.get("/studies", response_model=list[StudySummary])
def list_studies_endpoint():
    return list_studies()


@router.post("/studies", response_model=Study, status_code=201)
async def create_study_endpoint(
    file: UploadFile,
    label: str = Form(...),
    modality: str = Form(DEFAULT_MODALITY),
    model: str = Form(DEFAULT_MODEL),
):
    chunks: list[bytes] = []
    total = 0
    while True:
        chunk = await file.read(1024 * 1024)
        if not chunk:
            break
        total += len(chunk)
        if total > _MAX_UPLOAD_BYTES:
            raise HTTPException(status_code=413, detail="File too large")
        chunks.append(chunk)
    file_data = b"".join(chunks)

    try:
        return await run_in_threadpool(
            create_study,
            file_data=file_data,
            filename=file.filename or "",
            label=label,
            modality=modality,
            model=model,
        )
    except StudyValidationError as e:
        raise HTTPException(status_code=400, detail=e.detail) from None
    except RuntimeError:
        raise HTTPException(status_code=502, detail="Failed to write study to storage") from None


@router.get("/studies/stats", response_model=StudyStats)
def study_stats_endpoint():
    return get_study_stats()


@router.get("/studies/{study_id}", response_model=Study)
def get_study_endpoint(study_id: str):
    try:
        return get_study(study_id)
    except StudyNotFoundError as e:
        raise HTTPException(status_code=404, detail=e.detail) from None


@router.patch("/studies/{study_id}", response_model=Study)
def update_study_endpoint(study_id: str, body: StudyUpdate):
    try:
        return update_study(study_id, label=body.label, model=body.model)
    except StudyNotFoundError as e:
        raise HTTPException(status_code=404, detail=e.detail) from None
    except StudyValidationError as e:
        raise HTTPException(status_code=400, detail=e.detail) from None


@router.delete("/studies/{study_id}")
def delete_study_endpoint(study_id: str):
    try:
        delete_study(study_id)
    except StudyNotFoundError as e:
        raise HTTPException(status_code=404, detail=e.detail) from None
    except RuntimeError:
        raise HTTPException(status_code=502, detail="Failed to delete study") from None
    return {"deleted": True, "id": study_id}


@router.post("/studies/{study_id}/segment", response_model=Study)
async def segment_study_endpoint(study_id: str):
    try:
        # Long-running (bundle download + CPU inference): keep it off the loop.
        return await run_in_threadpool(run_segmentation, study_id)
    except StudyNotFoundError as e:
        raise HTTPException(status_code=404, detail=e.detail) from None
    except StudyProcessingError as e:
        raise HTTPException(status_code=500, detail=e.detail) from None


@router.get("/studies/{study_id}/slices/{kind}/{index}")
def study_slice_endpoint(study_id: str, kind: str, index: int):
    try:
        return {"url": get_slice_url(study_id, kind, index)}
    except StudyValidationError as e:
        raise HTTPException(status_code=400, detail=e.detail) from None
    except StudyNotFoundError as e:
        raise HTTPException(status_code=404, detail=e.detail) from None
