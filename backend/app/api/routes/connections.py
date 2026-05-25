from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.models.connection import TrinoConnectionRequest, TrinoConnectionResponse
from app.db.database import get_db
from app.services import connection_store, trino_service, metadata_service, redis_cache

router = APIRouter()

@router.post("/test-connection")
def test_connection(conn_req: TrinoConnectionRequest):
    """
    Performs Trino endpoint validation:
      1. Verify Trino is reachable (SELECT 1)
      2. Verify catalogs are discoverable (SHOW CATALOGS)
      3. Validate optional active catalog/schema metadata scope

    Returns detailed step-by-step results without saving the connection.
    """
    result = trino_service.validate_connection(conn_req)
    if not result["success"]:
        # Return 400 with full validation details so frontend can show them
        raise HTTPException(
            status_code=400,
            detail={
                "message": result["error"],
                "steps": result["steps"],
                "schemas": result.get("schemas", []),
            }
        )
    return {
        "status": "success",
        "message": f"Connection validated. Discovered {len(result.get('catalogs', []))} catalog(s).",
        "steps": result["steps"],
        "tables": result["tables"],
        "catalogs": result.get("catalogs", []),
        "schemas": result["schemas"],
    }


@router.post("/connect", response_model=dict)
def connect(conn_req: TrinoConnectionRequest, db: Session = Depends(get_db)):
    """
    Full connect workflow:
      1. Validate connection (same as /test-connection)
      2. Save as active connection
      3. Clear old selected scope and metadata
      4. Return connection info

    If validation fails, nothing is saved and old metadata is cleared.
    """
    # Step 1: Validate
    result = trino_service.validate_connection(conn_req)
    if not result["success"]:
        # Clear any stale metadata on failed connection
        redis_cache.clear_metadata()
        redis_cache.clear_selected_sources()
        raise HTTPException(
            status_code=400,
            detail={
                "message": result["error"],
                "steps": result["steps"],
                "schemas": result.get("schemas", []),
            }
        )

    # Step 2: Save active connection
    try:
        active_conn = connection_store.save_active_connection(db, conn_req)
    except Exception as e:
        raise HTTPException(status_code=500, detail={"message": f"Failed to save connection: {str(e)}", "steps": result["steps"]})

    # Step 3: New connection requires an explicit AI context selection.
    redis_cache.clear_metadata()
    redis_cache.clear_selected_sources()

    # Step 4: Return everything
    return {
        "status": "success",
        "message": "Connected. Choose data sources for AI context before querying.",
        "connection": TrinoConnectionResponse.model_validate(active_conn).model_dump(),
        "steps": result["steps"],
    }


@router.post("/disconnect")
def disconnect(db: Session = Depends(get_db)):
    """
    Disconnects: deactivates all connections and clears cached metadata.
    """
    from app.models.connection import ConnectionRecord
    db.query(ConnectionRecord).update({"is_active": False})
    db.commit()
    redis_cache.clear_metadata()
    redis_cache.clear_selected_sources()
    return {"status": "success", "message": "Disconnected. Metadata cache cleared."}


@router.post("/save-connection", response_model=TrinoConnectionResponse)
def save_connection(conn_req: TrinoConnectionRequest, db: Session = Depends(get_db)):
    """
    Tests the connection and, if successful, saves it as the active connection.
    """
    try:
        # Verify connection first
        trino_service.test_connection(conn_req)
        
        # Save securely
        active_conn = connection_store.save_active_connection(db, conn_req)
        redis_cache.clear_metadata()
        redis_cache.clear_selected_sources()
        return active_conn
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to save connection: {str(e)}")

@router.get("/active-connection", response_model=TrinoConnectionResponse)
def get_active_connection(db: Session = Depends(get_db)):
    """
    Retrieves the currently active connection. Does not return the password.
    """
    active_conn = connection_store.get_active_connection(db)
    if not active_conn:
        raise HTTPException(status_code=404, detail="No active connection found.")
    return active_conn
