from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.db.database import get_db
from app.models.metadata import GlobalMetadata
from app.services import metadata_service

router = APIRouter()

@router.post("/discover", response_model=GlobalMetadata)
def discover_metadata(db: Session = Depends(get_db)):
    """
    Performs full schema discovery and stores result in Redis.
    """
    try:
        return metadata_service.discover_and_cache_metadata(db)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/schema", response_model=GlobalMetadata)
def get_schema():
    """
    Returns cached metadata.
    """
    cached = metadata_service.get_cached_metadata()
    if not cached:
        raise HTTPException(status_code=404, detail="Schema metadata not found in cache. Please run /discover first.")
    return cached

@router.post("/refresh", response_model=GlobalMetadata)
def refresh_metadata(db: Session = Depends(get_db)):
    """
    Forces fresh discovery and replaces Redis cache.
    """
    try:
        return metadata_service.discover_and_cache_metadata(db)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
