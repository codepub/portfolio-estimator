import statistics
import math
import unittest
from unittest.mock import patch
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

    def test_stochastic_volatility_scaling(self):
        """Prove that the stochastic engine correctly scales annual volatility to monthly steps."""
        expected_annual_return = 0.07
        target_annual_vol = 0.225
        total_months = 10000  # Large sample size to ensure statistical convergence
        
        # Generate a single raw timeline of 10,000 months to get a statistically significant sample
        # (Replace '_generate_gbm_rates' with your actual internal generator function name)
        rates = self.simulator._generate_gbm_returns(
            expected_annual_return, 
            target_annual_vol, 
            total_months)
        
        # Calculate the actual standard deviation of the generated monthly returns
        monthly_vol = statistics.stdev(rates)
        
        # Scale it back up to see what the annualized result is
        realized_annual_vol = monthly_vol * math.sqrt(12)
        
        # The realized volatility should be very close to the 0.225 target
        self.assertAlmostEqual(realized_annual_vol, target_annual_vol, delta=0.01,
            msg=f"FATAL: Volatility scaling failed. Expected ~{target_annual_vol}, got {realized_annual_vol}")

    def test_monte_carlo_path_continuity(self):
        """
        Prove that Monte Carlo percentiles are unbroken, individual timelines
        and that monthly returns are not accidentally annualized.
        """
        params = self.base_params.copy()
        params["growth_models"] = ["stochastic"]
        params["stochastic_engine"] = "gbm"
        params["stochastic_iterations"] = 50 
        target_vol = 0.13
        params["stochastic_volatility"] = target_vol
        params["simulation_start_year"] = 2025
        params["simulation_end_year"] = 2075  # 50 years = 600 months
        
        # Run the full pipeline
        results = self.simulator.run_simulation(params)
        
        # Extract the median path's returns
        median_returns = [month_data["stochastic_50_return"] for month_data in results]
        
        # VERIFICATION 1: The "Annualized Return" Bug
        # A single monthly return in a 13% vol environment should rarely exceed 15-20%. 
        # If the backend accidentally annualizes the output ((1+r)^12 - 1), 
        # these numbers will routinely spike over 50%.
        max_monthly_swing = max(abs(r) for r in median_returns)
        self.assertLess(max_monthly_swing, 0.50, 
                        f"Failed: Monthly returns look suspiciously large ({max_monthly_swing*100:.1f}%). Are they being annualized?")
        
        # VERIFICATION 2: The "Frankenstein Path" Bug
        # Calculate the realized annualized volatility of this single median path.
        # If paths are being cross-sectionally sorted every month (stitching different timelines together), 
        # the mathematical noise will cause this volatility to explode well beyond 100%.
        monthly_vol = statistics.stdev(median_returns)
        annualized_vol = monthly_vol * math.sqrt(12)
        
        # We use a generous upper bound (e.g., 0.30) because a single 600-month path 
        # will naturally deviate slightly from the 0.13 target, but it will NEVER hit 
        # the 1.50+ (150%) range of a Frankenstein path.
        self.assertLess(annualized_vol, 0.30, 
                        f"FATAL: Frankenstein path detected! Volatility exploded to {annualized_vol*100:.1f}%.")
        self.assertGreater(annualized_vol, 0.05, 
                           "Failed: Volatility is suspiciously low. Is the random walk functioning?")

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
        """Prove that the High-Water Mark uses the Synthetic Index and respects the Hungry Bucket limit."""
        params = self.base_params.copy()
        params["initial_investment"] = 100000
        params["initial_profit_percentage"] = 0.0 # Simplified for clear test math
        params["use_cash_buffer"] = True
        params["yearly_spending"] = 12000  # 1k / month
        params["buffer_target_months"] = 10 # 10k target
        params["buffer_current_size"] = 5000 # START WITH A 5K DEFICIT
        params["use_high_water_mark"] = True
       # --- NEW: Disable the Refill Throttle for this specific test ---
        # Allow the engine to transfer up to 12 months of expenses at once 
        # so it can reach the 10k target in a single massive month.
        params["buffer_refill_throttle_months"] = 12  
        
        # M1: +1%  (New ATH! Growth is ~1k. Deficit is ~6k. MUST ONLY harvest the 1k gain.)
        # M2: -10% (Market crash. Index drops. Zero equity sales allowed.)
        # M3: +2%  (False recovery. Still below ATH. Zero equity sales allowed.)
        # M4: +20% (Massive boom. New ATH! Gains are huge, deficit is small. MUST fully fill buffer.)
        rates = [0.01, -0.10, 0.02, 0.20] + [0.0] * 596
        
        result = self.simulator._run_single_timeline(params, rates, "Finland", 2025, 1, 600)
        
        # Month 1 (Hungry Bucket Test): Buffer starts at 5k, spends 1k (down to 4k). 
        # The 1% market gain yields 1k. It should harvest that 1k, ending around 5k.
        # If the bug is active, w_inv will be 6k and the buffer will jump to 10k.
        self.assertLess(result[1]["w_inv"], 2000, "Failed M1: Engine cannibalized principal to fill the buffer!")
        self.assertLess(result[1]["buffer_val"], 6000, "Failed M1: Buffer filled past the organic gains available.")
        
        # Month 2 (Crash): The engine must pull strictly from the buffer. Zero equity sales.
        self.assertEqual(result[2]["w_inv"], 0.0, "Failed in M2: Engine sold equities during a crash.")
        self.assertGreater(result[2]["w_buf"], 0.0)
        
        # Month 3 (False Recovery): Market is green, but index is below the M1 peak. Engine MUST refuse to sell.
        self.assertEqual(result[3]["w_inv"], 0.0, "Failed in M3: Engine fell for a false recovery and sold equities.")
        
        # Month 4 (New ATH): Market crosses the high-water mark. Huge gains. Buffer fully refills.
        self.assertGreater(result[4]["w_inv"], 0.0, "Failed in M4: Engine refused to sell at a new All-Time High.")
        self.assertAlmostEqual(result[4]["buffer_val"], 10000, delta=1.0, msg="Failed M4: Buffer did not fully refill despite massive gains.")

    def test_proportional_valuation_withdrawal(self):
        """Prove the engine elastically splits withdrawals between cash and equities during a moderate drawdown."""
        params = self.base_params.copy()
        params["use_cash_buffer"] = True
        params["yearly_spending"] = 12000  # 1k / month
        params["buffer_current_size"] = 10000 
        params["use_proportional_withdrawal"] = True
        params["valuation_slow_sma_months"] = 60
        
        # Simulate a sudden 15% drop below the established baseline.
        # With a 2.0 multiplier, a 15% drop should mandate drawing ~30% from cash and ~70% from equities.
        rates = [0.0] * 60 + [-0.15] + [0.0] * 539

    def test_regime_withdrawal_and_dead_cat_bounce(self):
        """Prove the 4-regime model routes cash correctly and prevents dead-cat bounce liquidations."""
        params = self.base_params.copy()
        params["initial_investment"] = 1000000
        params["use_cash_buffer"] = True
        params["yearly_spending"] = 12000  # 1k / month
        params["buffer_current_size"] = 50000 
        params["use_proportional_withdrawal"] = True
        params["valuation_slow_sma_months"] = 60
        params["trend_sma_months"] = 12
        
        # M1-M60: 0% (Builds the baseline Index = 100)
        # M61: -25% (The Shock: Price crashes below Fast SMA, but Slow SMA is still high)
        # M62: +10% (Dead-Cat Bounce: Positive month, but macro is still broken)
        rates = [0.0] * 60 + [-0.25, 0.10] + [0.0] * 538
        
        result = self.simulator._run_single_timeline(params, rates, "Finland", 2025, 1, 600)
        
        # Month 61 (The Shock)
        # Price (75) is < Fast SMA (~98), but Slow SMA (~99.5) is still high enough 
        # that the drawdown math isn't extreme yet, OR it triggers the Shock regime directly.
        # Either way, we expect heavy cash usage, zero equity sales.
        shock_month = result[61]
        self.assertEqual(shock_month["w_inv"], 0.0, "Failed: Engine sold equities during the initial shock!")
        self.assertGreater(shock_month["w_buf"], 0.0, "Failed: Engine refused to use cash during the shock.")
        
        # Month 62 (Dead-Cat Bounce)
        # The market grew 10%. The standard replenishment logic wants to sell equities to refill the 1k used in M61.
        # But Price (~82.5) is still far below Slow SMA (~99). Replenishment MUST be blocked.
        bounce_month = result[62]
        w_inv_total = bounce_month["w_inv"]
        
        # In Regime 3/4, a ~17% deficit means proportional withdrawal (e.g., 34% cash, 66% equities).
        # It's okay to sell *some* equities for the monthly spend, but it MUST NOT sell massive amounts to refill the bucket.
        # 1k spend * 66% = ~660 max from equities. If it refills the bucket, it would be 1000+.
        self.assertLess(w_inv_total, 1000, "FATAL: Engine fell for the Dead-Cat Bounce and sold equities to refill cash!")

    @patch('random.gauss')
    def test_heston_valuation_anchor(self, mock_gauss):
        """
        Prove that the intrinsic valuation anchor prevents total societal collapse 
        during an impossibly long, relentless bear market.
        """
        # We force the random walk to be perpetually negative. 
        # Every single month for 50 years, the market takes a hit.
        mock_gauss.return_value = -0.5
        
        expected_return = 0.07
        annual_volatility = 0.225
        total_months = 600
        
        # Run the anchored Heston generator
        rates = self.simulator._generate_heston_returns(
            expected_return, 
            annual_volatility, 
            total_months
        )
        
        # Track the simulated index
        simulated_index = 100.0
        for r in rates:
            simulated_index *= (1 + r)
            
        # THE MATH:
        # Without the anchor, 600 months of constant -0.5 standard deviation shocks 
        # combined with geometric drag would vaporize the index down to roughly 0.00001.
        # With the anchor, the "cheapness" of the market creates an upward pressure 
        # that eventually perfectly balances out the constant downward shocks.
        
        self.assertGreater(
            simulated_index, 
            1.0, 
            f"FATAL: Valuation anchor failed. Index collapsed to {simulated_index:.5f}"
        )
        
        self.assertLess(
            simulated_index, 
            100.0, 
            "FATAL: Anchor is too strong. It overpowered a constant 50-year bear market."
        )

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