# PUMP AUTO — Bot (worker) deployment

The web app only serves UI + API. Automated trading needs the **bot process**.

## What the bot runs
- **Scanner** — discovers tokens, scores, filters
- **Execution** — claims APPROVED orders → Jupiter quote → sign → submit → confirm → open position
- **Position** — TP / SL / trailing → enqueues SELL through risk engine

## Railway (recommended)

1. In the same project as the web app, **New Service** → **GitHub Repo** → same `pump-auto` repo.
2. Name it e.g. `pump-auto-bot`.
3. **Settings → Deploy**
   - **Custom Start Command:** `npm run worker:bot`
   - **No public domain** (worker, not web)
4. **Variables** — copy from web service (or use Railway shared variables):
   - `DATABASE_URL` (same Postgres)
   - `REDIS_URL` (same Redis)
   - `SOLANA_RPC_URL` or `HELIUS_RPC_URL`
   - `WALLET_ENCRYPTION_KEY` (**must match web**)
   - `JUPITER_API_URL` = `https://lite-api.jup.ag/swap/v1`
   - `JUPITER_API_KEY` (optional)
   - `AUTH_SECRET`
5. Deploy. Logs should show:
   ```
   [bot] PUMP AUTO worker starting
   [scanner] …
   ```

## Local
```bash
npm run worker:bot
```

## Safety
- No trade bypasses the risk engine
- Positions open only after **CONFIRMED** txs
- Emergency stop blocks new entries (does not auto-sell)
