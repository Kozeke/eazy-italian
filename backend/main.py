from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import os

from app.core.config import settings
from app.api.v1.api import api_router
from app.core.database import engine
from app.core.database import Base

app = FastAPI(
    title=settings.PROJECT_NAME,
    openapi_url=f"{settings.API_V1_STR}/openapi.json",
    docs_url="/docs",
    redoc_url="/redoc",
)

# Set up CORS - Must be before including routers
print(f"Setting up CORS with origins: {settings.cors_origins_list}")
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allow_headers=["*"],
    expose_headers=["*"],
    max_age=3600,  # Cache preflight requests for 1 hour
)

# Include API router
app.include_router(api_router, prefix=settings.API_V1_STR)

@app.on_event("startup")
async def startup_event():
    # Create database tables with retry logic
    import time
    from sqlalchemy.exc import OperationalError
    
    max_retries = 5
    retry_delay = 2
    
    for attempt in range(max_retries):
        try:
            Base.metadata.create_all(bind=engine)
            print("Database tables created successfully")
            break
        except OperationalError as e:
            if attempt < max_retries - 1:
                print(f"Database connection failed (attempt {attempt + 1}/{max_retries}): {e}")
                print(f"Retrying in {retry_delay} seconds...")
                time.sleep(retry_delay)
                retry_delay *= 2
            else:
                print(f"Failed to connect to database after {max_retries} attempts")
                print("Starting application without database initialization...")
                break

# Health check endpoint (must be before static file mounting)
@app.get("/health")
async def health_check():
    return {"status": "healthy"}

# CORS test endpoint - Test if CORS is properly configured
@app.get("/cors-test")
async def cors_test():
    return {
        "message": "CORS is working", 
        "origins": settings.cors_origins_list,
        "environment": settings.ENVIRONMENT
    }

# OPTIONS handler for CORS preflight - Explicit handler for debugging
@app.options("/api/v1/auth/login")
async def options_login():
    return {"message": "OK"}

# Root endpoint
@app.get("/")
async def root():
    return {
        "message": "Eazy Italian API", 
        "version": "1.0.0", 
        "status": "deployed", 
        "database": "connected",
        "cors_origins": settings.cors_origins_list
    }

# Mount static files for frontend at /static path
if os.path.exists("frontend/dist"):
    app.mount("/static", StaticFiles(directory="frontend/dist", html=True), name="static")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
