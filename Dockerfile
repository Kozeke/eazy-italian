# Use Python 3.11 slim image
FROM python:3.11-slim

# Add build argument to force rebuild
ARG BUILD_DATE=unknown
ARG VCS_REF=unknown

# Set working directory
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    nodejs \
    npm \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy backend requirements and install Python dependencies
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy frontend package files and install Node.js dependencies
COPY frontend/package*.json ./frontend/
WORKDIR /app/frontend
# Install all dependencies (including dev dependencies for build)
RUN npm ci

# Copy frontend source and build
COPY frontend/ ./
# Force install platform-specific dependencies
RUN npm install @rollup/rollup-linux-x64-gnu
RUN npm run build

# Copy backend source (this will now be rebuilt every time)
WORKDIR /app
COPY backend/ ./

# Create a simple script to serve the frontend from the backend
RUN echo '#!/bin/bash\n\
cd /app\n\
python -m uvicorn main:app --host 0.0.0.0 --port 8000' > /app/start.sh && \
chmod +x /app/start.sh

# Expose port
EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=30s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:8000/health || exit 1

# Start the application
CMD ["/app/start.sh"]
