import logging

from sqlalchemy.orm import Session
from cryptography.fernet import Fernet
from app.models.connection import ConnectionRecord, TrinoConnectionRequest
from app.core.config import settings

logger = logging.getLogger(__name__)

# Initialize Fernet cipher for password encryption/decryption
cipher_suite = Fernet(settings.SECRET_KEY.encode('utf-8'))

def encrypt_password(password: str) -> str:
    if not password:
        return None
    return cipher_suite.encrypt(password.encode('utf-8')).decode('utf-8')

def decrypt_password(encrypted_password: str) -> str:
    if not encrypted_password:
        return None
    return cipher_suite.decrypt(encrypted_password.encode('utf-8')).decode('utf-8')

def save_active_connection(db: Session, conn_req: TrinoConnectionRequest) -> ConnectionRecord:
    # Deactivate all existing connections
    db.query(ConnectionRecord).update({"is_active": False})
    
    # Create new active connection
    new_conn = ConnectionRecord(
        host=conn_req.host,
        port=conn_req.port,
        default_catalog=conn_req.default_catalog or "",
        default_schema=conn_req.default_schema or "",
        username=conn_req.username,
        encrypted_password=encrypt_password(conn_req.password),
        ssl_enabled=conn_req.ssl_enabled,
        is_active=True
    )
    
    db.add(new_conn)
    db.commit()
    db.refresh(new_conn)
    return new_conn

def get_active_connection(db: Session) -> ConnectionRecord:
    return db.query(ConnectionRecord).filter(ConnectionRecord.is_active == True).first()


def _saved_connection_request(active_conn: ConnectionRecord) -> TrinoConnectionRequest:
    return TrinoConnectionRequest(
        host=active_conn.host,
        port=active_conn.port,
        default_catalog=active_conn.default_catalog,
        default_schema=active_conn.default_schema,
        username=active_conn.username,
        password=decrypt_password(active_conn.encrypted_password),
        ssl=active_conn.ssl_enabled,
    )


def _environment_connection_request() -> TrinoConnectionRequest:
    return TrinoConnectionRequest(
        host=settings.TRINO_HOST,
        port=settings.TRINO_PORT,
        default_catalog=settings.TRINO_DEFAULT_CATALOG or None,
        default_schema=settings.TRINO_DEFAULT_SCHEMA or None,
        username=settings.TRINO_USER,
        password=settings.TRINO_PASSWORD or None,
        ssl=settings.TRINO_HTTP_SCHEME.lower() == "https",
    )


def resolve_trino_connection_request(db: Session) -> tuple[TrinoConnectionRequest, str]:
    """Select a Trino connection according to configured source precedence."""
    policy = settings.TRINO_CONNECTION_SOURCE
    allow_saved = settings.ALLOW_SAVED_CONNECTIONS
    active_conn = None

    if policy != "env" and allow_saved:
        active_conn = get_active_connection(db)

    if active_conn:
        conn_req = _saved_connection_request(active_conn)
        source = "saved"
    elif policy == "saved":
        raise ValueError(
            "TRINO_CONNECTION_SOURCE=saved requires an active saved connection. "
            "Save a connection in the UI or select TRINO_CONNECTION_SOURCE=auto or env."
        )
    else:
        conn_req = _environment_connection_request()
        source = "env"

    logger.info(
        "Resolved Trino connection source | policy=%s | allow_saved_connections=%s | active_source=%s | endpoint=%s://%s:%s | user=%s",
        policy,
        allow_saved,
        source,
        "https" if conn_req.ssl_enabled else "http",
        conn_req.host,
        conn_req.port,
        conn_req.username,
    )
    return conn_req, source
