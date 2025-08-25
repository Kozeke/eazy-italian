# Frontend Deployment Guide for Render

## Steps to Deploy Frontend to Render:

### 1. Go to Render Dashboard
- Visit https://dashboard.render.com/
- Sign in or create an account

### 2. Create New Web Service
- Click "New +" button
- Select "Static Site"

### 3. Connect Repository
- Connect your GitHub repository: `eazy-italian`
- Select the repository

### 4. Configure Build Settings
- **Name**: `eazy-italian-frontend`
- **Build Command**: `cd frontend && npm install && npm run build`
- **Publish Directory**: `frontend/dist`
- **Environment**: `Static Site`

### 5. Deploy
- Click "Create Static Site"
- Wait for build to complete

### 6. Access Your App
- Your frontend will be available at: `https://eazy-italian-frontend.onrender.com`
- The frontend will automatically connect to your backend at: `https://eazy-italian.onrender.com`

## API Configuration
The frontend is already configured to use your Render backend API at:
`https://eazy-italian.onrender.com/api/v1`

## Notes
- The frontend will automatically rebuild when you push changes to GitHub
- Both frontend and backend will be accessible via Render's CDN
- CORS is already configured in the backend to allow requests from Render domains
