import statistics
import math
import unittest
from unittest.mock import patch
from calculator import PortfolioSimulator

class TestPortfolioSimulator(unittest.TestCase):
    def setUp(self):
        # 1. Define mock configurations first (Now includes TestTiered and TestProgressive)
        mock_taxes = {
            "capital_gains": { 
                "Finland": { "type": "flat", "rate": 0.34 },
                "TestProgressive": {
                    "type": "tiered",
                    "brackets": [
                        {"limit": 30000, "rate": 0.30},
                        {"limit": None, "rate": 0.34}
                    ]
                }
            },
            "pension_income": {
                "Finland": { "type": "progressive_estimate", "brackets": [{"limit": None, "rate": 0.20}] },
                "Italy_7_Percent": { "type": "flat", "rate": 0.07 },
                "TestTiered": {
                    "type": "tiered",
                    "brackets": [
                        {"limit": 20000, "rate": 0.10},
                        {"limit": 50000, "rate": 0.20},
                        {"limit": None, "rate": 0.30}
                    ]
                }
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
        max_monthly_swing = max(abs(r) for r in median_returns)
        self.assertLess(max_monthly_swing, 0.50, 
                        f"Failed: Monthly returns look suspiciously large ({max_monthly_swing*100:.1f}%). Are they being annualized?")
        
        # VERIFICATION 2: The "Frankenstein Path" Bug
        monthly_vol = statistics.stdev(median_returns)
        annualized_vol = monthly_vol * math.sqrt(12)
        
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
        
        rates = [0.10, -0.10, 0.10] + [0.0] * 597
        
        result = self.simulator._run_single_timeline(params, rates, "Finland", 2025, 1, 600)
        
        self.assertEqual(result[1]["w_inv"], 0.0)
        self.assertGreater(result[1]["w_buf"], 0.0)
        self.assertLess(result[1]["buffer_val"], 10000) 
        
        self.assertEqual(result[2]["w_inv"], 0.0)
        self.assertGreater(result[2]["w_buf"], 0.0)
        self.assertLess(result[2]["buffer_val"], result[1]["buffer_val"]) 
        
        self.assertGreater(result[3]["w_inv"], 0.0) 
        self.assertGreater(result[3]["buffer_val"], result[2]["buffer_val"]) 

    def test_option3_counter_cyclical_buy_the_dip(self):
        """Prove that a collapsing slow/fast SMA ratio forcefully buys equities."""
        params = self.base_params.copy()
        params["use_cash_buffer"] = True
        params["yearly_spending"] = 12000 # 1k/month
        params["buffer_target_months"] = 10 
        params["buffer_current_size"] = 10000 
        
        params["use_dynamic_buffer"] = True
        params["trend_sma_months"] = 2
        params["valuation_slow_sma_months"] = 4
        
        rates = [0.10, 0.10, 0.10, 0.10, -0.40, -0.40] + [0.0] * 594
        
        result = self.simulator._run_single_timeline(params, rates, "Finland", 2025, 1, 600)
        self.assertLess(result[6]["buffer_val"], 9000)

    def test_option4_high_water_mark(self):
        """Prove that the High-Water Mark uses the Synthetic Index and respects the Hungry Bucket limit."""
        params = self.base_params.copy()
        params["initial_investment"] = 100000
        params["initial_profit_percentage"] = 0.0 
        params["use_cash_buffer"] = True
        params["yearly_spending"] = 12000  # 1k / month
        params["buffer_target_months"] = 10 # 10k target
        params["buffer_current_size"] = 5000 # START WITH A 5K DEFICIT
        params["use_high_water_mark"] = True
        params["buffer_refill_throttle_months"] = 12  
        
        rates = [0.01, -0.10, 0.02, 0.20] + [0.0] * 596
        
        result = self.simulator._run_single_timeline(params, rates, "Finland", 2025, 1, 600)
        
        self.assertLess(result[1]["w_inv"], 2000, "Failed M1: Engine cannibalized principal to fill the buffer!")
        self.assertLess(result[1]["buffer_val"], 6000, "Failed M1: Buffer filled past the organic gains available.")
        
        self.assertEqual(result[2]["w_inv"], 0.0, "Failed in M2: Engine sold equities during a crash.")
        self.assertGreater(result[2]["w_buf"], 0.0)
        
        self.assertEqual(result[3]["w_inv"], 0.0, "Failed in M3: Engine fell for a false recovery and sold equities.")
        
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
        
        # --- THE FIX ---
        # Set the fast SMA to 1 month. This disables the "Hurricane" panic mode 
        # and forces the engine to calculate the elastic "Valley" split based purely 
        # on the distance from the 5-year average.
        params["trend_sma_months"] = 1  
        
        rates = [0.0] * 60 + [-0.15] + [0.0] * 539
        result = self.simulator._run_single_timeline(params, rates, "Finland", 2025, 1, 600)
        
        # At month 61, the 15% crash occurs. 
        # The engine should calculate a ~15% drawdown and draw roughly 30% from cash, 70% from equities.
        self.assertGreater(result[61]["w_inv"], 0.0, "Failed: Engine did not pull from equities.")
        self.assertGreater(result[61]["w_buf"], 0.0, "Failed: Engine did not pull from the buffer.")

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
        
        rates = [0.0] * 60 + [-0.25, 0.10] + [0.0] * 538
        
        result = self.simulator._run_single_timeline(params, rates, "Finland", 2025, 1, 600)
        
        shock_month = result[61]
        self.assertEqual(shock_month["w_inv"], 0.0, "Failed: Engine sold equities during the initial shock!")
        self.assertGreater(shock_month["w_buf"], 0.0, "Failed: Engine refused to use cash during the shock.")
        
        bounce_month = result[62]
        w_inv_total = bounce_month["w_inv"]
        self.assertLess(w_inv_total, 1000, "FATAL: Engine fell for the Dead-Cat Bounce and sold equities to refill cash!")

    @patch('random.gauss')
    def test_heston_valuation_anchor(self, mock_gauss):
        """Prove that the intrinsic valuation anchor prevents total societal collapse."""
        mock_gauss.return_value = -0.5
        expected_return = 0.07
        annual_volatility = 0.225
        total_months = 600
        
        rates = self.simulator._generate_heston_returns(
            expected_return, 
            annual_volatility, 
            total_months
        )
        
        simulated_index = 100.0
        for r in rates:
            simulated_index *= (1 + r)
            
        self.assertGreater(simulated_index, 1.0, f"FATAL: Valuation anchor failed. Index collapsed to {simulated_index:.5f}")
        self.assertLess(simulated_index, 100.0, "FATAL: Anchor is too strong. It overpowered a constant 50-year bear market.")

    def test_option5_dual_momentum_regimes(self):
        """
        Prove the 3-Regime Dual-Momentum elastic withdrawal logic, 
        including the new Structural Momentum Lock.
        """
        params = self.base_params.copy()
        params.update({
            "initial_investment": 100000,
            "yearly_spending": 12000,          # 1k / month
            "use_cash_buffer": True,
            "buffer_target_months": 36,
            "buffer_current_size": 36000,
            "use_proportional_withdrawal": True,
            "use_trend_guardrail": False,
            "equity_critical_mass_floor": 0.0,   
            "equity_replenish_threshold": 0.0,
            "pensions": [],         
            "cash_events": [],      
            "trend_sma_months": 12,
            "valuation_slow_sma_months": 60
        })

        # --- ENGINEERED TIMELINE ---
        # M1-M60: Flat market. Index = 100.
        # M61: Sudden -50% crash. Index = 50. (Regime 1: Hurricane)
        # M62-72: Flat at 50.
        # M73: +10% bounce. Index = 55. (Regime 2: Valley)
        # M74: +100% boom. Index = 110. (Spot price recovers, but 12mo SMA is still ~55. STILL Regime 2 due to lag!)
        # M75-M86: Flat at 110. (12mo SMA catches up and crosses 5yr SMA. Regime 3: Clear Skies!)
        rates = [0.0]*60 + [-0.50] + [0.0]*11 + [0.10, 1.00] + [0.0]*12 + [0.0]*100
        
        result = self.simulator._run_single_timeline(params, rates, "Finland", 2025, 1, 100)

        # M61: Hurricane 
        self.assertAlmostEqual(result[61]["w_inv"], 0.0, delta=1.0, msg="Failed Regime 1: Engine sold equities during a hurricane.")
        self.assertGreater(result[61]["w_buf"], 990, "Failed Regime 1: Buffer did not absorb the full shock.")

        # M73: The Valley (Initial bounce)
        w_inv_valley = result[73]["w_inv"]
        w_buf_valley = result[73]["w_buf"]
        self.assertGreater(w_inv_valley, 0.0, "Failed Regime 2: Did not utilize equities during early recovery.")
        self.assertGreater(w_buf_valley, 0.0, "Failed Regime 2: Did not utilize buffer during early recovery.")

        # M74: The Structural Lag (Spot is 110, but 12mo SMA is ~55. Engine MUST stay cautious.)
        w_buf_lag = result[74]["w_buf"]
        self.assertGreater(w_buf_lag, 0.0, "Failed Structural Lag: Engine ignored broken momentum and dumped burden on equities.")
        
        # M86: Clear Skies (12mo SMA has fully crossed the 5yr SMA. Momentum is restored.)
        self.assertEqual(result[86]["w_buf"], 0.0, "Failed Regime 3: Engine drained the buffer during a mathematically confirmed bull market.")
        self.assertGreater(result[86]["w_inv"], 990, "Failed Regime 3: Engine failed to use equities during clear skies.")
        
    def test_option6_systemic_hysteresis(self):
        """Prove the Systemic Hysteresis loop correctly isolates the portfolio."""
        params = self.base_params.copy()
        params.update({
            "yearly_spending": 12000,
            "use_cash_buffer": True,
            "buffer_target_months": 100, 
            "equity_critical_mass_floor": 0.20,
            "equity_replenish_threshold": 0.50,
            "buffer_refill_throttle_months": 12 
        })

        # Scenario A: The ICU 
        params["initial_investment"] = 10000  # 10k Equity
        params["buffer_current_size"] = 90000 # 90k Buffer
        rates_icu = [0.0]*10
        result_icu = self.simulator._run_single_timeline(params, rates_icu, "Finland", 2025, 1, 10)
        self.assertEqual(result_icu[1]["w_inv"], 0.0, "Failed ICU: Engine sold equities when critical mass was broken.")
        self.assertGreater(result_icu[1]["w_buf"], 990, "Failed ICU: Buffer did not absorb the survival withdrawal.")

        # Scenario B: Physical Therapy
        params["initial_investment"] = 30000  
        params["buffer_current_size"] = 70000 
        rates_pt = [0.50] + [0.0]*10 
        result_pt = self.simulator._run_single_timeline(params, rates_pt, "Finland", 2025, 1, 10)
        buffer_start = 70000
        buffer_end_m1 = result_pt[1]["buffer_val"]
        self.assertLessEqual(buffer_end_m1, buffer_start, "Failed Physical Therapy: Engine cannibalized a fragile recovery to refill cash.")

        # Scenario C: Healthy 
        params["initial_investment"] = 60000  
        params["buffer_current_size"] = 40000 
        rates_healthy = [0.50] + [0.0]*10
        result_healthy = self.simulator._run_single_timeline(params, rates_healthy, "Finland", 2025, 1, 10)
        buffer_start_healthy = 40000
        buffer_end_healthy = result_healthy[1]["buffer_val"]
        self.assertGreater(buffer_end_healthy, buffer_start_healthy, "Failed Healthy State: Engine refused to harvest profits despite high equity mass.")

    def test_option5_superiority_under_heston(self):
        """Prove that Option 5 preserves more capital than Option 1+3 during a Heston crash sequence."""
        import random
        random.seed(42)
        annual_rate = 0.07
        annual_vol = 0.225
        total_months = 600
        rates = self.simulator._generate_heston_returns(annual_rate, annual_vol, total_months)
        
        # Strategy A (1 + 3 + 6)
        params_1_3 = self.base_params.copy()
        params_1_3.update({
            "initial_investment": 1000000,
            "yearly_spending": 40000,
            "use_cash_buffer": True,
            "buffer_target_months": 36,
            "buffer_current_size": 120000,
            "use_trend_guardrail": True,          
            "use_dynamic_buffer": True,           
            "use_proportional_withdrawal": False, 
            "equity_critical_mass_floor": 0.20,
            "equity_replenish_threshold": 0.50
        })
        result_1_3 = self.simulator._run_single_timeline(params_1_3, rates, "Finland", 2025, 1, 600)
        final_value_1_3 = result_1_3[600]["value"]
        
        # Strategy B (5 + 6)
        params_5 = self.base_params.copy()
        params_5.update({
            "initial_investment": 1000000,
            "yearly_spending": 40000,
            "use_cash_buffer": True,
            "buffer_target_months": 36,
            "buffer_current_size": 120000,
            "use_trend_guardrail": False,         
            "use_dynamic_buffer": False,          
            "use_proportional_withdrawal": True,  
            "equity_critical_mass_floor": 0.20,
            "equity_replenish_threshold": 0.50
        })
        result_5 = self.simulator._run_single_timeline(params_5, rates, "Finland", 2025, 1, 600)
        final_value_5 = result_5[600]["value"]
        
        self.assertGreater(
            final_value_5, 
            final_value_1_3, 
            f"Strategy failed! Opt 5 ended with {final_value_5}, but Opt 1+3 ended with {final_value_1_3}"
        )
    
    def test_run_simulation_routing(self):
        """Test that the main router successfully calls all growth models without throwing AttributeErrors."""
        params = self.base_params.copy()
        params["growth_models"] = ["linear", "stochastic", "stochastic_gbm", "stochastic_heston", "historical_MOCK"]
        params["stochastic_iterations"] = 2 
        
        self.simulator.indices = {"MOCK": [{"year": 2000, "return": 0.10}]}
        results = self.simulator.run_simulation(params)
        
        self.assertIn("linear_Finland_value", results[1])
        self.assertIn("stochastic_50_Finland_value", results[1])
        self.assertIn("stochastic_gbm_Finland_value", results[1])
        self.assertIn("stochastic_heston_Finland_value", results[1])
        self.assertIn("historical_MOCK_Finland_value", results[1])

    # =====================================================================
    # NEW TAX MATHEMATICS VALIDATION
    # =====================================================================
    
    def test_pension_tax_first_bracket(self):
        # Income: 15k. All fits in the first 10% bracket.
        tax = self.simulator.calculate_pension_tax(15000, "TestTiered")
        self.assertAlmostEqual(tax, 1500.0)

    def test_pension_tax_second_bracket(self):
        # Income: 30k. First 20k @ 10% (2000) + Next 10k @ 20% (2000)
        tax = self.simulator.calculate_pension_tax(30000, "TestTiered")
        self.assertAlmostEqual(tax, 4000.0)

    def test_pension_tax_infinite_bracket(self):
        # Income: 60k. Hits the infinite top tier.
        # First 20k @ 10% (2000) + Next 30k @ 20% (6000) + Final 10k @ 30% (3000)
        tax = self.simulator.calculate_pension_tax(60000, "TestTiered")
        self.assertAlmostEqual(tax, 11000.0)

    def test_capital_gains_exact_bracket_boundary(self):
        tax_config = self.simulator.taxes["capital_gains"]["TestProgressive"]
        gross = self.simulator._calculate_gross_withdrawal(
            net_needed=21000, 
            profit_percentage=1.0, 
            tax_config=tax_config, 
            current_year_gains=0.0
        )
        self.assertAlmostEqual(gross, 30000.0)

    def test_capital_gains_crossing_boundary(self):
        tax_config = self.simulator.taxes["capital_gains"]["TestProgressive"]
        gross = self.simulator._calculate_gross_withdrawal(
            net_needed=30000, 
            profit_percentage=1.0, 
            tax_config=tax_config, 
            current_year_gains=0.0
        )
        self.assertAlmostEqual(gross, 43636.3636, places=4)

    def test_capital_gains_partial_profit(self):
        tax_config = self.simulator.taxes["capital_gains"]["TestProgressive"]
        gross = self.simulator._calculate_gross_withdrawal(
            net_needed=30000, 
            profit_percentage=0.5, 
            tax_config=tax_config, 
            current_year_gains=0.0
        )
        self.assertAlmostEqual(gross, 35294.1176, places=4)

    def test_capital_gains_existing_annual_gains(self):
        tax_config = self.simulator.taxes["capital_gains"]["TestProgressive"]
        gross = self.simulator._calculate_gross_withdrawal(
            net_needed=10000, 
            profit_percentage=1.0, 
            tax_config=tax_config, 
            current_year_gains=25000.0
        )
        self.assertAlmostEqual(gross, 14848.4848, places=4)

if __name__ == '__main__':
    unittest.main()