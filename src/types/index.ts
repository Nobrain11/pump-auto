// PUMP AUTO — Core Domain Types
// These types mirror the production data model and are used across UI, API, workers.

export type StrategyType =
  | "AUTO_HUNTER"
  | "SMART_DEV_FOLLOW"
  | "MANUAL"
  | "MOMENTUM"
  | "SNIPER"
  | "BREAKOUT"
  | "MEAN_REVERSION"
  | "DCA"
  | "COPY_TRADING"
  | "CUSTOM";

export type HunterState =
  | "OFF"
  | "STARTING"
  | "SCANNING"
  | "ANALYZING"
  | "READY"
  | "EXECUTING"
  | "MONITORING"
  | "PAUSED"
  | "RISK_HALTED"
  | "ERROR";

export type OrderState =
  | "CREATED"
  | "RISK_CHECK"
  | "APPROVED"
  | "BUILDING"
  | "SIGNED"
  | "SUBMITTED"
  | "CONFIRMING"
  | "CONFIRMED"
  | "FAILED"
  | "CANCELLED";

export type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export type Confidence = "LOW" | "MEDIUM" | "HIGH";

export interface TokenScoreBreakdown {
  overall: number;
  dev: number;
  liquidity: number;
  flow: number;
  momentum: number;
  holderQuality: number;
  safety: number;
  marketFit: number;
  risk: RiskLevel;
  components: Record<string, number | string | boolean | null>;
  computedAt: string;
}

export interface DeveloperStats {
  address: string;
  totalLaunches: number;
  graduatedCount: number;
  abandonedCount: number;
  activeCount: number;
  medianSurvivalSeconds: number | null;
  medianPeakMultiple: number | null;
  successfulLaunchRatio: number | null;
  sampleSize: number;
  confidence: Confidence;
  riskIndicators: string[];
  score: number;
}

export interface PositionSummary {
  id: string;
  mint: string;
  symbol?: string;
  entryAmountSol: number;
  currentValueSol: number;
  realizedPnlSol: number;
  unrealizedPnlSol: number;
  pnlPct: number;
  highestPnlPct: number;
  maxDrawdownPct: number;
  heldSeconds: number;
  status: "OPEN" | "PARTIAL" | "CLOSED";
}

export interface PortfolioSummary {
  totalSol: number;
  todayPnlSol: number;
  todayPnlPct: number;
  realizedPnlSol: number;
  unrealizedPnlSol: number;
  exposureSol: number;
  positionCount: number;
  activePositions: PositionSummary[];
}

export interface HunterLiveState {
  state: HunterState;
  marketRegime: "BULLISH" | "BEARISH" | "NEUTRAL" | "UNKNOWN";
  opportunitiesFound: number;
  passedFilters: number;
  watching: number;
  positions: number;
  entriesToday: number;
  dailyRiskUsedPct: number;
  lastTickAt: string | null;
}

export interface ActivityItem {
  id: string;
  type: string;
  message: string;
  severity: "INFO" | "SUCCESS" | "WARNING" | "ERROR";
  timestamp: string;
  metadata?: Record<string, unknown>;
}

export interface RiskCheckResult {
  approved: boolean;
  reason?: string;
  checks: {
    dailyLossCap: boolean;
    maxPerTrade: boolean;
    maxExposure: boolean;
    maxPositions: boolean;
    slippage: boolean;
    cooldown: boolean;
    emergencyStop: boolean;
    duplicate: boolean;
  };
}

export interface SwapQuote {
  inputMint: string;
  outputMint: string;
  inAmount: string;
  outAmount: string;
  priceImpactPct: number;
  slippageBps: number;
  routePlan: unknown[];
  otherAmountThreshold: string;
}

export interface SwapProvider {
  getQuote(params: {
    inputMint: string;
    outputMint: string;
    amount: string;
    slippageBps: number;
  }): Promise<SwapQuote>;
  buildTransaction(quote: SwapQuote, userPublicKey: string): Promise<string>;
  getStatus(signature: string): Promise<"PENDING" | "CONFIRMED" | "FAILED">;
}

export interface LeaderboardTrader {
  id: string;
  name: string;
  verified: boolean;
  roiPct: number;
  realizedPnlSol: number;
  unrealizedPnlSol: number;
  winRatePct: number;
  trades: number;
  volumeSol: number;
  followers: number;
  risk: RiskLevel;
  confidence: Confidence;
  sampleSize: number;
}

export interface CopyTradeConfiguration {
  traderId: string;
  mode: "fixed" | "percent";
  amount: number;
  maxPositions: number;
  maxDailyExposure?: number;
  minLiquidity?: number;
  minTokenScore?: number;
  risk: RiskLevel;
  slippageBps?: number;
}

export interface SolanaProvider {
  getBalance(publicKey: string): Promise<number>;
  getTokenAccounts(publicKey: string): Promise<{ mint: string; amount: string; uiAmount: number }[]>;
  getTransaction(signature: string): Promise<unknown | null>;
  sendRawTransaction(rawTx: Buffer | Uint8Array): Promise<string>;
  confirmTransaction(signature: string, commitment?: "processed" | "confirmed" | "finalized"): Promise<boolean>;
}
