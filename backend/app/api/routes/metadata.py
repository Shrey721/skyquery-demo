from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.db.database import get_db
from app.models.metadata import GlobalMetadata, SelectedSourcesRequest, SourceDiscoveryResponse
from app.services import metadata_service

router = APIRouter()

@router.get("/discover-sources", response_model=SourceDiscoveryResponse)
def discover_sources(db: Session = Depends(get_db)):
    """
    Discovers catalog -> schema -> table names for the source picker.
    Does not cache LLM schema metadata.
    """
    try:
        return metadata_service.discover_sources(db)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/selected-sources")
def save_selected_sources(request: SelectedSourcesRequest, db: Session = Depends(get_db)):
    """
    Persists the selected AI context scope and clears old schema metadata.
    """
    try:
        selected_sources = metadata_service.save_selected_sources(request, db)
        return {"selected_sources": [source.model_dump(by_alias=True) for source in selected_sources]}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/selected-sources")
def get_selected_sources():
    selected_sources = metadata_service.get_selected_sources()
    if selected_sources is None:
        raise HTTPException(status_code=404, detail="No selected data source scope found. Choose data sources first.")
    return {"selected_sources": [source.model_dump(by_alias=True) for source in selected_sources]}


@router.post("/refresh-selected-context", response_model=GlobalMetadata)
def refresh_selected_context(db: Session = Depends(get_db)):
    """
    Builds compact schema metadata only for selected tables and caches it.
    """
    try:
        return metadata_service.buildSelectedSchemaContext(db)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/discover", response_model=GlobalMetadata)
def discover_metadata(db: Session = Depends(get_db)):
    """
    Compatibility endpoint: refreshes metadata only for the saved source scope.
    """
    try:
        return metadata_service.buildSelectedSchemaContext(db)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/schema", response_model=GlobalMetadata)
def get_schema():
    """
    Returns cached metadata for the selected source scope.
    """
    if metadata_service.get_selected_sources() is None:
        raise HTTPException(status_code=404, detail="Choose data sources for AI context before querying.")

    cached = metadata_service.get_cached_metadata()
    if not cached:
        raise HTTPException(status_code=404, detail="Selected schema context not found. Save a source selection and refresh context first.")
    return cached

@router.post("/refresh", response_model=GlobalMetadata)
def refresh_metadata(db: Session = Depends(get_db)):
    """
    Compatibility endpoint: refreshes metadata only for the saved source scope.
    """
    try:
        return metadata_service.buildSelectedSchemaContext(db)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
