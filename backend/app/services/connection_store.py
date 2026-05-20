from sqlalchemy.orm import Session
from cryptography.fernet import Fernet
from app.models.connection import ConnectionRecord, TrinoConnectionRequest
from app.core.config import settings

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
