# Render Deployment Setup Guide

## 🚨 Important: The 500 Error Issue

The 500 Internal Server Error you're experiencing is likely due to **missing environment variables** on your Render backend service. The backend needs database credentials and other configuration to work properly.

## Backend Service Configuration on Render

### Step 1: Access Your Backend Service
1. Go to [Render Dashboard](https://dashboard.render.com)
2. Select your **backend service** (eazy-italian)
3. Go to the **Environment** tab

### Step 2: Add Required Environment Variables

Add the following environment variables (these are **REQUIRED** for the backend to work):

#### Database Configuration
```
DATABASE_URL=<Your PostgreSQL URL from Render>
```
**How to get this:**
- If you have a PostgreSQL database on Render, go to your database service
- Copy the **Internal Database URL** (starts with `postgresql://`)
- Paste it as the value for `DATABASE_URL`

If you don't have a database yet:
1. Click **New +** → **PostgreSQL**
2. Name it `eazy-italian-db`
3. Select the free tier
4. After creation, copy the **Internal Database URL**

#### JWT & Security
```
SECRET_KEY=<Generate a secure random string>
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30
```
**To generate SECRET_KEY**: Run this command locally:
```bash
python -c "import secrets; print(secrets.token_urlsafe(32))"
```

#### CORS Configuration
```
CORS_ORIGINS=https://eazy-italian-frontend.onrender.com
```
**Note**: Replace with your actual frontend URL from Render

#### Optional: Email Configuration (if using email features)
```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-app-specific-password
SMTP_TLS=True
SMTP_SSL=False
```

#### Optional: Redis (if using caching)
```
REDIS_URL=redis://red-xxxxxxxxxx:6379
```

#### Application Settings
```
DEBUG=False
ENVIRONMENT=production
```

### Step 3: Save and Deploy
1. After adding all environment variables, click **Save Changes**
2. Render will automatically redeploy your backend
3. Wait for the deployment to complete (check logs for any errors)

## Frontend Service Configuration on Render

### Step 1: Access Your Frontend Service
1. Go to [Render Dashboard](https://dashboard.render.com)
2. Select your **frontend service** (eazy-italian-frontend)
3. Go to the **Environment** tab

### Step 2: Add Frontend Environment Variable
```
VITE_API_BASE_URL=https://eazy-italian.onrender.com/api/v1
```

### Step 3: Update Build Command (if needed)
Make sure your build command includes the environment variable:
```bash
cd frontend && npm install && npm run build
```

## Verifying CORS is Working

### Method 1: Check Backend Logs
1. Go to your backend service on Render
2. Click on **Logs** tab
3. Look for a line like: `CORS origins configured: ['https://eazy-italian-frontend.onrender.com', ...]`

### Method 2: Test CORS Endpoint
Visit: `https://eazy-italian.onrender.com/cors-test`

You should see:
```json
{
  "message": "CORS is working",
  "origins": ["https://eazy-italian-frontend.onrender.com", ...]
}
```

## Common Issues & Solutions

### Issue 1: 500 Internal Server Error
**Cause**: Missing environment variables or database not connected

**Solution**:
1. Check that `DATABASE_URL` is set correctly
2. Check that your PostgreSQL database is running
3. Check backend logs for the actual error message

### Issue 2: CORS Error
**Cause**: Frontend URL not in CORS_ORIGINS

**Solution**:
1. Find your exact frontend URL (e.g., `https://eazy-italian-frontend.onrender.com`)
2. Add it to `CORS_ORIGINS` environment variable in backend
3. Make sure there are no trailing slashes
4. Redeploy backend

### Issue 3: Database Connection Failed
**Cause**: Wrong DATABASE_URL or database not accessible

**Solution**:
1. Use the **Internal Database URL** (not External)
2. Make sure both services are in the same region
3. Check database is running and not suspended

### Issue 4: Frontend Can't Reach Backend
**Cause**: Wrong API URL in frontend

**Solution**:
1. Check `VITE_API_BASE_URL` in frontend environment variables
2. Make sure it points to backend URL + `/api/v1`
3. Example: `https://eazy-italian.onrender.com/api/v1`

## Testing After Setup

### 1. Test Backend Health
Visit: `https://eazy-italian.onrender.com/health`

Should return:
```json
{"status": "healthy"}
```

### 2. Test Backend Root
Visit: `https://eazy-italian.onrender.com/`

Should return:
```json
{
  "message": "Eazy Italian API",
  "version": "1.0.0",
  "status": "deployed",
  "database": "connected"
}
```

### 3. Test Frontend Login
1. Go to your frontend URL
2. Try to login
3. Check browser console for any errors
4. Check Network tab to see if requests are going to the correct URL

## Quick Checklist

- [ ] Backend `DATABASE_URL` environment variable set
- [ ] Backend `SECRET_KEY` environment variable set  
- [ ] Backend `CORS_ORIGINS` includes frontend URL
- [ ] Frontend `VITE_API_BASE_URL` points to backend
- [ ] PostgreSQL database is running
- [ ] Both services deployed successfully
- [ ] Backend health check returns "healthy"
- [ ] CORS test endpoint returns correct origins
- [ ] Can login from frontend

## Need Help?

If you're still experiencing issues:

1. **Check Backend Logs**: Most issues show up in the logs
2. **Check Browser Console**: Look for network errors or CORS messages
3. **Verify URLs**: Make sure all URLs are correct and use HTTPS in production
4. **Check Database**: Ensure the database is running and accessible

## Example: Complete Environment Variable Setup

### Backend Service
```env
# Required
DATABASE_URL=postgresql://user:pass@host:5432/dbname
SECRET_KEY=your-generated-secret-key-here
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30
CORS_ORIGINS=https://eazy-italian-frontend.onrender.com

# Application
DEBUG=False
ENVIRONMENT=production
```

### Frontend Service  
```env
VITE_API_BASE_URL=https://eazy-italian.onrender.com/api/v1
```

