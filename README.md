# ALMA — Automated Land & Moisture Action

Dual-trigger (rainfall + Gibe III dam) flood early warning dashboard for the Omo River–Lake Turkana basin.

## Run locally

Requires [Node.js](https://nodejs.org/) and npm.

```sh
npm install
npm run dev
```

Then open the URL Vite prints (usually `http://localhost:5173`).

### Optional: Africa's Talking sandbox SMS

Copy `.env.example` to `.env` and set:

```
AT_API_KEY=your_sandbox_key
AT_USERNAME=sandbox
```

Without those vars, Simulator → **Send Demo SMS** stays in demo mode.

## Scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` | Dev server |
| `npm run build` | Production build |
| `npm run preview` | Preview production build |
| `npm run lint` | ESLint |

## Stack

- TanStack Start
- TypeScript
- React
- Tailwind CSS
