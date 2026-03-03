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

if __name__ == '__main__':
    unittest.main()