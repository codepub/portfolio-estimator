import unittest
from calculator import PortfolioSimulator

class TestSimulatorAdvancedRegimes(unittest.TestCase):
    def setUp(self):
        # Provide minimal valid configurations to initialize the engine
        dummy_taxes = {
            "capital_gains": {"Finland": {"type": "flat", "rate": 0.30}},
            "pension_income": {"Finland": {"type": "flat", "rate": 0.20}}
        }
        # Renamed to match the legacy test you moved over
        self.simulator = PortfolioSimulator(dummy_taxes, {})

        # A tightly controlled baseline state
        self.base_params = {
            'initial_investment': 100000.0,
            'initial_profit_percentage': 0.0,
            'yearly_spending': 12000.0, # Exactly €1,000 / month
            'pensions': [],
            'pensions_inflation_adjusted': False, 
            'cash_events': [],
            'spending_events': [],
            'relocations': [],
            'inflation_percentage': 0.0,
            'use_cash_buffer': True,
            'buffer_current_size': 50000.0,
            'buffer_target_months': 36,
            'trend_sma_months': 2,            # Fast moving average (2 months)
            'valuation_slow_sma_months': 4,   # Slow moving average (4 months)
            'equity_critical_mass_floor': 0.20,
            'buffer_replenishment_threshold': 0.05, 
            'use_baseline_volatility': False,
            'use_proportional_withdrawal': False,
            'use_trend_guardrail': False,
            'use_equity_glidepath': False,
            'use_high_water_mark': False
        }

    def test_valley_elasticity_option5_vs_option1(self):
        """
        Tests the 'Early Recovery' (Valley) phase.
        Scenario: Market crashes, then bounces slightly. 
        Price > Fast SMA (Short-term uptrend), but Price < Slow SMA (Long-term underwater).
        """
        controlled_rates = [0.0, 0.0, -0.10, 0.05]
        
        # --- Run 1: Legacy Option 1 (Binary Trend) ---
        params_opt1 = self.base_params.copy()
        params_opt1['use_trend_guardrail'] = True
        
        res_opt1 = self.simulator._run_single_timeline(params_opt1, controlled_rates, "Finland", 2026, 1, 4)
        month4_opt1 = res_opt1[4]
        
        # Binary trend sees the short-term uptrend and immediately pulls 100% from equities
        self.assertEqual(month4_opt1['w_buf'], 0.0)
        self.assertAlmostEqual(month4_opt1['w_inv'], 1000.0, places=1)

        # --- Run 2: Advanced Option 5 (Proportional Withdrawal) ---
        params_opt5 = self.base_params.copy()
        params_opt5['use_proportional_withdrawal'] = True
        
        res_opt5 = self.simulator._run_single_timeline(params_opt5, controlled_rates, "Finland", 2026, 1, 4)
        month4_opt5 = res_opt5[4]
        
        # Elastic trend sees it is still underwater (Slow SMA > Fast SMA) 
        # and proportional splits the burden. It should draw from BOTH.
        self.assertTrue(0.0 < month4_opt5['w_buf'] < 1000.0, "Option 5 failed to elastically draw from the buffer.")
        self.assertTrue(0.0 < month4_opt5['w_inv'] < 1000.0, "Option 5 failed to elastically draw from equities.")
        
        # The exact math check: Based on the valuation ratio (SMA / Slow SMA), 
        # we expect it to pull roughly 8% from the buffer (approx €80.62)
        self.assertAlmostEqual(month4_opt5['w_buf'], 80.62, places=1)

    def test_hurricane_lock_equivalence(self):
        """
        Tests that both Option 1 and Option 5 correctly lock down during a pure crash.
        """
        controlled_rates = [0.0, 0.0, -0.10]
        
        params_opt1 = self.base_params.copy()
        params_opt1['use_trend_guardrail'] = True
        res_opt1 = self.simulator._run_single_timeline(params_opt1, controlled_rates, "Finland", 2026, 1, 3)
        
        params_opt5 = self.base_params.copy()
        params_opt5['use_proportional_withdrawal'] = True
        res_opt5 = self.simulator._run_single_timeline(params_opt5, controlled_rates, "Finland", 2026, 1, 3)

        self.assertEqual(res_opt1[3]['w_buf'], 1000.0)
        self.assertEqual(res_opt5[3]['w_buf'], 1000.0)

    def test_seed_corn_protector_option6(self):
        """
        Tests the critical mass survival floor.
        """
        params = self.base_params.copy()
        params['initial_investment'] = 15000.0
        params['buffer_current_size'] = 85000.0
        
        controlled_rates = [0.10] 
        
        res = self.simulator._run_single_timeline(params, controlled_rates, "Finland", 2026, 1, 1)
        
        self.assertEqual(res[1]['w_buf'], 1000.0)
        self.assertEqual(res[1]['w_inv'], 0.0)

    def test_dead_cat_bounce_refill_protector(self):
        """
        Tests that a single positive month during a drawdown does not trigger a buffer refill.
        """
        params = self.base_params.copy()
        params['use_proportional_withdrawal'] = True
        params['buffer_current_size'] = 10000.0 
        
        controlled_rates = [0.0, 0.0, -0.20, 0.10]
        
        res = self.simulator._run_single_timeline(params, controlled_rates, "Finland", 2026, 1, 4)
        
        living_expenses_covered_by_equities = 1000.0 - res[4]['w_buf']
        self.assertAlmostEqual(res[4]['w_inv'], living_expenses_covered_by_equities, places=1)

    def test_guyton_klinger_survival_mechanics(self):
        """
        Tests why Guyton-Klinger survives deep crashes better than static withdrawals.
        Scenario: A sharp 30% drop in portfolio value over the first year, followed by a flat year.
        """
        # Base setup: €1,000,000 portfolio, €50,000 spend (5.0% Initial Withdrawal Rate)
        params = self.base_params.copy()
        params['initial_investment'] = 1000000.0
        params['buffer_current_size'] = 0.0
        params['yearly_spending'] = 50000.0 
        
        # A brutal Year 1: approx -30% total drop. Year 2: Flat.
        rates = [-0.029] * 12 + [0.0] * 12
        
        # --- Run 1: Static Withdrawal (No Guardrails) ---
        res_static = self.simulator._run_single_timeline(params, rates, "Finland", 2026, 1, 24)
        
        # --- Run 2: Guyton-Klinger Active ---
        params_gk = params.copy()
        params_gk['use_guyton_klinger'] = True
        params_gk['gk_upper_threshold'] = 0.20 # Trigger if WR hits 6.0% (5.0 * 1.2)
        params_gk['gk_cut_rate'] = 0.10        # Cut spend by 10%
        res_gk = self.simulator._run_single_timeline(params_gk, rates, "Finland", 2026, 1, 24)
        
        # Evaluation at Month 13 (Start of Year 2)
        # Portfolio fell to ~€650k. Static spending is still €50k (a dangerous 7.6% WR).
        # GK detects 7.6% > 6.0% and slices the lifestyle budget.
        
        static_monthly_spend = res_static[13]['spend']
        gk_monthly_spend = res_gk[13]['spend']
        
        # Prove the static spend stayed at €4,166/mo
        self.assertAlmostEqual(static_monthly_spend, 50000 / 12, places=1)
        
        # Prove the GK spend successfully ratcheted down by 10% to €3,750/mo
        self.assertAlmostEqual(gk_monthly_spend, (50000 * 0.9) / 12, places=1)
        
        # Prove the systemic outcome: By Month 24, the GK portfolio has mathematically 
        # preserved more capital because it dynamically reduced its burn rate.
        self.assertTrue(res_gk[24]['value'] > res_static[24]['value'])

    def test_monte_carlo_p10_buffer_vs_guyton_klinger(self):
        """
        Runs 500 Heston timelines to find the 10th percentile (Worst 10%) outcome
        for both the Cash Buffer (Options 5+6) and Guyton-Klinger strategies.
        """
        import random
        random.seed(42) # Locked for reproducibility across 500 runs
        
        iterations = 500
        total_months = 600 # 50 Years
        inflation_rate = 0.02
        
        buffer_min_spends = []
        buffer_final_wealths = []
        
        gk_min_spends = []
        gk_final_wealths = []
        
        print(f"\nIgniting {iterations} Heston Timelines. Please wait...")
        
        for i in range(iterations):
            # Generate a unique Heston path for this iteration
            rates = self.simulator._generate_heston_returns(0.07, 0.225, total_months)
            
            # --- SCENARIO A: Buffer (Opt 5+6) ---
            params_buffer = self.base_params.copy()
            params_buffer['initial_investment'] = 1350000.0
            params_buffer['buffer_current_size'] = 120000.0
            params_buffer['yearly_spending'] = 50000.0
            params_buffer['inflation_percentage'] = inflation_rate
            params_buffer['use_cash_buffer'] = True
            params_buffer['use_proportional_withdrawal'] = True
            params_buffer['equity_critical_mass_floor'] = 0.20
            params_buffer['equity_replenish_threshold'] = 0.50
            params_buffer['use_guyton_klinger'] = False
            
            res_buffer = self.simulator._run_single_timeline(params_buffer, rates, "Finland", 2026, 1, total_months)
            
            # --- SCENARIO B: Guyton-Klinger ---
            params_gk = self.base_params.copy()
            params_gk['initial_investment'] = 1470000.0
            params_gk['buffer_current_size'] = 0.0
            params_gk['yearly_spending'] = 50000.0
            params_gk['inflation_percentage'] = inflation_rate
            params_gk['use_cash_buffer'] = False
            params_gk['use_proportional_withdrawal'] = False
            params_gk['use_guyton_klinger'] = True
            params_gk['gk_upper_threshold'] = 0.20 
            params_gk['gk_lower_threshold'] = 0.20
            params_gk['gk_cut_rate'] = 0.10
            params_gk['gk_raise_rate'] = 0.10
            params_gk['gk_allow_raises'] = True
            
            res_gk = self.simulator._run_single_timeline(params_gk, rates, "Finland", 2026, 1, total_months)
            
            # --- Extract Minimum Real Spends for this iteration ---
            min_buf = float('inf')
            min_gk = float('inf')
            
            for year in range(1, 51):
                start_m = (year - 1) * 12 + 1
                end_m = year * 12
                
                yearly_buf = sum(res_buffer[m]['spend'] for m in range(start_m, end_m + 1))
                yearly_gk = sum(res_gk[m]['spend'] for m in range(start_m, end_m + 1))
                
                discount_factor = (1 + inflation_rate) ** year
                real_buf = yearly_buf / discount_factor
                real_gk = yearly_gk / discount_factor
                
                if 0 < real_buf < min_buf: min_buf = real_buf
                if 0 < real_gk < min_gk: min_gk = real_gk
                
            buffer_min_spends.append(min_buf)
            buffer_final_wealths.append(res_buffer[total_months]['value'])
            
            gk_min_spends.append(min_gk)
            gk_final_wealths.append(res_gk[total_months]['value'])

        # --- Calculate Percentiles ---
        # Sort the arrays from worst to best
        buffer_min_spends.sort()
        buffer_final_wealths.sort()
        gk_min_spends.sort()
        gk_final_wealths.sort()
        
        # 10th Percentile Index
        p10_idx = int(iterations * 0.10)
        
        print("\n" + "="*70)
        print(f" MONTE CARLO P10 (WORST 10% OUTCOMES ACROSS {iterations} RUNS)")
        print("="*70)
        print(f"P10 Minimum Real Spend (Buffer 5+6): €{buffer_min_spends[p10_idx]:,.0f} / year")
        print(f"P10 Minimum Real Spend (Guyton-K):   €{gk_min_spends[p10_idx]:,.0f} / year")
        print("-" * 70)
        print(f"P10 Final Nominal Wealth (Buffer):   €{buffer_final_wealths[p10_idx]:,.0f}")
        print(f"P10 Final Nominal Wealth (Guyton-K): €{gk_final_wealths[p10_idx]:,.0f}")
        print("="*70 + "\n")

    def test_monte_carlo_p10_three_way_comparison(self):
        """
        Runs 500 Heston timelines to find the 10th percentile (Worst 10%) outcome.
        Compares Cash Buffer (Opt 5+6) vs. Guyton-Klinger vs. Proportional Attenuator.
        Enforces strict variable isolation to prevent state leakage.
        """
        import random
        import copy
        random.seed(42) # Locked for reproducibility
        
        iterations = 500
        total_months = 600 # 50 Years
        inflation_rate = 0.02
        
        # Arrays to hold the results across all 500 runs
        results = {
            'buffer': {'min_spend': [], 'final_wealth': []},
            'gk': {'min_spend': [], 'final_wealth': []},
            'attenuator': {'min_spend': [], 'final_wealth': []}
        }
        
        print(f"\nIgniting {iterations} Heston Timelines for 3-Way Test. Please wait...")
        
        for i in range(iterations):
            rates = self.simulator._generate_heston_returns(0.07, 0.225, total_months)
            
            # --- SCENARIO A: Buffer (Opt 5+6) ---
            # deepcopy guarantees a completely isolated memory space for this run
            params_buffer = copy.deepcopy(self.base_params)
            params_buffer['initial_investment'] = 850000.0
            params_buffer['buffer_current_size'] = 150000.0
            params_buffer['yearly_spending'] = 30000.0
            params_buffer['inflation_percentage'] = inflation_rate
            params_buffer['use_cash_buffer'] = True
            params_buffer['use_proportional_withdrawal'] = True
            params_buffer['equity_critical_mass_floor'] = 0.20
            params_buffer['equity_replenish_threshold'] = 0.50
            params_buffer['use_guyton_klinger'] = False
            params_buffer['use_proportional_attenuator'] = False
            
            res_buf = self.simulator._run_single_timeline(params_buffer, rates, "Finland", 2026, 1, total_months)
            
            # --- SCENARIO B: Guyton-Klinger ---
            params_gk = copy.deepcopy(self.base_params)
            params_gk['initial_investment'] = 1000000.0
            params_gk['buffer_current_size'] = 0.0
            params_gk['yearly_spending'] = 30000.0
            params_gk['inflation_percentage'] = inflation_rate
            params_gk['use_cash_buffer'] = False
            params_gk['use_guyton_klinger'] = True
            params_gk['gk_upper_threshold'] = 0.20 
            params_gk['gk_lower_threshold'] = 0.20
            params_gk['gk_cut_rate'] = 0.10
            params_gk['gk_raise_rate'] = 0.10
            params_gk['gk_allow_raises'] = True
            params_gk['use_proportional_attenuator'] = False
            
            res_gk = self.simulator._run_single_timeline(params_gk, rates, "Finland", 2026, 1, total_months)
            
            # --- SCENARIO C: Proportional Attenuator (The Elastic Dimmer) ---
            params_att = copy.deepcopy(self.base_params)
            params_att['initial_investment'] = 1000000.0
            params_att['buffer_current_size'] = 0.0
            params_att['yearly_spending'] = 30000.0
            params_att['inflation_percentage'] = inflation_rate
            params_att['use_cash_buffer'] = False
            params_att['use_guyton_klinger'] = False
            params_att['use_proportional_attenuator'] = True
            params_att['attenuator_max_cut'] = 0.50 # Never cut more than 50%
            
            res_att = self.simulator._run_single_timeline(params_att, rates, "Finland", 2026, 1, total_months)
            
            # --- Extract Minimum Real Spends ---
            min_buf = float('inf')
            min_gk = float('inf')
            min_att = float('inf')
            
            for year in range(1, 51):
                start_m = (year - 1) * 12 + 1
                end_m = year * 12
                
                discount = (1 + inflation_rate) ** year
                
                real_buf = sum(res_buf[m]['spend'] for m in range(start_m, end_m + 1)) / discount
                real_gk = sum(res_gk[m]['spend'] for m in range(start_m, end_m + 1)) / discount
                real_att = sum(res_att[m]['spend'] for m in range(start_m, end_m + 1)) / discount
                
                if 0 < real_buf < min_buf: min_buf = real_buf
                if 0 < real_gk < min_gk: min_gk = real_gk
                if 0 < real_att < min_att: min_att = real_att
                
            results['buffer']['min_spend'].append(min_buf)
            results['buffer']['final_wealth'].append(res_buf[total_months]['value'])
            
            results['gk']['min_spend'].append(min_gk)
            results['gk']['final_wealth'].append(res_gk[total_months]['value'])
            
            results['attenuator']['min_spend'].append(min_att)
            results['attenuator']['final_wealth'].append(res_att[total_months]['value'])

        # --- Sort to find Percentiles ---
        for strategy in results.values():
            strategy['min_spend'].sort()
            strategy['final_wealth'].sort()
            
        p10_idx = int(iterations * 0.10)
        
        print("\n" + "="*80)
        print(f" P10 OUTCOMES (Worst 10% across {iterations} Heston Timelines)")
        print("="*80)
        print(f"{'Strategy':<25} | {'Minimum Real Spend / Yr':<25} | {'Final Nominal Wealth'}")
        print("-" * 80)
        
        strategies = [
            ("Cash Buffer (Opt 5+6)", 'buffer'),
            ("Guyton-Klinger", 'gk'),
            ("Proportional Attenuator", 'attenuator')
        ]
        
        for name, key in strategies:
            spend = results[key]['min_spend'][p10_idx]
            wealth = results[key]['final_wealth'][p10_idx]
            print(f"{name:<25} | €{spend:<24,.0f} | €{wealth:,.0f}")
            
        print("="*80 + "\n")
        
        # Explicit teardown to guarantee no memory leakage to other tests
        del results, params_buffer, params_gk, params_att, rates, res_buf, res_gk, res_att

    def test_monte_carlo_p10_three_way_comparison_qol(self):
        """
        Runs 500 Heston timelines to find the 10th percentile (Worst 10%) outcome.
        Compares Cash Buffer (Opt 5+6) vs. Guyton-Klinger vs. Proportional Attenuator.
        Focuses on Quality of Life: Minimum Real Spend and Average Real Spend at a 3% withdrawal rate.
        """
        import random
        import copy
        import statistics
        random.seed(42) # Locked for reproducibility
        
        iterations = 10
        total_months = 600 # 50 Years
        inflation_rate = 0.02
        yearly_spend_target = 30000.0 # 3.0% Initial Withdrawal to ensure survival
        
        results = {
            'buffer': {'min_spend': [], 'avg_spend': [], 'final_wealth': []},
            'gk': {'min_spend': [], 'avg_spend': [], 'final_wealth': []},
            'attenuator': {'min_spend': [], 'avg_spend': [], 'final_wealth': []}
        }
        
        print(f"\nIgniting {iterations} Heston Timelines (3.0% Target). Please wait...")
        
        for i in range(iterations):
            rates = self.simulator._generate_heston_returns(0.07, 0.225, total_months)
            
            # --- SCENARIO A: Buffer (Opt 5+6) ---
            params_buf = copy.deepcopy(self.base_params)
            params_buf['initial_investment'] = 850000.0
            params_buf['buffer_current_size'] = 150000.0
            params_buf['yearly_spending'] = yearly_spend_target
            params_buf['inflation_percentage'] = inflation_rate
            params_buf['use_cash_buffer'] = True
            params_buf['use_proportional_withdrawal'] = True
            params_buf['equity_critical_mass_floor'] = 0.20
            params_buf['equity_replenish_threshold'] = 0.50
            params_buf['use_guyton_klinger'] = False
            params_buf['use_proportional_attenuator'] = False
            
            res_buf = self.simulator._run_single_timeline(params_buf, rates, "Finland", 2026, 1, total_months)
            
            # --- SCENARIO B: Guyton-Klinger ---
            params_gk = copy.deepcopy(self.base_params)
            params_gk['initial_investment'] = 1000000.0
            params_gk['buffer_current_size'] = 0.0
            params_gk['yearly_spending'] = yearly_spend_target
            params_gk['inflation_percentage'] = inflation_rate
            params_gk['use_cash_buffer'] = False
            params_gk['use_guyton_klinger'] = True
            params_gk['gk_upper_threshold'] = 0.20 
            params_gk['gk_lower_threshold'] = 0.20
            params_gk['gk_cut_rate'] = 0.10
            params_gk['gk_raise_rate'] = 0.10
            params_gk['gk_allow_raises'] = True
            params_gk['use_proportional_attenuator'] = False
            
            res_gk = self.simulator._run_single_timeline(params_gk, rates, "Finland", 2026, 1, total_months)
            
            # --- SCENARIO C: Proportional Attenuator ---
            params_att = copy.deepcopy(self.base_params)
            params_att['initial_investment'] = 1000000.0
            params_att['buffer_current_size'] = 0.0
            params_att['yearly_spending'] = yearly_spend_target
            params_att['inflation_percentage'] = inflation_rate
            params_att['use_cash_buffer'] = False
            params_att['use_guyton_klinger'] = False
            params_att['use_proportional_attenuator'] = True
            params_att['attenuator_max_cut'] = 0.50 
            
            res_att = self.simulator._run_single_timeline(params_att, rates, "Finland", 2026, 1, total_months)
            
            # --- Extract Quality of Life Metrics ---
            for strat, res in [('buffer', res_buf), ('gk', res_gk), ('attenuator', res_att)]:
                yearly_real_spends = []
                
                for year in range(1, 51):
                    start_m = (year - 1) * 12 + 1
                    end_m = year * 12
                    discount = (1 + inflation_rate) ** year
                    real_spend = sum(res[m]['spend'] for m in range(start_m, end_m + 1)) / discount
                    yearly_real_spends.append(real_spend)
                
                # Filter out pure zeros for the minimum calculation so we see the true floor
                non_zero_spends = [s for s in yearly_real_spends if s > 1.0]
                min_s = min(non_zero_spends) if non_zero_spends else 0.0
                avg_s = statistics.mean(yearly_real_spends)
                
                results[strat]['min_spend'].append(min_s)
                results[strat]['avg_spend'].append(avg_s)
                results[strat]['final_wealth'].append(res[total_months]['value'])

        # --- Sort to find Percentiles ---
        for strat in results.values():
            strat['min_spend'].sort()
            strat['avg_spend'].sort()
            strat['final_wealth'].sort()
            
        p10_idx = int(iterations * 0.10)
        
        print("\n" + "="*100)
        print(f" QUALITY OF LIFE (Worst 10% across {iterations} Runs | 3.0% Initial Withdrawal)")
        print("="*100)
        print(f"{'Strategy':<25} | {'Min Real Spend/Yr':<20} | {'Avg Real Spend/Yr':<20} | {'Final Nominal Wealth'}")
        print("-" * 100)
        
        strategies = [
            ("Cash Buffer (Opt 5+6)", 'buffer'),
            ("Guyton-Klinger", 'gk'),
            ("Proportional Attenuator", 'attenuator')
        ]
        
        for name, key in strategies:
            p10_min = results[key]['min_spend'][p10_idx]
            p10_avg = results[key]['avg_spend'][p10_idx]
            p10_wealth = results[key]['final_wealth'][p10_idx]
            print(f"{name:<25} | €{p10_min:<19,.0f} | €{p10_avg:<19,.0f} | €{p10_wealth:,.0f}")
            
        print("="*100 + "\n")
        
        # Memory cleanup
        del results, params_buf, params_gk, params_att, rates, res_buf, res_gk, res_att

    def test_minimum_capital_binary_search(self):
        """
        Inverts the problem: Fixes spending at €40,000/yr and uses a binary search algorithm 
        to find the absolute minimum initial capital required to survive the P10 Heston crash.
        """
        import random
        import copy
        
        # 1. Lock the universe. We must test every capital amount against the exact same storms.
        random.seed(42)
        iterations = 200
        total_months = 600
        inflation_rate = 0.02
        target_spend = 40000.0
        
        print(f"\n[INIT] Generating frozen matrix of {iterations} Heston timelines...")
        rates_matrix = [self.simulator._generate_heston_returns(0.07, 0.225, total_months) for _ in range(iterations)]
        
        # 2. Define the Search Engine
        def find_minimum_safe_capital(base_params, strategy_name, is_buffer_strategy=False):
            # Binary search bounds (€500k to €3M)
            low = 500000.0
            high = 3000000.0
            tolerance = 20000.0 # Stop searching when we narrow it down to a €20k window
            best_safe_capital = high
            
            print(f"\n--- Binary Search: {strategy_name} ---")
            
            while (high - low) > tolerance:
                test_cap = (low + high) / 2.0
                
                final_wealths = []
                for rates in rates_matrix:
                    params = copy.deepcopy(base_params)
                    
                    # If it's the buffer strategy, we split the test capital 85% Equities / 15% Cash
                    if is_buffer_strategy:
                        params['initial_investment'] = test_cap * 0.85
                        params['buffer_current_size'] = test_cap * 0.15
                    else:
                        params['initial_investment'] = test_cap
                        params['buffer_current_size'] = 0.0
                        
                    params['yearly_spending'] = target_spend
                    params['inflation_percentage'] = inflation_rate
                    
                    res = self.simulator._run_single_timeline(params, rates, "Finland", 2026, 1, total_months)
                    final_wealths.append(res[total_months]['value'])
                
                # Sort and find the P10 outcome
                final_wealths.sort()
                p10_wealth = final_wealths[int(iterations * 0.10)]
                
                if p10_wealth > 0:
                    best_safe_capital = test_cap
                    high = test_cap # It survived! Try less money.
                    print(f" [PASS] €{test_cap:<10,.0f} -> Survived P10 (Checking lower...)")
                else:
                    low = test_cap  # It failed. We need more money.
                    print(f" [FAIL] €{test_cap:<10,.0f} -> Bankrupt in P10 (Checking higher...)")
                    
            return best_safe_capital

        # 3. Setup the distinct strategy profiles
        
        # Buffer Strategy (Opt 5+6)
        params_buf = copy.deepcopy(self.base_params)
        params_buf.update({'use_cash_buffer': True, 'use_proportional_withdrawal': True, 
                           'equity_critical_mass_floor': 0.20, 'equity_replenish_threshold': 0.50,
                           'use_guyton_klinger': False, 'use_proportional_attenuator': False})
        
        # Guyton-Klinger
        params_gk = copy.deepcopy(self.base_params)
        params_gk.update({'use_cash_buffer': False, 'use_guyton_klinger': True, 
                          'gk_upper_threshold': 0.20, 'gk_lower_threshold': 0.20,
                          'gk_cut_rate': 0.10, 'gk_raise_rate': 0.10, 'gk_allow_raises': True,
                          'use_proportional_attenuator': False})
        
        # Proportional Attenuator
        params_att = copy.deepcopy(self.base_params)
        params_att.update({'use_cash_buffer': False, 'use_guyton_klinger': False,
                           'use_proportional_attenuator': True, 'attenuator_max_cut': 0.50})

        # 4. Execute the searches
        print("="*70)
        print(f" TARGETING: Minimum Capital to guarantee €{target_spend:,.0f}/yr in P10")
        print("="*70)
        
        req_buf = find_minimum_safe_capital(params_buf, "Cash Buffer (Opt 5+6)", is_buffer_strategy=True)
        req_gk = find_minimum_safe_capital(params_gk, "Guyton-Klinger", is_buffer_strategy=False)
        req_att = find_minimum_safe_capital(params_att, "Proportional Attenuator", is_buffer_strategy=False)
        
        # 5. Final Telemetry Readout
        print("\n" + "="*70)
        print(" MASS REQUIREMENT RESULTS (Worst 10% Heston 50-Year)")
        print("="*70)
        print(f"Cash Buffer (Opt 5+6)   : €{req_buf:,.0f} required")
        print(f"Guyton-Klinger          : €{req_gk:,.0f} required")
        print(f"Proportional Attenuator : €{req_att:,.0f} required")
        print("="*70 + "\n")
        
        # Teardown
        del rates_matrix, params_buf, params_gk, params_att

    def test_minimum_capital_six_way_search_with_bins(self):
        """
        Binary search targeting: €60,000/yr P10 survival.
        Poverty threshold: €30,000/yr real spend.
        Compares 6 regimes (including pure Constant Spend).
        Outputs a 4-bin histogram of the lived experience (Years spent at various spending levels).
        """
        import random
        import copy
        
        # Lock the Heston universe 
        random.seed(42)
        iterations = 200
        total_months = 600
        inflation_rate = 0.02
        target_spend = 60000.0
        poverty_threshold_annual = 30000.0  
        
        print(f"\n[INIT] Generating frozen matrix of {iterations} Heston timelines...")
        rates_matrix = [self.simulator._generate_heston_returns(0.07, 0.225, total_months) for _ in range(iterations)]
        
        def find_minimum_safe_capital(base_params, strategy_name, is_buffer_strategy=False):
            # Widened bounds for the Constant Spend model which requires massive capital
            low = 1000000.0
            high = 8000000.0
            tolerance = 25000.0 
            best_safe_capital = high
            best_p10_spends = []
            
            print(f"\n--- Binary Search: {strategy_name} ---")
            
            while (high - low) > tolerance:
                test_cap = (low + high) / 2.0
                timeline_results = []
                
                for rates in rates_matrix:
                    params = copy.deepcopy(base_params)
                    
                    if is_buffer_strategy:
                        params['initial_investment'] = test_cap * 0.85
                        params['buffer_current_size'] = test_cap * 0.15
                    else:
                        params['initial_investment'] = test_cap
                        params['buffer_current_size'] = 0.0
                        
                    params['yearly_spending'] = target_spend
                    params['inflation_percentage'] = inflation_rate
                    
                    res = self.simulator._run_single_timeline(params, rates, "Finland", 2026, 1, total_months)
                    
                    annual_real_spends = []
                    for year in range(1, 51):
                        start_m = (year - 1) * 12 + 1
                        end_m = year * 12
                        discount = (1 + inflation_rate) ** year
                        real_spend = sum(res[m]['spend'] for m in range(start_m, end_m + 1)) / discount
                        annual_real_spends.append(real_spend)
                        
                    timeline_results.append({
                        'final_wealth': res[total_months]['value'],
                        'min_real_spend': min(annual_real_spends),
                        'spends': annual_real_spends
                    })
                
                timeline_results.sort(key=lambda x: x['final_wealth'])
                p10_outcome = timeline_results[int(iterations * 0.10)]
                
                if p10_outcome['final_wealth'] > 0 and p10_outcome['min_real_spend'] >= poverty_threshold_annual:
                    best_safe_capital = test_cap
                    best_p10_spends = p10_outcome['spends']
                    high = test_cap 
                    print(f" [PASS] €{test_cap:<10,.0f} -> Survived P10 (Min Spend: €{p10_outcome['min_real_spend']:,.0f})")
                else:
                    low = test_cap  
                    fail_reason = "Bankrupt" if p10_outcome['final_wealth'] <= 0 else f"Poverty (Hit €{p10_outcome['min_real_spend']:,.0f})"
                    print(f" [FAIL] €{test_cap:<10,.0f} -> {fail_reason} in P10")
            
            # Categorize the 50 years of the winning P10 timeline into 4 bins
            bins = {"30k-40k": 0, "40k-50k": 0, "50k-60k": 0, "60k+": 0}
            if best_p10_spends:
                for s in best_p10_spends:
                    if s < 40000: bins["30k-40k"] += 1
                    elif s < 50000: bins["40k-50k"] += 1
                    elif s < 60000: bins["50k-60k"] += 1
                    else: bins["60k+"] += 1
                    
            return best_safe_capital, bins

        # --- 0. Standard Constant Spend (No Guardrails) ---
        params_std = copy.deepcopy(self.base_params)
        params_std.update({'use_cash_buffer': False, 'use_guyton_klinger': False,
                           'use_proportional_attenuator': False, 'enable_low_season_spend': False})

        # --- 1. Pure Buffer Strategy (Opt 5+6) ---
        params_buf = copy.deepcopy(self.base_params)
        params_buf.update({'use_cash_buffer': True, 'use_proportional_withdrawal': True, 
                           'equity_critical_mass_floor': 0.20, 'equity_replenish_threshold': 0.50,
                           'use_guyton_klinger': False, 'use_proportional_attenuator': False,
                           'enable_low_season_spend': False})
                           
        # --- 2. Binary Austerity (Low Season Spend Cut) ---
        params_aust = copy.deepcopy(self.base_params)
        params_aust.update({'use_cash_buffer': False, 'use_guyton_klinger': False,
                            'use_proportional_attenuator': False, 'enable_low_season_spend': True,
                            'low_season_cut_percentage': 0.20}) 
        
        # --- 3. Guyton-Klinger Guardrails ---
        params_gk = copy.deepcopy(self.base_params)
        params_gk.update({'use_cash_buffer': False, 'use_guyton_klinger': True, 
                          'gk_upper_threshold': 0.20, 'gk_lower_threshold': 0.20,
                          'gk_cut_rate': 0.10, 'gk_raise_rate': 0.10, 'gk_allow_raises': True,
                          'use_proportional_attenuator': False, 'enable_low_season_spend': False})
        
        # --- 4. Pure Elastic Dimmer ---
        params_att = copy.deepcopy(self.base_params)
        params_att.update({'use_cash_buffer': False, 'use_guyton_klinger': False,
                           'use_proportional_attenuator': True, 'attenuator_max_cut': 0.50,
                           'enable_low_season_spend': False})

        # --- 5. THE HYBRID (Buffer + Dimmer) ---
        params_hyb = copy.deepcopy(self.base_params)
        params_hyb.update({'use_cash_buffer': True, 'use_proportional_withdrawal': True, 
                           'equity_critical_mass_floor': 0.20, 'equity_replenish_threshold': 0.50,
                           'use_guyton_klinger': False, 'use_proportional_attenuator': True, 
                           'attenuator_max_cut': 0.50, 'enable_low_season_spend': False})

        print("="*110)
        print(f" TARGETING: Minimum Capital for €{target_spend:,.0f}/yr (Poverty Floor: €{poverty_threshold_annual:,.0f}/yr)")
        print("="*110)
        
        results = [
            ("Constant Spend (Baseline)", *find_minimum_safe_capital(params_std, "Constant Spend (Baseline)", False)),
            ("Pure Cash Buffer", *find_minimum_safe_capital(params_buf, "Pure Cash Buffer (Opt 5+6)", True)),
            ("Binary Austerity", *find_minimum_safe_capital(params_aust, "Binary Austerity (20% Cut)", False)),
            ("Guyton-Klinger", *find_minimum_safe_capital(params_gk, "Guyton-Klinger Guardrails", False)),
            ("Pure Elastic Dimmer", *find_minimum_safe_capital(params_att, "Pure Elastic Dimmer", False)),
            ("The Hybrid (Buffer+Dimmer)", *find_minimum_safe_capital(params_hyb, "The Hybrid (Buffer+Dimmer)", True))
        ]
        
        print("\n" + "="*110)
        print(f" FINAL RESULTS (Worst 10% Heston 50-Year | €60k Target | €30k Floor)")
        print("="*110)
        print(f"{'Strategy':<28} | {'Required Capital':<18} | {'€60k+':<8} | {'€50k-60k':<10} | {'€40k-50k':<10} | {'€30k-40k':<10}")
        print("-" * 110)
        
        for name, req_cap, bins in results:
            print(f"{name:<28} | €{req_cap:<17,.0f} | {bins['60k+']:<5} yrs | {bins['50k-60k']:<8} yrs | {bins['40k-50k']:<8} yrs | {bins['30k-40k']:<8} yrs")
            
        print("="*110 + "\n")
                
if __name__ == '__main__':
    unittest.main(verbosity=2)