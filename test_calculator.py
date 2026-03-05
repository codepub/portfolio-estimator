import unittest
from calculator import PortfolioSimulator

class TestPortfolioSimulator(unittest.TestCase):
    def setUp(self):
        # 1. Define mock configurations first
        mock_taxes = {
            "capital_gains": { "Finland": { "type": "flat", "rate": 0.34 } },
            "pension_income": {
                "Finland": { "type": "progressive_estimate", "brackets": [{"limit": None, "rate": 0.20}] },
                "Italy_7_Percent": { "type": "flat", "rate": 0.07 }
            }
        }
        mock_indices = {}  # Empty mock since these tests focus on deterministic math
        
        # 2. Inject them into the simulator
        self.simulator = PortfolioSimulator(taxes_config=mock_taxes, indices_config=mock_indices)
        
        self.base_params = {
            "initial_investment": 1000000,
            "initial_profit_percentage": 0.50,
            "yearly_spending": 60000,
            "inflation_percentage": 0.0, # Zeroed for easier math validation
            "enable_low_season_spend": False,
            "low_season_cut_percentage": 0.10,
            "growth_models": ["linear"],
            "tax_residencies": ["Finland"],
            "linear_rate": 0.05,
            "stochastic_volatility_monthly": 0.04,
            "stochastic_min_annual": -0.50,
            "stochastic_max_annual": 0.60,
            "stochastic_iterations": 10,
            "historical_start_year": 2000,
            "historical_end_year": 2020,
            "simulation_start_year": 2025,
            "simulation_start_month": 1,
            "simulation_end_year": 2075,
            "pensions_inflation_adjusted": False,
            "pensions": [],
            "cash_events": [],
            "relocations": [],
            "spending_events": [],
            "use_cash_buffer": False,
            "buffer_target_months": 36,
            "buffer_current_size": 100000,
            "buffer_depletion_threshold": 0.0,
            "buffer_replenishment_threshold": 0.10
        }
        
        self.base_params = {
            "initial_investment": 1000000,
            "initial_profit_percentage": 0.50,
            "yearly_spending": 60000,
            "inflation_percentage": 0.0, # Zeroed for easier math validation
            "enable_low_season_spend": False,
            "low_season_cut_percentage": 0.10,
            "growth_models": ["linear"],
            "tax_residencies": ["Finland"],
            "linear_rate": 0.05,
            "stochastic_volatility_monthly": 0.04,
            "stochastic_min_annual": -0.50,
            "stochastic_max_annual": 0.60,
            "stochastic_iterations": 10,
            "historical_start_year": 2000,
            "historical_end_year": 2020,
            "simulation_start_year": 2025,
            "simulation_start_month": 1,
            "simulation_end_year": 2075,
            "pensions_inflation_adjusted": False,
            "pensions": [],
            "cash_events": [],
            "relocations": [],
            "spending_events": [],
            "use_cash_buffer": False,
            "buffer_target_months": 36,
            "buffer_current_size": 100000,
            "buffer_depletion_threshold": 0.0,
            "buffer_replenishment_threshold": 0.10
        }

    def test_pension_surplus_reinvestment(self):
        """Test that excess pension income is reinvested into the portfolio."""
        params = self.base_params.copy()
        params["yearly_spending"] = 12000 # 1k/mo
        params["pensions"] = [{
            "amount": 2000, "start_year": 2025, "start_month": 1, 
            "end_year": None, "end_month": None, "tax_regime": "Finland"
        }]
        
        # 2000 gross at 20% mock tax = 1600 net. Spend is 1000. Surplus = 600.
        result = self.simulator._run_single_timeline(params, [0.0]*600, "Finland", 2025, 1, 600)
        
        # Initial is 1,000,000. Month 1 should add the 600 surplus (no market growth).
        self.assertAlmostEqual(result[1]["value"], 1000600.0)
        self.assertEqual(result[1]["w_inv"], 0.0) # Zero equities sold
        self.assertEqual(result[1]["spend"], 1000.0)

    def test_pension_expiration_and_dynamic_tax(self):
        """Test that a pension respects its end date and uses the specified tax regime."""
        params = self.base_params.copy()
        params["yearly_spending"] = 60000
        params["pensions"] = [{
            "amount": 1000, "start_year": 2025, "start_month": 1, 
            "end_year": 2025, "end_month": 6, "tax_regime": "Italy_7_Percent"
        }]
        
        result = self.simulator._run_single_timeline(params, [0.0]*600, "Finland", 2025, 1, 600)
        
        # 1000 gross at 7% = 930 net.
        self.assertEqual(result[1]["w_pen"], 930.0)
        
        # Month 6 should be the last month of the pension
        self.assertEqual(result[6]["w_pen"], 930.0)
        
        # Month 7 should have zero pension
        self.assertEqual(result[7]["w_pen"], 0.0)

    def test_lifestyle_spending_events(self):
        """Test that a spending event cleanly overwrites the baseline consumption."""
        params = self.base_params.copy()
        params["yearly_spending"] = 60000 # 5k/mo
        params["spending_events"] = [{
            "amount": 30000, "year": 2025, "month": 3
        }]
        
        result = self.simulator._run_single_timeline(params, [0.0]*600, "Finland", 2025, 1, 600)
        
        self.assertEqual(result[1]["spend"], 5000.0)
        self.assertEqual(result[2]["spend"], 5000.0)
        # Month 3 resets to 30k/yr = 2.5k/mo
        self.assertEqual(result[3]["spend"], 2500.0)

    def test_continuous_depletion_state(self):
        """Test that the engine calculates partial depletion and continuous forced austerity."""
        params = self.base_params.copy()
        params["initial_investment"] = 5000 
        params["yearly_spending"] = 60000 # 5k/mo target
        params["pensions"] = [{
            "amount": 2000, "start_year": 2025, "start_month": 1, 
            "end_year": None, "end_month": None, "tax_regime": "Finland"
        }]
        
        result = self.simulator._run_single_timeline(params, [0.0]*600, "Finland", 2025, 1, 600)
        
        # Month 2: Portfolio liquidates its last ~€903 gross, yielding €750 net. 
        # Actual spend is €1600 pension + €750 portfolio = €2350.
        self.assertEqual(result[2]["value"], 0.0)
        self.assertAlmostEqual(result[2]["spend"], 2350.0, places=1)
        
        # Month 3: Portfolio is completely gone. Spend is strictly clamped to the €1600 net pension.
        self.assertEqual(result[3]["value"], 0.0)
        self.assertEqual(result[3]["spend"], 1600.0)
        self.assertEqual(result[3]["w_inv"], 0.0)
    
    def test_historical_model_extraction(self):
        """Test that historical data is correctly sliced and looped."""
        params = self.base_params.copy()
        params["growth_models"] = ["historical_MOCK"]
        params["historical_start_year"] = 2000
        params["historical_end_year"] = 2001
        
        # Inject mock index data
        self.simulator.indices = {
            "MOCK": [
                {"year": 1999, "return": 0.50},   # Should be filtered out
                {"year": 2000, "return": 0.1268}, # roughly 1% per month when compounded
                {"year": 2001, "return": 0.0},    # 0% growth
                {"year": 2002, "return": -0.50}   # Should be filtered out
            ]
        }
        
        # Ask the helper for 36 months of data (longer than the 2-year mock slice)
        rates = self.simulator._extract_historical_rates(self.simulator.indices["MOCK"], params, 36)
        
        # 2000 and 2001 gives 24 months of data. 
        # Total requested is 36, so it must loop back to 2000 for the final 12 months.
        self.assertEqual(len(rates), 36)
        
        # 1.1268^(1/12) - 1 is approx 0.01
        self.assertAlmostEqual(rates[0], 0.01, places=3)      # Month 1 (Year 2000)
        self.assertEqual(rates[12], 0.0)                      # Month 13 (Year 2001)
        self.assertAlmostEqual(rates[24], 0.01, places=3)     # Month 25 (Looped back to Year 2000)

    def test_option1_trend_guardrail_execution(self):
        """Prove that the SMA guardrail successfully intercepts and reroutes withdrawals."""
        params = self.base_params.copy()
        params["use_cash_buffer"] = True
        params["buffer_current_size"] = 50000
        params["use_trend_guardrail"] = True
        params["trend_sma_months"] = 3 # Extremely short memory for the test
        
        # Month 1-3: Steady 5% growth. Month 4: Massive 30% crash.
        rates = [0.05, 0.05, 0.05, -0.30] + [0.0] * 596
        
        result = self.simulator._run_single_timeline(params, rates, "Finland", 2025, 1, 600)
        
        # In Month 3, trend is up. Portfolio should be sold to fund the ~5000 monthly spend.
        self.assertGreater(result[3]["w_inv"], 0.0)
        
        # In Month 4, the -30% crash drops the synthetic index below the 3-month SMA.
        # The guardrail should trigger: €0 from investments, 100% from buffer.
        self.assertEqual(result[4]["w_inv"], 0.0)
        self.assertGreater(result[4]["w_buf"], 0.0)

    def test_option2_equity_glidepath(self):
        """Prove that the Equity Glidepath strictly uses the buffer and blocks replenishment during the lock period."""
        params = self.base_params.copy()
        params["use_cash_buffer"] = True
        params["yearly_spending"] = 12000  # 1k / month
        params["buffer_target_months"] = 10 
        params["buffer_current_size"] = 10000 
        
        params["use_equity_glidepath"] = True
        params["glidepath_months"] = 2  # Lock the portfolio for exactly 2 months
        
        # Month 1: +10% (Massive boom. Normally would trigger a replenish. Glidepath must block it.)
        # Month 2: -10% (Market crash. Glidepath continues to force buffer usage.)
        # Month 3: +10% (Massive boom. Glidepath is over. Engine must wake up and replenish the buffer.)
        rates = [0.10, -0.10, 0.10] + [0.0] * 597
        
        result = self.simulator._run_single_timeline(params, rates, "Finland", 2025, 1, 600)
        
        # Month 1 (Inside Glidepath, Market Booming):
        # Must pull expenses strictly from buffer. Must NOT harvest the +10% gain.
        self.assertEqual(result[1]["w_inv"], 0.0)
        self.assertGreater(result[1]["w_buf"], 0.0)
        self.assertLess(result[1]["buffer_val"], 10000) # Buffer drained to pay bills, not refilled
        
        # Month 2 (Inside Glidepath, Market Crashing):
        # Must continue to pull expenses strictly from buffer.
        self.assertEqual(result[2]["w_inv"], 0.0)
        self.assertGreater(result[2]["w_buf"], 0.0)
        self.assertLess(result[2]["buffer_val"], result[1]["buffer_val"]) # Buffer drained further
        
        # Month 3 (Outside Glidepath, Market Booming):
        # The 2-month lock is released. The +10% return now triggers a massive replenish to restore the buffer.
        self.assertGreater(result[3]["w_inv"], 0.0) # Equities sold to pay expenses and refill buffer
        self.assertGreater(result[3]["buffer_val"], result[2]["buffer_val"]) # Buffer is successfully refilled

    def test_option3_counter_cyclical_buy_the_dip(self):
        """Prove that a collapsing slow/fast SMA ratio forcefully buys equities."""
        params = self.base_params.copy()
        params["use_cash_buffer"] = True
        # Set target to exactly what we have, so under normal conditions, no buying happens
        params["yearly_spending"] = 12000 # 1k/month
        params["buffer_target_months"] = 10 
        params["buffer_current_size"] = 10000 
        
        params["use_dynamic_buffer"] = True
        params["trend_sma_months"] = 2
        params["valuation_slow_sma_months"] = 4
        
        # Force a timeline where the fast average crashes violently below the slow average
        rates = [0.10, 0.10, 0.10, 0.10, -0.40, -0.40] + [0.0] * 594
        
        # Track portfolio value precisely before the crash
        result = self.simulator._run_single_timeline(params, rates, "Finland", 2025, 1, 600)
        
        # By Month 6, the 2-month SMA is heavily negative while the 4-month is still buoyed by early gains.
        # The ratio collapses < 1.0. Target buffer shrinks. Excess cash MUST be deployed to portfolio.
        
        # If the buy-the-dip mechanism fired, the buffer value should be lower than what it started with,
        # not because we spent it (spend is only 1k), but because we injected it into the market.
        self.assertLess(result[6]["buffer_val"], 9000)

    def test_option4_high_water_mark(self):
        """Prove that the High-Water Mark strategy only replenishes the buffer at all-time highs."""
        params = self.base_params.copy()
        params["use_cash_buffer"] = True
        params["yearly_spending"] = 12000  # 1k / month
        params["buffer_target_months"] = 10 
        params["buffer_current_size"] = 10000 
        params["use_high_water_mark"] = True
        
        # Month 1: +5% (Sets a new All-Time High)
        # Month 2: -10% (Market crash)
        # Month 3: +2% (Partial recovery, but still below the Month 1 peak)
        # Month 4: +20% (Massive boom, blasts through to a new All-Time High)
        rates = [0.05, -0.10, 0.02, 0.20] + [0.0] * 596
        
        result = self.simulator._run_single_timeline(params, rates, "Finland", 2025, 1, 600)
        
        # Month 2 (Crash): The engine must pull strictly from the buffer. Zero equity sales.
        self.assertEqual(result[2]["w_inv"], 0.0)
        self.assertGreater(result[2]["w_buf"], 0.0)
        self.assertLess(result[2]["buffer_val"], 10000) # Buffer is actively draining
        
        # Month 3 (False Recovery): Market is green, but below ATH. Engine must STILL refuse to sell equities.
        self.assertEqual(result[3]["w_inv"], 0.0)
        self.assertGreater(result[3]["w_buf"], 0.0)
        self.assertLess(result[3]["buffer_val"], result[2]["buffer_val"]) # Buffer drains further
        
        # Month 4 (New ATH): Market crosses the high-water mark. Engine should finally sell equities to refill the buffer.
        self.assertGreater(result[4]["w_inv"], 0.0)
        self.assertAlmostEqual(result[4]["buffer_val"], 10000, delta=1.0) # Buffer is restored to target

    def test_run_simulation_routing(self):
        """Test that the main router successfully calls all growth models without throwing AttributeErrors."""
        params = self.base_params.copy()
        # Request every single model simultaneously
        params["growth_models"] = ["linear", "stochastic", "stochastic_gbm", "stochastic_heston", "historical_MOCK"]
        params["stochastic_iterations"] = 2 # Keep the test fast
        
        self.simulator.indices = {"MOCK": [{"year": 2000, "return": 0.10}]}
        
        # If any of the internal generator methods are missing, this will crash the test
        results = self.simulator.run_simulation(params)
        
        # Verify the dictionary successfully populated the keys for all requested models
        self.assertIn("linear_Finland_value", results[1])
        self.assertIn("stochastic_50_Finland_value", results[1])
        self.assertIn("stochastic_gbm_Finland_value", results[1])
        self.assertIn("stochastic_heston_Finland_value", results[1])
        self.assertIn("historical_MOCK_Finland_value", results[1])

if __name__ == '__main__':
    unittest.main()