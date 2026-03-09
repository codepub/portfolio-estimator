# a Vibe Coded Quantitative Retirement & FIRE Simulator

A high-fidelity Monte Carlo and historical timeline simulator designed to model complex retirement scenarios, optimize sequence-of-returns risk (SRR), and preserve personal autonomy.

Unlike standard retirement calculators that rely on static averages and normal distributions, this engine treats the market as a complex dynamical system. It incorporates institutional-grade stochastic physics, dynamic multi-regime taxation, algorithmic cash buffer strategies, and control-system hysteresis to test portfolio survival across both standard variance and catastrophic tail-risk events.
---

## ⚙️ Core Physics & Growth Models

The simulation engine generates up to 600-month (50-year) timelines using three distinct frameworks:

Historical Slicing: Extracts exact sequences of actual monthly market returns (e.g., S&P 500, EURO STOXX 50, OMXHPI) and natively loops them to test specific macroeconomic conditions (e.g., retiring into the Dot-Com crash or the 1970s stagflation era).

Geometric Brownian Motion (GBM): The baseline for normal Monte Carlo simulations. Generates log-normally distributed paths utilizing annualized expected returns and historical volatility.

Heston Model with Macro Gravity (Stress Testing): Simulates catastrophic market mechanics. By injecting stochastic volatility with a negative correlation (rho = -0.7$) and an intrinsic valuation anchor, this model accurately reproduces "fat tails," volatility clustering, and mean-reverting dip-buying. It is designed to test the portfolio's survival through prolonged, multi-year financial panics.

---

## 🛡️ Algorithmic Risk Management (Cash Buffers)

Optimizing purely for terminal wealth often leads to failure during a crash. This engine includes six distinct, toggleable logic gates to route cashflows, protect equities during drawdowns, and prevent boundary oscillation:

SMA Trend Guardrail (The Circuit Breaker): Uses a fast moving average (e.g., 12-month) as a lagging indicator. If the macro trend snaps, the engine severs the portfolio and forces 100% of consumption onto the cash buffer.

Equity Glidepath (The Shield): A deterministic structural defense. Wards off Sequence of Returns Risk by locking the portfolio and forcing all living expenses to drain from a massive initial cash buffer during the first 5-10 years of retirement.

Counter-Cyclical Valuation (Buy the Dip): Compares a fast SMA to a slow SMA (e.g., 60-month) to measure market valuation. Dynamically shrinks the target buffer when the market crashes, autonomously deploying excess cash to buy cheap equities.

High-Water Mark (Pure Bucket Strategy): The ultimate structural defense. The engine always withdraws from cash first, and strictly refuses to sell equities to refill the buffer unless the portfolio is sitting at an all-time historical peak.

Valuation-Based Proportional Withdrawal (THIS WORKS BEST, others just nice to compare against)

## 🛡️ Valuation-Based Proportional Withdrawal 

Elastic Dual-Momentum (Proportional Withdrawal): A 3-Regime dynamic shock absorber utilizing 1-year and 5-year averages.

Regime 1 (The Hurricane): 100% cash usage during active crashes.

Regime 2 (The Valley): Dynamically splits withdrawals between cash and equities based on the depth of the drawdown.

Regime 3 (Clear Skies): 100% equity usage to preserve the cash buffer.

Systemic Hysteresis (Structural Equity Protectors): Solves boundary oscillation by decoupling the survival floor from the recovery ceiling.

The Critical Mass Floor: An absolute global override. If equities drop below a critical threshold (e.g., 20% of net worth), all equity sales are strictly forbidden.

The Replenish Threshold: A secondary ceiling (e.g., 50%) that forbids profit harvesting during a recovery, forcing the engine to rebuild structural mass before it is allowed to refill the cash bucket.
---
## 🌍 Dynamic Lifestyle & Taxation

The simulator is built to handle reality, tracking cashflows down to the exact month:

Multi-Regime Capital Gains: Calculates progressive and flat tax brackets dynamically as shares are sold.

Relocation Tracking: Tax residency can be scheduled to change at specific months in the future, altering the withdrawal math on the fly.

Purchasing Power: Applies continuous monthly inflation to lifestyle spending, pension payouts, and the final "Today's Euros" portfolio valuation.

Low Season Austerity: Optional behavioral rule that autonomously cuts monthly spending by a specified percentage during negative market growth.

Autonomous Surplus Reinvestment: If fixed income (pensions) exceeds the monthly lifestyle target, the engine autonomously reinvests the surplus back into the equity pool to compound.

---

## 🛠️ Technical Architecture

* **Backend:** Python / FastAPI / Pydantic (Strict schema validation and algorithmic routing).
* **Frontend:** React / Vite / Recharts (Dynamic charting and state management).
* **Testing:** Pytest suite executing continuous integration (CI) via GitHub Actions to mathematically verify logic gates, tax brackets, and buffer depletion rules.

### Running the Application (Docker)

1. Ensure Docker Desktop is running.
2. Build and launch the full stack (FastAPI backend + React frontend):
   ```bash
   docker-compose up --build

## Architecture
The system operates on a decoupled client-server architecture:
* **Backend (`FastAPI` / Python):** A stateless mathematical engine that loads external JSON arrays, processes timeline loops (600 months), executes tax algorithms, and calculates Monte Carlo percentiles.
* **Frontend (`React` / Recharts / Vite):** A dynamic telemetry dashboard that queries the backend for available configuration state, handles user input logic, and plots dense temporal data.

## Dynamic Configuration (JSON APIs)
You do not need to modify source code to add new historical data or tax regimes. The backend automatically parses the following files on boot and exposes them to the UI:

### `indices_monthly.json`
Add new arrays of historical index data to compare sequences of return. 
* **Format:** `"INDEX_NAME": [{"year": 1995, "month": 1, "return": 0.25}, ...]`
* *Note: Ensure keys inside the array are strictly lowercase (`"year"`, `"return"`).*

### `taxes.json`
Define the mathematical rules for both capital gains and pension income across different global jurisdictions.
* **Capital Gains:** Define flat taxes or exemptions.
* **Pension Income:** Define `"flat"` rates, tiered progressive brackets (`"tiered"`), or estimated progressive scales (`"progressive_estimate"`). 

## Running the Application

### 1. Local Development (Browser on the same machine)
Use Docker Compose to spin up the stack:
```bash
docker-compose up --build