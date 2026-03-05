import React, { useState, useEffect, useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { PlusCircle, Trash2, Eye, EyeOff } from 'lucide-react';

export default function App() {
  const currentDate = new Date();
  const currentYear = currentDate.getFullYear();
  const defaultStartMonth = currentDate.getMonth() === 11 ? 1 : currentDate.getMonth() + 2;
  const defaultStartYear = currentDate.getMonth() === 11 ? currentYear + 1 : currentYear;
  
  const [dynamicModels, setDynamicModels] = useState({
    uiModels: { linear: 'Linear Average', stochastic: 'Stochastic (Monte Carlo)', historical_SP500: 'S&P 500', historical_EUROSTOXX50: 'EURO STOXX' },
    displayNames: { linear: 'Linear Average', historical_SP500: 'S&P 500', historical_EUROSTOXX50: 'EURO STOXX', stochastic_90: 'Stochastic (Best 10%)', stochastic_50: 'Stochastic (Median)', stochastic_10: 'Stochastic (Worst 10%)' },
    displayColors: { linear: '#2563eb', historical_SP500: '#dc2626', historical_EUROSTOXX50: '#9333ea', stochastic_90: '#4ade80', stochastic_50: '#16a34a', stochastic_10: '#064e3b' },
    capGainsRegimes: ['Finland'],
    pensionRegimes: ['Finland'],
    taxStyles: { 'Finland': undefined }
  });

  const [params, setParams] = useState({
    initial_investment: 1000000, initial_profit_percentage: 0.40, yearly_spending: 40000, inflation_percentage: 0.02,
    enable_low_season_spend: false, low_season_cut_percentage: 0.10,
    growth_models: ['linear'], tax_residencies: ['Finland'], linear_rate: 0.07, 
    stochastic_iterations: 100, stochastic_engine: 'gbm', stochastic_volatility: 0.13,
    historical_start_year: 1950, historical_end_year: 2025, 
    simulation_start_year: defaultStartYear, simulation_start_month: defaultStartMonth, simulation_end_year: defaultStartYear + 50,
    pensions_inflation_adjusted: true, pensions: [], cash_events: [], relocations: [], spending_events: [],
    use_cash_buffer: false, buffer_target_months: 36, buffer_current_size: 120000, buffer_depletion_threshold: 0.0, buffer_replenishment_threshold: 0.10,
    use_trend_guardrail: false, trend_sma_months: 12,
    use_equity_glidepath: false, glidepath_months: 60, // <-- NEW
    use_dynamic_buffer: false, valuation_slow_sma_months: 60 // <-- NEW
  });

  const [chartData, setChartData] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [hiddenLines, setHiddenLines] = useState([]);

  useEffect(() => {
    const loadConfig = async () => {
      try {
        const res = await fetch(`http://${window.location.hostname}:8000/config`);
        const data = await res.json();
        const historyColors = ['#dc2626', '#9333ea', '#ea580c', '#0284c7', '#ca8a04', '#4f46e5'];
        
        let newUi = { 
          linear: 'Linear Average', 
          stochastic: 'Stochastic (Monte Carlo)',
          stochastic_gbm: 'GBM (Single Path)',         // NEW
          stochastic_heston: 'Heston (Crash Scenario)' // NEW
        };
        let newNames = { 
          linear: 'Linear Average', 
          stochastic_90: 'Stochastic (Best 10%)', 
          stochastic_50: 'Stochastic (Median)', 
          stochastic_10: 'Stochastic (Worst 10%)',
          stochastic_gbm: 'GBM Model',                 // NEW
          stochastic_heston: 'Heston Crash'            // NEW
        };
        let newColors = { 
          linear: '#2563eb', 
          stochastic_90: '#4ade80', stochastic_50: '#16a34a', stochastic_10: '#064e3b',
          stochastic_gbm: '#d97706',                   // NEW: Deep Amber
          stochastic_heston: '#be123c'                 // NEW: Rose / Crimson
        };

        if (data.historical_indices) {
          data.historical_indices.forEach((indexKey, i) => {
            const modelId = `historical_${indexKey}`;
            newUi[modelId] = `Historical: ${indexKey}`;
            newNames[modelId] = indexKey;
            newColors[modelId] = historyColors[i % historyColors.length];
          });
        }

        const dashPatterns = [undefined, '5 5', '3 3', '10 5', '20 10', '7 7', '2 2'];
        let newTaxStyles = {};
        if (data.capital_gains_taxes) {
            data.capital_gains_taxes.forEach((tax, i) => {
                newTaxStyles[tax] = dashPatterns[i % dashPatterns.length];
            });
        }

        setDynamicModels({ 
            uiModels: newUi, displayNames: newNames, displayColors: newColors,
            capGainsRegimes: data.capital_gains_taxes || ['Finland'],
            pensionRegimes: data.pension_taxes || ['Finland'],
            taxStyles: newTaxStyles
        });
      } catch (err) { console.error("Failed to load backend config", err); }
    };
    loadConfig();
  }, []);

  const activeModels = useMemo(() => {
    let expanded = [];
    params.growth_models.forEach(m => {
      if (m === 'stochastic') { expanded.push('stochastic_90', 'stochastic_50', 'stochastic_10'); } 
      else { expanded.push(m); }
    });
    return expanded;
  }, [params.growth_models]);

  useEffect(() => {
    const fetchSimulation = async () => {
      setIsLoading(true); setError(null); setChartData([]); 
      try {
        const safePayload = { 
          ...params, 
          pensions: params.pensions.map(p => ({ ...p, end_year: p.end_year === '' ? null : p.end_year, end_month: p.end_month === '' ? null : p.end_month })) 
        };
        const response = await fetch(`http://${window.location.hostname}:8000/simulate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(safePayload) });
        
        if (!response.ok) throw new Error('Simulation failed to calculate');
        const json = await response.json();
        setChartData(json.data);
      } catch (err) { setError(err.message); } finally { setIsLoading(false); }
    };
    const handler = setTimeout(() => fetchSimulation(), 1000);
    return () => clearTimeout(handler);
  }, [params]);

  const getAbsMonth = (m) => params.simulation_start_month + m - 2;
  const formatYear = (m) => params.simulation_start_year + Math.floor(getAbsMonth(m) / 12);
  const formatMonthYear = (m) => {
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const abs = getAbsMonth(m);
    return `${months[(abs % 12 + 12) % 12]} ${params.simulation_start_year + Math.floor(abs / 12)}`;
  };

  const summaryStats = useMemo(() => {
    if (!chartData || chartData.length === 0) return [];
    const stats = [];
    
    activeModels.forEach(model => {
      params.tax_residencies.forEach(tax => {
        const dataKey = `${model}_${tax}_value`;
        let finalValue = 0; let depletionMonth = null; let isBridgedByPension = false; 
        
        const lastMonthData = chartData[chartData.length - 1];
        
        if (lastMonthData && lastMonthData[dataKey] > 0) { 
          finalValue = lastMonthData[dataKey]; 
        } else { 
          let depletionIndex = -1;
          for (let i = 0; i < chartData.length; i++) { 
            if (chartData[i][dataKey] <= 0) { 
              depletionMonth = chartData[i].month; 
              depletionIndex = i;
              break; 
            } 
          } 
          if (depletionIndex !== -1) {
            isBridgedByPension = true;
            for (let i = depletionIndex; i < chartData.length; i++) {
              if (chartData[i][`${model}_${tax}_w_pen`] <= 0) {
                isBridgedByPension = false;
                break;
              }
            }
          }
        }
        stats.push({ id: dataKey, model, tax, modelName: dynamicModels.displayNames[model] || model, taxName: tax.replace(/_/g, ' '), finalValue, depletionMonth, isBridgedByPension });
      });
    });
    
    return stats.sort((a, b) => {
      if (a.finalValue > 0 && b.finalValue > 0) return b.finalValue - a.finalValue;
      if (a.finalValue > 0) return -1; if (b.finalValue > 0) return 1;
      return (b.depletionMonth || 0) - (a.depletionMonth || 0);
    });
  }, [chartData, activeModels, params.tax_residencies, dynamicModels]);

  const toggleLineVisibility = (dataKey) => { setHiddenLines(prev => prev.includes(dataKey) ? prev.filter(k => k !== dataKey) : [...prev, dataKey]); };
  const handleChange = (e) => { const { name, value, type, checked } = e.target; setParams(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : (type === 'number' || type === 'range' ? parseFloat(value) || 0 : value) })); };
  const handleEngineChange = (e) => {
    const engine = e.target.value;
    // Inject the mathematically precise long-term S&P 500 variances
    const defaultVol = engine === 'heston' ? 0.225 : 0.13;
    setParams(prev => ({ ...prev, stochastic_engine: engine, stochastic_volatility: defaultVol }));
  };
  const handleArrayToggle = (key, id) => { setParams(prev => { const isSelected = prev[key].includes(id); const newList = isSelected ? prev[key].filter(i => i !== id) : [...prev[key], id]; return { ...prev, [key]: newList.length ? newList : [id] }; }); };
  
  const addPension = () => { setParams(prev => ({ ...prev, pensions: [...prev.pensions, { amount: 1500, start_year: params.simulation_start_year + 10, start_month: 1, end_year: '', end_month: '', tax_regime: 'Finland' }] })); };
  const updatePension = (index, field, value) => { setParams(prev => { const newArr = [...prev.pensions]; newArr[index][field] = (field === 'end_year' || field === 'end_month') && value === '' ? '' : (field === 'tax_regime' ? value : Number(value) || 0); return { ...prev, pensions: newArr }; }); };
  const removePension = (index) => { setParams(prev => ({ ...prev, pensions: prev.pensions.filter((_, i) => i !== index) })); };

  const addCashEvent = () => { setParams(prev => ({ ...prev, cash_events: [...prev.cash_events, { amount: 200000, target: 'investment', year: params.simulation_start_year + 5, month: 6 }] })); };
  const updateCashEvent = (index, field, value) => { setParams(prev => { const newArr = [...prev.cash_events]; newArr[index][field] = field === 'target' ? value : (parseFloat(value) || 0); return { ...prev, cash_events: newArr }; }); };
  const removeCashEvent = (index) => { setParams(prev => ({ ...prev, cash_events: prev.cash_events.filter((_, i) => i !== index) })); };

  const addRelocation = () => { setParams(prev => ({ ...prev, relocations: [...prev.relocations, { new_regime: 'Finland', year: params.simulation_start_year + 5, month: 1 }] })); };
  const updateRelocation = (index, field, value) => { setParams(prev => { const newArr = [...prev.relocations]; newArr[index][field] = field === 'new_regime' ? value : (parseFloat(value) || 0); return { ...prev, relocations: newArr }; }); };
  const removeRelocation = (index) => { setParams(prev => ({ ...prev, relocations: prev.relocations.filter((_, i) => i !== index) })); };

  const addSpendingEvent = () => { setParams(prev => ({ ...prev, spending_events: [...prev.spending_events, { amount: 30000, year: params.simulation_start_year + 5, month: 1 }] })); };
  const updateSpendingEvent = (index, field, value) => { setParams(prev => { const newArr = [...prev.spending_events]; newArr[index][field] = parseFloat(value) || 0; return { ...prev, spending_events: newArr }; }); };
  const removeSpendingEvent = (index) => { setParams(prev => ({ ...prev, spending_events: prev.spending_events.filter((_, i) => i !== index) })); };

  const inputGroupStyle = { marginBottom: '16px' };
  const labelStyle = { display: 'block', fontWeight: 'bold', marginBottom: '4px', fontSize: '14px' };
  const inputStyle = { width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ccc', boxSizing: 'border-box' };
  const currencyFormatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });

  return (
    <div style={{ backgroundColor: '#f3f4f6', padding: '20px', fontFamily: 'system-ui, sans-serif', width: '100vw', height: '100vh', boxSizing: 'border-box', overflowX: 'hidden', color: '#111827', display: 'flex', flexDirection: 'column' }}>
      <h1 style={{ fontSize: '1.25rem', borderBottom: '2px solid #ccc', paddingBottom: '10px', marginTop: 0, marginBottom: '16px', color: '#374151' }}>Portfolio Estimator</h1>
      
      <div style={{ display: 'flex', gap: '20px', flex: 1, minHeight: 0 }}>
        
        {/* INPUT PANEL */}
        <div style={{ width: '380px', minWidth: '380px', backgroundColor: '#fff', padding: '20px', borderRadius: '8px', border: '1px solid #e5e7eb', overflowY: 'auto', height: '100%', boxSizing: 'border-box' }}>
          <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', backgroundColor: '#e0e7ff', padding: '12px', borderRadius: '6px', border: '1px solid #c7d2fe' }}>
            <div style={{ flex: 1 }}><label style={labelStyle}>Start Yr</label><input type="number" name="simulation_start_year" value={params.simulation_start_year} onChange={handleChange} style={inputStyle} /></div>
            <div style={{ flex: 1 }}><label style={labelStyle}>Start Mo</label><input type="number" name="simulation_start_month" value={params.simulation_start_month} min="1" max="12" onChange={handleChange} style={inputStyle} /></div>
            <div style={{ flex: 1 }}><label style={labelStyle}>End Yr</label><input type="number" name="simulation_end_year" value={params.simulation_end_year} onChange={handleChange} style={inputStyle} /></div>
          </div>

          <div style={inputGroupStyle}><label style={labelStyle}>Initial Investment (€)</label><input type="number" name="initial_investment" value={params.initial_investment} onChange={handleChange} style={inputStyle} /></div>
          <div style={inputGroupStyle}><label style={labelStyle}>Initial Profit Percentage (Decimal)</label><input type="number" name="initial_profit_percentage" value={params.initial_profit_percentage} onChange={handleChange} step="0.01" max="1" min="0" style={inputStyle} /></div>
          <div style={inputGroupStyle}><label style={labelStyle}>Yearly Spending (€)</label><input type="number" name="yearly_spending" value={params.yearly_spending} onChange={handleChange} style={inputStyle} /></div>
          <div style={inputGroupStyle}><label style={labelStyle}>Inflation Rate (Decimal)</label><input type="number" name="inflation_percentage" value={params.inflation_percentage} onChange={handleChange} step="0.01" style={inputStyle} /></div>
          
          <div style={{ ...inputGroupStyle, backgroundColor: '#fdf2f8', padding: '12px', borderRadius: '6px', border: '1px solid #fbcfe8' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: params.enable_low_season_spend ? '12px' : '0' }}><input type="checkbox" id="enable_low_season_spend" name="enable_low_season_spend" checked={params.enable_low_season_spend} onChange={handleChange} /><label htmlFor="enable_low_season_spend" style={{ fontSize: '14px', fontWeight: 'bold', color: '#831843' }}>Enable Low Season Spending</label></div>
            {params.enable_low_season_spend && (<div><label style={labelStyle}>Belt-Tightening Cut (Decimal)</label><input type="number" name="low_season_cut_percentage" value={params.low_season_cut_percentage} onChange={handleChange} step="0.01" max="1" min="0" style={inputStyle} /></div>)}
          </div>

          <div style={{ ...inputGroupStyle, backgroundColor: '#fef3c7', padding: '12px', borderRadius: '6px', border: '1px solid #fde68a' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: params.use_cash_buffer ? '12px' : '0' }}>
              <input type="checkbox" id="use_cash_buffer" name="use_cash_buffer" checked={params.use_cash_buffer} onChange={handleChange} />
              <label htmlFor="use_cash_buffer" style={{ fontSize: '14px', fontWeight: 'bold', color: '#92400e' }}>Enable Cash Buffer Strategy</label>
            </div>
            
            {params.use_cash_buffer && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div><label style={labelStyle}>Initial Buffer Size (€)</label><input type="number" name="buffer_current_size" value={params.buffer_current_size} onChange={handleChange} style={inputStyle} /></div>
                <div><label style={labelStyle}>Baseline Target Buffer (Months)</label><input type="number" name="buffer_target_months" value={params.buffer_target_months} onChange={handleChange} style={inputStyle} /></div>
                
                <div style={{ display: 'flex', gap: '10px' }}>
                  <div style={{ flex: 1 }}><label style={labelStyle}>Depletion Threshold</label><input type="number" name="buffer_depletion_threshold" value={params.buffer_depletion_threshold} onChange={handleChange} step="0.01" style={inputStyle} /></div>
                  <div style={{ flex: 1 }}><label style={labelStyle}>Replenish Threshold</label><input type="number" name="buffer_replenishment_threshold" value={params.buffer_replenishment_threshold} onChange={handleChange} step="0.01" style={inputStyle} /></div>
                </div>

                {/* --- OPTION 1: SMA TREND GUARDRAIL --- */}
                <div style={{ borderTop: '1px solid #fcd34d', paddingTop: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: params.use_trend_guardrail ? '12px' : '0' }}>
                    <input type="checkbox" id="use_trend_guardrail" name="use_trend_guardrail" checked={params.use_trend_guardrail} onChange={handleChange} />
                    <label htmlFor="use_trend_guardrail" style={{ fontSize: '14px', fontWeight: 'bold', color: '#b45309' }}>1. Use SMA Trend Guardrail (Circuit Breaker)</label>
                  </div>
                  {params.use_trend_guardrail && (
                    <div>
                      <label style={labelStyle}>Fast SMA Window (Months, e.g., 12)</label>
                      <input type="number" name="trend_sma_months" value={params.trend_sma_months} onChange={handleChange} min="1" max="120" style={inputStyle} />
                    </div>
                  )}
                </div>

                {/* --- OPTION 2: EQUITY GLIDEPATH --- */}
                <div style={{ borderTop: '1px solid #fcd34d', paddingTop: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: params.use_equity_glidepath ? '12px' : '0' }}>
                    <input type="checkbox" id="use_equity_glidepath" name="use_equity_glidepath" checked={params.use_equity_glidepath} onChange={handleChange} />
                    <label htmlFor="use_equity_glidepath" style={{ fontSize: '14px', fontWeight: 'bold', color: '#b45309' }}>2. Use Equity Glidepath (Initial Cash Drain)</label>
                  </div>
                  {params.use_equity_glidepath && (
                    <div>
                      <label style={labelStyle}>Glidepath Duration (Months, e.g., 60)</label>
                      <input type="number" name="glidepath_months" value={params.glidepath_months} onChange={handleChange} min="12" max="240" style={inputStyle} />
                    </div>
                  )}
                </div>

                {/* --- OPTION 3: COUNTER-CYCLICAL BUFFER --- */}
                <div style={{ borderTop: '1px solid #fcd34d', paddingTop: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: params.use_dynamic_buffer ? '12px' : '0' }}>
                    <input type="checkbox" id="use_dynamic_buffer" name="use_dynamic_buffer" checked={params.use_dynamic_buffer} onChange={handleChange} />
                    <label htmlFor="use_dynamic_buffer" style={{ fontSize: '14px', fontWeight: 'bold', color: '#b45309' }}>3. Dynamic Counter-Cyclical Sizing (Buy the Dip)</label>
                  </div>
                  {params.use_dynamic_buffer && (
                    <div>
                      <label style={labelStyle}>Slow SMA Window (Months, e.g., 60)</label>
                      <input type="number" name="valuation_slow_sma_months" value={params.valuation_slow_sma_months} onChange={handleChange} min="12" max="240" style={inputStyle} />
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          <div style={{ ...inputGroupStyle, backgroundColor: '#f9fafb', padding: '12px', borderRadius: '6px', border: '1px solid #e5e7eb' }}>
            <label style={labelStyle}>Compare Tax Residencies (Cap Gains)</label>
            {dynamicModels.capGainsRegimes.map((id) => (<div key={id} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}><input type="checkbox" id={`tax-${id}`} checked={params.tax_residencies.includes(id)} onChange={() => handleArrayToggle('tax_residencies', id)} /><label htmlFor={`tax-${id}`} style={{ fontSize: '14px' }}>{id.replace(/_/g, ' ')}</label></div>))}
          </div>

          <div style={{ ...inputGroupStyle, backgroundColor: '#f9fafb', padding: '12px', borderRadius: '6px', border: '1px solid #e5e7eb' }}>
            <label style={labelStyle}>Compare Growth Models</label>
            {Object.entries(dynamicModels.uiModels).map(([id, name]) => (<div key={id} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}><input type="checkbox" id={id} checked={params.growth_models.includes(id)} onChange={() => handleArrayToggle('growth_models', id)} /><label htmlFor={id} style={{ fontSize: '14px' }}>{name}</label></div>))}
          </div>

          {params.growth_models.some(m => m.startsWith('historical')) && (
            <div style={{ padding: '12px', backgroundColor: '#eef2ff', borderRadius: '6px', marginBottom: '16px', border: '1px solid #c7d2fe' }}>
              <strong style={{ display: 'block', fontSize: '13px', marginBottom: '12px', color: '#3730a3' }}>Historical Parameters</strong>
              <div style={{ display: 'flex', gap: '10px' }}>
                <div style={{ flex: 1 }}><label style={labelStyle}>Start Year</label><input type="number" name="historical_start_year" value={params.historical_start_year} onChange={handleChange} style={inputStyle} /></div>
                <div style={{ flex: 1 }}><label style={labelStyle}>End Year</label><input type="number" name="historical_end_year" value={params.historical_end_year} onChange={handleChange} style={inputStyle} /></div>
              </div>
            </div>
          )}

          {params.growth_models.includes('stochastic') && (
                <div style={{ borderTop: '1px solid #bbf7d0', paddingTop: '12px', marginTop: '12px' }}>
                  <div style={{ marginBottom: '12px' }}>
                    <label style={labelStyle}>Monte Carlo Engine Physics</label>
                    <select name="stochastic_engine" value={params.stochastic_engine} onChange={handleEngineChange} style={inputStyle}>
                      <option value="gbm">Geometric Brownian Motion (Standard)</option>
                      <option value="heston">Heston Model (Fat Tails & Crashes)</option>
                    </select>
                  </div>
                  <div style={inputGroupStyle}>
                    <label style={labelStyle}>Annual Volatility (Decimal, e.g. 0.13)</label>
                    <input type="number" name="stochastic_volatility" value={params.stochastic_volatility} onChange={handleChange} step="0.001" style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>Monte Carlo Iterations: {params.stochastic_iterations}</label>
                    <input type="range" name="stochastic_iterations" value={params.stochastic_iterations} min="10" max="1000" step="10" onChange={handleChange} style={{ width: '100%', cursor: 'pointer' }} />
                  </div>
                </div>
              )}

          <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: '16px', marginTop: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <h4 style={{ margin: 0 }}>Cash Events (One-Time)</h4>
              <button onClick={addCashEvent} style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', background: '#dcfce7', border: 'none', padding: '6px 12px', borderRadius: '4px', color: '#166534', fontWeight: 'bold' }}><PlusCircle size={16} /> Add</button>
            </div>
            {params.cash_events.map((ev, index) => (
              <div key={`ce-${index}`} style={{ backgroundColor: '#f0fdf4', padding: '12px', borderRadius: '6px', border: '1px solid #bbf7d0', marginBottom: '10px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', borderBottom: '1px solid #bbf7d0', paddingBottom: '4px' }}>
                  <strong style={{ fontSize: '14px', color: '#166534' }}>Event {index + 1}</strong>
                  <button onClick={() => removeCashEvent(index)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer' }}><Trash2 size={16} /></button>
                </div>
                <div style={{ display: 'flex', gap: '10px', marginBottom: '12px' }}>
                  <div style={{ flex: 1 }}><label style={labelStyle}>Amount (€)</label><input type="number" value={ev.amount} onChange={(e) => updateCashEvent(index, 'amount', e.target.value)} style={inputStyle} /></div>
                  <div style={{ flex: 1 }}><label style={labelStyle}>Target</label><select value={ev.target} onChange={(e) => updateCashEvent(index, 'target', e.target.value)} style={inputStyle}><option value="investment">Investments</option><option value="buffer">Cash Buffer</option></select></div>
                </div>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <div style={{ flex: 1 }}><label style={labelStyle}>Year</label><input type="number" value={ev.year} onChange={(e) => updateCashEvent(index, 'year', e.target.value)} style={inputStyle} /></div>
                  <div style={{ flex: 1 }}><label style={labelStyle}>Month</label><input type="number" value={ev.month} onChange={(e) => updateCashEvent(index, 'month', e.target.value)} min="1" max="12" style={inputStyle} /></div>
                </div>
              </div>
            ))}
          </div>

          <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: '16px', marginTop: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <h4 style={{ margin: 0 }}>Relocations (Tax)</h4>
              <button onClick={addRelocation} style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', background: '#fef08a', border: 'none', padding: '6px 12px', borderRadius: '4px', color: '#854d0e', fontWeight: 'bold' }}><PlusCircle size={16} /> Add</button>
            </div>
            {params.relocations.map((reloc, index) => (
              <div key={`reloc-${index}`} style={{ backgroundColor: '#fefce8', padding: '12px', borderRadius: '6px', border: '1px solid #fde047', marginBottom: '10px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', borderBottom: '1px solid #fde047', paddingBottom: '4px' }}>
                  <strong style={{ fontSize: '14px', color: '#854d0e' }}>Move {index + 1}</strong>
                  <button onClick={() => removeRelocation(index)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer' }}><Trash2 size={16} /></button>
                </div>
                <div style={{ marginBottom: '12px' }}><label style={labelStyle}>New Tax Residency</label><select value={reloc.new_regime} onChange={(e) => updateRelocation(index, 'new_regime', e.target.value)} style={inputStyle}>{dynamicModels.capGainsRegimes.map((id) => <option key={id} value={id}>{id.replace(/_/g, ' ')}</option>)}</select></div>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <div style={{ flex: 1 }}><label style={labelStyle}>Year</label><input type="number" value={reloc.year} onChange={(e) => updateRelocation(index, 'year', e.target.value)} style={inputStyle} /></div>
                  <div style={{ flex: 1 }}><label style={labelStyle}>Month</label><input type="number" value={reloc.month} onChange={(e) => updateRelocation(index, 'month', e.target.value)} min="1" max="12" style={inputStyle} /></div>
                </div>
              </div>
            ))}
          </div>

          <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: '16px', marginTop: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <h4 style={{ margin: 0 }}>Pensions (Recurring)</h4>
              <button onClick={addPension} style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', background: '#e0e7ff', border: 'none', padding: '6px 12px', borderRadius: '4px', color: '#3730a3', fontWeight: 'bold' }}><PlusCircle size={16} /> Add</button>
            </div>
            {params.pensions.map((pension, index) => (
              <div key={index} style={{ backgroundColor: '#f9fafb', padding: '12px', borderRadius: '6px', border: '1px solid #e5e7eb', marginBottom: '10px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', borderBottom: '1px solid #e5e7eb', paddingBottom: '4px' }}>
                  <strong style={{ fontSize: '14px' }}>Stream {index + 1}</strong>
                  <button onClick={() => removePension(index)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer' }}><Trash2 size={16} /></button>
                </div>
                <div style={{ display: 'flex', gap: '10px', marginBottom: '12px' }}>
                  <div style={{ flex: 1 }}><label style={labelStyle}>Amount/mo in today's money (€)</label><input type="number" value={pension.amount} onChange={(e) => updatePension(index, 'amount', e.target.value)} style={inputStyle} /></div>
                </div>
                <div style={{ marginBottom: '12px' }}>
                  <label style={labelStyle}>Pension Tax Regime</label>
                  <select value={pension.tax_regime} onChange={(e) => updatePension(index, 'tax_regime', e.target.value)} style={inputStyle}>
                    {dynamicModels.pensionRegimes.map((id) => <option key={id} value={id}>{id.replace(/_/g, ' ')}</option>)}
                  </select>
                </div>
                <div style={{ display: 'flex', gap: '10px', marginBottom: '12px' }}>
                  <div style={{ flex: 1 }}><label style={labelStyle}>Start Year</label><input type="number" value={pension.start_year} onChange={(e) => updatePension(index, 'start_year', e.target.value)} style={inputStyle} /></div>
                  <div style={{ flex: 1 }}><label style={labelStyle}>Start Month</label><input type="number" value={pension.start_month} onChange={(e) => updatePension(index, 'start_month', e.target.value)} min="1" max="12" style={inputStyle} /></div>
                </div>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <div style={{ flex: 1 }}><label style={labelStyle}>End Year (Opt)</label><input type="number" value={pension.end_year} onChange={(e) => updatePension(index, 'end_year', e.target.value)} placeholder="Infinite" style={inputStyle} /></div>
                  <div style={{ flex: 1 }}><label style={labelStyle}>End Month (Opt)</label><input type="number" value={pension.end_month} onChange={(e) => updatePension(index, 'end_month', e.target.value)} min="1" max="12" placeholder="Infinite" style={inputStyle} /></div>
                </div>
              </div>
            ))}
          </div>

          <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: '16px', marginTop: '24px', marginBottom: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <h4 style={{ margin: 0 }}>Lifestyle Changes (Spend)</h4>
              <button onClick={addSpendingEvent} style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', background: '#ffedd5', border: 'none', padding: '6px 12px', borderRadius: '4px', color: '#c2410c', fontWeight: 'bold' }}><PlusCircle size={16} /> Add</button>
            </div>
            {params.spending_events.map((ev, index) => (
              <div key={`se-${index}`} style={{ backgroundColor: '#fff7ed', padding: '12px', borderRadius: '6px', border: '1px solid #fed7aa', marginBottom: '10px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', borderBottom: '1px solid #fed7aa', paddingBottom: '4px' }}>
                  <strong style={{ fontSize: '14px', color: '#c2410c' }}>New Baseline {index + 1}</strong>
                  <button onClick={() => removeSpendingEvent(index)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer' }}><Trash2 size={16} /></button>
                </div>
                <div style={inputGroupStyle}>
                  <label style={labelStyle}>New Yearly Target in today's money (€)</label>
                  <input type="number" value={ev.amount} onChange={(e) => updateSpendingEvent(index, 'amount', e.target.value)} style={inputStyle} />
                </div>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <div style={{ flex: 1 }}><label style={labelStyle}>Year</label><input type="number" value={ev.year} onChange={(e) => updateSpendingEvent(index, 'year', e.target.value)} style={inputStyle} /></div>
                  <div style={{ flex: 1 }}><label style={labelStyle}>Month</label><input type="number" value={ev.month} onChange={(e) => updateSpendingEvent(index, 'month', e.target.value)} min="1" max="12" style={inputStyle} /></div>
                </div>
              </div>
            ))}
          </div>

          {isLoading && ( <p style={{ color: '#0066cc', fontWeight: 'bold' }}>Simulating {params.growth_models.includes('stochastic') ? params.stochastic_iterations : 1} timeline(s)...</p> )}
          {error && <p style={{ color: 'red' }}>Error: {error}</p>}
        </div>

        {/* VISUALIZER PANEL */}
        <div style={{ flex: 1, height: '100%', overflowY: 'auto', display: 'flex', flexDirection: 'column', minWidth: 0, paddingRight: '10px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexShrink: 0 }}>
            <h3 style={{ margin: 0 }}>Projection & Dynamics</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '12px', backgroundColor: '#fff', padding: '10px 16px', borderRadius: '6px', border: '1px solid #e5e7eb' }}>
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <strong style={{ color: '#6b7280', textTransform: 'uppercase', fontSize: '10px', width: '130px', flexShrink: 0 }}>Tax Regime (Style)</strong>
                <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                  {dynamicModels.capGainsRegimes.map(tax => (
                    <div key={tax} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <svg width="24" height="10"><line x1="0" y1="5" x2="24" y2="5" stroke="#4b5563" strokeWidth="2" strokeDasharray={dynamicModels.taxStyles[tax]} /></svg>
                      <span>{tax.replace(/_/g, ' ')}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div style={{ height: '1px', backgroundColor: '#e5e7eb', width: '100%' }}></div>
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <strong style={{ color: '#6b7280', textTransform: 'uppercase', fontSize: '10px', width: '130px', flexShrink: 0 }}>Growth Model (Color)</strong>
                <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                  {activeModels.map(model => (
                    <div key={model} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <div style={{ width: '12px', height: '12px', backgroundColor: dynamicModels.displayColors[model] || '#000', borderRadius: '2px' }}></div>
                      <span>{dynamicModels.displayNames[model] || model}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div style={{ flex: '1 1 auto', minHeight: '300px', marginBottom: '20px', backgroundColor: '#fff', padding: '20px 0 0 0', borderRadius: '8px', border: '1px solid #e5e7eb', position: 'relative' }}>
            <h4 style={{ position: 'absolute', top: 5, left: 20, margin: 0, fontSize: '13px', color: '#6b7280' }}>Total Portfolio Assets (Left) vs. Return Rate (Right)</h4>
            <ResponsiveContainer width="99%" height="100%">
              <LineChart data={chartData} margin={{ top: 20, right: 20, left: 10, bottom: 20 }} syncId="portfolioSim">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" tickFormatter={formatYear} />
                <YAxis yAxisId="left" tickFormatter={(value) => `${(value / 1000).toFixed(0)}k`} width={80} />
                <YAxis yAxisId="right" orientation="right" tickFormatter={(value) => `${(value * 100).toFixed(0)}%`} width={80} />
                <Tooltip wrapperStyle={{ zIndex: 1000 }} labelFormatter={formatMonthYear} formatter={(value, name) => name.includes('Return') ? [`${(value * 100).toFixed(2)}%`, name] : [currencyFormatter.format(value), name]} />
                
                {params.pensions.map((p, i) => { 
                  const startMonthRelative = ((p.start_year - params.simulation_start_year) * 12) + p.start_month - params.simulation_start_month + 1;
                  const totalSimulationMonths = (params.simulation_end_year - params.simulation_start_year) * 12;
                  return (startMonthRelative > 0 && startMonthRelative <= totalSimulationMonths) ? <ReferenceLine yAxisId="left" key={`ref-pen-${i}`} x={startMonthRelative} stroke="#db2777" isFront={true} label={{ value: `Pension ${i + 1}`, position: 'insideTopLeft', fill: '#be185d', fontSize: 12 }} /> : null; 
                })}
                {params.cash_events.map((ev, i) => { 
                  const evMonthRelative = ((ev.year - params.simulation_start_year) * 12) + ev.month - params.simulation_start_month + 1;
                  const totalSimulationMonths = (params.simulation_end_year - params.simulation_start_year) * 12;
                  return (evMonthRelative > 0 && evMonthRelative <= totalSimulationMonths) ? <ReferenceLine yAxisId="left" key={`ref-cash-${i}`} x={evMonthRelative} stroke="#2563eb" isFront={true} label={{ value: `+${(ev.amount/1000).toFixed(0)}k`, position: 'insideBottomRight', fill: '#1d4ed8', fontSize: 12 }} /> : null; 
                })}
                {params.relocations.map((reloc, i) => { 
                  const relocMonthRelative = ((reloc.year - params.simulation_start_year) * 12) + reloc.month - params.simulation_start_month + 1;
                  const totalSimulationMonths = (params.simulation_end_year - params.simulation_start_year) * 12;
                  return (relocMonthRelative > 0 && relocMonthRelative <= totalSimulationMonths) ? <ReferenceLine yAxisId="left" key={`ref-reloc-${i}`} x={relocMonthRelative} stroke="#9333ea" isFront={true} label={{ value: `Move: ${reloc.new_regime.replace(/_/g, ' ')}`, position: 'insideTopRight', fill: '#7e22ce', fontSize: 12 }} /> : null; 
                })}
                {params.spending_events.map((ev, i) => { 
                  const evMonthRelative = ((ev.year - params.simulation_start_year) * 12) + ev.month - params.simulation_start_month + 1;
                  const totalSimulationMonths = (params.simulation_end_year - params.simulation_start_year) * 12;
                  return (evMonthRelative > 0 && evMonthRelative <= totalSimulationMonths) ? <ReferenceLine yAxisId="left" key={`ref-spend-${i}`} x={evMonthRelative} stroke="#ea580c" isFront={true} label={{ value: `Spend: ${(ev.amount/1000).toFixed(0)}k`, position: 'insideTopLeft', fill: '#9a3412', fontSize: 12 }} /> : null; 
                })}

                {activeModels.map(model => params.tax_residencies.map(tax => <Line yAxisId="left" key={`${model}_${tax}`} type="monotone" dataKey={`${model}_${tax}_value`} name={`${dynamicModels.displayNames[model] || model} (${tax.replace(/_/g, ' ')})`} stroke={dynamicModels.displayColors[model] || '#000'} strokeDasharray={dynamicModels.taxStyles[tax]} strokeWidth={2} dot={false} isAnimationActive={false} hide={hiddenLines.includes(`${model}_${tax}_value`)} />))}
                {activeModels.map(model => <Line yAxisId="right" key={`${model}_return`} type="monotone" dataKey={`${model}_return`} name={`${dynamicModels.displayNames[model] || model} Return`} stroke={dynamicModels.displayColors[model] || '#000'} strokeDasharray="2 4" strokeWidth={1} dot={false} isAnimationActive={false} hide={hiddenLines.includes(`${model}_return`)} />)}
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div style={{ flex: '1 1 auto', minHeight: '300px', marginBottom: '20px', backgroundColor: '#fff', padding: '20px 0 0 0', borderRadius: '8px', border: '1px solid #e5e7eb', position: 'relative' }}>
             <h4 style={{ position: 'absolute', top: 5, left: 20, margin: 0, fontSize: '13px', color: '#6b7280' }}>Monthly Cashflows (Left) vs. Buffer Balance (Right)</h4>
             <ResponsiveContainer width="99%" height="100%">
              <LineChart data={chartData} margin={{ top: 20, right: 20, left: 10, bottom: 20 }} syncId="portfolioSim">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" tickFormatter={formatYear} />
                <YAxis yAxisId="left" tickFormatter={(value) => `${(value / 1000).toFixed(1)}k`} width={80} />
                <YAxis yAxisId="right" orientation="right" tickFormatter={(value) => `${(value / 1000).toFixed(0)}k`} width={80} />
                
                <Tooltip 
                  wrapperStyle={{ zIndex: 1000 }} 
                  labelFormatter={formatMonthYear} 
                  formatter={(value, name, props) => {
                    if (name.includes('Spend')) {
                      const modelBase = props.dataKey.replace('_spend', '');
                      const isAusterity = props.payload[`${modelBase}_austerity`];
                      return [currencyFormatter.format(value), isAusterity ? `${name} 📉 (Low Season Active)` : name];
                    }
                    return [currencyFormatter.format(value), name];
                  }} 
                />
                
                {params.pensions.map((p, i) => { 
                  const startMonthRelative = ((p.start_year - params.simulation_start_year) * 12) + p.start_month - params.simulation_start_month + 1;
                  const totalSimulationMonths = (params.simulation_end_year - params.simulation_start_year) * 12;
                  return (startMonthRelative > 0 && startMonthRelative <= totalSimulationMonths) ? <ReferenceLine yAxisId="left" key={`ref-pen-bot-${i}`} x={startMonthRelative} stroke="#db2777" isFront={true} /> : null; 
                })}
                {params.cash_events.map((ev, i) => { 
                  const evMonthRelative = ((ev.year - params.simulation_start_year) * 12) + ev.month - params.simulation_start_month + 1;
                  const totalSimulationMonths = (params.simulation_end_year - params.simulation_start_year) * 12;
                  return (evMonthRelative > 0 && evMonthRelative <= totalSimulationMonths) ? <ReferenceLine yAxisId="left" key={`ref-cash-bot-${i}`} x={evMonthRelative} stroke="#2563eb" isFront={true} /> : null; 
                })}
                {params.relocations.map((reloc, i) => { 
                  const relocMonthRelative = ((reloc.year - params.simulation_start_year) * 12) + reloc.month - params.simulation_start_month + 1;
                  const totalSimulationMonths = (params.simulation_end_year - params.simulation_start_year) * 12;
                  return (relocMonthRelative > 0 && relocMonthRelative <= totalSimulationMonths) ? <ReferenceLine yAxisId="left" key={`ref-reloc-bot-${i}`} x={relocMonthRelative} stroke="#9333ea" isFront={true} /> : null; 
                })}
                {params.spending_events.map((ev, i) => { 
                  const evMonthRelative = ((ev.year - params.simulation_start_year) * 12) + ev.month - params.simulation_start_month + 1;
                  const totalSimulationMonths = (params.simulation_end_year - params.simulation_start_year) * 12;
                  return (evMonthRelative > 0 && evMonthRelative <= totalSimulationMonths) ? <ReferenceLine yAxisId="left" key={`ref-spend-bot-${i}`} x={evMonthRelative} stroke="#ea580c" isFront={true} /> : null; 
                })}

                {activeModels.map(model => {
                  const isModelHidden = params.tax_residencies.every(tax => hiddenLines.includes(`${model}_${tax}_value`));
                  return (
                    <React.Fragment key={`${model}_all_flows`}>
                      <Line yAxisId="left" type="stepAfter" dataKey={`${model}_spend`} name={`${dynamicModels.displayNames[model] || model} Spend`} stroke={dynamicModels.displayColors[model] || '#000'} strokeDasharray="2 4" strokeWidth={2} dot={false} isAnimationActive={false} hide={isModelHidden} />
                      {params.tax_residencies.map(tax => (
                        <React.Fragment key={`${model}_${tax}_flows`}>
                          {params.use_cash_buffer && <Line yAxisId="right" type="monotone" dataKey={`${model}_${tax}_buffer_val`} name={`Buffer Bal (${tax.replace(/_/g, ' ')})`} stroke={dynamicModels.displayColors[model] || '#000'} strokeDasharray={dynamicModels.taxStyles[tax]} strokeWidth={2} dot={false} isAnimationActive={false} hide={hiddenLines.includes(`${model}_${tax}_value`)} />}
                          {params.use_cash_buffer && <Line yAxisId="left" type="monotone" dataKey={`${model}_${tax}_w_buf`} name={`Buffer Used (${tax.replace(/_/g, ' ')})`} stroke="#ea580c" strokeWidth={1} dot={false} isAnimationActive={false} hide={hiddenLines.includes(`${model}_${tax}_value`)} />}
                          <Line yAxisId="left" type="monotone" dataKey={`${model}_${tax}_w_inv`} name={`Equities Sold (${tax.replace(/_/g, ' ')})`} stroke={dynamicModels.displayColors[model] || '#000'} strokeWidth={1} dot={false} isAnimationActive={false} hide={hiddenLines.includes(`${model}_${tax}_value`)} />
                          <Line yAxisId="left" type="monotone" dataKey={`${model}_${tax}_w_pen`} name={`Pension Income (${tax.replace(/_/g, ' ')})`} stroke="#db2777" strokeDasharray="3 3" strokeWidth={1} dot={false} isAnimationActive={false} hide={hiddenLines.includes(`${model}_${tax}_value`)} />
                        </React.Fragment>
                      ))}
                    </React.Fragment>
                  );
                })}
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div style={{ flex: '0 0 auto', backgroundColor: '#fff', borderRadius: '8px', border: '1px solid #e5e7eb', overflowY: 'auto', minHeight: '150px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '14px' }}>
              <thead style={{ backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb', position: 'sticky', top: 0, zIndex: 1 }}>
                <tr>
                  <th style={{ padding: '12px 16px' }}>Visibility</th>
                  <th style={{ padding: '12px 16px' }}>Growth Model</th>
                  <th style={{ padding: '12px 16px' }}>Tax Residency</th>
                  <th style={{ padding: '12px 16px' }}>Outcome</th>
                  <th style={{ padding: '12px 16px', textAlign: 'right' }}>Final Nominal ({params.simulation_end_year})</th>
                  <th style={{ padding: '12px 16px', textAlign: 'right' }}>Real Value (Today's €)</th>
                </tr>
              </thead>
              <tbody>
                {summaryStats.map((stat, i) => {
                  const isHidden = hiddenLines.includes(stat.id);
                  return (
                    <tr key={stat.id} onClick={() => { toggleLineVisibility(stat.id); toggleLineVisibility(stat.id.replace('_value', '_return')); }} style={{ borderBottom: '1px solid #e5e7eb', cursor: 'pointer', backgroundColor: i % 2 === 0 ? '#fff' : '#f9fafb', opacity: isHidden ? 0.4 : 1 }}>
                      <td style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '8px' }}>{isHidden ? <EyeOff size={16} /> : <Eye size={16} color={dynamicModels.displayColors[stat.model] || '#000'} />}<span>{isHidden ? 'Hidden' : 'Visible'}</span></td>
                      <td style={{ padding: '12px 16px', fontWeight: '500' }}><div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><div style={{ width: '10px', height: '10px', backgroundColor: dynamicModels.displayColors[stat.model] || '#000', borderRadius: '2px' }}></div>{stat.modelName}</div></td>
                      <td style={{ padding: '12px 16px' }}><div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><svg width="20" height="4"><line x1="0" y1="2" x2="20" y2="2" stroke="#4b5563" strokeWidth="2" strokeDasharray={dynamicModels.taxStyles[stat.tax]} /></svg>{stat.taxName}</div></td>
                      <td style={{ padding: '12px 16px' }}>
                        {stat.finalValue > 0 
                          ? <span style={{ color: '#166534', backgroundColor: '#dcfce7', padding: '2px 8px', borderRadius: '12px', fontSize: '12px' }}>Sustainable</span> 
                          : stat.isBridgedByPension
                            ? <span style={{ color: '#9a3412', backgroundColor: '#ffedd5', padding: '2px 8px', borderRadius: '12px', fontSize: '12px' }}>Unsustainable {formatMonthYear((stat.depletionMonth || 1))}</span>
                            : <span style={{ color: '#991b1b', backgroundColor: '#fee2e2', padding: '2px 8px', borderRadius: '12px', fontSize: '12px' }}>Depleted {formatMonthYear((stat.depletionMonth || 1))}</span>
                        }
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: stat.finalValue > 0 ? '600' : '400' }}>
                        {stat.finalValue > 0 ? currencyFormatter.format(stat.finalValue) : '€0'}
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: stat.finalValue > 0 ? '600' : '400', color: '#4b5563', backgroundColor: '#f3f4f6' }}>
                        {stat.finalValue > 0 
                          ? currencyFormatter.format(stat.finalValue / Math.pow(1 + params.inflation_percentage, params.simulation_end_year - params.simulation_start_year)) 
                          : '€0'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}