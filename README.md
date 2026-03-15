# a Vibe Coded Quantitative Retirement & FIRE Simulator

A high-fidelity Monte Carlo and historical timeline simulator designed to model complex retirement scenarios and to optimize sequence-of-returns risk (SRR).

Unlike standard retirement calculators that rely on static averages and normal distributions, this engine treats the market as a complex dynamical system. It incorporates institutional-grade stochastic physics, dynamic multi-regime taxation, algorithmic cash buffer strategies, and control-system hysteresis to test portfolio survival across both standard variance and catastrophic tail-risk events.

**A Note on the Physics of Survival (The Cash Buffer Paradox):** Mathematical efficiency and real-world survival are often at odds. Over a 50-year aggregate horizon, holding a cash buffer introduces "cash drag"—the compounding growth lost by keeping mass out of the equity engine. From a pure, unfeeling mathematical standpoint, it is "expensive." However, a market crash is not equally dangerous at all points in time. A buffer acts as a vital structural heat sink during the high-vulnerability launch phase of retirement (the first 5–10 years). Severing the portfolio from the market during an early crash prevents the permanent, irrecoverable destruction of core shares at the bottom of a cycle. It is an insurance premium paid in yield to buy the ultimate autonomy: the ability to completely ignore the macroeconomic weather.

---

## ⚙️ Core Physics & Global Constraints

The simulation engine generates up to 600-month (50-year) timelines utilizing three distinct growth frameworks, governed by a strict, global survival floor.

**The Poverty Disqualifier (The Absolute Floor):** A globally enforced hard limit defined in "today's money" (e.g., €600/month). Regardless of the active spending protocol or market conditions, if inflation-adjusted real spending drops below this threshold in *any* month, the timeline is mathematically flagged as a catastrophic failure.

**Historical Slicing:** Extracts exact sequences of actual monthly market returns (e.g., S&P 500, EURO STOXX 50, OMXHPI) and natively loops them to test specific macroeconomic conditions (e.g., retiring into the Dot-Com crash or the 1970s stagflation era).

**Geometric Brownian Motion (GBM):** The baseline for normal Monte Carlo simulations. Generates log-normally distributed paths utilizing annualized expected returns and historical volatility.

**Heston Model with Macro Gravity (Stress Testing):** Simulates catastrophic market mechanics. By injecting stochastic volatility with a negative correlation (rho = -0.7) and an intrinsic valuation anchor, this model accurately reproduces "fat tails," volatility clustering, and mean-reverting dip-buying. It is designed to test the portfolio's survival through prolonged, multi-year financial panics.

---

## 🎯 Inverse Monte Carlo (The Targeting Computer)

Instead of running a standard forward simulation ("What happens to my €1,000,000?"), the Targeting Computer utilizes a heavily parallelized binary search to invert the physics: *"What is the absolute minimum capital required to survive?"*

* **P10 Optimization:** To guarantee a 90% success rate, the engine autonomously isolates the Worst 10% (P10) timeline from a thousand stochastic futures and mathematically solves for the exact starting mass required to keep that specific, hostile timeline above the Poverty Disqualifier.
* **The Cost of Safety:** By running concurrent searches for the Median, Best 10%, and Worst 10% futures, the system exposes the exact capital premium required to insure against tail-risk events.
* **Psychological Binning:** The engine records the exact lived experience of the worst-case scenario, sorting the 50-year timeline into human-scale impact bins: 100% Full Lifestyle, 95-99% (Invisible Micro-Trims), 85-94% (Noticeable Cuts), and <85% (Deep Austerity), alongside capturing the absolute "Deepest Cut" experienced.

---

## 🎛️ Algorithmic Spending Control (Liability Management)

A system cannot survive tail-risk events without down-regulating its metabolism. The engine provides three distinct, mutually exclusive mechanisms to autonomously throttle monthly liabilities during a crisis:

**Low Season Austerity:** A simple behavioral toggle. Autonomously cuts monthly spending by a fixed percentage during any month where market growth is negative.

**Guyton-Klinger Guardrails (The Ratchet):** A rigid, mathematically bounded survival system. Monitors the real-time withdrawal rate. If the rate exceeds the initial safe withdrawal parameter by a set threshold (e.g., +20%), spending is permanently slashed by 10%. Conversely, the "Prosperity Rule" grants spending raises if the portfolio vastly outgrows its original trajectory. Prioritizes absolute portfolio survival over lifestyle stability.

**The Proportional Attenuator (The Elastic Dimmer):** A biologically inspired feedback loop. Instead of permanent cuts, it smoothly dims lifestyle spending in exact proportion to the market's mathematical distance from its 5-year moving average. Spending dynamically rebounds to 100% the moment structural macroeconomic health is restored.

---

## 🛡️ Algorithmic Risk Management (Cash Buffers)

Optimizing purely for terminal wealth often leads to failure during a crash. This engine includes six distinct logic gates to route cashflows, protect equities during drawdowns, and prevent boundary oscillation:

**SMA Trend Guardrail (The Circuit Breaker):** Uses a fast moving average (e.g., 12-month) as a lagging indicator. If the macro trend snaps, the engine severs the portfolio and forces 100% of consumption onto the cash buffer.

**Equity Glidepath (The Shield):** A deterministic structural defense. Wards off Sequence of Returns Risk by locking the portfolio and forcing all living expenses to drain from a massive initial cash buffer during the first 5-10 years of retirement.

**Counter-Cyclical Valuation (Buy the Dip):** Compares a fast SMA to a slow SMA (e.g., 60-month) to measure market valuation. Dynamically shrinks the target buffer when the market crashes, autonomously deploying excess cash to buy cheap equities.

**High-Water Mark (Pure Bucket Strategy):** The ultimate structural defense. The engine always withdraws from cash first, and strictly refuses to sell equities to refill the buffer unless the portfolio is sitting at an all-time historical peak.

**Valuation-Based Proportional Withdrawal:** The most optimized configuration. An elastic, 3-regime dynamic shock absorber utilizing 1-year and 5-year averages:

* **Regime 1 (The Hurricane):** 100% cash usage during active crashes.
* **Regime 2 (The Valley):** Dynamically splits withdrawals between cash and equities based on the depth of the drawdown.
* **Regime 3 (Clear Skies):** 100% equity usage to preserve the cash buffer.

**Systemic Hysteresis (Structural Equity Protectors):** Solves boundary oscillation by decoupling the survival floor from the recovery ceiling.

* **The Critical Mass Floor:** An absolute global override. If equities drop below a critical threshold (e.g., 20% of net worth), all equity sales are strictly forbidden.
* **The Replenish Threshold:** A secondary ceiling (e.g., 50%) that forbids profit harvesting during a recovery, forcing the engine to rebuild structural mass before it is allowed to refill the cash bucket.

---

## 🌍 Dynamic Lifestyle & Taxation

The simulator is built to handle reality, tracking cashflows down to the exact month:

**Multi-Regime Capital Gains:** Calculates progressive and flat tax brackets dynamically as shares are sold.

**Relocation Tracking:** Tax residency can be scheduled to change at specific months in the future, altering the withdrawal math on the fly.

**Purchasing Power:** Applies continuous monthly inflation to lifestyle spending, pension payouts, and the final "Today's Euros" portfolio valuation.

**Autonomous Surplus Reinvestment:** If fixed income (pensions) exceeds the monthly lifestyle target, the engine autonomously reinvests the surplus back into the equity pool to compound.

---

## 🛠️ Technical Architecture

* **Backend:** Python / FastAPI / Pydantic / `concurrent.futures` (Strict schema validation, multiprocessing pool optimization, and algorithmic routing).
* **Frontend:** React / Vite / Recharts (Dynamic charting and state management).
* **Testing:** Pytest suite executing continuous integration (CI) via GitHub Actions to mathematically verify logic gates, tax brackets, and buffer depletion rules.

### Running the Application (Docker)

1. Ensure Docker Desktop is running.
2. Build and launch the full stack (FastAPI backend + React frontend):

```bash
docker-compose up --build

```

### Architecture

The system operates on a decoupled client-server architecture:

* **Backend (`FastAPI` / Python):** A stateless mathematical engine that loads external JSON arrays, processes heavily parallelized timeline loops (600 months), executes tax algorithms, and calculates inverse Monte Carlo percentiles.
* **Frontend (`React` / Recharts / Vite):** A dynamic telemetry dashboard that queries the backend for available configuration state, handles user input logic, and plots dense temporal data.

### Dynamic Configuration (JSON APIs)

You do not need to modify source code to add new historical data or tax regimes. The backend automatically parses the following files on boot and exposes them to the UI:

* **`indices_monthly.json`:** Add new arrays of historical index data to compare sequences of return. Format: `"INDEX_NAME": [{"year": 1995, "month": 1, "return": 0.25}, ...]`. Ensure keys inside the array are strictly lowercase.
* **`taxes.json`:** Define the mathematical rules for both capital gains and pension income across different global jurisdictions. Supports flat taxes, exemptions, progressive tiered brackets, or estimated progressive scales.

