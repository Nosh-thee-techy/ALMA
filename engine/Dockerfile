# ALMA Engine — persistent Africa's Talking webhook host
# ---------------------------------------------------------------------------
# Deploy this folder (engine/) to Railway / Render / Fly — NOT the Vite desk.
# AT Voice + USSD callbacks need a stable HTTPS URL; ngrok tunnels drop mid-demo.
#
# Railway (recommended):
#   1. New project → Deploy from GitHub → Root Directory = engine
#   2. Add a Volume mounted at /data (SQLite survives restarts)
#   3. Set env vars from ../.env.example (AT_*, PUBLIC_BASE_URL, etc.)
#   4. After deploy, set PUBLIC_BASE_URL=https://YOUR-SERVICE.up.railway.app
#   5. Point AT dashboard callbacks:
#        USSD  → https://YOUR-SERVICE.up.railway.app/api/ussd
#        Voice → https://YOUR-SERVICE.up.railway.app/api/voice
#   6. If AT sandbox key rotates: update AT_API_KEY in Railway Variables → Redeploy
#
# Local image test:
#   docker build -t alma-engine . && docker run -p 8787:8787 -e PORT=8787 alma-engine
# ---------------------------------------------------------------------------
FROM python:3.12-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    ALMA_SESSION_DB=/data/alma_sessions.sqlite3

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

RUN mkdir -p /data /app/data/audio

EXPOSE 8787

# Railway/Render inject $PORT; default 8787 for local Docker runs.
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8787}"]
