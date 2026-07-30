# ALMA — Automated Land & Moisture Action

Dual-trigger (rainfall + Gibe III dam) flood early warning for the Omo–Turkana basin.

- **Website** = NGO / county / Red Cross ops desk  
- **Farmers & pastoralists** = SMS, WhatsApp, USSD `*384*96428#`, voice (not the website)

## Run locally

### Web desk

```powershell
npm install
npm run dev -- --host 127.0.0.1
```

Open http://127.0.0.1:8080/

### Engine (risk, USSD, voice, simulator, live rain)

```powershell
cd engine
.\.venv\Scripts\Activate.ps1
$env:ALMA_FUNCTION_MODEL="gemma2:2b"
$env:ALMA_ANALYST_MODEL="gemma2:2b"
uvicorn main:app --reload --host 127.0.0.1 --port 8787
```

- http://127.0.0.1:8787/health  
- http://127.0.0.1:8787/api/dashboard/live-signals  
- http://127.0.0.1:8787/docs  

Full last-mile + ngrok steps: [DEMO_LAST_MILE.md](./DEMO_LAST_MILE.md) · Engine notes: [engine/README.md](./engine/README.md)

### Optional env

Copy `.env.example` → `.env`:

- `AT_API_KEY` / `AT_USERNAME` — live SMS  
- `AT_WHATSAPP_NUMBER` — WhatsApp (no sandbox)  
- `ALMA_ENGINE_URL=http://127.0.0.1:8787`  
- `DAM_TELEMETRY_URL` — optional partner dam JSON  

## Scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` | Web desk |
| `npm run engine` | FastAPI engine (Windows venv path) |
| `npm run build` | Production build |
| `npm run lint` | ESLint |

## Stack

TanStack Start · React · TypeScript · Tailwind · FastAPI engine · Ollama Gemma (optional)
