from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
import json
from datetime import datetime
from calculator import PortfolioSimulator

app = FastAPI(title="Portfolio Estimator API")

# Configure CORS to allow the React frontend to communicate with this API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allows all origins for local prototyping
    allow_credentials=True,
    allow_methods=["*"],  # Allows all methods (including the OPTIONS preflight)
    allow_headers=["*"],
)

# Load static configs into memory on startup
try:
    with open("taxes.json", "r") as f:
        taxes_config = json.load(f)
    with open("indices.json", "r") as f:
        indices_config = json.load(f)
except FileNotFoundError:
    taxes_config = {}
    indices_config = {}
    print("Warning: taxes.json or indices.json not found. Ensure they are in the directory.")

simulator = PortfolioSimulator(taxes_config, indices_config)

# Pydantic models validate the incoming data from your UI automatically
class PensionInput(BaseModel):
    amount: float
    start_year: int
    start_month: int
    end_year: Optional[int] = None
    end_month: Optional[int] = None
    tax_regime: str = "Finland"

class CashEventInput(BaseModel):
    amount: float
    year: int
    month: int
    target: str  # 'buffer' or 'investment'

# --- NEW: LIFESTYLE SPENDING CHANGE ---
class SpendingEventInput(BaseModel):
    amount: float
    year: int
    month: int

class RelocationInput(BaseModel):
    year: int
    month: int
    new_regime: str

class SimulationParams(BaseModel):
    initial_investment: float
    initial_profit_percentage: float
    yearly_spending: float
    inflation_percentage: float
    pensions: List[PensionInput]
    pensions_inflation_adjusted: bool = True
    cash_events: List[CashEventInput] = []
    relocations: List[RelocationInput] = []
    spending_events: List[SpendingEventInput] = []
    growth_models: List[str] = ["linear"] # e.g., 'linear', 'stochastic', 'historical_sp500'
    linear_rate: float = 0.07
    stochastic_engine: str = "gbm"
    stochastic_volatility: float = 0.13
    stochastic_iterations: int = 100
    simulation_start_year: int = datetime.now().year
    simulation_start_month: int = (datetime.now().month % 12) + 1
    simulation_end_year: int = datetime.now().year + 50
    tax_residencies: List[str] = ["Finland"]
    historical_start_year: int = 1950
    historical_end_year: int = 2025
    enable_low_season_spend: bool = False
    low_season_cut_percentage: float = 0.10
    use_cash_buffer: bool = False
    buffer_target_months: int = 36
    buffer_current_size: float = 0.0
    buffer_depletion_threshold: float = 0.0
    buffer_replenishment_threshold: float = 0.10
    use_trend_guardrail: bool = False
    trend_sma_months: int = 12
    use_equity_glidepath: bool = False
    glidepath_months: int = 60
    use_dynamic_buffer: bool = False
    valuation_slow_sma_months: int = 60

@app.get("/config")
def get_config():
    try:
        with open("indices.json", "r") as f:
            indices = json.load(f)
        with open("taxes.json", "r") as f:
            taxes = json.load(f)
            
        return {
            "historical_indices": list(indices.keys()),
            "capital_gains_taxes": list(taxes.get("capital_gains", {}).keys()),
            "pension_taxes": list(taxes.get("pension_income", {}).keys())
        }
    except Exception as e:
        return {"historical_indices": [], "capital_gains_taxes": ["Finland"], "pension_taxes": ["Finland"]}

@app.post("/simulate")
def run_simulation(params: SimulationParams):
    try:
        # Pass the validated dictionary to your math engine
        results = simulator.run_simulation(params.model_dump())
        return {"status": "success", "data": results}
    except Exception as e:
        # Fulfills the "shall log errors" requirement
        print(f"Simulation Error: {str(e)}")
        raise HTTPException(status_code=500, detail="Simulation failed. Check backend logs.")
