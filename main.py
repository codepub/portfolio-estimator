from fastapi import FastAPI, HTTPException, Body
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
import json
import copy
import random
from datetime import datetime
import statistics
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
    with open("indices_monthly.json", "r") as f:
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
    initial_investment: float = 1000000.0
    initial_profit_percentage: float = 0.40
    yearly_spending: float = 40000.0
    inflation_percentage: float = 0.02
    poverty_threshold: float = 600.0          # <- Added missing variable!
    pensions: List[PensionInput] = []
    pensions_inflation_adjusted: bool = True
    cash_events: List[CashEventInput] = []
    relocations: List[RelocationInput] = []
    spending_events: List[SpendingEventInput] = []
    growth_models: List[str] = ["linear"]
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
    buffer_replenishment_threshold: float = 0.01  # Upgraded to 1%
    use_trend_guardrail: bool = False
    trend_sma_months: int = 12
    use_equity_glidepath: bool = False
    glidepath_months: int = 60
    use_dynamic_buffer: bool = False
    valuation_slow_sma_months: int = 60
    use_high_water_mark: bool = False
    use_proportional_withdrawal: bool = False
    throttle_multiplier: int = 3
    equity_critical_mass_floor: float = 0.20
    equity_replenish_threshold: float = 0.85      # Upgraded to 85%
    use_guyton_klinger: bool = False
    gk_upper_threshold: float = 0.20
    gk_lower_threshold: float = 0.20
    gk_cut_rate: float = 0.10
    gk_raise_rate: float = 0.10
    gk_allow_raises: bool = True
    use_proportional_attenuator: bool = False
    attenuator_max_cut: float = 0.50

@app.post("/find_min_capital")
def find_minimum_capital(params: dict = Body(...)):
    """
    Inverts the simulation: Finds the absolute minimum starting capital required 
    to survive the timeline while maintaining the Poverty Disqualifier floor.
    Executes timelines concurrently using a multiprocessing pool.
    """
    import random
    import copy
    import concurrent.futures
    
    total_months = (params['simulation_end_year'] - params['simulation_start_year']) * 12
    iterations = params.get('stochastic_iterations', 100)
    poverty_threshold_annual = params.get('poverty_threshold', 600) * 12
    
    # 1. Pre-generate and freeze timelines for fair binary searching
    frozen_timelines = {}
    if 'stochastic' in params.get('growth_models', []):
        random.seed(42) # Lock universe for monotonic search
        vol = params.get('stochastic_volatility', 0.13)
        if params.get('stochastic_engine') == 'heston':
            frozen_timelines['stochastic'] = [simulator._generate_heston_returns(0.07, vol, total_months) for _ in range(iterations)]
        else:
            frozen_timelines['stochastic'] = [simulator._generate_gbm_returns(0.07, vol, total_months) for _ in range(iterations)]
    
    results = []
    
    search_models = []
    for m in params.get('growth_models', ['linear']):
        if m == 'stochastic':
            search_models.extend(['Stochastic (Worst 10%)', 'Stochastic (Median)', 'Stochastic (Best 10%)'])
        else:
            search_models.append(m)

    # 2. Open the CPU Pool ONCE for the entire request
    with concurrent.futures.ProcessPoolExecutor() as executor:
        
        for model in search_models:
            for tax in params.get('tax_residencies', ['Finland']):
                
                low = 100000.0
                high = 10000000.0 # 10 Million upper bound
                tolerance = 100.0
                best_safe_capital = high
                best_p10_spends = []
                target_spend = params['yearly_spending']
                
                while (high - low) > tolerance:
                    test_cap = (low + high) / 2.0
                    
                    # Setup the test payload
                    test_params = copy.deepcopy(params)
                    if test_params.get('use_cash_buffer'):
                        orig_total = params['initial_investment'] + params.get('buffer_current_size', 0)
                        buf_ratio = params.get('buffer_current_size', 0) / orig_total if orig_total > 0 else 0.15
                        test_params['initial_investment'] = test_cap * (1 - buf_ratio)
                        test_params['buffer_current_size'] = test_cap * buf_ratio
                    else:
                        test_params['initial_investment'] = test_cap
                        test_params['buffer_current_size'] = 0.0

                    # Route to the correct physics arrays
                    if model.startswith('Stochastic'):
                        timelines_to_test = frozen_timelines.get('stochastic', [])
                    elif model == 'linear':
                        base_monthly_rate = (1 + test_params.get('linear_rate', 0.07))**(1/12) - 1
                        timelines_to_test = [[base_monthly_rate] * total_months]
                    elif model.startswith('historical_'):
                        index_name = model.replace('historical_', '')
                        historical_data = simulator.indices.get(index_name, [])
                        timelines_to_test = [simulator._extract_historical_rates(historical_data, test_params, total_months)]
                    else:
                        timelines_to_test = [[0.0] * total_months]

                    final_wealths = []
                    monthly_inflation_rate = (1 + test_params['inflation_percentage']) ** (1/12) - 1
                    
                    # Launch all timelines simultaneously into the worker pool
                    futures = [
                        executor.submit(
                            simulator._run_single_timeline, 
                            test_params, rates, tax, 
                            test_params['simulation_start_year'], test_params['simulation_start_month'], 
                            total_months
                        ) for rates in timelines_to_test
                    ]
                    
                    # Collect them as they finish crunching
                    for future in concurrent.futures.as_completed(futures):
                        res = future.result()
                        
                        annual_real_spends = []
                        for year in range(1, (total_months // 12) + 1):
                            start_m = (year - 1) * 12 + 1
                            end_m = year * 12
                            # Compact list comprehension for the pure monthly discounting
                            real_annual_sum = sum(res[m]['spend'] / ((1 + monthly_inflation_rate) ** (m - 1)) for m in range(start_m, end_m + 1))
                            annual_real_spends.append(real_annual_sum)
                                
                        final_wealths.append({
                            'wealth': res[total_months]['value'], 
                            'min_spend': min(annual_real_spends),
                            'spends': annual_real_spends
                        })
                    
                    final_wealths.sort(key=lambda x: x['wealth'])
                    
                    # Target the specific percentile
                    if model == 'Stochastic (Worst 10%)': eval_idx = int(iterations * 0.10)
                    elif model == 'Stochastic (Median)': eval_idx = int(iterations * 0.50)
                    elif model == 'Stochastic (Best 10%)': eval_idx = int(iterations * 0.90)
                    else: eval_idx = 0 
                    
                    outcome = final_wealths[eval_idx]
                    
                    if outcome['wealth'] > 0 and outcome['min_spend'] >= poverty_threshold_annual:
                        best_safe_capital = test_cap
                        best_p10_spends = outcome['spends'] 
                        high = test_cap 
                    else:
                        low = test_cap 

                # Calculate Psychological Bins & Deepest Cut
                bins = {"100%": 0, "95-99%": 0, "85-94%": 0, "<85%": 0}
                max_cut_pct = 0.0
                
                if best_p10_spends:
                    for s in best_p10_spends:
                        if s < target_spend * 0.995: 
                            cut_depth = (target_spend - s) / target_spend
                            if cut_depth > max_cut_pct:
                                max_cut_pct = cut_depth

                        if s >= target_spend * 0.995: bins["100%"] += 1  
                        elif s >= target_spend * 0.95: bins["95-99%"] += 1
                        elif s >= target_spend * 0.85: bins["85-94%"] += 1
                        else: bins["<85%"] += 1

                deepest_cut_str = f"-{max_cut_pct * 100:.1f}%" if max_cut_pct > 0 else "0.0%"

                spend_proto = "Constant (No Guardrails)"
                if params.get('use_guyton_klinger'): spend_proto = "Guyton-Klinger"
                elif params.get('use_proportional_attenuator'): spend_proto = "Elastic Dimmer"
                elif params.get('enable_low_season_spend'): spend_proto = "Austerity Cut"
                
                # --- SYNCHRONIZED BUFFER PROTOCOL LABELS ---
                buf_proto = "None"
                if params.get('use_cash_buffer'):
                    phase1 = "Phase 1: Glidepath" if params.get('use_equity_glidepath') else ""
                    
                    phase2_components = []
                    if params.get('use_proportional_withdrawal'):
                        phase2_components.append("5. Proportional Withdrawal")
                    elif params.get('use_high_water_mark'):
                        phase2_components.append("4. High-Water Mark")
                    elif params.get('use_baseline_volatility'):
                        phase2_components.append("1. Baseline Volatility")
                        
                    if params.get('use_trend_guardrail'):
                        phase2_components.append("2. SMA Guardrail")
                    if params.get('use_dynamic_buffer'):
                        phase2_components.append("3. Dynamic Sizing")
                        
                    phase2_str = " + ".join(phase2_components)
                    
                    if phase1 and phase2_str:
                        buf_proto = f"{phase1} -> {phase2_str}"
                    elif phase1:
                        buf_proto = phase1
                    elif phase2_str:
                        buf_proto = phase2_str
                    else:
                        buf_proto = "Active (No Base Strategy)"
                        
                results.append({
                    "model": model,
                    "tax": tax,
                    "required_capital": best_safe_capital,
                    "spending_protocol": spend_proto,
                    "buffer_protocol": buf_proto,
                    "bins": bins,
                    "deepest_cut": deepest_cut_str
                })
                
    return {"status": "success", "data": results}

@app.get("/config")
def get_config():
    try:
        # 1. Build the SSOT defaults. 
        default_params = SimulationParams().model_dump()
    except Exception as e:
        print(f"CRITICAL ERROR generating default params: {e}")
        default_params = {} # Fallback to prevent UI lockup

    try:
        # 2. Load the JSONs
        with open("indices_monthly.json", "r") as f:
            indices = json.load(f)
        with open("taxes.json", "r") as f:
            taxes = json.load(f)
            
        return {
            "historical_indices": list(indices.keys()),
            "capital_gains_taxes": list(taxes.get("capital_gains", {}).keys()),
            "pension_taxes": list(taxes.get("pension_income", {}).keys()),
            "default_params": default_params 
        }
    except Exception as e:
        print(f"Warning: Could not load JSON configs: {e}")
        return {
            "historical_indices": [], 
            "capital_gains_taxes": ["Finland"], 
            "pension_taxes": ["Finland"],
            "default_params": default_params 
        }

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
