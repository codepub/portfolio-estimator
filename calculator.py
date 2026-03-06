import random
import math
from datetime import datetime

class PortfolioSimulator:
    def __init__(self, taxes_config, indices_config):
        self.taxes = taxes_config
        self.indices = indices_config

    def calculate_pension_tax(self, gross_annual_pension, regime):
        config = self.taxes.get("pension_income", {}).get(regime)
        if not config:
            return 0.0 # Fallback to zero tax if config is missing
            
        if config["type"] == "flat":
            return gross_annual_pension * config["rate"]
            
        elif config["type"] in ["tiered", "progressive_estimate"]:
            tax = 0.0
            remaining_gross = gross_annual_pension
            for bracket in config["brackets"]:
                limit = bracket.get("limit")
                rate = bracket["rate"]
                if limit is None or remaining_gross <= limit:
                    tax += remaining_gross * rate
                    break
                else:
                    tax += limit * rate
                    remaining_gross -= limit
            return tax
        return 0.0


    def _extract_historical_rates(self, historical_data, params, total_months):
        """
        Smart-extracts historical data.
        1. If monthly data is available for the year, it uses the real monthly return.
        2. If only annual data is available, it smears the return across 12 months.
        3. Loops the sequence to fill the required simulation length.
        """
        start_year = params.get('historical_start_year', 1950)
        end_year = params.get('historical_end_year', 2025)
        
        # We'll build a flat list of actual monthly rates
        monthly_sequence = []
        
        # Group data by year to handle mixed monthly/yearly inputs
        from collections import defaultdict
        data_by_year = defaultdict(list)
        for d in historical_data:
            if start_year <= d.get('year', 0) <= end_year:
                data_by_year[d['year']].append(d)

        # Iterate through years in chronological order
        for year in sorted(data_by_year.keys()):
            year_data = data_by_year[year]
            
            # Case A: We have monthly data for this year
            # We check if 'month' exists in any of the entries for this year
            if any('month' in d for d in year_data):
                # Sort by month to ensure chronological order (Jan -> Dec)
                sorted_months = sorted(year_data, key=lambda x: x.get('month', 0))
                for m_data in sorted_months:
                    monthly_sequence.append(m_data['return'])
            
            # Case B: We only have a single yearly return for this year
            else:
                annual_return = year_data[0]['return']
                # (1 + R_annual)^(1/12) - 1
                monthly_rate = (1 + annual_return)**(1/12) - 1
                monthly_sequence.extend([monthly_rate] * 12)

        # Fallback to zero growth if no data was found in that window
        if not monthly_sequence:
            return [0.0] * total_months
            
        # Loop the sequence until we fulfill the total_months (e.g., 600 months)
        rates = []
        while len(rates) < total_months:
            rates.extend(monthly_sequence)
            
        return rates[:total_months]  

    def _generate_gbm_returns(self, expected_annual_return, annual_volatility, total_months):
        """Geometric Brownian Motion: Log-normal random walk."""
        dt = 1/12
        mu = expected_annual_return
        sigma = annual_volatility
        returns = []
        
        for _ in range(total_months):
            z = random.gauss(0, 1)
            log_ret = (mu - 0.5 * sigma**2) * dt + sigma * math.sqrt(dt) * z
            returns.append(math.exp(log_ret) - 1)
            
        return returns

    def _generate_heston_returns(self, expected_annual_return, annual_volatility, total_months):
        """Heston Model: Stochastic volatility with mean-reversion and leverage effects."""
        dt = 1/12
        mu = expected_annual_return
        
        v_t = annual_volatility**2
        theta = annual_volatility**2
        kappa = 2.0
        xi = 0.4
        rho = -0.7
        
        returns = []
        
        for _ in range(total_months):
            z1 = random.gauss(0, 1)
            z2 = random.gauss(0, 1)
            z_s = z1
            z_v = rho * z1 + math.sqrt(1 - rho**2) * z2
            
            v_t_plus = max(v_t, 0.0)
            log_ret = (mu - 0.5 * v_t_plus) * dt + math.sqrt(v_t_plus * dt) * z_s
            returns.append(math.exp(log_ret) - 1)
            
            v_t = v_t + kappa * (theta - v_t_plus) * dt + xi * math.sqrt(v_t_plus * dt) * z_v
            
        return returns

    def _run_single_timeline(self, params, rates, tax_res, start_year, start_month, total_months):
        results = {}
        portfolio_value = params['initial_investment']
        total_principal = portfolio_value * (1 - params['initial_profit_percentage'])
        current_monthly_spending = params['yearly_spending'] / 12
        current_pension_values = [p['amount'] for p in params['pensions']]
        monthly_inflation_rate = (1 + params['inflation_percentage']) ** (1/12) - 1
        
        current_buffer = params.get('buffer_current_size', 0.0) if params.get('use_cash_buffer', False) else 0.0
        monthly_deplete_threshold = (1 + params.get('buffer_depletion_threshold', 0.0))**(1/12) - 1
        monthly_replenish_threshold = (1 + params.get('buffer_replenishment_threshold', 0.10))**(1/12) - 1
        current_year_gains_withdrawn = 0

        # --- SIGNAL PROCESSING STATE ---
        synthetic_index = 100.0
        high_water_mark_index = 100.0
        # We track the pure synthetic index to avoid the "Unreachable Peak" trap
        
        use_trend_guardrail = params.get('use_trend_guardrail', False)
        use_dynamic_buffer = params.get('use_dynamic_buffer', False)
        
        sma_window = int(params.get('trend_sma_months', 12))
        slow_sma_window = int(params.get('valuation_slow_sma_months', 60))
        
        use_high_water_mark = params.get('use_high_water_mark', False)
        

        # Ensure the history array is long enough to support the slow SMA if it's active
        max_window = max(sma_window, slow_sma_window) if use_dynamic_buffer else sma_window
        index_history = [synthetic_index] * max_window 
        # ------------------------------------

        for month in range(1, total_months + 1):
            current_absolute_month = (start_year * 12) + start_month - 1 + (month - 1)
            calendar_month = (current_absolute_month % 12) + 1
     
            if calendar_month == 1:
                current_year_gains_withdrawn = 0

            growth_rate = rates[month - 1]
            portfolio_value *= (1 + growth_rate)
            synthetic_index *= (1 + growth_rate)
    
            use_trend_guardrail = params.get('use_trend_guardrail', False)
            use_dynamic_buffer = params.get('use_dynamic_buffer', False)
            use_equity_glidepath = params.get('use_equity_glidepath', False)
            glidepath_months = int(params.get('glidepath_months', 60))


            index_history.append(synthetic_index)
            
            if len(index_history) > max_window * 2:
                index_history = index_history[-max_window:]
                
            current_sma = sum(index_history[-sma_window:]) / sma_window
            
            # Option 1: Trend Guardrail Evaluation
            is_macro_downtrend = False
            if use_trend_guardrail and synthetic_index < current_sma:
                is_macro_downtrend = True

            # Option 3: Dynamic Buffer Sizing & Buy-the-Dip Protocol
            # We start with the baseline target
            target_buffer = current_monthly_spending * params.get('buffer_target_months', 36)
            
            if use_dynamic_buffer:
                current_slow_sma = sum(index_history[-slow_sma_window:]) / slow_sma_window
                
                # Valuation ratio: Fast / Slow. Bounded between 0.5x (cheap) and 1.5x (expensive)
                valuation_ratio = current_sma / current_slow_sma if current_slow_sma > 0 else 1.0
                buffer_multiplier = max(0.5, min(1.5, valuation_ratio))
                
                # Apply the multiplier to dynamically resize the target buffer
                target_buffer *= buffer_multiplier
                
                # Counter-Cyclical Action: If the dynamically shrunk target is now lower than 
                # our actual cash on hand, we autonomously deploy the excess cash to buy cheap equities.
                if current_buffer > target_buffer and portfolio_value > 0:
                    excess_cash = current_buffer - target_buffer
                    current_buffer -= excess_cash
                    portfolio_value += excess_cash
                    total_principal += excess_cash # Dilute profit percentage to reflect higher cost basis
            # ------------------------------------------------

            # Option 4: Track the All-Time High of the Market ---
            if use_high_water_mark and synthetic_index > high_water_mark_index:
                high_water_mark_index = synthetic_index

            for event in params.get('cash_events', []):
                event_absolute_month = (event['year'] * 12) + event['month'] - 1
                if current_absolute_month == event_absolute_month:
                    if event['target'] == 'buffer' and params.get('use_cash_buffer', False):
                        current_buffer += event['amount']
                    elif event['target'] == 'investment':
                        portfolio_value += event['amount']
                        total_principal += event['amount']

            # --- NEW: LIFESTYLE SPENDING CHANGES ---
            for event in params.get('spending_events', []):
                event_abs_month = (event['year'] * 12) + event['month'] - 1
                if current_absolute_month == event_abs_month:
                    # Inflate the user's "today's euros" input to match the current timeline's nominal reality
                    inflated_new_spend = event['amount'] * ((1 + monthly_inflation_rate) ** (month - 1))
                    current_monthly_spending = inflated_new_spend / 12

            total_net_pension_this_month = 0
            for i, pension in enumerate(params['pensions']):
                pension_start_absolute_month = (pension['start_year'] * 12) + pension['start_month'] - 1
                
                # Assume active if past the start date
                is_active = current_absolute_month >= pension_start_absolute_month
                
                # Override to false if we have passed a defined end date
                if pension.get('end_year') and pension.get('end_month'):
                    pension_end_absolute_month = (pension['end_year'] * 12) + pension['end_month'] - 1
                    if current_absolute_month > pension_end_absolute_month:
                        is_active = False

                if is_active:
                    gross_pension = current_pension_values[i]
                    # Extract the selected regime, defaulting to Finland
                    regime = params['pensions'][i].get('tax_regime', 'Finland') 
                    
                    annual_tax = self.calculate_pension_tax(gross_pension * 12, regime)
                    total_net_pension_this_month += gross_pension - (annual_tax / 12)

            effective_monthly_spending = current_monthly_spending
            is_austerity = False
            if params.get('enable_low_season_spend', False) and growth_rate < 0:
                effective_monthly_spending = current_monthly_spending * (1 - params.get('low_season_cut_percentage', 0.10))
                is_austerity = True

            # --- NEW: AUTONOMOUS SURPLUS REINVESTMENT ---
            surplus = total_net_pension_this_month - effective_monthly_spending
            
            if surplus > 0:
                # Pension covers everything. No withdrawal needed. Reinvest the extra cash.
                required_withdrawal_net = 0.0
                portfolio_value += surplus
                total_principal += surplus  # Dilutes profit percentage
            else:
                # Standard withdrawal scenario
                required_withdrawal_net = abs(surplus)

            # --- UPDATED: Buffer Routing Logic ---
            amount_from_buffer = 0.0
            
            if params.get('use_cash_buffer', False):
                is_in_glidepath = use_equity_glidepath and month <= glidepath_months
                
                # Option 2: Equity Glidepath (Priority 1)
                # Deliberately drain the buffer for all expenses during the initial danger zone
                if is_in_glidepath:
                    amount_from_buffer = min(required_withdrawal_net, current_buffer)

                # Option 4: High-Water Mark (Always pull from cash first)
                elif use_high_water_mark:
                    amount_from_buffer = min(required_withdrawal_net, current_buffer)

                # Option 1: SMA Trend Guardrail (Priority 2)
                elif use_trend_guardrail and is_macro_downtrend:
                    amount_from_buffer = min(required_withdrawal_net, current_buffer)
                    
                # Default Fallback: Short-term volatility threshold
                elif growth_rate < monthly_deplete_threshold:
                    amount_from_buffer = min(required_withdrawal_net, current_buffer)
                    
                current_buffer -= amount_from_buffer
                required_withdrawal_net -= amount_from_buffer
            # ------------------------------------------------

            gross_withdrawal = 0.0
            tax_rate = 0.0
            profit_percentage = 0.0
            if required_withdrawal_net > 0 and portfolio_value > 0:
                profit_percentage = max(0, (portfolio_value - total_principal) / portfolio_value)
                active_tax_res = tax_res
                for reloc in params.get('relocations', []):
                    reloc_abs_month = (reloc['year'] * 12) + reloc['month'] - 1
                    if current_absolute_month >= reloc_abs_month:
                        active_tax_res = reloc['new_regime']
                
                tax_config = self.taxes["capital_gains"][active_tax_res]
                if tax_config["type"] == "flat":
                    tax_rate = tax_config["rate"]
                elif tax_config["type"] == "tiered":
                    tax_rate = tax_config["brackets"][-1]["rate"] 
                    for bracket in tax_config["brackets"]:
                        if bracket["limit"] is None or current_year_gains_withdrawn < bracket["limit"]:
                            tax_rate = bracket["rate"]
                            break
                
                gross_withdrawal = required_withdrawal_net / (1 - (profit_percentage * tax_rate))
                
                # --- EMERGENCY OVERRIDE PART 1: Partial Shortfall ---
                if gross_withdrawal > portfolio_value:
                    gross_withdrawal = portfolio_value 
                    actual_net_received = gross_withdrawal * (1 - (profit_percentage * tax_rate))
                    shortfall = required_withdrawal_net - actual_net_received
                    
                    # Portfolio couldn't cover it. Force the shortfall onto the buffer.
                    if shortfall > 0 and current_buffer > 0:
                        emergency_pull = min(shortfall, current_buffer)
                        current_buffer -= emergency_pull
                        amount_from_buffer += emergency_pull
                        required_withdrawal_net -= emergency_pull
                # ----------------------------------------------------
                
                portfolio_value -= gross_withdrawal
                principal_withdrawal = gross_withdrawal * (1 - profit_percentage)
                total_principal -= principal_withdrawal
                current_year_gains_withdrawn += (gross_withdrawal - principal_withdrawal)

            # --- EMERGENCY OVERRIDE PART 2: Portfolio Empty ---
            elif required_withdrawal_net > 0 and portfolio_value <= 0 and current_buffer > 0:
                # The portfolio is completely empty. We MUST drain the buffer to survive,
                # ignoring all strategy threshold rules.
                emergency_pull = min(required_withdrawal_net, current_buffer)
                current_buffer -= emergency_pull
                amount_from_buffer += emergency_pull
                required_withdrawal_net -= emergency_pull
            # --------------------------------------------------

            # --- NEW: Prevent replenishment during the Glidepath phase ---

            gross_withdrawal_for_buffer = 0.0
            allow_replenish = True
            if use_equity_glidepath and month <= glidepath_months:
                allow_replenish = False
                
            if params.get('use_cash_buffer', False) and allow_replenish and current_buffer < target_buffer and portfolio_value > 0:
                
                amount_to_add = 0.0
                
                # Option 4: Only refill if the index is sitting at an all-time historical peak
                if use_high_water_mark:
                    if synthetic_index >= high_water_mark_index :  
                        amount_to_add = target_buffer - current_buffer
                
                # Standard Logic: Refill if this month's growth beat the threshold
                elif growth_rate > monthly_replenish_threshold:
                    gross_excess = portfolio_value * (growth_rate - monthly_replenish_threshold)
                    net_excess = gross_excess * (1 - (profit_percentage * tax_rate))
                    amount_to_add = min(target_buffer - current_buffer, net_excess)
                
                # Execute the transfer
                if amount_to_add > 0:
                    gross_withdrawal_for_buffer = amount_to_add / (1 - (profit_percentage * tax_rate))
                    if gross_withdrawal_for_buffer > portfolio_value:
                        gross_withdrawal_for_buffer = portfolio_value
                        amount_to_add = gross_withdrawal_for_buffer * (1 - (profit_percentage * tax_rate))
                    
                    portfolio_value -= gross_withdrawal_for_buffer
                    principal_withdrawal = gross_withdrawal_for_buffer * (1 - profit_percentage)
                    total_principal -= principal_withdrawal
                    current_year_gains_withdrawn += (gross_withdrawal_for_buffer - principal_withdrawal)
                    current_buffer += amount_to_add
                    
                    # Reset the peak so we don't continuously harvest a sideways market
                    #if use_high_water_mark:
                    #    high_water_mark_index = synthetic_index

            # Ensure principal tracking doesn't drift negative from floating point math
            total_principal = max(0.0, total_principal)

            current_monthly_spending *= (1 + monthly_inflation_rate)
            if params['pensions_inflation_adjusted']:
                current_pension_values = [v * (1 + monthly_inflation_rate) for v in current_pension_values]

            # --- NEW: ACTUAL CONSUMPTION TRACKING ---
            if surplus > 0:
                # Target met entirely by pension. Rest was reinvested.
                actual_spend = effective_monthly_spending
            else:
                # Target exceeded pension. Spend is pension + buffer used + net cash pulled from equities.
                net_investment_withdrawal = gross_withdrawal * (1 - (profit_percentage * tax_rate))
                actual_spend = total_net_pension_this_month + amount_from_buffer + net_investment_withdrawal

            total_assets = portfolio_value + current_buffer
            
            results[month] = {
                "value": round(total_assets, 2),
                "buffer_val": round(current_buffer, 2),
                "w_inv": round(gross_withdrawal + gross_withdrawal_for_buffer, 2),
                "w_buf": round(amount_from_buffer, 2),
                "w_pen": round(total_net_pension_this_month, 2),
                "return": ((1 + growth_rate)**12) - 1,
                "spend": round(actual_spend, 2),
                "austerity": is_austerity
            }
            
            # (The "if total_assets <= 0: break" block has been completely removed)

        return results

    def run_simulation(self, params):
        models_to_run = params.get('growth_models', ['linear'])
        taxes_to_run = params.get('tax_residencies', ['Finland'])
        
        start_year = params.get('simulation_start_year', datetime.now().year)
        start_month = params.get('simulation_start_month', (datetime.now().month % 12) + 1)
        end_year = params.get('simulation_end_year', start_year + 50)
        total_months = (end_year - start_year) * 12
        
        merged_results = { month: {"month": month} for month in range(1, total_months + 1) }

        # PRE-CALCULATION FOR STATIC MODELS
        static_rates = {}
        for model in [m for m in models_to_run if m != 'stochastic']:
            rates = []
            for month in range(1, total_months + 1):
                cal_year = ((start_year * 12) + start_month - 1 + (month - 1)) // 12
                if model == 'linear':
                    rates.append((1 + params['linear_rate'])**(1/12) - 1)
                elif model.startswith('historical_'):
                    # Strip the first 11 characters ('historical_') to get the exact JSON key
                    index_key = model[11:] 
                    
                    # Look up the key directly in the loaded indices dictionary
                    history = [row for row in self.indices.get(index_key, []) if params['historical_start_year'] <= row['year'] <= params['historical_end_year']]
                    if not history:
                        rates.append(0.0)
                    else:
                        rates.append((1 + history[cal_year % len(history)]['return']) ** (1/12) - 1)
            static_rates[model] = rates

        # EXECUTION PHASE
        for model in models_to_run:
            for tax_res in taxes_to_run:
                if model == 'stochastic':
                    iterations = params.get('stochastic_iterations', 100)
                    all_runs = []
                    
                    engine_choice = params.get('stochastic_engine', 'gbm')
                    annual_rate = params.get('linear_rate', 0.07)
                    
                    # Convert the UI's monthly volatility to the annualized metric the math expects
                    annual_vol = params.get('stochastic_volatility', 0.13)

                    # 1. Run distinct 50-year timelines based on the chosen physics engine
                    for _ in range(iterations):
                        if engine_choice == 'heston':
                            stoch_rates = self._generate_heston_returns(annual_rate, annual_vol, total_months)
                        else:
                            stoch_rates = self._generate_gbm_returns(annual_rate, annual_vol, total_months)
                            
                        # No more artificial clamping! The math runs pure.
                        run_result = self._run_single_timeline(params, stoch_rates, tax_res, start_year, start_month, total_months)
                        all_runs.append(run_result)
                    
                    # 2. Sort results month-by-month and extract percentiles
                    for month in range(1, total_months + 1):
                        month_data = [run[month] for run in all_runs]
                        month_data.sort(key=lambda x: x['value']) # Sort by portfolio value
                        
                        p10 = month_data[int(iterations * 0.10)]
                        p50 = month_data[int(iterations * 0.50)]
                        p90 = month_data[int(iterations * 0.90)]
                        
                        for prefix, data in [("stochastic_10", p10), ("stochastic_50", p50), ("stochastic_90", p90)]:
                            merged_results[month][f"{prefix}_{tax_res}_value"] = data["value"]
                            merged_results[month][f"{prefix}_{tax_res}_buffer_val"] = data["buffer_val"]
                            merged_results[month][f"{prefix}_{tax_res}_w_inv"] = data["w_inv"]
                            merged_results[month][f"{prefix}_{tax_res}_w_buf"] = data["w_buf"]
                            merged_results[month][f"{prefix}_{tax_res}_w_pen"] = data["w_pen"]
                            merged_results[month][f"{prefix}_return"] = data["return"]

                            merged_results[month][f"{prefix}_{tax_res}_spend"] = data.get("spend", 0.0)
                            merged_results[month][f"{prefix}_{tax_res}_austerity"] = data.get("austerity", False)
                else:
                    # Execute single-path models (Linear, Historical, GBM, Heston)
                    rates = []
                    
                    if model == 'linear':
                        base_monthly_rate = (1 + params.get('linear_rate', 0.07))**(1/12) - 1
                        rates = [base_monthly_rate] * total_months
                        
                    elif model.startswith('historical'):
                        index_name = model.replace('historical_', '')
                        historical_data = self.indices.get(index_name, [])
                        # (Assume your existing historical extraction logic goes here to populate 'rates')
                        rates = self._extract_historical_rates(historical_data, params, total_months) # Keep whatever logic you currently have here
                        
                    # --- NEW: QUANTITATIVE PATHS ---
                    elif model == 'stochastic_gbm':
                        annual_rate = params.get('linear_rate', 0.07)
                        annual_vol = params.get('stochastic_volatility', 0.13) # <-- Updated
                        rates = self._generate_gbm_returns(annual_rate, annual_vol, total_months)
                        
                    elif model == 'stochastic_heston':
                        annual_rate = params.get('linear_rate', 0.07)
                        annual_vol = params.get('stochastic_volatility', 0.225) # <-- Updated
                        rates = self._generate_heston_returns(annual_rate, annual_vol, total_months)
                    else:
                        rates = [0.0] * total_months # Fallback safety

                    # Feed the generated rates into the simulator
                    single_run = self._run_single_timeline(params, rates, tax_res, start_year, start_month, total_months)
                    
                    for month in range(1, total_months + 1):
                        data = single_run[month]
                        merged_results[month][f"{model}_{tax_res}_value"] = data["value"]
                        merged_results[month][f"{model}_{tax_res}_buffer_val"] = data["buffer_val"]
                        merged_results[month][f"{model}_{tax_res}_w_inv"] = data["w_inv"]
                        merged_results[month][f"{model}_{tax_res}_w_buf"] = data["w_buf"]
                        merged_results[month][f"{model}_{tax_res}_w_pen"] = data["w_pen"]
                        merged_results[month][f"{model}_return"] = data["return"]
                        merged_results[month][f"{model}_{tax_res}_spend"] = data.get("spend", 0.0)
                        merged_results[month][f"{model}_{tax_res}_austerity"] = data.get("austerity", False)

        return list(merged_results.values())
