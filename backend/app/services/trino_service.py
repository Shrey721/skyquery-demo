import trino
from trino.auth import BasicAuthentication
from app.models.connection import TrinoConnectionRequest


def quote_identifier(identifier: str) -> str:
    return '"' + str(identifier).replace('"', '""') + '"'


def qualified_name(*parts: str) -> str:
    return ".".join(quote_identifier(part) for part in parts if part)


def get_trino_connection(conn_req: TrinoConnectionRequest):
    auth = None
    if conn_req.password:
        auth = BasicAuthentication(conn_req.username, conn_req.password)
    
    http_scheme = "https" if conn_req.ssl_enabled else "http"
    
    connect_kwargs = {
        "host": conn_req.host,
        "port": conn_req.port,
        "user": conn_req.username,
        "auth": auth,
        "http_scheme": http_scheme,
    }
    if conn_req.default_catalog:
        connect_kwargs["catalog"] = conn_req.default_catalog
    if conn_req.default_schema:
        connect_kwargs["schema"] = conn_req.default_schema

    conn = trino.dbapi.connect(**connect_kwargs)
    return conn


def validate_connection(conn_req: TrinoConnectionRequest) -> dict:
    """
    Performs full JDBC-style connection validation against Trino.

    Steps:
        1. Verify Trino is reachable (SELECT 1)
        2. Verify catalogs are discoverable (SHOW CATALOGS)
        3. If provided, verify the default catalog/schema exist

    Returns a dict with:
        - success: bool
        - steps: list of {step, passed, detail} dicts
        - tables: list of table names (if all steps pass)
        - schemas: list of schema names in the catalog
        - error: str or None
    """
    steps = []
    catalogs = []
    schemas = []

    # Step 1: Verify Trino is reachable
    try:
        conn = get_trino_connection(conn_req)
        cur = conn.cursor()
        cur.execute("SELECT 1")
        result = cur.fetchone()
        if result and result[0] == 1:
            steps.append({"step": "Trino Reachability", "passed": True, "detail": f"Connected to {conn_req.host}:{conn_req.port}"})
        else:
            steps.append({"step": "Trino Reachability", "passed": False, "detail": "Unexpected response from SELECT 1"})
            return {"success": False, "steps": steps, "tables": [], "schemas": [], "error": "Trino is reachable but returned unexpected result."}
    except Exception as e:
        steps.append({"step": "Trino Reachability", "passed": False, "detail": str(e)})
        return {
            "success": False,
            "steps": steps,
            "tables": [],
            "schemas": [],
            "error": f"Cannot connect to Trino at {conn_req.host}:{conn_req.port}. Is the server running? Details: {str(e)}"
        }

    # Step 2: Verify catalog discovery works for the endpoint
    try:
        cur.execute("SHOW CATALOGS")
        rows = cur.fetchall()
        catalogs = [row[0] for row in rows]
        steps.append({
            "step": "Catalog Discovery",
            "passed": True,
            "detail": f"Discovered {len(catalogs)} catalog(s)"
        })
    except Exception as e:
        error_str = str(e)
        steps.append({"step": "Catalog Discovery", "passed": False, "detail": error_str})
        return {
            "success": False,
            "steps": steps,
            "catalogs": [],
            "schemas": [],
            "error": f"Cannot discover catalogs from Trino. Details: {error_str}"
        }

    # Step 3: Validate optional default catalog/schema as context only.
    if conn_req.default_catalog:
        if conn_req.default_catalog not in catalogs:
            steps.append({
                "step": "Default Catalog Validation",
                "passed": False,
                "detail": f"Default catalog '{conn_req.default_catalog}' not found"
            })
            return {
                "success": False,
                "steps": steps,
                "catalogs": catalogs,
                "schemas": [],
                "error": f"Default catalog '{conn_req.default_catalog}' does not exist or is not accessible."
            }

        steps.append({
            "step": "Default Catalog Validation",
            "passed": True,
            "detail": f"Default catalog '{conn_req.default_catalog}' is available"
        })

        if conn_req.default_schema:
            try:
                cur.execute(f"SHOW SCHEMAS FROM {quote_identifier(conn_req.default_catalog)}")
                rows = cur.fetchall()
                schemas = [row[0] for row in rows]
            except Exception as e:
                error_str = str(e)
                steps.append({"step": "Default Schema Validation", "passed": False, "detail": error_str})
                return {
                    "success": False,
                    "steps": steps,
                    "catalogs": catalogs,
                    "schemas": [],
                    "error": f"Cannot list schemas for default catalog '{conn_req.default_catalog}'. Details: {error_str}"
                }

            if conn_req.default_schema not in schemas:
                steps.append({
                    "step": "Default Schema Validation",
                    "passed": False,
                    "detail": f"Default schema '{conn_req.default_schema}' not found"
                })
                return {
                    "success": False,
                    "steps": steps,
                    "catalogs": catalogs,
                    "schemas": schemas,
                    "error": f"Default schema '{conn_req.default_schema}' does not exist in default catalog '{conn_req.default_catalog}'."
                }

            steps.append({
                "step": "Default Schema Validation",
                "passed": True,
                "detail": f"Default schema '{conn_req.default_schema}' is available"
            })
    elif conn_req.default_schema:
        steps.append({
            "step": "Default Schema Validation",
            "passed": False,
            "detail": "Default schema requires a default catalog"
        })
        return {
            "success": False,
            "steps": steps,
            "catalogs": catalogs,
            "schemas": [],
            "error": "Default schema requires a default catalog."
        }

    return {
        "success": True,
        "steps": steps,
        "catalogs": catalogs,
        "tables": [],
        "schemas": schemas,
        "error": None
    }


def test_connection(conn_req: TrinoConnectionRequest) -> bool:
    """
    Legacy wrapper. Returns True if validation passes, raises on failure.
    """
    result = validate_connection(conn_req)
    if not result["success"]:
        raise Exception(result["error"])
    return True
