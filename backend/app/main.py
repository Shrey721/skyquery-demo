from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.api.routes import connections, metadata, auth, history
from app.api.routes.flights import router as flights_router
from app.api.routes.weather import router as weather_router
from app.models.connection import Base
from app.models.user import User  # Import User to ensure tables are created
from app.models.chat_history import ChatHistory  # Import ChatHistory to ensure tables are created
from app.db.database import engine
from starlette.middleware.sessions import SessionMiddleware

# Create tables if they don't exist
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title=settings.PROJECT_NAME,
    openapi_url=f"{settings.API_V1_STR}/openapi.json"
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.add_middleware(
    SessionMiddleware,
    secret_key=settings.SECRET_KEY,
    session_cookie="skyquery_session",
    max_age=86400 * 7,  # 7 days
    same_site="lax",
    https_only=False,
)

# Include Routers
app.include_router(connections.router, prefix=f"{settings.API_V1_STR}/connections", tags=["connections"])
app.include_router(metadata.router, prefix=f"{settings.API_V1_STR}/metadata", tags=["metadata"])
app.include_router(auth.router, prefix=f"{settings.API_V1_STR}/auth", tags=["auth"])
app.include_router(history.router, prefix=f"{settings.API_V1_STR}/history", tags=["history"])
# Import and register the NL-to-SQL query endpoint
from app.api.routes.query import router as query_router
app.include_router(query_router, tags=["query"])
app.include_router(flights_router, prefix=f"{settings.API_V1_STR}", tags=["flights"])
app.include_router(flights_router, prefix="/api/public", tags=["public-flights"])
app.include_router(weather_router, prefix="/api", tags=["weather"])
app.include_router(weather_router, prefix=f"{settings.API_V1_STR}", tags=["weather"])

@app.get("/")
def root():
    return {"message": "Welcome to SkyQuery API"}
