# Google OAuth Setup Guide

## Fixing 403 Forbidden Error

The 403 error occurs when your Google OAuth Client ID is not properly configured in Google Cloud Console. Follow these steps:

### Step 1: Configure OAuth Consent Screen

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Select your project (or create a new one)
3. Navigate to **APIs & Services** > **OAuth consent screen**
4. Choose **External** (for testing) or **Internal** (for Google Workspace)
5. Fill in the required information:
   - **App name**: TeachFlow (or your app name)
   - **User support email**: Your email
   - **Developer contact information**: Your email
6. Click **Save and Continue**
7. Add scopes (if needed):
   - `email`
   - `profile`
   - `openid`
8. Add test users (for External apps in testing mode):
   - Add your email address
9. Click **Save and Continue**

### Step 2: Create OAuth 2.0 Client ID

1. Go to **APIs & Services** > **Credentials**
2. Click **Create Credentials** > **OAuth client ID**
3. Choose **Web application** as the application type
4. Configure:
   - **Name**: TeachFlow Web Client (or any name)
   - **Authorized JavaScript origins**:
     - `http://localhost:3000` (for development)
     - `http://127.0.0.1:3000` (for development)
     - Your production domain (e.g., `https://yourdomain.com`)
   - **Authorized redirect URIs**:
     - `http://localhost:3000` (for development)
     - `http://127.0.0.1:3000` (for development)
     - Your production domain (e.g., `https://yourdomain.com`)
5. Click **Create**
6. Copy the **Client ID** (it should look like: `692433185695-xxxxx.apps.googleusercontent.com`)

### Step 3: Enable Required APIs

1. Go to **APIs & Services** > **Library**
2. Search for and enable:
   - **Google Identity Services API**
   - **Google+ API** (if available)

### Step 4: Verify Your Configuration

Your Client ID: `692433185695-ti5t4l30kr0sbhr19ran5n9rjcu7b4ss.apps.googleusercontent.com`

Make sure:
- ✅ OAuth consent screen is configured
- ✅ Authorized JavaScript origins include `http://localhost:3000`
- ✅ Authorized redirect URIs include `http://localhost:3000`
- ✅ The Client ID is correct in your `.env` file

### Step 5: Test the Configuration

1. Restart your development server
2. Clear browser cache
3. Try signing in with Google again

### Common Issues

**403 Forbidden:**
- Check that Authorized JavaScript origins are set correctly
- Verify OAuth consent screen is published (or you're a test user)
- Make sure the Client ID matches in `.env` file

**"Error 400: redirect_uri_mismatch":**
- Add your exact URL to Authorized redirect URIs
- Include both `http://localhost:3000` and `http://127.0.0.1:3000`

**"Error 403: access_denied":**
- Make sure you're added as a test user (for External apps in testing)
- Check that required scopes are added

### Production Setup

For production:
1. Change OAuth consent screen to **Published** (after review)
2. Add your production domain to Authorized JavaScript origins
3. Update `.env` file with production Client ID (or use environment variables)
