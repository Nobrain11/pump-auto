# PUMP AUTO — Solana Automated Trading Terminal

**Fund → Hunt → Filter → Enter → Watch → Exit → Learn → Repeat**

Production-oriented Next.js application for automated trading on Solana / Pump.fun markets.

> This is the real application architecture — not a documentation site or mock dashboard.  
> No simulated balances, fake PnL, or fabricated developer statistics in production paths.

---

## Stack

- **Frontend**: Next.js 15 (App Router), TypeScript, Tailwind CSS, mobile-first
- **Database**: PostgreSQL + Prisma (authoritative source of truth)
- **Cache / Queues**: Redis (ioredis)
- **Chain**: `@solana/web3.js`, Jupiter swap abstraction
- **Security**: AES-256-GCM wallet secrets, env-managed encryption key, redaction
- **Workers**: Separate processes for scanner, execution, position monitoring

---

## Quick Start (Development)

```bash
cp .env.example .env.local
# Fill at minimum:
# DATABASE_URL, REDIS_URL, SOLANA_RPC_URL, WALLET_ENCRYPTION_KEY, AUTH_SECRET

npm install
npx prisma generate
npx prisma db push

npm run dev
```

Generate encryption key:
```bash
openssl rand -base64 32
```

---

## Architecture Highlights

### Wallet secrets
- Stored **only** in `EncryptedWalletSecret` table
- AES-256-GCM, unique IV per secret
- Never returned by API, never logged
- Decryption happens only inside the execution boundary for signing

### Risk engine
Every automated trade must pass:
- Daily loss cap
- Max per-trade size
- Max wallet exposure
- Max concurrent positions
- Cooldown
- Emergency stop
- Duplicate token protection

### Order state machine
```
CREATED → RISK_CHECK → APPROVED → BUILDING → SIGNED → SUBMITTED → CONFIRMING → CONFIRMED
                                                                      ↘ FAILED / CANCELLED
```
Only **confirmed** transactions update final position state.

### Provider abstractions
- `SolanaProvider` — RPC balances, send, confirm
- `SwapProvider` — Jupiter today; swappable later
- Fail closed when infrastructure is unavailable

### Product rules enforced
1. No fake trading functionality
2. No fabricated developer success rates
3. No private key exposure
4. No silent mock data in production
5. Risk engine is mandatory
6. Idempotent execution (no duplicate trades)
7. Submitted ≠ confirmed

---

## Project Structure

```
src/
  app/                  # Next.js App Router (pages + API)
  components/           # UI (layout, trading, ui primitives)
  engines/              # Risk, scoring, strategy decision
  lib/
    auth/               # Session helpers
    db/                 # Prisma client
    security/           # Encryption, redaction
    solana/             # Wallet service
    utils/
  providers/            # Solana RPC, Jupiter, future indexers
  types/                # Domain types
  workers/              # Background processes (scanner, execution, position)
prisma/
  schema.prisma         # Full production schema
```

---

## Build Phases (status)

| Phase | Status |
|-------|--------|
| 1. Foundation (Next, TS, Tailwind, schema, env, logging) | ✅ |
| 2. Wallet system (create/import/encrypt/list/balance) | ✅ |
| 3. Market infrastructure (DexScreener, discovery, scanner API) | ✅ |
| 4. Intelligence (token + developer scoring, filters, risk) | ✅ |
| 5. Execution (Jupiter + sign + submit + confirm + claim loop) | ✅ core |
| 6. Positions + PnL (open on confirm, exits, portfolio API) | ✅ core |
| 7. Auto-Hunter (state machine, terminal controls, emergency stop) | ✅ UI + API |
| 8. Smart Dev Follow | shell |
| 9. Terminal UI live | ✅ controls + feed shell |
| 10. Product layer (learn, settings, security, support, wallets) | ✅ |
| 11. Production hardening (tests started; rate limits, deploy TBD) | 🔄 |

---

## Security Notes

- Never commit `.env` or real keys
- `WALLET_ENCRYPTION_KEY` and `AUTH_SECRET` are mandatory
- Support UI must display: *“PUMP AUTO will never ask for your private key or seed phrase through support.”*
- All financial numbers must come from confirmed transactions + live market data

---

## License

Private / proprietary — all rights reserved.
