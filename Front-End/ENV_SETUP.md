# 🔧 Environment Setup Guide

## Local Development Setup

### Frontend (.env.local)

1. Copy `.env.example` to `.env.local`:
   ```bash
   cp .env.example .env.local
   ```

2. Update `.env.local` with your local values:
   ```env
   NEXT_PUBLIC_API_URL=http://localhost:3001/api
   NEXT_PUBLIC_VAPID_PUBLIC_KEY=BBV9L1K72r124wbj5PrTNYRbY9ZiyqqAtNKU-7GRXVVgzkepWf-4Fu9LCMi5OF1asnOjusjP-wvLJTLypB4xwLw
   ```

3. If using a different local IP:
   ```env
   NEXT_PUBLIC_API_URL=http://192.168.91.173:3001/api
   ```

### Important Notes

- **Never commit `.env.local`** - it contains local/sensitive values
- `NEXT_PUBLIC_*` variables are bundled into the frontend at build time
- After changing `.env.local`, you may need to restart the dev server
- Delete `.next/` folder if changes don't take effect: `rm -rf .next && npm run dev`

## Vercel Deployment Setup

When deploying to Vercel:

1. Go to **Project Settings → Environment Variables**
2. Add these variables:
   - `NEXT_PUBLIC_API_URL` = Your backend URL (e.g., `https://api.youromain.com/api`)
   - `NEXT_PUBLIC_VAPID_PUBLIC_KEY` = Your Web Push VAPID key

3. Redeploy the frontend after adding env vars

## Troubleshooting

### Error: "404 Not Found" with strange URL
- ❌ `.env.local` is not being read properly
- ✅ Check that `NEXT_PUBLIC_API_URL` is set correctly
- ✅ Restart the dev server
- ✅ Clear `.next/` cache

### API calls failing on Vercel
- ❌ Environment variables not set in Vercel dashboard
- ✅ Go to Project Settings and add all required env vars
- ✅ Redeploy after adding env vars
