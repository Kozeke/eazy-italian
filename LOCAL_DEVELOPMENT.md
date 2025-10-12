# 🐳 Local Development with Docker

## Prerequisites

Before running the project, make sure you have:

- ✅ **Docker Desktop** installed and running
- ✅ At least **4GB of RAM** available for Docker
- ✅ **Git** installed

## Quick Start

### 1. Clone the Repository (if not already done)

```bash
git clone https://github.com/Kozeke/eazy-italian.git
cd eazy-italian
```

### 2. Start All Services

```bash
docker-compose up --build
```

This single command will:
- Build all Docker images
- Start PostgreSQL database
- Start Redis cache
- Start MinIO file storage
- Start Backend API (FastAPI)
- Start Celery worker and beat
- Start Frontend (React + Vite)

### 3. Wait for Services to Start

You'll see logs from all services. Wait until you see:

```
backend_1  | INFO:     Application startup complete.
frontend_1 | VITE vX.X.X  ready in XXX ms
```

### 4. Access the Application

Once all services are running:

- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:8000
- **API Documentation**: http://localhost:8000/docs
- **MinIO Console**: http://localhost:9001 (admin/minioadmin123)

## 📦 What's Running?

| Service | Port | Description |
|---------|------|-------------|
| Frontend | 3000 | React app with hot reload |
| Backend | 8000 | FastAPI with auto-reload |
| PostgreSQL | 5432 | Database |
| Redis | 6379 | Cache & message broker |
| MinIO | 9000, 9001 | File storage |

## 🛑 Stopping the Services

### Stop all services (keeps data):
```bash
docker-compose down
```

### Stop and remove all data:
```bash
docker-compose down -v
```

### Stop a specific service:
```bash
docker-compose stop backend
```

## 🔄 Restarting Services

### Restart all services:
```bash
docker-compose restart
```

### Restart specific service:
```bash
docker-compose restart backend
```

### Rebuild and restart (after code changes):
```bash
docker-compose up --build
```

## 📝 Common Commands

### View logs from all services:
```bash
docker-compose logs -f
```

### View logs from specific service:
```bash
docker-compose logs -f backend
```

### Run backend shell:
```bash
docker-compose exec backend bash
```

### Run database migrations:
```bash
docker-compose exec backend python migrate_db.py
```

### Create demo accounts:
```bash
docker-compose exec backend python create_demo_accounts.py
```

### Access PostgreSQL:
```bash
docker-compose exec postgres psql -U postgres -d eazy_italian
```

## 🧪 Testing Locally

### Create Test Accounts

```bash
docker-compose exec backend python create_demo_accounts.py
```

This creates:
- **Admin**: admin@eazyitalian.com / password123
- **Teacher**: teacher@eazyitalian.com / password123
- **Student**: student@eazyitalian.com / password123

### Test Login

1. Go to http://localhost:3000
2. Click "Login"
3. Use any of the demo accounts above

## 🐛 Troubleshooting

### Issue: Port already in use

**Error**: `Bind for 0.0.0.0:3000 failed: port is already allocated`

**Solution**:
```bash
# Find what's using the port
netstat -ano | findstr :3000

# Stop the service or change port in docker-compose.yml
```

### Issue: Docker containers won't start

**Solution**:
```bash
# Stop all containers
docker-compose down

# Remove all containers and volumes
docker-compose down -v

# Rebuild from scratch
docker-compose up --build
```

### Issue: Frontend can't connect to backend

**Check**:
1. Backend is running: http://localhost:8000/health
2. CORS is configured for localhost:3000
3. Frontend is using correct API URL (check browser console)

### Issue: Database connection failed

**Solution**:
```bash
# Check if PostgreSQL is healthy
docker-compose ps

# If unhealthy, restart it
docker-compose restart postgres
```

### Issue: Out of disk space

**Solution**:
```bash
# Clean up Docker system
docker system prune -a --volumes

# Then rebuild
docker-compose up --build
```

## 🔧 Development Workflow

### 1. Frontend Development

- Frontend runs with **Vite hot reload**
- Edit files in `frontend/src/`
- Changes appear automatically in browser
- No need to restart container

### 2. Backend Development

- Backend runs with **uvicorn --reload**
- Edit files in `backend/`
- Server automatically restarts
- Check logs: `docker-compose logs -f backend`

### 3. Database Changes

After changing models:
```bash
# Run migrations
docker-compose exec backend python migrate_db.py

# Or create new migration
docker-compose exec backend alembic revision --autogenerate -m "description"
docker-compose exec backend alembic upgrade head
```

## 📊 Environment Variables

### Backend (.env or docker-compose.yml)

```env
DATABASE_URL=postgresql://postgres:postgres@postgres:5432/eazy_italian
REDIS_URL=redis://redis:6379
SECRET_KEY=your-super-secret-key-change-in-production
CORS_ORIGINS=http://localhost:3000,http://127.0.0.1:3000
```

### Frontend (.env.local)

```env
VITE_API_BASE_URL=http://localhost:8000/api/v1
```

## 🚀 Performance Tips

### Speed up builds:

1. **Use BuildKit**:
   ```bash
   export DOCKER_BUILDKIT=1
   docker-compose build
   ```

2. **Limit log output**:
   ```bash
   docker-compose up --build > /dev/null 2>&1 &
   ```

3. **Run only what you need**:
   ```bash
   # Just backend + database
   docker-compose up postgres backend
   
   # Just frontend (if backend is running elsewhere)
   docker-compose up frontend
   ```

## 🔍 Monitoring

### Check service health:
```bash
docker-compose ps
```

### Check resource usage:
```bash
docker stats
```

### Check service logs in real-time:
```bash
docker-compose logs -f backend frontend
```

## 🎯 Production vs Development

| Feature | Development (Docker) | Production (Render) |
|---------|---------------------|---------------------|
| Hot reload | ✅ Enabled | ❌ Disabled |
| Debug mode | ✅ On | ❌ Off |
| API URL | localhost:8000 | eazy-italian.onrender.com |
| Database | Local PostgreSQL | Render PostgreSQL |
| File storage | Local MinIO | Could use S3/Render storage |

## 📚 Additional Resources

- **Backend API Docs**: http://localhost:8000/docs
- **React DevTools**: Install browser extension
- **Docker Docs**: https://docs.docker.com/
- **FastAPI Docs**: https://fastapi.tiangolo.com/

## ✅ Pre-flight Checklist

Before starting development:

- [ ] Docker Desktop is running
- [ ] Ports 3000, 8000, 5432, 6379, 9000, 9001 are free
- [ ] You have at least 4GB RAM available
- [ ] Latest code is pulled from git
- [ ] `.env.local` exists in frontend folder

## 🆘 Need Help?

If you're stuck:

1. Check the logs: `docker-compose logs -f`
2. Restart services: `docker-compose restart`
3. Clean rebuild: `docker-compose down -v && docker-compose up --build`
4. Check Docker Desktop is running and has enough resources
5. Verify ports aren't in use: `netstat -ano | findstr ":3000 :8000"`

## 🎉 Success!

You should now have:
- ✅ Frontend running at http://localhost:3000
- ✅ Backend API at http://localhost:8000
- ✅ Hot reload enabled for both
- ✅ All services healthy and communicating
- ✅ Ready to develop!

Happy coding! 🚀

