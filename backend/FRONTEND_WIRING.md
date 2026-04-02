# Frontend Wiring Instructions

The Next.js frontend has been securely updated to hit the new FastAPI + Gemini backend, using the exact schema specified in your prompt.

## What changed in `app/page.tsx`:
1. **Types Updated:**
   - Changed `ParsedAction` to match `IntentAction` exactly (`type`, `target`, schema).
   - Changed `ParseResponse` to match `IntentResponse` (array is now named `actions`).
2. **Fetch Request Updated:**
   - API Url changed to `http://localhost:8000/api/parse`.
   - Body payload changed to match `ParseRequest` (`{ intent: ... }`).
3. **Data Mapping:**
   - Total amounts and `ActionReceiptCard` mappings were mapped dynamically via `.actions` and `.target`.

## How to run the full stack:

1. **Start the Backend:**
   Open a new terminal, navigate to the `backend` folder, install requirements (if you haven't), and run with uvicorn.
   ```bash
   cd backend
   .\venv\Scripts\activate
   uvicorn main:app --reload --port 8000
   ```
   *Make sure you have set `GEMINI_API_KEY` in `backend/.env`!*

2. **Start the Frontend:**
   In your Next.js directory (root):
   ```bash
   npm run dev
   ```

The frontend will proxy your prompt directly to the Gemini API via our new FastAPI endpoint and render the beautifully formatted response!
