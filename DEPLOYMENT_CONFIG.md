# Deployment Configuration Guide

## Environment Variables Configuration

The frontend uses environment variables to configure the backend API URL for different environments.

### Local Development

For local development, the frontend uses `.env.local` file:

```env
VITE_API_BASE_URL=http://localhost:8000/api/v1
```

This file is automatically ignored by git and will not be committed to the repository.

### Production Deployment on Render

For production deployment, you need to set the following environment variable in your Render dashboard:

#### Step 1: Go to Your Render Dashboard
1. Navigate to https://dashboard.render.com
2. Select your frontend service (the one serving the React app)

#### Step 2: Add Environment Variable
1. Go to the **Environment** section
2. Add the following environment variable:
   - **Key**: `VITE_API_BASE_URL`
   - **Value**: `https://eazy-italian.onrender.com/api/v1`

#### Step 3: Redeploy
After adding the environment variable, Render will automatically redeploy your application with the new configuration.

### How It Works

- In development: Vite loads variables from `.env.local`
- In production: Vite uses environment variables from the build environment (Render)
- The `api.ts` file reads the `VITE_API_BASE_URL` variable and uses it as the base URL for all API requests
- If the variable is not set, it defaults to `http://localhost:8000/api/v1`

### Backend Configuration

Your backend is deployed at: https://eazy-italian.onrender.com

The backend API is accessible at: https://eazy-italian.onrender.com/api/v1

### Testing the Configuration

To verify the configuration is working:

1. **Local**: Start the backend (`uvicorn main:app --reload`) and frontend (`npm run dev`)
2. **Production**: Check the browser console for API requests - they should point to the Render URL

### Important Notes

- All environment variables for Vite must be prefixed with `VITE_` to be exposed to the client
- Never commit `.env.local` to version control (it's in .gitignore)
- The `.env.production` file is committed as a fallback but will be overridden by Render's environment variables
