<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/drive/1YOmWne1F7CmxYtj2ojV0zq6-iPa38QGl

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set `VITE_GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`


## Deploy (Vercel)

1. Push this branch to GitHub.
2. Import the repository in Vercel.
3. Add environment variable: `VITE_GEMINI_API_KEY` (and optionally `VITE_MODELSLAB_API_KEY`, `VITE_BLOB_READ_WRITE_TOKEN`).
4. Deploy. Vercel uses `vercel.json` (`npm run build` + `dist` output).


### Quick post-deploy check

- Open the Vercel deployment URL and verify the login screen appears.
- In Vercel Project Settings → Environment Variables, confirm `VITE_GEMINI_API_KEY` is set for the Production environment.
- If you update environment variables, trigger a **Redeploy** so the new values are included in the build.
