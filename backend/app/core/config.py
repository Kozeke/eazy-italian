from pydantic_settings import BaseSettings
from typing import List, Optional
import os

class Settings(BaseSettings):
    # Database
    DATABASE_URL: str = "postgresql://postgres:postgres@localhost:5432/eazy_italian"
    REDIS_URL: str = "redis://localhost:6379"
    
    # JWT
    SECRET_KEY: str = "your-super-secret-key-change-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 480  # 8 hours - increased for better UX during editing sessions
    
    # Email
    SMTP_HOST: str = "smtp.gmail.com"
    SMTP_PORT: int = 587
    SMTP_USER: str = "your-email@gmail.com"
    SMTP_PASSWORD: str = "your-app-password"
    SMTP_TLS: bool = True
    SMTP_SSL: bool = False
    
    # File Storage
    MINIO_ENDPOINT: str = "localhost:9000"
    MINIO_ACCESS_KEY: str = "minioadmin"
    MINIO_SECRET_KEY: str = "minioadmin123"
    MINIO_BUCKET_NAME: str = "eazy-italian"
    MINIO_SECURE: bool = False
    
    # CORS - Frontend URLs that are allowed to access the API
    CORS_ORIGINS: str = "http://localhost:3000,http://127.0.0.1:3000,http://localhost:3001,http://127.0.0.1:3001,http://localhost:3002,http://127.0.0.1:3002,https://eazy-italian-frontend.onrender.com"
    
    @property
    def cors_origins_list(self) -> List[str]:
        """
        Returns list of allowed CORS origins for the API
        Combines default local development origins with environment-configured origins
        """
        # Default local development origins
        default_origins = [
            "http://localhost:3000",
            "http://127.0.0.1:3000", 
            "http://localhost:3001",
            "http://127.0.0.1:3001",
            "http://localhost:3002",
            "http://127.0.0.1:3002",
        ]
        
        # Parse environment variable origins and filter out wildcards
        env_origins = [
            origin.strip() 
            for origin in self.CORS_ORIGINS.split(",") 
            if origin.strip() and "*" not in origin
        ]
        
        # Combine and deduplicate
        all_origins = list(set(default_origins + env_origins))
        
        print(f"CORS origins configured: {all_origins}")
        return all_origins
    
    # Application
    DEBUG: bool = True
    ENVIRONMENT: str = "development"
    API_V1_STR: str = "/api/v1"
    PROJECT_NAME: str = "Eazy Italian"
    
    class Config:
        env_file = ".env"
        case_sensitive = True

settings = Settings()
