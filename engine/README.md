# ALMA Engine — FastAPI last-mile + risk gateway
#
# Run (Windows PowerShell):
#   cd engine
#   python -m venv .venv
#   .\.venv\Scripts\Activate.ps1
#   pip install -r requirements.txt
#   uvicorn main:app --reload --host 127.0.0.1 --port 8787
#
# Health:     GET  http://127.0.0.1:8787/health
# USSD:       POST http://127.0.0.1:8787/api/ussd  (form: sessionId, phoneNumber, text)
# Voice:      POST http://127.0.0.1:8787/api/voice (AT XML)
# Simulator:  POST http://127.0.0.1:8787/api/simulator/trigger
# Dashboard:  GET  /api/dashboard/risk  POST /api/dashboard/analyst
#
# Optional offline Gemma (Ollama) — both models should be pulled:
#   ollama pull gemma2:2b   # USSD/SMS ground-truth parser (≤2s or rule fallback)
#   ollama pull gemma2:9b   # desk analyst + SMS polish (longer timeout OK)
# Config in engine/.env — see ALMA_FUNCTION_MODEL / ALMA_ANALYST_MODEL
#
# Data honesty: dam/rain inputs default to data_quality=simulated.
# Never label mock Gibe III values as live SCADA unless a partner feed is wired.

## Layout

```
engine/
  main.py
  routes/     ussd.py  voice.py  simulator.py  dashboard.py
  services/   gemma_ai.py  risk_engine.py  africastalking.py  session_store.py  playbook_loader.py
  data/       wards_geojson.json  sector_playbooks.json
```

## Env

| Variable | Purpose |
|----------|---------|
| `AT_API_KEY` / `AT_USERNAME` | Africa's Talking SMS (sandbox or live) |
| `AT_SMS_URL` | Override SMS endpoint |
| `OLLAMA_HOST` | Local Ollama base URL |
| `ALMA_FUNCTION_MODEL` | Edge parser model (default `gemma2:2b`) |
| `ALMA_ANALYST_MODEL` | Desk analyst model (default `gemma2:9b`) |
| `ALMA_GEMMA_TIMEOUT_S` | Hard timeout before rule fallback (default `2`) |
| `ALMA_SESSION_DB` | SQLite path for USSD sessions |

## Compound risk formula

When `|T_rain − T_dam| ≤ 24h`:

`severity = min(100, ((RainScore×0.45)+(DamScore×0.55)) × 1.4)`

Otherwise peak single-signal severity is used. Rain travel ~48–72h; dam surge ~12–24h.
