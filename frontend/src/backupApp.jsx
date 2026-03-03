import React, { useState, useEffect, useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { PlusCircle, Trash2, Eye, EyeOff } from 'lucide-react';

// Decoupled Input Models vs Display Models - EXACT JSON KEYS
const uiModels = { linear: 'Linear Average', stochastic: 'Stochastic (Monte Carlo)', historical_SP500: 'S&P 500', historical_EUROSTOXX50: 'EURO STOXX' };
const displayNames = { linear: 'Linear Average', historical_SP500: 'S&P 500', historical_EUROSTOXX50: 'EURO STOXX', stochastic_90: 'Stochastic (Best 10%)', stochastic_50: 'Stochastic (Median)', stochastic_10: 'Stochastic (Worst 10%)' };
const displayColors = { linear: '#2563eb', historical_SP500: '#dc2626', historical_EUROSTOXX50: '#9333ea', stochastic_90: '#4ade80', stochastic_50: '#16a34a', stochastic_10: '#064e3b' };

const taxNames = { Finland: 'Finland', Italy_7_Percent: 'Italy (7%)', Italy_General: 'Italy (Gen)', Spain: 'Spain', Portugal_General: 'Portugal', Czech_Republic: 'Czech (3y)', Bulgaria: 'Bulgaria' };
const taxDashArrays = { Finland: undefined, Italy_7_Percent: '5 5', Italy_General: '3 3', Spain: '10 5', Portugal_General: '20 10', Czech_Republic: '7 7', Bulgaria: '2 2' };

export default function App() {
  const currentDate = new Date();
  const currentYear = currentDate.getFullYear();
  const defaultStartMonth = currentDate.getMonth() === 11 ? 1 : currentDate.getMonth() + 2;
  const defaultStartYear = currentDate.getMonth() === 11 ? currentYear + 1 : currentYear;
  
  const [params, setParams] = useState({
    initial_investment: 1000000, initial_profit_percentage: 0.40, yearly_spending: 40000, inflation_percentage: 0.02,
    enable_low_season_spend: false, low_season_cut_percentage: 0.10,
    growth_models: ['linear'], tax_residencies: ['Finland'], linear_rate: 0.07, 
    stochastic_volatility_monthly: 0.04, stochastic_min_annual: -0.50, stochastic_max_annual: 0.60, stochastic_iterations: 100,
    historical_start_year: 1950, historical_end_year: 2025, 
    simulation_start_year: defaultStartYear, simulation_start_month: defaultStartMonth, simulation_end_year: defaultStartYear + 50,
    pensions_inflation_adjusted: true, pensions: [], cash_events: [], relocations: [],
    use_cash_buffer: false, buffer_target_months: 36, buffer_current_size: 120000, buffer_depletion_threshold: 0.0, buffer_replenishment_threshold: 0.10
  });

  const [chartData, setChartData] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [hiddenLines, setHiddenLines] = useState([]);

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
        const response = await fetch('http://localhost:8000/simulate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(params) });
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
        let finalValue = 0; let depletionMonth = null;
        const lastMonthData = chartData[chartData.length - 1];
        if (lastMonthData && lastMonthData[dataKey] > 0) { finalValue = lastMonthData[dataKey]; } 
        else { for (let i = 0; i < chartData.length; i++) { if (chartData[i][dataKey] <= 0) { depletionMonth = chartData[i].month; break; } } }
        stats.push({ id: dataKey, model, tax, modelName: displayNames[model], taxName: taxNames[tax], finalValue, depletionMonth });
      });
    });
    return stats.sort((a, b) => {
      if (a.finalValue > 0 && b.finalValue > 0) return b.finalValue - a.finalValue;
      if (a.finalValue > 0) return -1; if (b.finalValue > 0) return 1;
      return (b.depletionMonth || 0) - (a.depletionMonth || 0);
    });
  }, [chartData, activeModels, params.tax_residencies]);

  const toggleLineVisibility = (dataKey) => { setHiddenLines(prev => prev.includes(dataKey) ? prev.filter(k => k !== dataKey) : [...prev, dataKey]); };
  const handleChange = (e) => { const { name, value, type, checked } = e.target; setParams(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : (type === 'number' || type === 'range' ? parseFloat(value) || 0 : value) })); };
  const handleArrayToggle = (key, id) => { setParams(prev => { const isSelected = prev[key].includes(id); const newList = isSelected ? prev[key].filter(i => i !== id) : [...prev[key], id]; return { ...prev, [key]: newList.length ? newList : [id] }; }); };
  
  const addPension = () => { setParams(prev => ({ ...prev, pensions: [...prev.pensions, { amount: 1500, start_year: params.simulation_start_year + 10, start_month: 1 }] })); };
  const updatePension = (index, field, value) => { setParams(prev => { const newArr = [...prev.pensions]; newArr[index][field] = parseFloat(value) || 0; return { ...prev, pensions: newArr }; }); };
  const removePension = (index) => { setParams(prev => ({ ...prev, pensions: prev.pensions.filter((_, i) => i !== index) })); };

  const addCashEvent = () => { setParams(prev => ({ ...prev, cash_events: [...prev.cash_events, { amount: 200000, target: 'investment', year: params.simulation_start_year + 5, month: 6 }] })); };
  const updateCashEvent = (index, field, value) => { setParams(prev => { const newArr = [...prev.cash_events]; newArr[index][field] = field === 'target' ? value : (parseFloat(value) || 0); return { ...prev, cash_events: newArr }; }); };
  const removeCashEvent = (index) => { setParams(prev => ({ ...prev, cash_events: prev.cash_events.filter((_, i) => i !== index) })); };

  const addRelocation = () => { setParams(prev => ({ ...prev, relocations: [...prev.relocations, { new_regime: 'Spain', year: params.simulation_start_year + 5, month: 1 }] })); };
  const updateRelocation = (index, field, value) => { setParams(prev => { const newArr = [...prev.relocations]; newArr[index][field] = field === 'new_regime' ? value : (parseFloat(value) || 0); return { ...prev, relocations: newArr }; }); };
  const removeRelocation = (index) => { setParams(prev => ({ ...prev, relocations: prev.relocations.filter((_, i) => i !== index) })); };

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
          
          <div style={{ ...inputGroupStyle, backgroundColor: '#fdf2f8', padding: '12px', borderRadius: '6px', border: '1px solid #fbcfe8' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: params.enable_low_season_spend ? '12px' : '0' }}><input type="checkbox" id="enable_low_season_spend" name="enable_low_season_spend" checked={params.enable_low_season_spend} onChange={handleChange} /><label htmlFor="enable_low_season_spend" style={{ fontSize: '14px', fontWeight: 'bold', color: '#831843' }}>Enable Low Season Spending</label></div>
            {params.enable_low_season_spend && (<div><label style={labelStyle}>Belt-Tightening Cut (Decimal)</label><input type="number" name="low_season_cut_percentage" value={params.low_season_cut_percentage} onChange={handleChange} step="0.01" max="1" min="0" style={inputStyle} /></div>)}
          </div>

          <div style={inputGroupStyle}><label style={labelStyle}>Inflation Rate (Decimal)</label><input type="number" name="inflation_percentage" value={params.inflation_percentage} onChange={handleChange} step="0.01" style={inputStyle} /></div>

          <div style={{ ...inputGroupStyle, backgroundColor: '#fef3c7', padding: '12px', borderRadius: '6px', border: '1px solid #fde68a' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: params.use_cash_buffer ? '12px' : '0' }}><input type="checkbox" id="use_cash_buffer" name="use_cash_buffer" checked={params.use_cash_buffer} onChange={handleChange} /><label htmlFor="use_cash_buffer" style={{ fontSize: '14px', fontWeight: 'bold', color: '#92400e' }}>Enable Cash Buffer Strategy</label></div>
            {params.use_cash_buffer && (
              <>
                <div style={inputGroupStyle}><label style={labelStyle}>Initial Buffer Size (€)</label><input type="number" name="buffer_current_size" value={params.buffer_current_size} onChange={handleChange} style={inputStyle} /></div>
                <div style={inputGroupStyle}><label style={labelStyle}>Target Buffer Size (Months)</label><input type="number" name="buffer_target_months" value={params.buffer_target_months} onChange={handleChange} style={inputStyle} /></div>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <div style={{ flex: 1 }}><label style={labelStyle}>Depletion Threshold</label><input type="number" name="buffer_depletion_threshold" value={params.buffer_depletion_threshold} onChange={handleChange} step="0.01" style={inputStyle} /></div>
                  <div style={{ flex: 1 }}><label style={labelStyle}>Replenish Threshold</label><input type="number" name="buffer_replenishment_threshold" value={params.buffer_replenishment_threshold} onChange={handleChange} step="0.01" style={inputStyle} /></div>
                </div>
              </>
            )}
          </div>

          <div style={{ ...inputGroupStyle, backgroundColor: '#f9fafb', padding: '12px', borderRadius: '6px', border: '1px solid #e5e7eb' }}>
            <label style={labelStyle}>Compare Tax Residencies</label>
            {Object.entries(taxNames).map(([id, name]) => (<div key={id} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}><input type="checkbox" id={`tax-${id}`} checked={params.tax_residencies.includes(id)} onChange={() => handleArrayToggle('tax_residencies', id)} /><label htmlFor={`tax-${id}`} style={{ fontSize: '14px' }}>{name}</label></div>))}
          </div>

          <div style={{ ...inputGroupStyle, backgroundColor: '#f9fafb', padding: '12px', borderRadius: '6px', border: '1px solid #e5e7eb' }}>
            <label style={labelStyle}>Compare Growth Models</label>
            {Object.entries(uiModels).map(([id, name]) => (<div key={id} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}><input type="checkbox" id={id} checked={params.growth_models.includes(id)} onChange={() => handleArrayToggle('growth_models', id)} /><label htmlFor={id} style={{ fontSize: '14px' }}>{name}</label></div>))}
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

          {params.growth_models.some(m => m === 'linear' || m === 'stochastic') && (
            <div style={{ padding: '12px', backgroundColor: '#f0fdf4', borderRadius: '6px', marginBottom: '16px', border: '1px solid #bbf7d0' }}>
              <strong style={{ display: 'block', fontSize: '13px', marginBottom: '12px', color: '#166534' }}>Linear & Stochastic Parameters</strong>
              <div style={inputGroupStyle}><label style={labelStyle}>Expected Annual Return (Decimal)</label><input type="number" name="linear_rate" value={params.linear_rate} onChange={handleChange} step="0.001" style={inputStyle} /></div>
              {params.growth_models.includes('stochastic') && (
                <div style={{ borderTop: '1px solid #bbf7d0', paddingTop: '12px', marginTop: '12px' }}>
                  <div style={inputGroupStyle}><label style={labelStyle}>Monthly Volatility (Decimal)</label><input type="number" name="stochastic_volatility_monthly" value={params.stochastic_volatility_monthly} onChange={handleChange} step="0.01" style={inputStyle} /></div>
                  <div style={{ display: 'flex', gap: '10px', marginBottom: '12px' }}>
                    <div style={{ flex: 1 }}><label style={labelStyle}>Min Limit</label><input type="number" name="stochastic_min_annual" value={params.stochastic_min_annual} onChange={handleChange} step="0.01" style={inputStyle} /></div>
                    <div style={{ flex: 1 }}><label style={labelStyle}>Max Limit</label><input type="number" name="stochastic_max_annual" value={params.stochastic_max_annual} onChange={handleChange} step="0.01" style={inputStyle} /></div>
                  </div>
                  
                  {/* NEW SLIDER FOR ITERATIONS */}
                  <div>
                    <label style={labelStyle}>Monte Carlo Iterations: {params.stochastic_iterations}</label>
                    <input type="range" name="stochastic_iterations" value={params.stochastic_iterations} min="10" max="1000" step="10" onChange={handleChange} style={{ width: '100%', cursor: 'pointer' }} />
                  </div>
                </div>
              )}
            </div>
          )}

          <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: '16px', marginTop: '24px' }}><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}><h4 style={{ margin: 0 }}>Cash Events (One-Time)</h4><button onClick={addCashEvent} style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', background: '#dcfce7', border: 'none', padding: '6px 12px', borderRadius: '4px', color: '#166534', fontWeight: 'bold' }}><PlusCircle size={16} /> Add</button></div>{params.cash_events.map((ev, index) => (<div key={`ce-${index}`} style={{ backgroundColor: '#f0fdf4', padding: '12px', borderRadius: '6px', border: '1px solid #bbf7d0', marginBottom: '10px' }}><div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', borderBottom: '1px solid #bbf7d0', paddingBottom: '4px' }}><strong style={{ fontSize: '14px', color: '#166534' }}>Event {index + 1}</strong><button onClick={() => removeCashEvent(index)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer' }}><Trash2 size={16} /></button></div><div style={{ display: 'flex', gap: '10px', marginBottom: '12px' }}><div style={{ flex: 1 }}><label style={labelStyle}>Amount (€)</label><input type="number" value={ev.amount} onChange={(e) => updateCashEvent(index, 'amount', e.target.value)} style={inputStyle} /></div><div style={{ flex: 1 }}><label style={labelStyle}>Target</label><select value={ev.target} onChange={(e) => updateCashEvent(index, 'target', e.target.value)} style={inputStyle}><option value="investment">Investments</option><option value="buffer">Cash Buffer</option></select></div></div><div style={{ display: 'flex', gap: '10px' }}><div style={{ flex: 1 }}><label style={labelStyle}>Year</label><input type="number" value={ev.year} onChange={(e) => updateCashEvent(index, 'year', e.target.value)} style={inputStyle} /></div><div style={{ flex: 1 }}><label style={labelStyle}>Month</label><input type="number" value={ev.month} onChange={(e) => updateCashEvent(index, 'month', e.target.value)} min="1" max="12" style={inputStyle} /></div></div></div>))}</div>
          <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: '16px', marginTop: '24px' }}><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}><h4 style={{ margin: 0 }}>Relocations (Tax)</h4><button onClick={addRelocation} style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', background: '#fef08a', border: 'none', padding: '6px 12px', borderRadius: '4px', color: '#854d0e', fontWeight: 'bold' }}><PlusCircle size={16} /> Add</button></div>{params.relocations.map((reloc, index) => (<div key={`reloc-${index}`} style={{ backgroundColor: '#fefce8', padding: '12px', borderRadius: '6px', border: '1px solid #fde047', marginBottom: '10px' }}><div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', borderBottom: '1px solid #fde047', paddingBottom: '4px' }}><strong style={{ fontSize: '14px', color: '#854d0e' }}>Move {index + 1}</strong><button onClick={() => removeRelocation(index)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer' }}><Trash2 size={16} /></button></div><div style={{ marginBottom: '12px' }}><label style={labelStyle}>New Tax Residency</label><select value={reloc.new_regime} onChange={(e) => updateRelocation(index, 'new_regime', e.target.value)} style={inputStyle}>{Object.entries(taxNames).map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></div><div style={{ display: 'flex', gap: '10px' }}><div style={{ flex: 1 }}><label style={labelStyle}>Year</label><input type="number" value={reloc.year} onChange={(e) => updateRelocation(index, 'year', e.target.value)} style={inputStyle} /></div><div style={{ flex: 1 }}><label style={labelStyle}>Month</label><input type="number" value={reloc.month} onChange={(e) => updateRelocation(index, 'month', e.target.value)} min="1" max="12" style={inputStyle} /></div></div></div>))}</div>
          <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: '16px', marginTop: '24px' }}><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}><h4 style={{ margin: 0 }}>Pensions (Recurring)</h4><button onClick={addPension} style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', background: '#e0e7ff', border: 'none', padding: '6px 12px', borderRadius: '4px', color: '#3730a3', fontWeight: 'bold' }}><PlusCircle size={16} /> Add</button></div>{params.pensions.map((pension, index) => (<div key={index} style={{ backgroundColor: '#f9fafb', padding: '12px', borderRadius: '6px', border: '1px solid #e5e7eb', marginBottom: '10px' }}><div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', borderBottom: '1px solid #e5e7eb', paddingBottom: '4px' }}><strong style={{ fontSize: '14px' }}>Stream {index + 1}</strong><button onClick={() => removePension(index)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer' }}><Trash2 size={16} /></button></div><div style={{ display: 'flex', gap: '10px', marginBottom: '12px' }}><div style={{ flex: 1 }}><label style={labelStyle}>Amount/mo in today's money (€)</label><input type="number" value={pension.amount} onChange={(e) => updatePension(index, 'amount', e.target.value)} style={inputStyle} /></div></div><div style={{ display: 'flex', gap: '10px' }}><div style={{ flex: 1 }}><label style={labelStyle}>Start Year</label><input type="number" value={pension.start_year} onChange={(e) => updatePension(index, 'start_year', e.target.value)} style={inputStyle} /></div><div style={{ flex: 1 }}><label style={labelStyle}>Start Month</label><input type="number" value={pension.start_month} onChange={(e) => updatePension(index, 'start_month', e.target.value)} min="1" max="12" style={inputStyle} /></div></div></div>))}</div>
          
          {/* UPDATED LOADING TEXT */}
          {isLoading && (
            <p style={{ color: '#0066cc', fontWeight: 'bold' }}>
              Simulating {params.growth_models.includes('stochastic') ? params.stochastic_iterations : 1} timeline(s)...
            </p>
          )}
          {error && <p style={{ color: 'red' }}>Error: {error}</p>}
        </div>

        {/* VISUALIZER PANEL */}
        <div style={{ flex: 1, height: '100%', overflowY: 'auto', display: 'flex', flexDirection: 'column', minWidth: 0, paddingRight: '10px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexShrink: 0 }}>
            <h3 style={{ margin: 0 }}>Projection & Dynamics</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '12px', backgroundColor: '#fff', padding: '10px 16px', borderRadius: '6px', border: '1px solid #e5e7eb' }}>
              <div style={{ display: 'flex', alignItems: 'center' }}><strong style={{ color: '#6b7280', textTransform: 'uppercase', fontSize: '10px', width: '130px', flexShrink: 0 }}>Tax Regime (Style)</strong><div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>{params.tax_residencies.map(tax => (<div key={tax} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><svg width="24" height="10"><line x1="0" y1="5" x2="24" y2="5" stroke="#4b5563" strokeWidth="2" strokeDasharray={taxDashArrays[tax]} /></svg><span>{taxNames[tax]}</span></div>))}</div></div>
              <div style={{ height: '1px', backgroundColor: '#e5e7eb', width: '100%' }}></div>
              <div style={{ display: 'flex', alignItems: 'center' }}><strong style={{ color: '#6b7280', textTransform: 'uppercase', fontSize: '10px', width: '130px', flexShrink: 0 }}>Growth Model (Color)</strong><div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>{activeModels.map(model => (<div key={model} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><div style={{ width: '12px', height: '12px', backgroundColor: displayColors[model], borderRadius: '2px' }}></div><span>{displayNames[model]}</span></div>))}</div></div>
            </div>
          </div>

          <div style={{ flex: '1 1 auto', minHeight: '300px', marginBottom: '20px', backgroundColor: '#fff', padding: '20px 0 0 0', borderRadius: '8px', border: '1px solid #e5e7eb', position: 'relative' }}>
            <h4 style={{ position: 'absolute', top: 5, left: 20, margin: 0, fontSize: '13px', color: '#6b7280' }}>Total Portfolio Assets (Left) vs. Return Rate (Right)</h4>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 20, right: 20, left: 10, bottom: 20 }} syncId="portfolioSim">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" tickFormatter={formatYear} />
                <YAxis yAxisId="left" tickFormatter={(value) => `${(value / 1000).toFixed(0)}k`} width={80} />
                <YAxis yAxisId="right" orientation="right" tickFormatter={(value) => `${(value * 100).toFixed(0)}%`} width={80} />
                <Tooltip labelFormatter={formatMonthYear} formatter={(value, name) => name.includes('Return') ? [`${(value * 100).toFixed(2)}%`, name] : [currencyFormatter.format(value), name]} />
 
                {/* --- RESTORED EVENT LINES --- */}
                {params.pensions.map((p, i) => { 
                  const startMonthRelative = ((p.start_year - params.simulation_start_year) * 12) + p.start_month - params.simulation_start_month + 1;
                  const totalSimulationMonths = (params.simulation_end_year - params.simulation_start_year) * 12;
                  // Changed to Magenta (#db2777) to contrast with green stochastic lines
                  return (startMonthRelative > 0 && startMonthRelative <= totalSimulationMonths) ? <ReferenceLine yAxisId="left" key={`ref-pen-${i}`} x={startMonthRelative} stroke="#db2777" strokeDasharray="3 3" label={{ value: `Pension ${i + 1}`, position: 'insideTopLeft', fill: '#be185d', fontSize: 12 }} /> : null; 
                })}
                {params.cash_events.map((ev, i) => { 
                  const evMonthRelative = ((ev.year - params.simulation_start_year) * 12) + ev.month - params.simulation_start_month + 1;
                  const totalSimulationMonths = (params.simulation_end_year - params.simulation_start_year) * 12;
                  return (evMonthRelative > 0 && evMonthRelative <= totalSimulationMonths) ? <ReferenceLine yAxisId="left" key={`ref-cash-${i}`} x={evMonthRelative} stroke="#2563eb" strokeDasharray="3 3" label={{ value: `+${(ev.amount/1000).toFixed(0)}k`, position: 'insideTopLeft', fill: '#1d4ed8', fontSize: 12 }} /> : null; 
                })}
                {params.relocations.map((reloc, i) => { 
                  const relocMonthRelative = ((reloc.year - params.simulation_start_year) * 12) + reloc.month - params.simulation_start_month + 1;
                  const totalSimulationMonths = (params.simulation_end_year - params.simulation_start_year) * 12;
                  return (relocMonthRelative > 0 && relocMonthRelative <= totalSimulationMonths) ? <ReferenceLine yAxisId="left" key={`ref-reloc-${i}`} x={relocMonthRelative} stroke="#9333ea" strokeDasharray="5 5" label={{ value: `${taxNames[reloc.new_regime]}`, position: 'insideTopLeft', fill: '#7e22ce', fontSize: 12 }} /> : null; 
                })}

               {activeModels.map(model => params.tax_residencies.map(tax => <Line yAxisId="left" key={`${model}_${tax}`} type="monotone" dataKey={`${model}_${tax}_value`} name={`${displayNames[model]} (${taxNames[tax]})`} stroke={displayColors[model]} strokeDasharray={taxDashArrays[tax]} strokeWidth={2} dot={false} isAnimationActive={false} hide={hiddenLines.includes(`${model}_${tax}_value`)} />))}
                {activeModels.map(model => <Line yAxisId="right" key={`${model}_return`} type="monotone" dataKey={`${model}_return`} name={`${displayNames[model]} Return`} stroke={displayColors[model]} strokeDasharray="2 4" strokeWidth={1} dot={false} isAnimationActive={false} hide={hiddenLines.includes(`${model}_return`)} />)}
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div style={{ flex: '1 1 auto', minHeight: '300px', marginBottom: '20px', backgroundColor: '#fff', padding: '20px 0 0 0', borderRadius: '8px', border: '1px solid #e5e7eb', position: 'relative' }}>
             <h4 style={{ position: 'absolute', top: 5, left: 20, margin: 0, fontSize: '13px', color: '#6b7280' }}>Monthly Cashflows (Left) vs. Buffer Balance (Right)</h4>
             <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 20, right: 20, left: 10, bottom: 20 }} syncId="portfolioSim">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" tickFormatter={formatYear} />
                <YAxis yAxisId="left" tickFormatter={(value) => `${(value / 1000).toFixed(1)}k`} width={80} />
                <YAxis yAxisId="right" orientation="right" tickFormatter={(value) => `${(value / 1000).toFixed(0)}k`} width={80} />
                <Tooltip wrapperStyle={{ zIndex: 1000 }} labelFormatter={formatMonthYear} formatter={(value) => currencyFormatter.format(value)} />
                {activeModels.map(model => params.tax_residencies.map(tax => (
                  <React.Fragment key={`${model}_${tax}_flows`}>
                    {params.use_cash_buffer && <Line yAxisId="right" type="monotone" dataKey={`${model}_${tax}_buffer_val`} name={`Buffer Bal (${taxNames[tax]})`} stroke={displayColors[model]} strokeDasharray={taxDashArrays[tax]} strokeWidth={2} dot={false} isAnimationActive={false} hide={hiddenLines.includes(`${model}_${tax}_value`)} />}
                    {params.use_cash_buffer && <Line yAxisId="left" type="monotone" dataKey={`${model}_${tax}_w_buf`} name={`Buffer Used (${taxNames[tax]})`} stroke="#ea580c" strokeWidth={1} dot={false} isAnimationActive={false} hide={hiddenLines.includes(`${model}_${tax}_value`)} />}
                    <Line yAxisId="left" type="monotone" dataKey={`${model}_${tax}_w_inv`} name={`Equities Sold (${taxNames[tax]})`} stroke={displayColors[model]} strokeWidth={1} dot={false} isAnimationActive={false} hide={hiddenLines.includes(`${model}_${tax}_value`)} />
                    <Line yAxisId="left" type="monotone" dataKey={`${model}_${tax}_w_pen`} name={`Pension Income (${taxNames[tax]})`} stroke="#10b981" strokeDasharray="3 3" strokeWidth={1} dot={false} isAnimationActive={false} hide={hiddenLines.includes(`${model}_${tax}_value`)} />
                  </React.Fragment>
                )))}
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div style={{ flex: '0 0 auto', backgroundColor: '#fff', borderRadius: '8px', border: '1px solid #e5e7eb', overflowY: 'auto', minHeight: '150px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '14px' }}>
              <thead style={{ backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb', position: 'sticky', top: 0, zIndex: 1 }}>
                <tr><th style={{ padding: '12px 16px' }}>Visibility</th><th style={{ padding: '12px 16px' }}>Growth Model</th><th style={{ padding: '12px 16px' }}>Tax Residency</th><th style={{ padding: '12px 16px' }}>Outcome</th><th style={{ padding: '12px 16px', textAlign: 'right' }}>Final Value ({params.simulation_end_year})</th></tr>
              </thead>
              <tbody>
                {summaryStats.map((stat, i) => {
                  const isHidden = hiddenLines.includes(stat.id);
                  return (
                    <tr key={stat.id} onClick={() => { toggleLineVisibility(stat.id); toggleLineVisibility(stat.id.replace('_value', '_return')); }} style={{ borderBottom: '1px solid #e5e7eb', cursor: 'pointer', backgroundColor: i % 2 === 0 ? '#fff' : '#f9fafb', opacity: isHidden ? 0.4 : 1 }}>
                      <td style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '8px' }}>{isHidden ? <EyeOff size={16} /> : <Eye size={16} color={displayColors[stat.model]} />}<span>{isHidden ? 'Hidden' : 'Visible'}</span></td>
                      <td style={{ padding: '12px 16px', fontWeight: '500' }}><div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><div style={{ width: '10px', height: '10px', backgroundColor: displayColors[stat.model], borderRadius: '2px' }}></div>{stat.modelName}</div></td>
                      <td style={{ padding: '12px 16px' }}><div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><svg width="20" height="4"><line x1="0" y1="2" x2="20" y2="2" stroke="#4b5563" strokeWidth="2" strokeDasharray={taxDashArrays[stat.tax]} /></svg>{stat.taxName}</div></td>
                      <td style={{ padding: '12px 16px' }}>{stat.finalValue > 0 ? <span style={{ color: '#16a34a', backgroundColor: '#dcfce7', padding: '2px 8px', borderRadius: '12px', fontSize: '12px' }}>Survived</span> : <span style={{ color: '#dc2626', backgroundColor: '#fee2e2', padding: '2px 8px', borderRadius: '12px', fontSize: '12px' }}>Depleted {formatMonthYear((stat.depletionMonth || 1))}</span>}</td>
                      <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: stat.finalValue > 0 ? '600' : '400' }}>{stat.finalValue > 0 ? currencyFormatter.format(stat.finalValue) : '€0'}</td>
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
