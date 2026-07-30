# ALMA last-mile demo (SMS / USSD / Voice / WhatsApp)

Farmers and pastoralists do **not** use the website. They get alerts via phone.

## 1. Start services

```powershell
# Terminal A — web desk
cd c:\Users\Administrator\turkana-alert-watch
npm run dev -- --host 127.0.0.1

# Terminal B — engine
cd c:\Users\Administrator\turkana-alert-watch\engine
$env:ALMA_FUNCTION_MODEL="gemma2:2b"
$env:ALMA_ANALYST_MODEL="gemma2:2b"
.\.venv\Scripts\uvicorn.exe main:app --reload --host 127.0.0.1 --port 8787
```

- Desk: http://127.0.0.1:8080/
- Engine health: http://127.0.0.1:8787/health
- Live rain + dam alternative: http://127.0.0.1:8787/api/dashboard/live-signals
- API docs: http://127.0.0.1:8787/docs

## 2. Credentials (SMS / WhatsApp / Voice / cloud AI)

| Variable | Purpose |
|----------|---------|
| `AT_API_KEY` / `AT_USERNAME` | SMS (sandbox username is always `sandbox`) |
| `META_WA_TOKEN` + `META_WA_PHONE_NUMBER_ID` | WhatsApp via **Meta Cloud API** (no AT WhatsApp needed) |
| `AT_WHATSAPP_NUMBER` | Optional Africa’s Talking WhatsApp (no sandbox) |
| `ELEVENLABS_API_KEY` | Natural TTS for Voice IVR `<Play>` |
| `FEATHERLESS_API_KEY` | Cloud LLM when local Gemma is slow |
| `PUBLIC_BASE_URL` | Ngrok URL so AT can fetch ElevenLabs MP3s |
| `DAM_TELEMETRY_URL` | Optional partner dam JSON |

**WhatsApp without AT:** Meta Cloud API (wired), Twilio WhatsApp, 360dialog, MessageBird/Sinch.

Without keys, Simulator still works in **demo mode**.

## 3. Public URL for real USSD / Voice (ngrok)

Africa’s Talking must POST to a public HTTPS URL:

```powershell
ngrok http 8787
```

In the AT dashboard:

- **USSD** callback → `https://YOUR_ID.ngrok-free.app/api/ussd`
- **Voice** callback → `https://YOUR_ID.ngrok-free.app/api/voice`
- Service code e.g. `*384*96428#` (sandbox / registered code)

Local test without a phone:

```powershell
curl -X POST http://127.0.0.1:8787/api/ussd -d "sessionId=1&phoneNumber=+254700000000&text="
curl -X POST http://127.0.0.1:8787/api/ussd -d "sessionId=1&phoneNumber=+254700000000&text=1*1"
```

## 4. Dam alternatives (why not “live Gibe III”)

There is **no public Gibe III SCADA**. ALMA offers:

1. **Live Open-Meteo rain** over Upper Omo → **estimated release pressure** (clearly labeled).
2. **Partner feed** via `DAM_TELEMETRY_URL` when EEP / basin authority share an API.
3. **Simulator** for rehearsal SMS/WhatsApp without pretending dam gauges are live.

## 5. WhatsApp

Simulator → choose WhatsApp or SMS + WhatsApp.  
Needs `AT_WHATSAPP_NUMBER` on a production AT app (WhatsApp has no sandbox).
