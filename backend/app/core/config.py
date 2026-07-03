"""Centralized application settings loaded from environment variables."""

from pydantic_settings import BaseSettings
from typing import List, Optional
import os

class Settings(BaseSettings):
    # Database
    DATABASE_URL: str = "postgresql://postgres:postgres@localhost:5432/eazy_italian"
    REDIS_URL: str = "redis://localhost:6379"
    
    # Google OAuth (same client id as frontend VITE_GOOGLE_CLIENT_ID)
    GOOGLE_CLIENT_ID: str = ""

    # JWT
    SECRET_KEY: str = "your-super-secret-key-change-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 180  # 3 hours
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30
    
    # Email
    SMTP_HOST: str = "smtp.gmail.com"
    SMTP_PORT: int = 587
    SMTP_USER: str = "your-email@gmail.com"
    SMTP_PASSWORD: str = "your-app-password"
    SMTP_TLS: bool = True
    SMTP_SSL: bool = False

    # Stripe (set in .env / environment; same names as fields, e.g. STRIPE_SECRET_KEY).
    STRIPE_SECRET_KEY: str = ""
    # Subscription Price IDs from Stripe Dashboard → Products.
    STRIPE_STANDARD_PRICE_ID: str = ""
    STRIPE_PRO_PRICE_ID: str = ""
    # Hosted Checkout return URLs (override for local dev, e.g. http://localhost:3000/success).
    STRIPE_CHECKOUT_SUCCESS_URL: str = "https://linguai.net/success"
    STRIPE_CHECKOUT_CANCEL_URL: str = "https://linguai.net/cancel"
    # Signing secret from Stripe Dashboard → Developers → Webhooks (whsec_...).
    STRIPE_WEBHOOK_SECRET: str = ""

    # Telegram bot token used to forward support chat messages to Telegram.
    TELEGRAM_BOT_TOKEN: str = ""
    # Telegram chat id that receives forwarded support chat messages.
    TELEGRAM_CHAT_ID: str = ""
    # Shared secret used to authorize Telegram-to-backend support replies.
    SUPPORT_REPLY_SECRET: str = ""
    
    # File Storage (MinIO for local dev; any S3-compatible service for production)
    MINIO_ENDPOINT: str = "localhost:9000"
    MINIO_ACCESS_KEY: str = "minioadmin"
    MINIO_SECRET_KEY: str = "minioadmin123"
    MINIO_BUCKET_NAME: str = "eazy-italian"
    MINIO_SECURE: bool = False
    # Public base URL for files stored in the bucket.
    # For Cloudflare R2: set to the R2.dev subdomain or custom domain,
    # e.g. "https://pub-xxxx.r2.dev".
    # For Backblaze B2: "https://f004.backblazeb2.com/file/<bucket>".
    # For local MinIO: leave empty — files are served via /api/v1/static/.
    # When non-empty, the backend uploads every generated image to the bucket
    # and stores the resulting CDN URL in the DB so files survive redeploys.
    MINIO_PUBLIC_URL: str = ""
    
    # CORS - Frontend URLs that are allowed to access the API
    CORS_ORIGINS: str = "http://localhost:3000,http://127.0.0.1:3000,http://localhost:3001,http://127.0.0.1:3001,http://localhost:3002,http://127.0.0.1:3002,https://linguai.net,https://www.linguai.net,https://eazy-italian-frontend.onrender.com"
    CORS_ORIGINS: str = "http://localhost:3000,http://127.0.0.1:3000,http://localhost:3001,http://127.0.0.1:3001,http://localhost:3002,http://127.0.0.1:3002,https://eazy-italian-frontend.onrender.com,https://ligua-ai.com,https://linguai.net"
    
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
            "https://eazy-italian-frontend.onrender.com",
            "https://ligua-ai.com",
            "https://linguai.net",
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
    PROJECT_NAME: str = "Ligua AI"
    
    # AI Provider Configuration (exercise generation defaults to DeepSeek→Groq in ai_exercise_generator)
    AI_PROVIDER: str = "deepseek"
    GROQ_API_KEY: str = ""
    GROQ_MODEL: str = "llama-3.3-70b-versatile"
    GROQ_TIMEOUT: int = 60
    
    # Ollama Configuration
    OLLAMA_BASE_URL: str = "http://localhost:11434"
    OLLAMA_MODEL: str = "llama3.2"
    
    # RAG Configuration
    EMBEDDING_MODEL: str = "LaBSE"
    RAG_TOP_K: int = 5
    RAG_MIN_SIMILARITY: float = 0.3
    
    # fal.ai image generation (FLUX.1 [dev])
    FAL_KEY: str = ""
    FAL_MODEL: str = "fal-ai/flux/dev"
    FAL_IMAGE_SIZE: str = "landscape_4_3"   # landscape_4_3 | square_hd | portrait_4_3
    FAL_LORA_URL: str = ""                    # optional — URL to an educational-style LoRA
    FAL_LORA_SCALE: float = 0.8

    # DeepSeek Configuration
    DEEPSEEK_API_KEY: str = ""
    DEEPSEEK_MODEL: str = "deepseek-chat"
    DEEPSEEK_TIMEOUT: int = 90
    
    class Config:
        env_file = ".env"
        case_sensitive = True

settings = Settings()
