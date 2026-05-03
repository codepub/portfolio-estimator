import random
import math
from datetime import datetime
import copy

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
            previous_limit = 0.0
            
            for bracket in config["brackets"]:
                limit = bracket.get("limit")
                rate = bracket["rate"]
                
                if limit is None:
                    # This is the "infinite" top bracket
                    tax += (gross_annual_pension - previous_limit) * rate
                    break
                    
                if gross_annual_pension <= limit:
                    # Total income falls within this specific bracket slice
                    tax += (gross_annual_pension - previous_limit) * rate
                    break
                else:
                    # Income exceeds this bracket. Fill this slice and move to the next.
                    bracket_width = limit - previous_limit
                    tax += bracket_width * rate
                    previous_limit = limit
                    
            return tax
            
        return 0.0
    
    def calculate_interest_tax(self, gross_interest, regime, current_year_gains=0.0):
        """
        Calculates the tax owed on savings account interest.
        Defaults to 'capital_gains' rules unless 'interest_income' is explicitly defined in the JSON.
        """
        if gross_interest <= 0:
            return 0.0

        # Look for a dedicated interest tax config first, fallback to capital gains
        config = self.taxes.get("interest_income", {}).get(regime)
        if not config:
            config = self.taxes.get("capital_gains", {}).get(regime)
            
        if not config:
            return 0.0 # Fallback to zero if regime is completely missing
            
        if config["type"] == "flat":
            return gross_interest * config["rate"]
            
        elif config["type"] in ["tiered", "progressive_estimate"]:
            tax = 0.0
            remaining_interest = gross_interest
            current_g = current_year_gains
            
            for bracket in config["brackets"]:
                limit = bracket.get("limit")
                rate = bracket["rate"]
                
                # Skip brackets we've already filled with earlier capital gains
                if limit is not None and current_g >= limit:
                    continue
                    
                capacity = float('inf') if limit is None else limit - current_g
                
                if remaining_interest <= capacity:
                    # All remaining interest fits perfectly in this bracket slice
                    tax += remaining_interest * rate
                    break
                else:
                    # Fill this bracket slice and move to the next higher bracket
                    tax += capacity * rate
                    current_g += capacity
                    remaining_interest -= capacity
                    
            return tax
            
        return 0.0

    def _calculate_gross_withdrawal(self, net_needed, profit_percentage, tax_config, current_year_gains):
        """
        Reverse-engineers the exact gross withdrawal required to yield a specific net amount, 
        slicing the withdrawal progressively across tiered tax brackets.
        """
        if net_needed <= 0:
            return 0.0

        # Apply Hankintameno-olettama (Deemed Acquisition Cost) cap
        deemed_cost_pct = tax_config.get("deemed_acquisition_cost_pct")
        if deemed_cost_pct is not None:
            max_taxable_profit = 1.0 - deemed_cost_pct
            profit_percentage = min(profit_percentage, max_taxable_profit)

        if profit_percentage <= 0:
            return net_needed # No profit means no tax, gross == net
            
        if tax_config["type"] == "flat":
            return net_needed / (1 - (profit_percentage * tax_config["rate"]))
            
        elif tax_config["type"] in ["tiered", "progressive_estimate"]:
            gross_total = 0.0
            remaining_net = net_needed
            current_g = current_year_gains
            
            for bracket in tax_config["brackets"]:
                limit = bracket.get("limit")
                rate = bracket["rate"]
                
                # Skip brackets we've already filled earlier in the year
                if limit is not None and current_g >= limit:
                    continue
                    
                # Calculate remaining capacity of gains in this specific bracket
                capacity_gains = float('inf') if limit is None else limit - current_g
                max_gross_in_bracket = capacity_gains / profit_percentage
                max_net_in_bracket = max_gross_in_bracket * (1 - (profit_percentage * rate))
                
                if remaining_net <= max_net_in_bracket:
                    # We can finish the rest of the withdrawal inside this bracket
                    gross_here = remaining_net / (1 - (profit_percentage * rate))
                    gross_total += gross_here
                    break
                else:
                    # We consume this entire bracket slice and move up to the next bracket
                    gross_total += max_gross_in_bracket
                    current_g += capacity_gains
                    remaining_net -= max_net_in_bracket
                    
            return gross_total
            
        return net_needed

    def _calculate_net_from_gross(self, gross_amount, profit_percentage, tax_config, current_year_gains):
        """
        Forward-calculates the exact net proceeds from a gross withdrawal, 
        slicing the taxable gains progressively across tiered tax brackets.
        """
        if gross_amount <= 0:
            return 0.0
        
        # Apply Hankintameno-olettama (Deemed Acquisition Cost) cap
        deemed_cost_pct = tax_config.get("deemed_acquisition_cost_pct")
        if deemed_cost_pct is not None:
            max_taxable_profit = 1.0 - deemed_cost_pct
            profit_percentage = min(profit_percentage, max_taxable_profit)

        if profit_percentage <= 0:
            return gross_amount

        total_gains = gross_amount * profit_percentage
        
        if tax_config["type"] == "flat":
            tax_owed = total_gains * tax_config["rate"]
            return gross_amount - tax_owed
            
        elif tax_config["type"] in ["tiered", "progressive_estimate"]:
            tax_owed = 0.0
            remaining_gains = total_gains
            current_g = current_year_gains
            
            for bracket in tax_config["brackets"]:
                limit = bracket.get("limit")
                rate = bracket["rate"]
                
                # Skip brackets we've already filled
                if limit is not None and current_g >= limit:
                    continue
                    
                # Calculate remaining capacity of gains in this specific bracket
                capacity = float('inf') if limit is None else limit - current_g
                
                if remaining_gains <= capacity:
                    # All remaining gains fit perfectly in this bracket slice
                    tax_owed += remaining_gains * rate
                    break
                else:
                    # Fill this bracket slice with gains and move to the next higher bracket
                    tax_owed += capacity * rate
                    current_g += capacity
                    remaining_gains -= capacity
                    
            return gross_amount - tax_owed
            
        return gross_amount

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
        """Heston Model: Stochastic volatility with valuation-anchored mean-reversion.
        Utilizes daily sub-stepping for mathematical stability."""
    
        # Time domain parameters
        dt_monthly = 1.0 / 12.0
        sub_steps_per_month = 21  # roughly trading days in a month
        dt = dt_monthly / sub_steps_per_month
    
        base_mu = expected_annual_return
    
        # Heston parameters
        v_t = annual_volatility**2
        theta = annual_volatility**2
        kappa = 2.5
        xi = 0.4
        rho = -0.7
        x = math.sqrt(1 - rho**2)
    
        # Intrinsic Valuation Anchor parameters
        reversion_strength = 0.05
        simulated_index = 100.0
        trend_index = 100.0
    
        returns = []

        for _ in range(total_months):
            # 1. Calculate the valuation premium at the START of the month.
            # Keeping this at the macro level prevents micro-oscillations.
            valuation_premium = reversion_strength * math.log(trend_index / simulated_index)
            dynamic_mu = base_mu + valuation_premium
        
            monthly_log_return = 0.0
        
            # 2. Sub-step the Heston process (Daily simulation)
            for _ in range(sub_steps_per_month):
                z1 = random.gauss(0, 1)
                z2 = random.gauss(0, 1)
                z_s = z1
                z_v = rho * z1 + x*z2
            
                # Full Truncation scheme: only use the positive part for the drift and diffusion
                v_t_plus = max(v_t, 0.0)
            
                # Step the log price
                daily_log_ret = (dynamic_mu - 0.5 * v_t_plus) * dt + math.sqrt(v_t_plus * dt) * z_s
                monthly_log_return += daily_log_ret
            
                # Step the variance
                v_t = v_t + kappa * (theta - v_t_plus) * dt + xi * math.sqrt(v_t_plus * dt) * z_v
            
            # 3. Convert accumulated log returns back to a discrete monthly percentage
            monthly_return = math.exp(monthly_log_return) - 1
            returns.append(monthly_return)
        
            # 4. Update the macro indices for the next month's valuation anchor
            trend_index *= math.exp(base_mu * dt_monthly)
            simulated_index *= (1 + monthly_return)

        return returns
    
    def generate_filtered_stochastic_timeline(self, params, total_months):
        """
        Generates a stochastic return sequence, applying rejection sampling 
        to ensure the specified initial months do not yield a negative compound return.
        """
        engine_choice = params.get('stochastic_engine', 'gbm')
        annual_rate = params.get('linear_rate', 0.07)
        annual_vol = params.get('stochastic_volatility', 0.13)
        
        # Pull the new monthly parameter
        first_possible_downturn_month = params.get('first_possible_downturn_month', 0)
        max_attempts = 50
        attempts = 0
        stoch_rates = []

        while attempts < max_attempts:
            attempts += 1
            
            if engine_choice == 'heston':
                stoch_rates = self._generate_heston_returns(annual_rate, annual_vol, total_months)
            else:
                stoch_rates = self._generate_gbm_returns(annual_rate, annual_vol, total_months)

            if first_possible_downturn_month > 0:
                early_downturn_detected = False
                
                # Dynamically build evaluation intervals (12-month blocks + remainder)
                chunks = first_possible_downturn_month // 12
                remainder = first_possible_downturn_month % 12
                
                intervals = [(i * 12, (i + 1) * 12) for i in range(chunks)]
                if remainder > 0:
                    intervals.append((chunks * 12, first_possible_downturn_month))
                    
                for start_m, end_m in intervals:
                    # Failsafe if the restricted period exceeds the simulation length
                    if end_m > len(stoch_rates):
                        end_m = len(stoch_rates)
                        
                    chunk_multiplier = 1.0
                    for m in range(start_m, end_m):
                        chunk_multiplier *= (1 + stoch_rates[m])
                        
                    if chunk_multiplier < 1.0:
                        early_downturn_detected = True
                        break
                        
                if early_downturn_detected:
                    continue # Reject and redraw this sequence

            return stoch_rates # Valid timeline found

        # Circuit breaker fallback
        return stoch_rates
    
    def _run_single_timeline(self, params, rates, tax_res, start_year, start_month, total_months):
        results = {}
        portfolio_value = params['initial_investment']
        total_principal = portfolio_value * (1 - params['initial_profit_percentage'])
        current_monthly_spending = params['yearly_spending'] / 12
        current_pension_values = [p['amount'] for p in params['pensions']]
        monthly_inflation_rate = (1 + params['inflation_percentage']) ** (1/12) - 1
        
        current_buffer = params.get('buffer_current_size', 0.0) if params.get('use_cash_buffer', False) else 0.0
        # SAVINGS ACCOUNT YIELD ---
        buffer_interest_rate = params.get('buffer_interest_rate', 0.0)
        # Using geometric compounding to match the inflation and linear rate logic
        monthly_buffer_rate = (1 + buffer_interest_rate)**(1/12) - 1 
        # ----------------------------------
        
        monthly_deplete_threshold = (1 + params.get('buffer_depletion_threshold', 0.0))**(1/12) - 1
        monthly_replenish_threshold = (1 + params.get('buffer_replenishment_threshold', 0.10))**(1/12) - 1
        current_year_gains_withdrawn = 0

        # --- SIGNAL PROCESSING STATE ---
        synthetic_index = 100.0
        high_water_mark_index = 100.0
        
        use_trend_guardrail = params.get('use_trend_guardrail', False)
        use_dynamic_buffer = params.get('use_dynamic_buffer', False)
        use_proportional_withdrawal = params.get('use_proportional_withdrawal', False)
        use_baseline_volatility = params.get('use_baseline_volatility', False)
        
        sma_window = int(params.get('trend_sma_months', 12))
        slow_sma_window = int(params.get('valuation_slow_sma_months', 60))
        
        use_high_water_mark = params.get('use_high_water_mark', False)
        
        # --- SPENDING OVERLAYS: GUYTON-KLINGER ---
        use_guyton_klinger = params.get('use_guyton_klinger', False)
        gk_upper_threshold = params.get('gk_upper_threshold', 0.20)
        gk_lower_threshold = params.get('gk_lower_threshold', 0.20)
        gk_cut_rate = params.get('gk_cut_rate', 0.10)
        gk_raise_rate = params.get('gk_raise_rate', 0.10)
        gk_allow_raises = params.get('gk_allow_raises', True) 
        
        initial_withdrawal_rate = 0.0
        total_initial_assets = params['initial_investment'] + params.get('buffer_current_size', 0.0)
        if total_initial_assets > 0:
            initial_withdrawal_rate = params['yearly_spending'] / total_initial_assets
            
        gk_spend_multiplier = 1.0
        # --------------------------------------
        # NEW: Initialize the dynamic buffer target state
        current_buffer_target_months = params.get('buffer_target_months', 36)

        # --- MEMORY ALLOCATION ---
        requires_slow_sma = use_dynamic_buffer or use_proportional_withdrawal or params.get('use_proportional_attenuator', False)
        max_window = max(sma_window, slow_sma_window) if requires_slow_sma else sma_window
        index_history = [synthetic_index] * max_window
        # ------------------------------------

        for month in range(1, total_months + 1):
            current_absolute_month = (start_year * 12) + start_month - 1 + (month - 1)
            calendar_month = (current_absolute_month % 12) + 1
     
            if calendar_month == 1:
                current_year_gains_withdrawn = 0
                
                # --- SPENDING OVERLAYS: GUYTON-KLINGER ANNUAL EVALUATION ---
                if month > 1 and use_guyton_klinger:
                    current_assets_for_gk = portfolio_value + current_buffer
                    if current_assets_for_gk > 0:
                        current_wr = (current_monthly_spending * 12 * gk_spend_multiplier) / current_assets_for_gk
                        
                        if current_wr > initial_withdrawal_rate * (1 + gk_upper_threshold):
                            gk_spend_multiplier *= (1 - gk_cut_rate)
                        elif gk_allow_raises and current_wr < initial_withdrawal_rate * (1 - gk_lower_threshold):
                            gk_spend_multiplier *= (1 + gk_raise_rate)
                # --------------------------------------------------

            growth_rate = rates[month - 1]
            portfolio_value *= (1 + growth_rate)
            synthetic_index *= (1 + growth_rate)
    
            # --- NEW: TAX-AWARE BUFFER YIELD ---
            if current_buffer > 0 and monthly_buffer_rate > 0:
                gross_interest_this_month = current_buffer * monthly_buffer_rate
                
                # Figure out where the user lives right now
                active_tax_res = tax_res
                for reloc in params.get('relocations', []):
                    reloc_abs_month = (reloc['year'] * 12) + reloc['month'] - 1
                    if current_absolute_month >= reloc_abs_month:
                        active_tax_res = reloc['new_regime']
                
                # Calculate the tax owed on this specific interest payment
                tax_on_interest = self.calculate_interest_tax(
                    gross_interest_this_month, 
                    active_tax_res, 
                    current_year_gains_withdrawn
                )
                
                # Add only the net yield to the buffer
                net_interest = gross_interest_this_month - tax_on_interest
                current_buffer += net_interest
                
                # IMPORTANT: If the interest is being taxed under capital gains, 
                # we must add it to the year's total so subsequent withdrawals hit the right bracket.
                config_used = self.taxes.get("interest_income", {}).get(active_tax_res)
                if not config_used:
                    current_year_gains_withdrawn += gross_interest_this_month
            # -----------------------------------

            use_trend_guardrail = params.get('use_trend_guardrail', False)
            use_dynamic_buffer = params.get('use_dynamic_buffer', False)
            use_equity_glidepath = params.get('use_equity_glidepath', False)
            glidepath_months = int(params.get('glidepath_months', 60))

            index_history.append(synthetic_index)
            
            if len(index_history) > max_window * 2:
                index_history = index_history[-max_window:]
                
            current_sma = sum(index_history[-sma_window:]) / sma_window
            current_slow_sma = sum(index_history[-slow_sma_window:]) / slow_sma_window

            # PHASE 2 (Option 2): Trend Guardrail Evaluation
            is_macro_downtrend = False
            if use_trend_guardrail and synthetic_index < current_sma:
                is_macro_downtrend = True

            # PHASE 2 (Option 3): Dynamic Buffer Sizing & Buy-the-Dip Protocol
            target_buffer = current_monthly_spending * current_buffer_target_months

            if use_dynamic_buffer:
                valuation_ratio = current_sma / current_slow_sma if current_slow_sma > 0 else 1.0
                buffer_multiplier = max(0.5, min(1.5, valuation_ratio))
                target_buffer *= buffer_multiplier
                
            if current_buffer > target_buffer and portfolio_value > 0:
                excess_cash = current_buffer - target_buffer
                current_buffer -= excess_cash
                portfolio_value += excess_cash
                total_principal += excess_cash 
            # ------------------------------------------------

            # PHASE 2 (Option 4): Track the All-Time High of the Market
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

            # --- LIFESTYLE SPENDING CHANGES ---
            for event in params.get('spending_events', []):
                event_abs_month = (event['year'] * 12) + event['month'] - 1
                if current_absolute_month == event_abs_month:
                    inflated_new_spend = event['amount'] * ((1 + monthly_inflation_rate) ** (month - 1))
                    current_monthly_spending = inflated_new_spend / 12

            # NEW: BUFFER TARGET CHANGES
            for event in params.get('buffer_target_events', []):
                event_abs_month = (event['year'] * 12) + event['month'] - 1
                if current_absolute_month == event_abs_month:
                    current_buffer_target_months = event['target_months']
           
            # --- PORTFOLIO REBALANCING EVENTS ---
            for event in params.get('rebalancing_events', []):
                event_abs_month = (event['year'] * 12) + event['month'] - 1
                if current_absolute_month == event_abs_month:
                    rebalance_pct = max(0.0, min(1.0, event.get('percentage', 0.0)))
                    
                    if rebalance_pct > 0 and portfolio_value > 0:
                        # 1. Determine current tax regime for the exact time of the event
                        active_event_tax_res = tax_res
                        for reloc in params.get('relocations', []):
                            reloc_abs_month = (reloc['year'] * 12) + reloc['month'] - 1
                            if current_absolute_month >= reloc_abs_month:
                                active_event_tax_res = reloc['new_regime']
                                
                        tax_config = self.taxes.get("capital_gains", {}).get(active_event_tax_res)
                        
                        if tax_config:
                            # 2. Determine current overall profit percentage
                            current_profit_pct = max(0.0, (portfolio_value - total_principal) / portfolio_value)
                            
                            # 3. Calculate gross rebalance amount and the net proceeds after tax
                            gross_rebalance = portfolio_value * rebalance_pct
                            net_reinvested = self._calculate_net_from_gross(
                                gross_rebalance, 
                                current_profit_pct, 
                                tax_config, 
                                current_year_gains_withdrawn
                            )
                            
                            tax_paid = gross_rebalance - net_reinvested
                            
                            # 4. Apply the tax drag to the portfolio value
                            portfolio_value -= tax_paid
                            
                            # 5. Reset the cost basis (principal) for the rebalanced portion.
                            # The un-rebalanced portion keeps its original principal ratio, 
                            # while the reinvested net proceeds become 100% principal.
                            total_principal_kept = total_principal * (1.0 - rebalance_pct)
                            total_principal = total_principal_kept + net_reinvested
                            
                            # 6. Accumulate realized gains so subsequent standard withdrawals 
                            # in the same year are pushed into the correct progressive tax brackets.
                            current_year_gains_withdrawn += (gross_rebalance * current_profit_pct)

            total_net_pension_this_month = 0
            for i, pension in enumerate(params['pensions']):
                pension_start_absolute_month = (pension['start_year'] * 12) + pension['start_month'] - 1
                is_active = current_absolute_month >= pension_start_absolute_month
                
                if pension.get('end_year') and pension.get('end_month'):
                    pension_end_absolute_month = (pension['end_year'] * 12) + pension['end_month'] - 1
                    if current_absolute_month > pension_end_absolute_month:
                        is_active = False

                if is_active:
                    gross_pension = current_pension_values[i]
                    regime = params['pensions'][i].get('tax_regime', 'Finland') 
                    annual_tax = self.calculate_pension_tax(gross_pension * 12, regime)
                    total_net_pension_this_month += gross_pension - (annual_tax / 12)

            effective_monthly_spending = current_monthly_spending * gk_spend_multiplier
            
            # --- SPENDING OVERLAYS: THE PROPORTIONAL ATTENUATOR (ELASTIC DIMMER) ---
            use_proportional_attenuator = params.get('use_proportional_attenuator', False)
            attenuator_max_cut = params.get('attenuator_max_cut', 0.50)
            
            # New configurable override parameters
            use_attenuator_wr_override = params.get('use_attenuator_wr_override', False)
            attenuator_wr_override_threshold = params.get('attenuator_wr_override_threshold', 0.04) 
            
            if use_proportional_attenuator and current_slow_sma > 0:
                # Calculate current withdrawal rate to see if the portfolio is structurally safe
                total_current_assets_for_wr = portfolio_value + current_buffer
                current_annual_wr = (effective_monthly_spending * 12) / total_current_assets_for_wr if total_current_assets_for_wr > 0 else float('inf')
                
                # Circuit Breaker: Only apply the cut if the override is DISABLED, 
                # OR if the override is enabled but our WR is dangerously above the threshold.
                is_wr_safe = use_attenuator_wr_override and (current_annual_wr <= attenuator_wr_override_threshold)
                
                if not is_wr_safe:
                    if synthetic_index < current_slow_sma:
                        drawdown_pct = (current_slow_sma - synthetic_index) / current_slow_sma
                        actual_cut = min(drawdown_pct, attenuator_max_cut)
                        effective_monthly_spending *= (1.0 - actual_cut)
            # --------------------------------------------------------------

            is_austerity = False
            if params.get('enable_low_season_spend', False) and growth_rate < 0:
                effective_monthly_spending *= (1 - params.get('low_season_cut_percentage', 0.10))
                is_austerity = True            
            
            # --- AUTONOMOUS SURPLUS REINVESTMENT ---
            surplus = total_net_pension_this_month - effective_monthly_spending
            
            if surplus > 0:
                required_withdrawal_net = 0.0
                portfolio_value += surplus
                total_principal += surplus 
            else:
                required_withdrawal_net = abs(surplus)

            # --- BUFFER ROUTING LOGIC (Withdrawal Order) ---
            amount_from_buffer = 0.0
            
            if params.get('use_cash_buffer', False):
                is_in_glidepath = use_equity_glidepath and month <= glidepath_months
                
                # --- Global Seed Corn Protector (Withdrawal Override) ---
                is_critically_low_equities = False
                total_assets_for_check = portfolio_value + current_buffer
                if total_assets_for_check > 0:
                    equity_ratio = portfolio_value / total_assets_for_check
                    critical_floor = params.get('equity_critical_mass_floor', 0.20)
                    if equity_ratio < critical_floor:
                        is_critically_low_equities = True

                # Phase 1: Equity Glidepath
                if is_in_glidepath:
                    amount_from_buffer = min(required_withdrawal_net, current_buffer)
                    
                # Global Override Priority: Critical Mass Survival Floor
                elif is_critically_low_equities:
                    amount_from_buffer = min(required_withdrawal_net, current_buffer)
                    
                # Phase 2 (Option 5): Valuation-Based Proportional Withdrawal
                elif use_proportional_withdrawal:
                    price_below_fast = synthetic_index < current_sma
                    price_below_slow = synthetic_index < current_slow_sma
                    momentum_broken = current_sma < current_slow_sma
                    
                    if price_below_fast:
                        buffer_draw_pct = 1.0
                    elif price_below_slow or momentum_broken:
                        valuation_ratio = current_sma / current_slow_sma if current_slow_sma > 0 else 1.0
                        drawdown = max(0.0, 1.0 - valuation_ratio)
                        buffer_draw_pct = min(1.0, drawdown * 2.0)
                    else:
                        buffer_draw_pct = 0.0
                        
                    desired_buffer_pull = required_withdrawal_net * buffer_draw_pct
                    amount_from_buffer = min(desired_buffer_pull, current_buffer)

                # Phase 2 (Option 4): High-Water Mark 
                elif use_high_water_mark:
                    amount_from_buffer = min(required_withdrawal_net, current_buffer)

                # Phase 2 (Option 2): SMA Trend Guardrail 
                elif use_trend_guardrail and is_macro_downtrend:
                    amount_from_buffer = min(required_withdrawal_net, current_buffer)
                    
                # Phase 2 (Option 1): Baseline Volatility Thresholds
                elif use_baseline_volatility and growth_rate < monthly_deplete_threshold:
                    amount_from_buffer = min(required_withdrawal_net, current_buffer)
                    
                current_buffer -= amount_from_buffer
                required_withdrawal_net -= amount_from_buffer
            # ------------------------------------------------

            # --- Tax Processing ---
            gross_withdrawal = 0.0
            profit_percentage = 0.0
            
            if portfolio_value > 0:
                profit_percentage = max(0, (portfolio_value - total_principal) / portfolio_value)
                
            active_tax_res = tax_res
            for reloc in params.get('relocations', []):
                reloc_abs_month = (reloc['year'] * 12) + reloc['month'] - 1
                if current_absolute_month >= reloc_abs_month:
                    active_tax_res = reloc['new_regime']
                    
            tax_config = self.taxes["capital_gains"][active_tax_res]
            
            # Establish the baseline marginal rate strictly for UI tracking, not math
            if tax_config["type"] == "flat":
                tax_rate = tax_config["rate"]
            else:
                tax_rate = tax_config["brackets"][-1]["rate"] 
                for bracket in tax_config["brackets"]:
                    if bracket["limit"] is None or current_year_gains_withdrawn < bracket["limit"]:
                        tax_rate = bracket["rate"]
                        break

            # Execute the standard withdrawal ONLY if we need the cash
            if required_withdrawal_net > 0 and portfolio_value > 0:
                gross_withdrawal = self._calculate_gross_withdrawal(
                    required_withdrawal_net, 
                    profit_percentage, 
                    tax_config, 
                    current_year_gains_withdrawn
                )
                              
                # --- EMERGENCY OVERRIDE PART 1: Partial Shortfall ---
                if gross_withdrawal > portfolio_value:
                    gross_withdrawal = portfolio_value 
                    # Calculate true net yield using progressive forward-math
                    actual_net_received = self._calculate_net_from_gross(
                        gross_withdrawal, 
                        profit_percentage, 
                        tax_config, 
                        current_year_gains_withdrawn
                    )
                    shortfall = required_withdrawal_net - actual_net_received
                    
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
                emergency_pull = min(required_withdrawal_net, current_buffer)
                current_buffer -= emergency_pull
                amount_from_buffer += emergency_pull
                required_withdrawal_net -= emergency_pull
            # --------------------------------------------------

            # --- BUFFER REPLENISH LOGIC ---
            gross_withdrawal_for_buffer = 0.0
            allow_replenish = True
            if use_equity_glidepath and month <= glidepath_months:
                allow_replenish = False

            # Global Override: Dead-Cat Bounce Protector
            if use_proportional_withdrawal:
                if synthetic_index < current_slow_sma or synthetic_index < current_sma or current_sma < current_slow_sma:
                    allow_replenish = False
            
            # Global Override: Seed Corn Protector (Equity Mass Floor)
            total_assets = portfolio_value + current_buffer
            if total_assets > 0:
                equity_ratio = portfolio_value / total_assets
                equity_replenish_threshold = params.get('equity_replenish_threshold', 0.50)
                if equity_ratio < equity_replenish_threshold:
                    allow_replenish = False


            if params.get('use_cash_buffer', False) and allow_replenish and current_buffer < target_buffer and portfolio_value > 0:
                
                amount_to_add = 0.0
                
                # Phase 2 (Option 4): Only refill if the index is sitting at an all-time historical peak
                if use_high_water_mark:
                    if synthetic_index >= high_water_mark_index:  
                        gains_this_month = portfolio_value * growth_rate if growth_rate > 0 else 0.0
                        net_gains = self._calculate_net_from_gross(
                            gains_this_month, profit_percentage, tax_config, current_year_gains_withdrawn
                        )
                        amount_to_add = min(target_buffer - current_buffer, net_gains)
                        
                # Phase 2 (Option 1): Refill if this month's growth beat the threshold
                elif use_baseline_volatility and growth_rate > monthly_replenish_threshold:
                    gross_excess = portfolio_value * (growth_rate - monthly_replenish_threshold)
                    net_excess = self._calculate_net_from_gross(
                        gross_excess, profit_percentage, tax_config, current_year_gains_withdrawn
                    )
                    amount_to_add = min(target_buffer - current_buffer, net_excess)
                
                # --- The Throttle Valve ---
                throttle_multiplier = params.get('buffer_refill_throttle_months', 3)
                max_safe_refill = current_monthly_spending * throttle_multiplier
                if amount_to_add > max_safe_refill:
                    amount_to_add = max_safe_refill
                # --------------------------------

                # Execute the transfer
                if amount_to_add > 0:
                    gains_base_for_buffer = current_year_gains_withdrawn + (gross_withdrawal * profit_percentage)
                    
                    gross_withdrawal_for_buffer = self._calculate_gross_withdrawal(
                        amount_to_add, 
                        profit_percentage, 
                        tax_config, 
                        gains_base_for_buffer
                    )
                    
                    if gross_withdrawal_for_buffer > portfolio_value:
                        gross_withdrawal_for_buffer = portfolio_value
                        amount_to_add = self._calculate_net_from_gross(
                            gross_withdrawal_for_buffer, profit_percentage, tax_config, gains_base_for_buffer
                        )
                    
                    portfolio_value -= gross_withdrawal_for_buffer
                    principal_withdrawal = gross_withdrawal_for_buffer * (1 - profit_percentage)
                    total_principal -= principal_withdrawal
                    current_year_gains_withdrawn += (gross_withdrawal_for_buffer - principal_withdrawal)
                    current_buffer += amount_to_add
                    
            total_principal = max(0.0, total_principal)

            current_monthly_spending *= (1 + monthly_inflation_rate)
            if params['pensions_inflation_adjusted']:
                current_pension_values = [v * (1 + monthly_inflation_rate) for v in current_pension_values]

            # --- ACTUAL CONSUMPTION TRACKING ---
            if surplus > 0:
                actual_spend = effective_monthly_spending
            else:
                # Use progressive math for accurate spend reporting
                net_investment_withdrawal = self._calculate_net_from_gross(
                    gross_withdrawal, profit_percentage, tax_config, current_year_gains_withdrawn - (gross_withdrawal * profit_percentage)
                )
                actual_spend = total_net_pension_this_month + amount_from_buffer + net_investment_withdrawal

            total_assets = portfolio_value + current_buffer
            
            results[month] = {
                "value": round(total_assets, 2),
                "buffer_val": round(current_buffer, 2),
                "w_inv": round(gross_withdrawal + gross_withdrawal_for_buffer, 2),
                "w_buf": round(amount_from_buffer, 2),
                "w_pen": round(total_net_pension_this_month, 2),
                "return": growth_rate,
                "spend": round(actual_spend, 2),
                "austerity": is_austerity
            }
            
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
                    index_key = model[11:] 
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
                    
                    # Pull destitution variables for the strict sort
                    monthly_inflation_rate = (1 + params.get('inflation_percentage', 0.02)) ** (1/12) - 1
                    destitution_threshold_annual = params.get('destitution_threshold', 600.0) * 12

                    # --- SIMPLIFIED LOOP ---
                    # We simply ask the new method to generate a valid timeline. 
                    # The complex rejection logic is hidden inside that method call.
                    for _ in range(iterations):
                        stoch_rates = self.generate_filtered_stochastic_timeline(params, total_months)

                        safe_params = copy.deepcopy(params)                              
                        run_result = self._run_single_timeline(safe_params, stoch_rates, tax_res, start_year, start_month, total_months)
                        all_runs.append(run_result)

                    # --- NEW STRICT SORTING LOGIC ---
                    def get_sort_key(run):
                        annual_real_spends = []
                        for year in range(1, (total_months // 12) + 1):
                            start_m = (year - 1) * 12 + 1
                            end_m = year * 12
                            real_annual_sum = sum(run[m]['spend'] / ((1 + monthly_inflation_rate) ** (m - 1)) for m in range(start_m, end_m + 1))
                            annual_real_spends.append(real_annual_sum)
                        
                        min_spend = min(annual_real_spends) if annual_real_spends else 0
                        final_wealth = run[total_months]['value']
                        
                        is_safe = final_wealth > 0 and min_spend >= destitution_threshold_annual
                        
                        # Primary sort: Failed paths (0) sort below Safe paths (1).
                        # Secondary sort: Within each group, sort by final wealth.
                        return (1 if is_safe else 0, final_wealth)

                    all_runs.sort(key=get_sort_key)
                    # --------------------------------

                    # Extract the percentiles
                    actual_iterations = len(all_runs)
                    if actual_iterations > 0:
                        p10_run = all_runs[int(actual_iterations * 0.10)]
                        p50_run = all_runs[int(actual_iterations * 0.50)]
                        p90_run = all_runs[int(actual_iterations * 0.90)]

                        for month in range(1, total_months + 1):
                            for prefix, data in [("stochastic_10", p10_run[month]), 
                                                 ("stochastic_50", p50_run[month]), 
                                                 ("stochastic_90", p90_run[month])]:
                                merged_results[month][f"{prefix}_{tax_res}_value"] = data["value"]
                                merged_results[month][f"{prefix}_{tax_res}_buffer_val"] = data["buffer_val"]
                                merged_results[month][f"{prefix}_{tax_res}_w_inv"] = data["w_inv"]
                                merged_results[month][f"{prefix}_{tax_res}_w_buf"] = data["w_buf"]
                                merged_results[month][f"{prefix}_{tax_res}_w_pen"] = data["w_pen"]
                                merged_results[month][f"{prefix}_return"] = data["return"]
                                merged_results[month][f"{prefix}_{tax_res}_spend"] = data.get("spend", 0.0)
                                merged_results[month][f"{prefix}_{tax_res}_austerity"] = data.get("austerity", False)
                                
                else:
                    rates = []
                    
                    if model == 'linear':
                        base_monthly_rate = (1 + params.get('linear_rate', 0.07))**(1/12) - 1
                        rates = [base_monthly_rate] * total_months
                        
                    elif model.startswith('historical'):
                        index_name = model.replace('historical_', '')
                        historical_data = self.indices.get(index_name, [])
                        rates = self._extract_historical_rates(historical_data, params, total_months) 
                        
                    elif model == 'stochastic_gbm':
                        annual_rate = params.get('linear_rate', 0.07)
                        annual_vol = params.get('stochastic_volatility', 0.13) 
                        rates = self._generate_gbm_returns(annual_rate, annual_vol, total_months)
                        
                    elif model == 'stochastic_heston':
                        annual_rate = params.get('linear_rate', 0.07)
                        annual_vol = params.get('stochastic_volatility', 0.225) 
                        rates = self._generate_heston_returns(annual_rate, annual_vol, total_months)
                    else:
                        rates = [0.0] * total_months 

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