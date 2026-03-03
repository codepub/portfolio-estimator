# Portfolio Estimator & FIRE Simulator

A deterministic and stochastic Monte Carlo simulation engine designed to model complex portfolio drawdown strategies over a 50-year (or more) timeline. 

This application differs from standard compound interest calculators by enforcing strict chronological event processing, evaluating capital gains taxes on a dynamic cost basis, maintaining separate cash buffer architectures, and routing autonomous surplus energy (pension overages) back into the principal.

## Architecture
The system operates on a decoupled client-server architecture:
* **Backend (`FastAPI` / Python):** A stateless mathematical engine that loads external JSON arrays, processes timeline loops (600 months), executes tax algorithms, and calculates Monte Carlo percentiles.
* **Frontend (`React` / Recharts / Vite):** A dynamic telemetry dashboard that queries the backend for available configuration state, handles user input logic, and plots dense temporal data.

## Dynamic Configuration (JSON APIs)
You do not need to modify source code to add new historical data or tax regimes. The backend automatically parses the following files on boot and exposes them to the UI:

### `indices.json`
Add new arrays of historical index data to compare sequences of return. 
* **Format:** `"INDEX_NAME": [{"year": 1995, "return": 0.25}, ...]`
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