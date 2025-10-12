# 🚨 Quick Fix for CORS Error

## The Problem

Your frontend at `https://eazy-italian-frontend.onrender.com` is being blocked by the backend at `https://eazy-italian.onrender.com` because:

1. The backend hasn't been updated with the latest code, OR
2. The `CORS_ORIGINS` environment variable isn't set on Render

## ✅ Quick Fix Steps (Do These Now)

### Step 1: Add CORS_ORIGINS Environment Variable

1. Go to https://dashboard.render.com
2. Click on your **backend service** (eazy-italian)
3. Click **Environment** in the left sidebar
4. Click **Add Environment Variable**
5. Add:
   - **Key**: `CORS_ORIGINS`
   - **Value**: `https://eazy-italian-frontend.onrender.com`
6. Click **Save Changes**

### Step 2: Add Other Critical Environment Variables

While you're there, add these required variables if you haven't already:

```
DATABASE_URL=<Your PostgreSQL Internal URL>
SECRET_KEY=<Generate with: python -c "import secrets; print(secrets.token_urlsafe(32))">
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30
DEBUG=False
ENVIRONMENT=production
```

### Step 3: Trigger a Redeploy

After adding the environment variables:
1. Go to **Manual Deploy** section
2. Click **Deploy latest commit**
3. Wait for deployment to complete (watch the logs)

### Step 4: Verify CORS is Working

Once deployed, test these URLs in your browser:

1. **Health Check**: https://eazy-italian.onrender.com/health
   - Should return: `{"status":"healthy"}`

2. **CORS Test**: https://eazy-italian.onrender.com/cors-test
   - Should return: `{"message":"CORS is working","origins":["https://eazy-italian-frontend.onrender.com",...]}`

3. **Root Endpoint**: https://eazy-italian.onrender.com/
   - Should return: `{"message":"Eazy Italian API","version":"1.0.0",...}`

## 🔍 Checking Backend Logs

To see what's happening:
1. Go to your backend service on Render
2. Click **Logs** tab
3. Look for these messages:
   - `CORS origins configured: [...]` - Should include your frontend URL
   - Any error messages about database connection
   - Any 500 errors with details

## 🎯 Expected Result

After fixing CORS, you should see in the logs:
```
CORS origins configured: ['http://localhost:3000', 'http://127.0.0.1:3000', 'https://eazy-italian-frontend.onrender.com']
```

And your login should work without CORS errors!

## ⚠️ Common Mistakes

1. **Typo in frontend URL** - Make sure it matches exactly (no trailing slash)
2. **Not redeploying** - Changes only take effect after redeploy
3. **Using external database URL** - Use the Internal Database URL for DATABASE_URL
4. **Missing SECRET_KEY** - Backend won't start without it

## 📞 Still Not Working?

If you still get CORS errors after this:

1. Check the backend logs for the exact error
2. Verify the environment variables are saved
3. Make sure the deployment completed successfully
4. Try a hard refresh on your frontend (Ctrl+Shift+R)
5. Check browser console for the exact error message

## 🔐 Generate SECRET_KEY

Run this locally to generate a secure key:

```bash
python -c "import secrets; print(secrets.token_urlsafe(32))"
```

Copy the output and use it as your SECRET_KEY value.

## 📋 Environment Variable Checklist

Backend service needs these:
- [ ] CORS_ORIGINS=https://eazy-italian-frontend.onrender.com
- [ ] DATABASE_URL=postgresql://...
- [ ] SECRET_KEY=<generated-key>
- [ ] ALGORITHM=HS256
- [ ] ACCESS_TOKEN_EXPIRE_MINUTES=30
- [ ] DEBUG=False
- [ ] ENVIRONMENT=production

Frontend service needs:
- [x] VITE_API_BASE_URL=https://eazy-italian.onrender.com/api/v1 (already done)

## 🎉 Success Indicators

You'll know it's working when:
1. No CORS errors in browser console
2. Login request shows status 200 or 401 (not 500)
3. Backend logs show "CORS origins configured" with your frontend URL
4. You can successfully login or get a proper error message (like "wrong password")

