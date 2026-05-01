import React, { useState, useEffect, useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, ZAxis, CartesianGrid, ScatterChart, Scatter, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { PlusCircle, Trash2, Eye, EyeOff, Zap } from 'lucide-react';

const formatEur = (val) => new Intl.NumberFormat('fi-FI', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(val);

const UnifiedTooltip = ({ active, payload, label, params }) => {
  if (active && payload && payload.length) {
    const monthData = payload[0].payload; 
    
    const absoluteMonth = parseInt(label);
    const startYear = parseInt(params.simulation_start_year || new Date().getFullYear());
    const startMonth = parseInt(params.simulation_start_month || 1);
    const currentYear = startYear + Math.floor((absoluteMonth + startMonth - 2) / 12);
    const calendarMonth = ((absoluteMonth + startMonth - 2) % 12) + 1;

    const mainLines = payload.filter(entry => entry.dataKey.includes('_value'));

    return (
      <div style={{ backgroundColor: 'rgba(255, 255, 255, 0.96)', padding: '16px', border: '1px solid #cbd5e1', borderRadius: '8px', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)', maxWidth: '600px' }}>
        <p style={{ margin: '0 0 12px 0', fontWeight: 'bold', fontSize: '15px', color: '#1e293b', borderBottom: '1px solid #e2e8f0', paddingBottom: '8px' }}>
          {currentYear} - Month {calendarMonth} <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 'normal' }}>(Timeline: {label})</span>
        </p>
      {mainLines.map((entry, index) => {
          const baseKey = entry.dataKey.replace('_value', '');
          
          const returnKey = Object.keys(monthData).find(k => k.endsWith('_return') && baseKey.startsWith(k.replace('_return', '') + '_'));
          const monthReturn = returnKey ? monthData[returnKey] : 0;
          
          const equitiesSold = monthData[`${baseKey}_w_inv`] !== undefined ? monthData[`${baseKey}_w_inv`] : (monthData.w_inv || 0);
          const bufferUsed = monthData[`${baseKey}_w_buf`] !== undefined ? monthData[`${baseKey}_w_buf`] : (monthData.w_buf || 0);
          const pension = monthData[`${baseKey}_w_pen`] !== undefined ? monthData[`${baseKey}_w_pen`] : (monthData.w_pen || 0);
          const spend = monthData[`${baseKey}_spend`] !== undefined ? monthData[`${baseKey}_spend`] : (monthData.spend || 0);
          const bufferVal = monthData[`${baseKey}_buffer_val`] !== undefined ? monthData[`${baseKey}_buffer_val`] : (monthData.buffer_val || 0);
          const isAusterity = monthData[`${baseKey}_austerity`] !== undefined ? monthData[`${baseKey}_austerity`] : (monthData.austerity || false);

          return (
            <div key={index} style={{ display: 'flex', alignItems: 'center', gap: '24px', marginBottom: index === mainLines.length - 1 ? '0' : '16px', borderLeft: `4px solid ${entry.color}`, paddingLeft: '12px' }}>
              
              <div style={{ minWidth: '180px' }}>
                <div style={{ fontWeight: 'bold', color: entry.color, fontSize: '14px', marginBottom: '4px' }}>{entry.name.replace(' Value', '')}</div>
                <div style={{ fontSize: '14px', color: '#1e293b' }}>Total Assets: <strong>{formatEur(entry.value)}</strong></div>
                <div style={{ fontSize: '13px', color: '#475569' }}>Equities: {formatEur(entry.value - bufferVal)}</div>
                <div style={{ fontSize: '13px', color: '#64748b' }}>Cash Buffer: {formatEur(bufferVal)}</div>
              </div>

              <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', columnGap: '24px', rowGap: '4px', fontSize: '12px', color: '#475569', borderLeft: '1px dashed #cbd5e1', paddingLeft: '24px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Month Return:</span> 
                  <span style={{ color: monthReturn >= 0 ? '#16a34a' : '#dc2626', fontWeight: 'bold' }}>
                    {(monthReturn * 100).toFixed(2)}%
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Equities Sold:</span> 
                  <span style={{ color: equitiesSold > 0 ? '#b91c1c' : 'inherit', fontWeight: equitiesSold > 0 ? 'bold' : 'normal' }}>{formatEur(equitiesSold)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Pension In:</span> 
                  <span style={{ color: pension > 0 ? '#0284c7' : 'inherit' }}>{formatEur(pension)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Buffer Used:</span> 
                  <span style={{ color: bufferUsed > 0 ? '#d97706' : 'inherit', fontWeight: bufferUsed > 0 ? 'bold' : 'normal' }}>{formatEur(bufferUsed)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gridColumn: '1 / -1', borderTop: '1px solid #f1f5f9', paddingTop: '4px', marginTop: '2px' }}>
                  <span>Total Spend:</span> 
                  <span style={{ fontWeight: 'bold', color: isAusterity ? '#047857' : 'inherit' }}>
                    {formatEur(spend)} {isAusterity && <span title="Low Season Austerity Active" style={{ fontSize: '12px', marginLeft: '4px' }}>❄️</span>}
                  </span>
                </div>
              </div>
            </div>
          );
        })}  
      </div>
    );
  }
  return null;
};

export default function App() {
  const [dynamicModels, setDynamicModels] = useState({
    uiModels: { linear: 'Linear Average', stochastic: 'Stochastic (Monte Carlo)' },
    displayNames: { linear: 'Linear Average', stochastic_90: 'Stochastic (Best 10%)', stochastic_50: 'Stochastic (Median)', stochastic_10: 'Stochastic (Worst 10%)' },
    displayColors: { linear: '#2563eb', stochastic_90: '#4ade80', stochastic_50: '#16a34a', stochastic_10: '#064e3b' },
    capGainsRegimes: ['Finland'],
    pensionRegimes: ['Finland'],
    taxStyles: { 'Finland': undefined }
  });

  const [params, setParams] = useState(null);
  const [isSimulating, setIsSimulating] = useState(false);
  const [chartData, setChartData] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [hiddenLines, setHiddenLines] = useState([]);
  const [isTargeting, setIsTargeting] = useState(false);
  const [targetResults, setTargetResults] = useState(null);
  const [analysisMode, setAnalysisMode] = useState('forward');
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [optimizationResult, setOptimizationResult] = useState(null);
  const [optimizationConfig, setOptimizationConfig] = useState({
    target_success_rate: 0.95,
    search_iterations: 30,
    paths_per_evaluation: 20
  });

// ... in handleOptimize function
const handleOptimize = async () => {
    setIsOptimizing(true);
    setOptimizationResult(null);
    try {
      const response = await fetch('http://localhost:8000/optimize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          base_params: params,
          target_success_rate: optimizationConfig.target_success_rate,
          search_iterations: optimizationConfig.search_iterations,
          paths_per_evaluation: optimizationConfig.paths_per_evaluation
        }),
      });
      if (!response.ok) throw new Error('Optimization failed');
      
      const json = await response.json();
      // Store the 'data' array from the backend response
      setOptimizationResult(json.data); 
    } catch (error) {
      console.error(error);
      alert("Failed to run optimizer. Check console.");
    } finally {
      setIsOptimizing(false);
    }
  };

// Change the function to take the specific optimal_strategy as an argument
const applyOptimizedStrategy = (optimal_strategy) => {
    if (!optimal_strategy) return;
    const best = optimal_strategy.parameters; //
    
    setParams(prev => {
      let nextParams = {
        ...prev,
        yearly_spending: Math.round(best.withdrawal_rate * (prev.initial_investment || 0)),
        buffer_target_months: best.buffer_months,
      };

      // Strategy specific logic remains the same
      if (best.active_strategy === "Low Season Austerity") {
        nextParams.enable_low_season_spend = true;
        nextParams.use_guyton_klinger = false;
        nextParams.use_proportional_attenuator = false;
        nextParams.low_season_cut_percentage = best.low_season_cut_percentage || 0;
      } else if (best.active_strategy === "Proportional Attenuator") {
        nextParams.enable_low_season_spend = false;
        nextParams.use_guyton_klinger = false;
        nextParams.use_proportional_attenuator = true;
        nextParams.attenuator_max_cut = best.attenuator_max_cut;
      } else if (best.active_strategy === "Guyton-Klinger") {
        nextParams.enable_low_season_spend = false;
        nextParams.use_proportional_attenuator = false;
        nextParams.use_guyton_klinger = true;
        nextParams.gk_cut_rate = best.gk_cut_rate;
        nextParams.gk_raise_rate = best.gk_raise_rate;
        nextParams.gk_upper_threshold = best.gk_withdrawal_limit_upper;
        nextParams.gk_lower_threshold = best.gk_withdrawal_limit_lower;
        nextParams.gk_allow_raises = (best.gk_raise_rate > 0);
      } else if (best.active_strategy === "Ratcheting") {
         nextParams.ratchet_raise_rate = best.ratchet_raise_rate;
      }

      return nextParams;
    });
  };

  const handleFindMinimumCapital = async () => {
    if (!params) return;
    setIsTargeting(true);
    setTargetResults(null);
    try {
      const safePayload = { 
        ...params, 
        pensions: params.pensions.map(p => ({ ...p, end_year: p.end_year === '' ? null : p.end_year, end_month: p.end_month === '' ? null : p.end_month })) 
      };
      const response = await fetch(`http://${window.location.hostname}:8000/find_min_capital`, { 
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify(safePayload) 
      });
      if (!response.ok) throw new Error('Targeting computer failed');
      const json = await response.json();
      setTargetResults(json.data);
    } catch (err) { 
      console.error(err); 
      alert("Failed to calculate minimum capital. Check backend console.");
    } finally { 
      setIsTargeting(false); 
    }
  };

  useEffect(() => {
    const loadConfig = async () => {
      try {
        const res = await fetch(`http://${window.location.hostname}:8000/config`, { cache: 'no-store' });
        const data = await res.json();
        const historyColors = ['#dc2626', '#9333ea', '#ea580c', '#0284c7', '#ca8a04', '#4f46e5'];
        
        let newUi = { linear: 'Linear Average', stochastic: 'Stochastic (Monte Carlo)', stochastic_gbm: 'GBM (Single Path)', stochastic_heston: 'Heston (Crash Scenario)' };
        let newNames = { linear: 'Linear Average', stochastic_90: 'Stochastic (Best 10%)', stochastic_50: 'Stochastic (Median)', stochastic_10: 'Stochastic (Worst 10%)', stochastic_gbm: 'GBM Model', stochastic_heston: 'Heston Crash' };
        let newColors = { linear: '#2563eb', stochastic_90: '#4ade80', stochastic_50: '#16a34a', stochastic_10: '#064e3b', stochastic_gbm: '#d97706', stochastic_heston: '#be123c' };

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

        if (data.default_params) {
            setParams(data.default_params);
        }
        if (data.optimizer_defaults) {
            setOptimizationConfig(data.optimizer_defaults);
        }

      } catch (err) { console.error("Failed to load backend config", err); }
    };
    loadConfig();
  }, []);

  const activeModels = useMemo(() => {
    if (!params) return [];
    let expanded = [];
    params.growth_models.forEach(m => {
      if (m === 'stochastic') { expanded.push('stochastic_90', 'stochastic_50', 'stochastic_10'); } 
      else { expanded.push(m); }
    });
    return expanded;
  }, [params?.growth_models]);

  useEffect(() => {
    if (!params) return;
    const fetchSimulation = async () => {
      setIsLoading(true); setError(null); setChartData([]); setIsSimulating(true); 
      try {
        const safePayload = { 
          ...params, 
          pensions: params.pensions.map(p => ({ ...p, end_year: p.end_year === '' ? null : p.end_year, end_month: p.end_month === '' ? null : p.end_month })) 
        };
        const response = await fetch(`http://${window.location.hostname}:8000/simulate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(safePayload) });
        
        if (!response.ok) throw new Error('Simulation failed to calculate');
        const json = await response.json();
        setChartData(json.data);
      } catch (err) { setError(err.message); } 
      finally { setIsLoading(false); setIsSimulating(false); }
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
      if (!params || !chartData || chartData.length === 0) return [];
      const stats = [];
      
      activeModels.forEach(model => {
        let annualizedVol = 0;
        const validReturns = chartData
          .map(row => parseFloat(row[`${model}_return`]))
          .filter(r => typeof r === 'number' && !isNaN(r));

        if (validReturns.length > 0) {
          const mean = validReturns.reduce((sum, val) => sum + val, 0) / validReturns.length;
          const variance = validReturns.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / validReturns.length;
          annualizedVol = Math.sqrt(variance) * Math.sqrt(12);
        }

        params.tax_residencies.forEach(tax => {
          const dataKey = `${model}_${tax}_value`;
          let finalValue = 0; 
          let depletionMonth = null; 
          let isBridgedByPension = false; 
          let destitutionMonth = null; 
          
          const lastMonthData = chartData[chartData.length - 1];
          
          if (lastMonthData && lastMonthData[dataKey] > 0) { 
            finalValue = lastMonthData[dataKey]; 
          } 
          
          let depletionIndex = -1;
          for (let i = 0; i < chartData.length; i++) { 

            if (chartData[i][dataKey] <= 0 && depletionIndex === -1) { 
              depletionMonth = chartData[i].month; 
              depletionIndex = i;
            } 
          
            const nominalSpend = chartData[i][`${model}_${tax}_spend`] !== undefined ? chartData[i][`${model}_${tax}_spend`] : chartData[i][`${model}_spend`];
            if (nominalSpend !== undefined && nominalSpend > 0) {
              const realSpend = nominalSpend / Math.pow(1 + params.inflation_percentage, i / 12);
              if (realSpend < params.destitution_threshold && !destitutionMonth) {
                destitutionMonth = chartData[i].month;
              }
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
          
          stats.push({ 
            id: dataKey, 
            model, 
            tax, 
            modelName: dynamicModels.displayNames[model] || model, 
            taxName: tax.replace(/_/g, ' '), 
            finalValue, 
            depletionMonth, 
            isBridgedByPension, 
            destitutionMonth, 
            annualizedVol 
          });
        });
      });
      
      return stats.sort((a, b) => {
        if (a.finalValue > 0 && b.finalValue > 0) return b.finalValue - a.finalValue;
        if (a.finalValue > 0) return -1; if (b.finalValue > 0) return 1;
        return (b.depletionMonth || 0) - (a.depletionMonth || 0);
      });
    }, [chartData, activeModels, params?.tax_residencies, dynamicModels, params?.inflation_percentage, params?.destitution_threshold]);
    
    const toggleLineVisibility = (dataKey) => { setHiddenLines(prev => prev.includes(dataKey) ? prev.filter(k => k !== dataKey) : [...prev, dataKey]); };
    
    const handleChange = (e) => { 
      const { name, value, type, checked } = e.target; 
      
      setParams(prev => {
        let nextState = { ...prev, [name]: type === 'checkbox' ? checked : (type === 'number' || type === 'range' ? parseFloat(value) || 0 : value) };
        
        if (type === 'checkbox' && checked) {
          if (name === 'enable_low_season_spend') { nextState.use_guyton_klinger = false; nextState.use_proportional_attenuator = false; }
          if (name === 'use_guyton_klinger') { nextState.enable_low_season_spend = false; nextState.use_proportional_attenuator = false; }
          if (name === 'use_proportional_attenuator') { nextState.enable_low_season_spend = false; nextState.use_guyton_klinger = false; }
        
          if (name === 'use_baseline_volatility') { nextState.use_high_water_mark = false; }
          if (name === 'use_high_water_mark') { nextState.use_baseline_volatility = false; }
        }
        return nextState;
      }); 
    };

    const handleEngineChange = (e) => {
      const engine = e.target.value;
      const defaultVol = engine === 'heston' ? 0.19 : 0.19;
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
    
    const addBufferTargetEvent = () => { setParams(prev => ({ ...prev, buffer_target_events: [...(prev.buffer_target_events || []), { target_months: 12, year: params.simulation_start_year + 5, month: 1 }] })); };
    const updateBufferTargetEvent = (index, field, value) => { setParams(prev => { const newArr = [...prev.buffer_target_events]; newArr[index][field] = parseInt(value) || 0; return { ...prev, buffer_target_events: newArr }; }); };
    const removeBufferTargetEvent = (index) => { setParams(prev => ({ ...prev, buffer_target_events: prev.buffer_target_events.filter((_, i) => i !== index) })); };

    const inputGroupStyle = { marginBottom: '16px' };
    const labelStyle = { display: 'block', fontWeight: 'bold', marginBottom: '4px', fontSize: '14px' };
    const inputStyle = { width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ccc', boxSizing: 'border-box' };
    const currencyFormatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });

    if (!params) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', backgroundColor: '#f3f4f6', color: '#475569', fontSize: '18px', fontWeight: 'bold' }}>
                Loading Engine Configuration...
            </div>
        );
    }

    return (
      <div style={{ backgroundColor: '#f3f4f6', padding: '20px', fontFamily: 'system-ui, sans-serif', width: '100vw', height: '100vh', boxSizing: 'border-box', overflowX: 'hidden', color: '#111827', display: 'flex', flexDirection: 'column' }}>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h1 style={{ fontSize: '24px', margin: 0, fontWeight: 'bold', color: '#1e293b' }}>Portfolio Estimator</h1>
            {isSimulating && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#0369a1', backgroundColor: '#e0f2fe', padding: '8px 16px', borderRadius: '20px', fontWeight: 'bold', border: '1px solid #bae6fd', marginLeft: '16px' }}>
                ⏳ Simulating Timelines...
              </div>
            )}
          </div>
        </div>
        
        <div style={{ display: 'flex', gap: '24px', flex: 1, minHeight: 0 }}>
          
          {/* ========================================= */}
          {/* PANEL 1: THE FORWARD INPUTS (LEFT SIDE)   */}
          {/* ========================================= */}
          <div style={{ width: '400px', minWidth: '400px', backgroundColor: '#fff', borderRadius: '8px', border: '1px solid #cbd5e1', overflowY: 'auto', height: '100%', boxSizing: 'border-box', position: 'relative', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)' }}>
            
            {/* Sticky Header for Left Panel */}
            <div style={{ padding: '16px 20px', backgroundColor: '#f8fafc', borderBottom: '1px solid #cbd5e1', position: 'sticky', top: 0, zIndex: 20 }}>
              <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 'bold', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ backgroundColor: '#2563eb', color: '#fff', width: '24px', height: '24px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px' }}>1</span>
                Simulation Parameters
              </h2>
              <p style={{ margin: '4px 0 0 32px', fontSize: '12px', color: '#64748b' }}>Configuration used by all analytical engine modes.</p>
            </div>

            <div style={{ padding: '20px' }}>
              <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', backgroundColor: '#e0e7ff', padding: '12px', borderRadius: '6px', border: '1px solid #c7d2fe' }}>
                <div style={{ flex: 1 }}><label style={labelStyle}>Start Year</label><input type="number" name="simulation_start_year" value={params.simulation_start_year} onChange={handleChange} style={inputStyle} /></div>
                <div style={{ flex: 1 }}><label style={labelStyle}>Start Month</label><input type="number" name="simulation_start_month" value={params.simulation_start_month} min="1" max="12" onChange={handleChange} style={inputStyle} /></div>
                <div style={{ flex: 1 }}><label style={labelStyle}>End Year</label><input type="number" name="simulation_end_year" value={params.simulation_end_year} onChange={handleChange} style={inputStyle} /></div>
              </div>

              <div style={inputGroupStyle}>
                <label 
                  style={labelStyle}
                  title="The starting size of your portfolio for forward projections.&#10;Note: Find Required Capital function (The Reverse Solver) ignores this value, as this is exactly the number it is trying to calculate."
                >
                  Initial Capital (€) ℹ️
                </label>
                <input type="number" name="initial_investment" value={params.initial_investment} onChange={handleChange} style={inputStyle} />
              </div>
              
              <div style={inputGroupStyle}>
                <label 
                  style={labelStyle}
                  title="What fraction of your starting capital is taxable profit?&#10;For example, 0.40 means 40% of the balance is subject to capital gains tax upon withdrawal. Find Required Capital function (The Reverse Solver) uses this ratio to calculate the tax burden on your target capital."
                >
                  Initial Profit Percentage (Decimal) ℹ️
                </label>
                <input type="number" name="initial_profit_percentage" value={params.initial_profit_percentage} onChange={handleChange} step="0.01" max="1" min="0" style={inputStyle} />
              </div>
              <div style={inputGroupStyle}><label style={labelStyle}>Yearly Spending (Post-Tax) (€)</label><input type="number" name="yearly_spending" value={params.yearly_spending} onChange={handleChange} style={inputStyle} /></div>
              <div style={inputGroupStyle}><label style={labelStyle}>Inflation Rate (Decimal)</label><input type="number" name="inflation_percentage" value={params.inflation_percentage} onChange={handleChange} step="0.01" style={inputStyle} /></div>
              
              <div style={inputGroupStyle}>
                <label style={labelStyle} title="If inflation-adjusted monthly spending falls below this, the timeline is flagged as 'Destitution' even if the portfolio survives.">
                  Destitution Disqualifier Threshold (€/mo Real) ℹ️
                </label>
                <input type="number" name="destitution_threshold" value={params.destitution_threshold} onChange={handleChange} style={inputStyle} />
              </div>

              {/* --- ALGORITHMIC SPENDING CONTROL MASTER CONTAINER --- */}
              <div style={{ ...inputGroupStyle, backgroundColor: '#f8fafc', padding: '16px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                <div style={{ marginBottom: '12px' }}>
                  <h3 style={{ fontSize: '15px', fontWeight: 'bold', color: '#334155', margin: '0 0 4px 0' }}>Algorithmic Spending Rules</h3>
                  <p style={{ fontSize: '12px', color: '#64748b', margin: 0 }}>Dynamically throttle your withdrawals during market downturns. Only one rule can be active at a time. Select a rule to see more info.</p>
                </div>

                {/* Option 1: Low Season Spend */}
                <div style={{ 
                  backgroundColor: params.enable_low_season_spend ? '#fef3c7' : '#fff', 
                  padding: '12px', 
                  borderRadius: '6px', 
                  border: params.enable_low_season_spend ? '1px solid #fde68a' : '1px solid #e2e8f0', 
                  marginBottom: '8px', 
                  transition: 'all 0.2s' 
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: params.enable_low_season_spend ? '8px' : '0' }}>
                    <input type="checkbox" id="enable_low_season_spend" name="enable_low_season_spend" checked={params.enable_low_season_spend || false} onChange={handleChange} style={{ margin: 0, width: '16px', height: '16px', cursor: 'pointer' }} />
                    <label htmlFor="enable_low_season_spend" style={{ fontSize: '14px', fontWeight: 'bold', color: params.enable_low_season_spend ? '#92400e' : '#475569', cursor: 'pointer', userSelect: 'none' }}>Low Season Austerity</label>
                  </div>
                  {params.enable_low_season_spend && (
                    <div style={{ paddingLeft: '24px' }}>
                      <p style={{ fontSize: '12px', color: '#92400e', margin: '0 0 12px 0' }}>Reduces your spending by a fixed percentage when the market is performing poorly to preserve capital.</p>
                      <div style={{ display: 'flex', gap: '10px', borderTop: '1px solid #fde68a', paddingTop: '12px', alignItems: 'flex-end' }}>
                        <div style={{ flex: 1 }}>
                          <label style={labelStyle}>Belt-Tightening Cut (Decimal)</label>
                          <input type="number" name="low_season_cut_percentage" value={params.low_season_cut_percentage} onChange={handleChange} step="0.01" max="1" min="0" style={inputStyle} />
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Option 2: Guyton-Klinger */}
                <div style={{ 
                  backgroundColor: params.use_guyton_klinger ? '#fef3c7' : '#fff', 
                  padding: '12px', 
                  borderRadius: '6px', 
                  border: params.use_guyton_klinger ? '1px solid #fde68a' : '1px solid #e2e8f0', 
                  marginBottom: '8px', 
                  transition: 'all 0.2s' 
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: params.use_guyton_klinger ? '8px' : '0' }}>
                    <input type="checkbox" id="use_guyton_klinger" name="use_guyton_klinger" checked={params.use_guyton_klinger || false} onChange={handleChange} style={{ margin: 0, width: '16px', height: '16px', cursor: 'pointer' }} />
                    <label htmlFor="use_guyton_klinger" style={{ fontSize: '14px', fontWeight: 'bold', color: params.use_guyton_klinger ? '#92400e' : '#475569', cursor: 'pointer', userSelect: 'none' }}>Guyton-Klinger Guardrails</label>
                  </div>
                  
                  {params.use_guyton_klinger && (
                    <div style={{ paddingLeft: '24px' }}>
                      <p style={{ fontSize: '12px', color: '#92400e', margin: '0 0 12px 0', lineHeight: '1.4' }}>
                        Adjusts your spending structurally based on portfolio health. If your current withdrawal rate exceeds your initial rate by the <strong>Upper Threshold</strong>, it triggers a spending cut. If it drops below the initial rate by the <strong>Lower Threshold</strong>, it triggers a raise.
                      </p>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', borderTop: '1px solid #fde68a', paddingTop: '12px' }}>
                        <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end' }}>
                          <div style={{ flex: 1 }}>
                            <label style={labelStyle}>Upper Threshold (Decimal)</label>
                            <input type="number" name="gk_upper_threshold" value={params.gk_upper_threshold} onChange={handleChange} step="0.01" style={inputStyle} />
                          </div>
                          <div style={{ flex: 1 }}>
                            <label style={labelStyle}>Spending Cut Rate (Decimal)</label>
                            <input type="number" name="gk_cut_rate" value={params.gk_cut_rate} onChange={handleChange} step="0.01" style={inputStyle} />
                          </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px', marginBottom: params.gk_allow_raises ? '4px' : '0' }}>
                          <input type="checkbox" id="gk_allow_raises" name="gk_allow_raises" checked={params.gk_allow_raises || false} onChange={handleChange} style={{ margin: 0, width: '16px', height: '16px', cursor: 'pointer' }} />
                          <label 
                            htmlFor="gk_allow_raises" 
                            style={{ fontSize: '13px', fontWeight: 'bold', color: '#92400e', cursor: 'pointer', userSelect: 'none' }}
                            title="Allows your spending to increase when the portfolio performs exceptionally well, keeping your withdrawal rate from dropping unnecessarily low."
                          >
                            Enable Prosperity Rule (Raises) ℹ️
                          </label>
                        </div>

                        {params.gk_allow_raises && (
                          <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end' }}>
                            <div style={{ flex: 1 }}>
                              <label style={labelStyle}>Lower Threshold (Decimal)</label>
                              <input type="number" name="gk_lower_threshold" value={params.gk_lower_threshold} onChange={handleChange} step="0.01" style={inputStyle} />
                            </div>
                            <div style={{ flex: 1 }}>
                              <label style={labelStyle}>Spending Raise Rate (Decimal)</label>
                              <input type="number" name="gk_raise_rate" value={params.gk_raise_rate} onChange={handleChange} step="0.01" style={inputStyle} />
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>

               {/* Option 3: Proportional Attenuator */}
                <div style={{ 
                  backgroundColor: params.use_proportional_attenuator ? '#fef3c7' : '#fff', 
                  padding: '12px', 
                  borderRadius: '6px', 
                  border: params.use_proportional_attenuator ? '1px solid #fde68a' : '1px solid #e2e8f0', 
                  transition: 'all 0.2s' 
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: params.use_proportional_attenuator ? '8px' : '0' }}>
                    <input type="checkbox" id="use_proportional_attenuator" name="use_proportional_attenuator" checked={params.use_proportional_attenuator || false} onChange={handleChange} style={{ margin: 0, width: '16px', height: '16px', cursor: 'pointer' }} />
                    <label htmlFor="use_proportional_attenuator" style={{ fontSize: '14px', fontWeight: 'bold', color: params.use_proportional_attenuator ? '#92400e' : '#475569', cursor: 'pointer', userSelect: 'none' }}>Proportional Attenuator (Elastic Dimmer)</label>
                  </div>
                  
                  {params.use_proportional_attenuator && (
                    <div style={{ paddingLeft: '24px' }}>
                      <p style={{ fontSize: '12px', color: '#92400e', margin: '0 0 12px 0', lineHeight: '1.4' }}>
                        Smoothly dims your spending when the market falls below its 5-year average, recovering instantly when the market bounces back. The <strong>Maximum Dimming Floor</strong> sets the hard limit on this reduction.
                      </p>
                      
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', borderTop: '1px solid #fde68a', paddingTop: '12px' }}>
                        
                        <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end' }}>
                          <div style={{ flex: 1 }}>
                            <label style={labelStyle}>Maximum Dimming Floor (Decimal)</label>
                            <input type="number" name="attenuator_max_cut" value={params.attenuator_max_cut || 0.50} onChange={handleChange} step="0.01" min="0" max="1" style={inputStyle} />
                          </div>
                          <div style={{ flex: 1 }}></div> {/* Empty flex unit to keep input width consistent */}
                        </div>

                        {/* --- NEW WR OVERRIDE CIRCUIT BREAKER --- */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px', marginBottom: params.use_attenuator_wr_override ? '4px' : '0' }}>
                          <input type="checkbox" id="use_attenuator_wr_override" name="use_attenuator_wr_override" checked={params.use_attenuator_wr_override || false} onChange={handleChange} style={{ margin: 0, width: '16px', height: '16px', cursor: 'pointer' }} />
                          <label 
                            htmlFor="use_attenuator_wr_override" 
                            style={{ fontSize: '13px', fontWeight: 'bold', color: '#92400e', cursor: 'pointer', userSelect: 'none' }}
                            title="Overrides market-based cuts if your absolute wealth is sufficient. Prevents unnecessary austerity in massive portfolios."
                          >
                            Enable Adequacy Circuit Breaker ℹ️
                          </label>
                        </div>

                        {params.use_attenuator_wr_override && (
                          <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end' }}>
                            <div style={{ flex: 1 }}>
                              <label style={labelStyle}>Max Safe Withdrawal Rate (Decimal)</label>
                              <input type="number" name="attenuator_wr_override_threshold" value={params.attenuator_wr_override_threshold || 0.04} onChange={handleChange} step="0.001" style={inputStyle} />
                            </div>
                            <div style={{ flex: 1 }}>
                               <p style={{ fontSize: '11px', color: '#92400e', margin: 0, paddingBottom: '8px' }}>
                                 E.g., 0.04 means cuts are ignored if you are pulling less than 4% of total assets.
                               </p>
                            </div>
                          </div>
                        )}

                      </div>
                    </div>
                  )}
                </div>

              </div>

              {/* --- CASH BUFFER MASTER CONTAINER --- */}
              <div style={{ ...inputGroupStyle, backgroundColor: '#f8fafc', padding: '16px 16px 14px 16px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                <div style={{ marginBottom: '12px' }}>
                  <h3 style={{ fontSize: '15px', fontWeight: 'bold', color: '#334155', margin: '0 0 4px 0' }}>Cash Buffer Strategy</h3>
                  <p style={{ fontSize: '12px', color: '#64748b', margin: 0 }}>Maintain a dedicated cash reserve to fund living expenses during market downturns, preventing the forced sale of equities at depressed prices.</p>
                </div>

                <div style={{
                    backgroundColor: params.use_cash_buffer ? '#fef3c7' : '#fff',
                    padding: '12px',
                    borderRadius: '6px',
                    border: params.use_cash_buffer ? '1px solid #fde68a' : '1px solid #e2e8f0',
                    transition: 'all 0.2s'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: params.use_cash_buffer ? '12px' : '0' }}>
                    <input type="checkbox" id="use_cash_buffer" name="use_cash_buffer" checked={params.use_cash_buffer || false} onChange={handleChange} style={{ margin: 0, width: '16px', height: '16px', cursor: 'pointer' }} />
                    <label htmlFor="use_cash_buffer" style={{ fontSize: '14px', fontWeight: 'bold', color: params.use_cash_buffer ? '#92400e' : '#475569', cursor: 'pointer', userSelect: 'none' }}>Enable Cash Buffer Controls</label>
                  </div>

                  {params.use_cash_buffer && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', borderTop: '1px solid #fde68a', paddingTop: '12px' }}>
                      
                      {/* INITIAL BUFFER ONLY */}
                      <div>
                        <label style={labelStyle}>Initial Buffer Size (€)</label>
                        <input type="number" name="buffer_current_size" value={params.buffer_current_size} onChange={handleChange} style={inputStyle} />
                      </div>
                      
                      {/* INSTRUCTIONAL BLOCK */}
                      <div style={{ fontSize: '13px', color: '#92400e', backgroundColor: '#fef3c7', padding: '10px 12px', borderRadius: '6px', marginBottom: '8px', borderLeft: '4px solid #fbbf24', lineHeight: '1.5' }}>
                        <p style={{ margin: 0 }}><strong>Strategy Stacking:</strong> You can run multiple protocols simultaneously. A sustainable system requires a balance of inflow (harvesting) and outflow (spending). It is highly recommended to select at least one Inflow rule and one Outflow rule.</p>
                      </div>

                      {/* GLOBAL MODIFIER: Hysteresis */}
                      <div style={{ borderTop: '1px solid #fcd34d', paddingTop: '12px', paddingBottom: '4px', marginTop: '4px' }}>
                        <div style={{ fontSize: '14px', fontWeight: 'bold', color: '#92400e', marginBottom: '8px' }}>Global Structural Protectors (Hysteresis)</div>
                        <p style={{ fontSize: '12px', color: '#92400e', margin: '0 0 12px 0', lineHeight: '1.4' }}>
                          These act as ultimate circuit breakers. If equities drop below the <strong>Critical Mass Floor</strong> (e.g., 0.20 for 20% of original value), the buffer stops refilling entirely to prevent death spirals. Equities must recover past the <strong>Replenish Threshold</strong> before refilling resumes.
                        </p>
                        <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end' }}>
                          <div style={{ flex: 1 }}><label style={labelStyle}>Critical Mass Floor (Decimal)</label><input type="number" name="equity_critical_mass_floor" value={params.equity_critical_mass_floor} onChange={handleChange} step="0.01" min="0" max="1" style={inputStyle} /></div>
                          <div style={{ flex: 1 }}><label style={labelStyle}>Replenish Threshold (Decimal)</label><input type="number" name="equity_replenish_threshold" value={params.equity_replenish_threshold} onChange={handleChange} step="0.01" min="0" max="1" style={inputStyle} /></div>
                        </div>
                      </div>

                      {/* PHASE 1 OVERLAY: GLIDEPATH */}
                      <div style={{ borderTop: '2px solid #fcd34d', paddingTop: '16px', paddingBottom: '4px', marginTop: '16px' }}>
                        <div style={{ fontSize: '15px', fontWeight: 'bold', color: '#b45309', marginBottom: '12px' }}>Phase 1: Initial Sequence Risk Mitigation</div>
                        
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: params.use_equity_glidepath ? '8px' : '0' }}>
                          <input type="checkbox" id="use_equity_glidepath" name="use_equity_glidepath" checked={params.use_equity_glidepath} onChange={handleChange} style={{ margin: 0, width: '16px', height: '16px', cursor: 'pointer' }} />
                          <label htmlFor="use_equity_glidepath" style={{ fontSize: '14px', fontWeight: 'bold', color: '#b45309', cursor: 'pointer', userSelect: 'none' }}>Enable Bond Tent / Equity Glidepath</label>
                        </div>
                        
                        {params.use_equity_glidepath && (
                          <div style={{ paddingLeft: '24px' }}>
                            <p style={{ fontSize: '12px', color: '#92400e', marginTop: 0, marginBottom: '12px', lineHeight: '1.4' }}>
                              Activates at the very beginning of your timeline. Forces 100% of your early spending to come exclusively from cash, protecting your equities from initial market crashes. <strong>Note:</strong> If your Initial Buffer Size cannot fund the entire duration, Phase 1 will terminate early as soon as the cash runs out, handing over to Phase 2.
                            </p>
                            <label style={labelStyle}>Glidepath Duration (Months)</label>
                            <input type="number" name="glidepath_months" value={params.glidepath_months || 60} onChange={handleChange} min="12" max="240" style={inputStyle} />
                          </div>
                        )}
                      </div>

                      {/* PHASE 2: STEADY-STATE ROUTING */}
                      <div style={{ borderTop: '2px solid #fcd34d', paddingTop: '16px', marginTop: '16px' }}>
                        <div style={{ fontSize: '15px', fontWeight: 'bold', color: '#b45309', marginBottom: '16px' }}>Phase 2: Steady-State Strategy</div>

                        {/* MOVED TARGET BUFFER */}
                        <div style={{ marginBottom: '20px', padding: '0 4px' }}>
                          <label style={labelStyle}>Steady-State Target Buffer (Months)</label>
                          <p style={{ fontSize: '12px', color: '#92400e', margin: '0 0 8px 0', lineHeight: '1.4' }}>The ideal size of your cash reserve during normal operations. The inflow rules below will attempt to fill the buffer up to this level, and outflow rules will drain it down.</p>
                          <input type="number" name="buffer_target_months" value={params.buffer_target_months} onChange={handleChange} style={inputStyle} />
                        </div>

                        {/* --- INFLOW RULES --- */}
                        <div style={{ marginBottom: '16px', backgroundColor: '#fffbeb', padding: '12px', borderRadius: '6px', border: '1px solid #fde68a' }}>
                          <div style={{ fontSize: '14px', fontWeight: 'bold', color: '#b45309', marginBottom: '12px', borderBottom: '1px solid #fcd34d', paddingBottom: '6px' }}>
                            📥 Inflow Rules (Refilling Cash)
                          </div>
                          
                          <div style={{ marginBottom: '12px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: params.use_baseline_volatility ? '8px' : '0' }}>
                              <input type="checkbox" id="use_baseline_volatility" name="use_baseline_volatility" checked={params.use_baseline_volatility || false} onChange={handleChange} style={{ margin: 0, width: '16px', height: '16px', cursor: 'pointer' }} />
                              <label htmlFor="use_baseline_volatility" style={{ fontSize: '14px', fontWeight: 'bold', color: '#b45309', cursor: 'pointer', userSelect: 'none' }}>Baseline Volatility Thresholds</label>
                            </div>
                            {params.use_baseline_volatility && (
                              <div style={{ paddingLeft: '24px' }}>
                                <p style={{ fontSize: '12px', color: '#92400e', marginTop: 0, marginBottom: '12px', lineHeight: '1.4' }}>
                                  • <strong>Depletion Threshold:</strong> Use cash if market return drops below this decimal (e.g., 0.0 for negative returns).<br/>
                                  • <strong>Replenish Threshold:</strong> Sell equities to refill cash if market return exceeds this decimal.<br/>
                                  • <strong>Refill Throttle:</strong> Max months of expenses transferred per refill to mitigate tax hits.
                                </p>
                                <div style={{ display: 'flex', gap: '10px', marginBottom: '8px', alignItems: 'flex-end' }}>
                                  <div style={{ flex: 1 }}><label style={labelStyle}>Depletion Threshold (Dec)</label><input type="number" name="buffer_depletion_threshold" value={params.buffer_depletion_threshold} onChange={handleChange} step="0.01" style={inputStyle} /></div>
                                  <div style={{ flex: 1 }}><label style={labelStyle}>Replenish Threshold (Dec)</label><input type="number" name="buffer_replenishment_threshold" value={params.buffer_replenishment_threshold} onChange={handleChange} step="0.01" style={inputStyle} /></div>
                                </div>
                                <div>
                                  <label style={labelStyle}>Refill Throttle (Max Months/Transfer)</label>
                                  <input type="number" name="buffer_refill_throttle_months" value={params.buffer_refill_throttle_months} onChange={handleChange} style={inputStyle} min="1" max="12" />
                                </div>
                              </div>
                            )}
                          </div>

                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <input type="checkbox" id="use_high_water_mark" name="use_high_water_mark" checked={params.use_high_water_mark} onChange={handleChange} style={{ margin: 0, width: '16px', height: '16px', cursor: 'pointer' }} />
                              <label htmlFor="use_high_water_mark" style={{ fontSize: '14px', fontWeight: 'bold', color: '#b45309', cursor: 'pointer', userSelect: 'none' }}>High-Water Mark</label>
                            </div>
                            {params.use_high_water_mark && (
                              <div style={{ paddingLeft: '24px', paddingTop: '8px' }}>
                                 <p style={{ fontSize: '12px', color: '#92400e', margin: 0, lineHeight: '1.4' }}>Tracks the all-time high of the portfolio. Equities are only sold to refill the buffer if the current portfolio value is within a strict distance of its historical peak.</p>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* --- OUTFLOW RULES --- */}
                        <div style={{ marginBottom: '16px', backgroundColor: '#fffbeb', padding: '12px', borderRadius: '6px', border: '1px solid #fde68a' }}>
                          <div style={{ fontSize: '14px', fontWeight: 'bold', color: '#b45309', marginBottom: '12px', borderBottom: '1px solid #fcd34d', paddingBottom: '6px' }}>
                            📤 Outflow Rules (Draining Cash)
                          </div>
                          
                          <div style={{ marginBottom: '12px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: params.use_trend_guardrail ? '8px' : '0' }}>
                              <input type="checkbox" id="use_trend_guardrail" name="use_trend_guardrail" checked={params.use_trend_guardrail} onChange={handleChange} style={{ margin: 0, width: '16px', height: '16px', cursor: 'pointer' }} />
                              <label htmlFor="use_trend_guardrail" style={{ fontSize: '14px', fontWeight: 'bold', color: '#b45309', cursor: 'pointer', userSelect: 'none' }}>SMA Trend Guardrail (Circuit Breaker)</label>
                            </div>
                            {params.use_trend_guardrail && (
                              <div style={{ paddingLeft: '24px' }}>
                                <p style={{ fontSize: '12px', color: '#92400e', marginTop: 0, marginBottom: '12px', lineHeight: '1.4' }}>Monitors a fast moving average. If the market drops below this SMA, it intercepts withdrawals and drains cash to protect equities. The <strong>Fast SMA Window</strong> defines the number of months to average (e.g., 10 or 12).</p>
                                <div><label style={labelStyle}>Fast SMA Window (Months)</label><input type="number" name="trend_sma_months" value={params.trend_sma_months || 12} onChange={handleChange} min="1" max="120" style={inputStyle} /></div>
                              </div>
                            )}
                          </div>

                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <input type="checkbox" id="use_proportional_withdrawal" name="use_proportional_withdrawal" checked={params.use_proportional_withdrawal || false} onChange={handleChange} style={{ margin: 0, width: '16px', height: '16px', cursor: 'pointer' }} />
                              <label htmlFor="use_proportional_withdrawal" style={{ fontSize: '14px', fontWeight: 'bold', color: '#b45309', cursor: 'pointer', userSelect: 'none' }}>Valuation-Based Proportional Withdrawal</label>
                            </div>
                            {params.use_proportional_withdrawal && (
                              <div style={{ paddingLeft: '24px', paddingTop: '8px' }}>
                                 <p style={{ fontSize: '12px', color: '#92400e', margin: 0, lineHeight: '1.4' }}>Splits your monthly withdrawals elastically between equities and cash based on multiple regime indicators (Clear Skies, Correction, Crash) rather than an all-or-nothing binary toggle.</p>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* --- MODIFIERS --- */}
                        <div style={{ backgroundColor: '#fffbeb', padding: '12px', borderRadius: '6px', border: '1px solid #fde68a' }}>
                          <div style={{ fontSize: '14px', fontWeight: 'bold', color: '#b45309', marginBottom: '12px', borderBottom: '1px solid #fcd34d', paddingBottom: '6px' }}>
                            ⚙️ Strategy Modifiers
                          </div>
                          
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: params.use_dynamic_buffer ? '8px' : '0' }}>
                              <input type="checkbox" id="use_dynamic_buffer" name="use_dynamic_buffer" checked={params.use_dynamic_buffer} onChange={handleChange} style={{ margin: 0, width: '16px', height: '16px', cursor: 'pointer' }} />
                              <label htmlFor="use_dynamic_buffer" style={{ fontSize: '14px', fontWeight: 'bold', color: '#b45309', cursor: 'pointer', userSelect: 'none' }}>Dynamic Counter-Cyclical Sizing</label>
                            </div>
                            {params.use_dynamic_buffer && (
                              <div style={{ paddingLeft: '24px' }}>
                                <p style={{ fontSize: '12px', color: '#92400e', marginTop: 0, marginBottom: '12px', lineHeight: '1.4' }}>Continuously expands or shrinks the target size of your cash buffer based on macro valuation trends to naturally buy low and sell high. The <strong>Slow SMA Window</strong> defines the long-term trendline (e.g., 60 months) used to determine if the market is overvalued or undervalued.</p>
                                <div><label style={labelStyle}>Slow SMA Window (Months)</label><input type="number" name="valuation_slow_sma_months" value={params.valuation_slow_sma_months || 60} onChange={handleChange} min="12" max="240" style={inputStyle} /></div>
                              </div>
                            )}
                          </div>
                        </div>

                      </div>
                    </div>               
                  )}
                </div>
              </div>

             {/* --- SECTION DIVIDER: FUTURE TIMELINE --- */}
              <div style={{ marginTop: '32px', marginBottom: '16px', borderBottom: '1px solid #cbd5e1', paddingBottom: '12px' }}>
                <h3 style={{ fontSize: '16px', fontWeight: 'bold', color: '#0f172a', margin: '0 0 4px 0' }}>
                  🗺️ Future Trajectory & Environment
                </h3>
                <p style={{ fontSize: '13px', color: '#64748b', margin: 0, lineHeight: '1.4' }}>
                  Parameterize your future life. Define the macroeconomic baselines and plot specific structural events—like windfalls, relocations, and new pension streams—along your timeline.
                </p>
              </div>

              <div style={{ ...inputGroupStyle, backgroundColor: '#f9fafb', padding: '12px', borderRadius: '6px', border: '1px solid #e5e7eb' }}>
                <label 
                  style={labelStyle} 
                  title="Select tax regimes to run in parallel.&#10;Each regime applies its specific country-level capital gains and pension tax rules, brackets, and exemptions to your portfolio withdrawals."
                >
                  Compare Tax Residencies ℹ️
                </label>
                {dynamicModels.capGainsRegimes.map((id) => (<div key={id} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}><input type="checkbox" id={`tax-${id}`} checked={params.tax_residencies.includes(id)} onChange={() => handleArrayToggle('tax_residencies', id)} style={{ margin: 0, width: '16px', height: '16px', cursor: 'pointer' }} /><label htmlFor={`tax-${id}`} style={{ fontSize: '14px', cursor: 'pointer', userSelect: 'none' }}>{id.replace(/_/g, ' ')}</label></div>))}
              </div>

              <div style={{ ...inputGroupStyle, backgroundColor: '#f9fafb', padding: '12px', borderRadius: '6px', border: '1px solid #e5e7eb' }}>
                <label 
                  style={labelStyle} 
                  title="Select how market returns are simulated:&#10;• Linear: A steady, fixed annual return.&#10;• Stochastic: Random paths using volatility (shows Median, Best 10%, and Worst 10% outcomes).&#10;• Historical: Replays actual market crash and bull run sequences."
                >
                  Compare Growth Models ℹ️
                </label>
                {Object.entries(dynamicModels.uiModels).map(([id, name]) => (<div key={id} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}><input type="checkbox" id={id} checked={params.growth_models.includes(id)} onChange={() => handleArrayToggle('growth_models', id)} style={{ margin: 0, width: '16px', height: '16px', cursor: 'pointer' }} /><label htmlFor={id} style={{ fontSize: '14px', cursor: 'pointer', userSelect: 'none' }}>{name}</label></div>))}
                
                {params.growth_models.includes('linear') && (
                  <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid #d1d5db' }}>
                    <label style={labelStyle}>Linear Return Rate (Decimal, e.g. 0.07)</label>
                    <input type="number" name="linear_rate" value={params.linear_rate} onChange={handleChange} step="0.001" style={inputStyle} />
                  </div>
                )}
              </div>

              {params.growth_models.some(m => m.startsWith('historical')) && (
                <div style={{ padding: '12px', backgroundColor: '#eef2ff', borderRadius: '6px', marginBottom: '16px', border: '1px solid #c7d2fe' }}>
                  <strong style={{ display: 'block', fontSize: '13px', marginBottom: '12px', color: '#3730a3' }}>Historical Stress Tests</strong>
                  <div style={{ marginBottom: '12px' }}>
                    <select style={inputStyle} onChange={(e) => {
                        const [start, end] = e.target.value.split(',').map(Number);
                        if (!isNaN(start) && !isNaN(end)) { setParams(prev => ({...prev, historical_start_year: start, historical_end_year: end})); }
                      }} value={`${params.historical_start_year},${params.historical_end_year}`}>
                      <option value="1950,2025">Full History (1950 - Present)</option>
                      <option value="1968,1982">The Great Stagflation (1968 - 1982)</option>
                      <option value="1999,2010">Dot-Com & GFC Crashes (1999 - 2010)</option>
                      <option value="2009,2021">The Bull Run (2009 - 2021)</option>
                      <option value="1929,1945">Great Depression (1929 - 1945)</option>
                      <option value="custom">Custom Range...</option>
                    </select>
                  </div>
                  <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end' }}>
                    <div style={{ flex: 1 }}><label style={labelStyle}>Start Year</label><input type="number" name="historical_start_year" value={params.historical_start_year} onChange={handleChange} style={inputStyle} /></div>
                    <div style={{ flex: 1 }}><label style={labelStyle}>End Year</label><input type="number" name="historical_end_year" value={params.historical_end_year} onChange={handleChange} style={inputStyle} /></div>
                  </div>
                </div>
              )}

              {params.growth_models.includes('stochastic') && (
                  <div style={{ borderTop: '1px solid #bbf7d0', paddingTop: '12px', marginTop: '12px', marginBottom: '16px' }}>
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
                    <div style={{ display: 'flex', gap: '10px', marginBottom: '12px', alignItems: 'flex-end' }}>
                      <div style={{ flex: 1 }}><label style={labelStyle}>Amount (€)</label><input type="number" value={ev.amount} onChange={(e) => updateCashEvent(index, 'amount', e.target.value)} style={inputStyle} /></div>
                      <div style={{ flex: 1 }}><label style={labelStyle}>Target</label><select value={ev.target} onChange={(e) => updateCashEvent(index, 'target', e.target.value)} style={inputStyle}><option value="investment">Investments</option><option value="buffer">Cash Buffer</option></select></div>
                    </div>
                    <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end' }}>
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
                    <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end' }}>
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
                    <div style={{ display: 'flex', gap: '10px', marginBottom: '12px', alignItems: 'flex-end' }}>
                      <div style={{ flex: 1 }}><label style={labelStyle}>Amount/mo in today's money (€)</label><input type="number" value={pension.amount} onChange={(e) => updatePension(index, 'amount', e.target.value)} style={inputStyle} /></div>
                    </div>
                    <div style={{ marginBottom: '12px' }}>
                      <label style={labelStyle}>Pension Tax Regime</label>
                      <select value={pension.tax_regime} onChange={(e) => updatePension(index, 'tax_regime', e.target.value)} style={inputStyle}>
                        {dynamicModels.pensionRegimes.map((id) => <option key={id} value={id}>{id.replace(/_/g, ' ')}</option>)}
                      </select>
                    </div>
                    <div style={{ display: 'flex', gap: '10px', marginBottom: '12px', alignItems: 'flex-end' }}>
                      <div style={{ flex: 1 }}><label style={labelStyle}>Start Year</label><input type="number" value={pension.start_year} onChange={(e) => updatePension(index, 'start_year', e.target.value)} style={inputStyle} /></div>
                      <div style={{ flex: 1 }}><label style={labelStyle}>Start Month</label><input type="number" value={pension.start_month} onChange={(e) => updatePension(index, 'start_month', e.target.value)} min="1" max="12" style={inputStyle} /></div>
                    </div>
                    <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end' }}>
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
                    <div style={{ ...inputGroupStyle, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
                      <label style={labelStyle}>New Yearly Target in today's money (€)</label>
                      <input type="number" value={ev.amount} onChange={(e) => updateSpendingEvent(index, 'amount', e.target.value)} style={inputStyle} />
                    </div>
                    <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end' }}>
                      <div style={{ flex: 1 }}><label style={labelStyle}>Year</label><input type="number" value={ev.year} onChange={(e) => updateSpendingEvent(index, 'year', e.target.value)} style={inputStyle} /></div>
                      <div style={{ flex: 1 }}><label style={labelStyle}>Month</label><input type="number" value={ev.month} onChange={(e) => updateSpendingEvent(index, 'month', e.target.value)} min="1" max="12" style={inputStyle} /></div>
                    </div>
                  </div>
                ))}
              </div>

              <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: '16px', marginTop: '24px', marginBottom: '24px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <h4 style={{ margin: 0 }}>Buffer Target Changes</h4>
                  <button onClick={addBufferTargetEvent} style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', background: '#ccfbf1', border: 'none', padding: '6px 12px', borderRadius: '4px', color: '#0f766e', fontWeight: 'bold' }}><PlusCircle size={16} /> Add</button>
                </div>
                {(params.buffer_target_events || []).map((ev, index) => (
                  <div key={`bte-${index}`} style={{ backgroundColor: '#f0fdfa', padding: '12px', borderRadius: '6px', border: '1px solid #99f6e4', marginBottom: '10px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', borderBottom: '1px solid #99f6e4', paddingBottom: '4px' }}>
                      <strong style={{ fontSize: '14px', color: '#0f766e' }}>Target Change {index + 1}</strong>
                      <button onClick={() => removeBufferTargetEvent(index)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer' }}><Trash2 size={16} /></button>
                    </div>
                    <div style={{ ...inputGroupStyle, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
                      <label style={labelStyle}>New Target Buffer (Months of Spend)</label>
                      <input type="number" value={ev.target_months} onChange={(e) => updateBufferTargetEvent(index, 'target_months', e.target.value)} style={inputStyle} />
                    </div>
                    <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end' }}>
                      <div style={{ flex: 1 }}><label style={labelStyle}>Year</label><input type="number" value={ev.year} onChange={(e) => updateBufferTargetEvent(index, 'year', e.target.value)} style={inputStyle} /></div>
                      <div style={{ flex: 1 }}><label style={labelStyle}>Month</label><input type="number" value={ev.month} onChange={(e) => updateBufferTargetEvent(index, 'month', e.target.value)} min="1" max="12" style={inputStyle} /></div>
                    </div>
                  </div>
                ))}
              </div>

              {isLoading && ( <p style={{ color: '#0066cc', fontWeight: 'bold' }}>Simulating {params.growth_models.includes('stochastic') ? params.stochastic_iterations : 1} timeline(s)...</p> )}
              {error && <p style={{ color: 'red' }}>Error: {error}</p>}
            </div>
          </div>

          {/* ========================================= */}
          {/* PANEL 2: THE OUTPUTS & SOLVER (RIGHT SIDE)*/}
          {/* ========================================= */}
          <div style={{ flex: 1, height: '100%', overflowY: 'auto', display: 'flex', flexDirection: 'column', minWidth: 0, paddingRight: '10px' }}>
            
            {/* UNIFIED RIGHT PANEL HEADER */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', backgroundColor: '#f8fafc', borderRadius: '8px', border: '1px solid #cbd5e1', marginBottom: '20px', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)', flexShrink: 0 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 'bold', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ backgroundColor: '#059669', color: '#fff', width: '24px', height: '24px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px' }}>2</span>
                  Analytical Engine
                </h2>
                <p style={{ margin: '4px 0 0 32px', fontSize: '12px', color: '#64748b' }}>Select an operational mode to analyze your parameters.</p>
              </div>

              {/* TAB TOGGLE */}
              <div style={{ display: 'flex', backgroundColor: '#e2e8f0', padding: '4px', borderRadius: '8px', border: '1px solid #cbd5e1', gap: '4px' }}>
                <button
                  onClick={() => setAnalysisMode('forward')}
                  style={{ padding: '8px 16px', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: 'bold', cursor: 'pointer', backgroundColor: analysisMode === 'forward' ? '#fff' : 'transparent', color: analysisMode === 'forward' ? '#0f172a' : '#64748b', boxShadow: analysisMode === 'forward' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none', transition: 'all 0.2s' }}
                >
                  📈 Forward Projection
                </button>
                <button
                  onClick={() => setAnalysisMode('reverse')}
                  style={{ padding: '8px 16px', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: 'bold', cursor: 'pointer', backgroundColor: analysisMode === 'reverse' ? '#fff' : 'transparent', color: analysisMode === 'reverse' ? '#0f172a' : '#64748b', boxShadow: analysisMode === 'reverse' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none', transition: 'all 0.2s' }}
                >
                  🎯 Find Required Capital
                </button>
                <button
                  onClick={() => setAnalysisMode('optimizer')}
                  style={{ padding: '8px 16px', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: 'bold', cursor: 'pointer', backgroundColor: analysisMode === 'optimizer' ? '#fff' : 'transparent', color: analysisMode === 'optimizer' ? '#0f172a' : '#64748b', boxShadow: analysisMode === 'optimizer' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none', transition: 'all 0.2s', display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  <Zap size={14} /> Cash and Buffer Size Optimizer
                </button>
              </div>
            </div>

            {/* --- TAB 1: FORWARD PROJECTION --- */}
            {analysisMode === 'forward' && (
              <>
                {/* Legend Box */}
                <div style={{ marginBottom: '20px', width: '100%', boxSizing: 'border-box' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '12px', backgroundColor: '#fff', padding: '12px 20px', borderRadius: '8px', border: '1px solid #cbd5e1', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)' }}>
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                      <strong style={{ color: '#6b7280', textTransform: 'uppercase', fontSize: '10px', width: '130px', flexShrink: 0 }}>Tax Regime (Style)</strong>
                      <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', flex: 1 }}>
                        {dynamicModels.capGainsRegimes.map(tax => (
                          <div key={tax} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <svg width="24" height="10"><line x1="0" y1="5" x2="24" y2="5" stroke="#4b5563" strokeWidth="2" strokeDasharray={dynamicModels.taxStyles[tax]} /></svg>
                            <span>{tax.replace(/_/g, ' ')}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div style={{ height: '1px', backgroundColor: '#e2e8f0', width: '100%' }}></div>
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                      <strong style={{ color: '#6b7280', textTransform: 'uppercase', fontSize: '10px', width: '130px', flexShrink: 0 }}>Growth Model (Color)</strong>
                      <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', flex: 1 }}>
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

                {/* CHART 1: ASSETS */}
                <div style={{ flex: '1 1 auto', minHeight: '300px', marginBottom: '20px', backgroundColor: '#fff', padding: '20px 0 0 0', borderRadius: '8px', border: '1px solid #cbd5e1', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)', position: 'relative', zIndex: 10 }}>
                  <h4 style={{ position: 'absolute', top: 5, left: 20, margin: 0, fontSize: '13px', color: '#6b7280' }}>Total Portfolio Assets (Left) vs. Return Rate (Right)</h4>
                  <ResponsiveContainer width="99%" height="100%">
                    <LineChart data={chartData} margin={{ top: 20, right: 20, left: 10, bottom: 20 }} syncId="portfolioSim">
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="month" tickFormatter={formatYear} />
                      <YAxis yAxisId="left" tickFormatter={(value) => `${(value / 1000).toFixed(0)}k`} width={80} />
                      <YAxis yAxisId="right" orientation="right" tickFormatter={(value) => `${(value * 100).toFixed(0)}%`} width={80} />
                      <Tooltip content={<UnifiedTooltip params={params} />} />
                      
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
                      {(params.buffer_target_events || []).map((ev, i) => { 
                        const evMonthRelative = ((ev.year - params.simulation_start_year) * 12) + ev.month - params.simulation_start_month + 1;
                        const totalSimulationMonths = (params.simulation_end_year - params.simulation_start_year) * 12;
                        return (evMonthRelative > 0 && evMonthRelative <= totalSimulationMonths) ? <ReferenceLine yAxisId="left" key={`ref-buftgt-${i}`} x={evMonthRelative} stroke="#0d9488" isFront={true} label={{ value: `Buffer Tgt: ${ev.target_months}mo`, position: 'insideTopRight', fill: '#0f766e', fontSize: 12 }} /> : null; 
                      })}
                      {activeModels.map(model => params.tax_residencies.map(tax => <Line yAxisId="left" key={`${model}_${tax}`} type="monotone" dataKey={`${model}_${tax}_value`} name={`${dynamicModels.displayNames[model] || model} (${tax.replace(/_/g, ' ')})`} stroke={dynamicModels.displayColors[model] || '#000'} strokeDasharray={dynamicModels.taxStyles[tax]} strokeWidth={2} dot={false} isAnimationActive={false} hide={hiddenLines.includes(`${model}_${tax}_value`)} />))}
                      
                      {activeModels.map(model => {
                        const isModelHidden = params.tax_residencies.every(tax => hiddenLines.includes(`${model}_${tax}_value`));
                        return <Line yAxisId="right" key={`${model}_return`} type="monotone" dataKey={`${model}_return`} name={`${dynamicModels.displayNames[model] || model} Return`} stroke={dynamicModels.displayColors[model] || '#000'} strokeDasharray="2 4" strokeWidth={1} dot={false} isAnimationActive={false} hide={isModelHidden} />;
                      })}
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                {/* CHART 2: FLOWS */}
                <div style={{ flex: '1 1 auto', minHeight: '300px', marginBottom: '20px', backgroundColor: '#fff', padding: '20px 0 0 0', borderRadius: '8px', border: '1px solid #cbd5e1', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)', position: 'relative' }}>
                  <h4 style={{ position: 'absolute', top: 5, left: 20, margin: 0, fontSize: '13px', color: '#6b7280' }}>Monthly Cashflows (Left) vs. Buffer Balance (Right)</h4>
                  <ResponsiveContainer width="99%" height="100%">
                    <LineChart data={chartData} margin={{ top: 20, right: 20, left: 10, bottom: 20 }} syncId="portfolioSim">
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="month" tickFormatter={formatYear} />
                      <YAxis yAxisId="left" tickFormatter={(value) => `${(value / 1000).toFixed(1)}k`} width={80} />
                      <YAxis yAxisId="right" orientation="right" tickFormatter={(value) => `${(value / 1000).toFixed(0)}k`} width={80} />
                      <Tooltip content={<></>} cursor={{ stroke: '#94a3b8', strokeWidth: 1, strokeDasharray: '4 4' }} />
                      
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
                      {(params.buffer_target_events || []).map((ev, i) => { 
                        const evMonthRelative = ((ev.year - params.simulation_start_year) * 12) + ev.month - params.simulation_start_month + 1;
                        const totalSimulationMonths = (params.simulation_end_year - params.simulation_start_year) * 12;
                        return (evMonthRelative > 0 && evMonthRelative <= totalSimulationMonths) ? <ReferenceLine yAxisId="left" key={`ref-buftgt-bot-${i}`} x={evMonthRelative} stroke="#0d9488" isFront={true} /> : null; 
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

                {/* SUMMARY TABLE */}
                <div style={{ flex: '0 0 auto', backgroundColor: '#fff', borderRadius: '8px', border: '1px solid #cbd5e1', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)', overflowY: 'auto', minHeight: '150px', marginBottom: '24px' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '14px' }}>
                    <thead style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #cbd5e1', position: 'sticky', top: 0, zIndex: 1 }}>
                      <tr>
                        <th style={{ padding: '12px 16px', color: '#334155' }}>Visibility</th>
                        <th style={{ padding: '12px 16px', color: '#334155' }}>Growth Model</th>
                        <th style={{ padding: '12px 16px', color: '#334155' }}>Tax Residency</th>
                        <th style={{ padding: '12px 16px', color: '#334155' }}>Outcome</th>
                        <th style={{ padding: '12px 16px', textAlign: 'right', color: '#334155' }}>Volatility (Ann.)</th>
                        <th style={{ padding: '12px 16px', textAlign: 'right', color: '#334155' }}>Final Nominal ({params.simulation_end_year})</th>
                        <th style={{ padding: '12px 16px', textAlign: 'right', color: '#334155' }}>Real Value (Today's €)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {summaryStats.map((stat, i) => {
                        const isHidden = hiddenLines.includes(stat.id);
                        return (
                          <tr key={stat.id} onClick={() => toggleLineVisibility(stat.id)} style={{ borderBottom: '1px solid #e2e8f0', cursor: 'pointer', backgroundColor: i % 2 === 0 ? '#fff' : '#f8fafc', opacity: isHidden ? 0.4 : 1 }}>
                            <td style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '8px' }}>{isHidden ? <EyeOff size={16} color="#94a3b8" /> : <Eye size={16} color={dynamicModels.displayColors[stat.model] || '#000'} />}<span style={{ color: isHidden ? '#94a3b8' : 'inherit' }}>{isHidden ? 'Hidden' : 'Visible'}</span></td>
                            <td style={{ padding: '12px 16px', fontWeight: '500' }}><div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><div style={{ width: '10px', height: '10px', backgroundColor: dynamicModels.displayColors[stat.model] || '#000', borderRadius: '2px' }}></div>{stat.modelName}</div></td>
                            <td style={{ padding: '12px 16px' }}><div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><svg width="20" height="4"><line x1="0" y1="2" x2="20" y2="2" stroke="#4b5563" strokeWidth="2" strokeDasharray={dynamicModels.taxStyles[stat.tax]} /></svg>{stat.taxName}</div></td>
                            <td style={{ padding: '12px 16px' }}>
                              {stat.finalValue > 0 
                                ? (stat.destitutionMonth 
                                  ? <span style={{ color: '#9a3412', backgroundColor: '#ffedd5', padding: '2px 8px', borderRadius: '12px', fontSize: '12px' }}>Destitution {formatMonthYear(stat.destitutionMonth)}</span>
                                  : <span style={{ color: '#166534', backgroundColor: '#dcfce7', padding: '2px 8px', borderRadius: '12px', fontSize: '12px' }}>Sustainable</span>)
                                : stat.isBridgedByPension
                                  ? <span style={{ color: '#9a3412', backgroundColor: '#ffedd5', padding: '2px 8px', borderRadius: '12px', fontSize: '12px' }}>Unsustainable {formatMonthYear((stat.depletionMonth || 1))}</span>
                                  : <span style={{ color: '#991b1b', backgroundColor: '#fee2e2', padding: '2px 8px', borderRadius: '12px', fontSize: '12px' }}>Depleted {formatMonthYear((stat.depletionMonth || 1))}</span>
                              }
                            </td>
                            <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: '500', color: '#64748b' }}>
                              {(stat.annualizedVol * 100).toFixed(1)}%
                            </td>
                            <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: stat.finalValue > 0 ? '600' : '400' }}>
                              {stat.finalValue > 0 ? currencyFormatter.format(stat.finalValue) : '€0'}
                            </td>
                            <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: stat.finalValue > 0 ? '600' : '400', color: '#475569', backgroundColor: '#f1f5f9' }}>
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
              </>
            )}

            {/* --- TAB 2: REVERSE SOLVER --- */}
            {analysisMode === 'reverse' && (
              <div style={{ backgroundColor: '#e0f2fe', padding: '20px', borderRadius: '8px', border: '1px solid #7dd3fc', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <h3 style={{ margin: '0 0 4px 0', color: '#0369a1', fontSize: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        🔄 Find Required Capital: Reverse solver
                    </h3>
                    <p style={{ margin: 0, fontSize: '13px', color: '#0c4a6e', maxWidth: '600px', lineHeight: '1.4' }}>
                      Calculates the <strong>Initial Capital</strong> needed to survive the timeline you configured on the left, while ensuring your real monthly spending never drops below your €{params.destitution_threshold}/mo destitution floor.
                    </p>
                  </div>
                  <button 
                    onClick={handleFindMinimumCapital} 
                    disabled={isTargeting}
                    style={{ backgroundColor: isTargeting ? '#94a3b8' : '#0284c7', color: '#fff', padding: '12px 24px', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: isTargeting ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', boxShadow: '0 4px 6px -1px rgba(2, 132, 199, 0.2)' }}
                  >
                    {isTargeting ? '⚙️ Solving...' : 'Calculate'}
                  </button>
                </div>
                
                {targetResults && (
                  <div style={{ backgroundColor: '#fff', border: '1px solid #bae6fd', borderRadius: '6px', overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px', whiteSpace: 'nowrap' }}>
                      <thead style={{ backgroundColor: '#f0f9ff' }}>
                        <tr>
                          <th colSpan="2" style={{ padding: '8px 12px', borderBottom: '1px solid #bae6fd', color: '#0369a1', fontSize: '12px', textTransform: 'uppercase' }}>Scenario Baseline</th>
                          <th colSpan="3" style={{ padding: '8px 12px', textAlign: 'center', borderBottom: '1px solid #bae6fd', borderLeft: '1px solid #e0f2fe', color: '#0369a1', fontSize: '12px', textTransform: 'uppercase' }}>Required Target Allocation</th>
                          <th colSpan="2" style={{ padding: '8px 12px', textAlign: 'center', borderBottom: '1px solid #bae6fd', borderLeft: '1px solid #e0f2fe', color: '#0369a1', fontSize: '12px', textTransform: 'uppercase' }}>Active System Guardrails</th>
                          <th colSpan="5" style={{ padding: '8px 12px', textAlign: 'center', borderBottom: '1px solid #bae6fd', borderLeft: '1px solid #e0f2fe', color: '#0369a1', fontSize: '12px', textTransform: 'uppercase' }}>Target Budget Delivered (Years)</th>
                        </tr>
                        <tr style={{ borderBottom: '1px solid #bae6fd' }}>
                          <th style={{ padding: '10px 12px' }}>Growth Model</th>
                          <th style={{ padding: '10px 12px' }}>Tax Residency</th>
                          <th style={{ padding: '10px 12px', textAlign: 'right', borderLeft: '1px solid #e0f2fe' }}>In Equities</th>
                          <th style={{ padding: '10px 12px', textAlign: 'right' }}>In Cash Buffer</th>
                          <th style={{ padding: '10px 12px', textAlign: 'right', color: '#0284c7' }}>Total Target Capital</th>
                          <th style={{ padding: '10px 12px', borderLeft: '1px solid #e0f2fe' }}>Cash Buffer Rules</th>
                          <th style={{ padding: '10px 12px' }}>Spending Rules</th>
                          <th style={{ padding: '10px 12px', textAlign: 'center', borderLeft: '1px solid #e0f2fe' }}>100% (No Cuts)</th>
                          <th style={{ padding: '10px 12px', textAlign: 'center' }}>95-99%</th>
                          <th style={{ padding: '10px 12px', textAlign: 'center' }}>85-94%</th>
                          <th style={{ padding: '10px 12px', textAlign: 'center' }}>&lt;85%</th>
                          <th style={{ padding: '10px 12px', textAlign: 'center', color: '#9f1239' }}>Max Cut</th>
                        </tr>
                      </thead>
                      <tbody>
                        {targetResults.map((res, idx) => {
                          const totalOrig = (parseFloat(params.initial_investment) || 0) + (parseFloat(params.buffer_current_size) || 0);
                          const bufRatio = (params.use_cash_buffer && totalOrig > 0) ? ((parseFloat(params.buffer_current_size) || 0) / totalOrig) : 0;
                          
                          const bufferVal = res.required_capital * bufRatio;
                          const equityVal = res.required_capital - bufferVal;

                          return (
                            <tr key={idx} style={{ borderBottom: idx === targetResults.length - 1 ? 'none' : '1px solid #e0f2fe', backgroundColor: idx % 2 === 0 ? '#fff' : '#f8fafc' }}>
                              <td style={{ padding: '12px', fontWeight: '500' }}>{dynamicModels.displayNames[res.model] || res.model}</td>
                              <td style={{ padding: '12px' }}>{res.tax.replace(/_/g, ' ')}</td>
                              <td style={{ padding: '12px', textAlign: 'right', color: '#475569', borderLeft: '1px solid #f0f9ff' }}>
                                {formatEur(equityVal)}
                              </td>
                              <td style={{ padding: '12px', textAlign: 'right', color: '#059669', fontWeight: bufferVal > 0 ? '500' : 'normal' }}>
                                {formatEur(bufferVal)}
                              </td>
                              <td style={{ padding: '12px', textAlign: 'right', fontWeight: 'bold', color: '#0369a1', fontSize: '14px', backgroundColor: '#f0f9ff' }}>
                                {formatEur(res.required_capital)}
                              </td>
                              <td style={{ padding: '12px', color: '#b45309', borderLeft: '1px solid #f0f9ff', fontSize: '12px' }}>
                                {res.buffer_protocol}
                              </td>
                              <td style={{ padding: '12px', color: '#4338ca', fontSize: '12px' }}>
                                {res.spending_protocol}
                              </td>
                              <td style={{ padding: '12px', textAlign: 'center', fontWeight: 'bold', color: '#16a34a', borderLeft: '1px solid #f0f9ff' }}>
                                {res.bins["100%"]}
                              </td>
                              <td style={{ padding: '12px', textAlign: 'center', color: '#84cc16' }}>
                                {res.bins["95-99%"]}
                              </td>
                              <td style={{ padding: '12px', textAlign: 'center', color: '#f59e0b' }}>
                                {res.bins["85-94%"]}
                              </td>
                              <td style={{ padding: '12px', textAlign: 'center', color: '#dc2626' }}>
                                {res.bins["<85%"]}
                              </td>
                              <td style={{ padding: '12px', textAlign: 'center', fontWeight: 'bold', color: '#9f1239' }}>
                                {res.deepest_cut}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

{/* --- TAB 3: OPTIMIZER --- */}
            {analysisMode === 'optimizer' && (
              <div style={{ backgroundColor: '#f8fafc', padding: '20px', borderRadius: '8px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <h3 style={{ margin: '0 0 4px 0', color: '#0f172a', fontSize: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Zap size={18} color="#0284c7" /> Stochastic Parameter Search
                    </h3>
                    <p style={{ margin: 0, fontSize: '13px', color: '#64748b', maxWidth: '600px', lineHeight: '1.4' }}>
                      Finds parameters that maximize lifetime spending while maintaining your target survival rate. Uses randomized search across the parameter space.
                    </p>
                  </div>
                  <button 
                    onClick={handleOptimize}
                    disabled={isOptimizing}
                    style={{ backgroundColor: isOptimizing ? '#94a3b8' : '#0284c7', color: '#fff', padding: '12px 24px', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: isOptimizing ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', boxShadow: '0 4px 6px -1px rgba(2, 132, 199, 0.2)' }}
                  >
                    {isOptimizing ? 'Exploring...' : 'Calculate'}
                  </button>
                </div>

                {/* NEW: Optimizer Configuration Inputs */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px', backgroundColor: '#f1f5f9', padding: '12px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#475569', marginBottom: '4px' }}>Target Success Rate (Dec)</label>
                    <input 
                      type="number" 
                      value={optimizationConfig.target_success_rate} 
                      onChange={(e) => setOptimizationConfig(prev => ({ ...prev, target_success_rate: parseFloat(e.target.value) || 0 }))}
                      step="0.01" min="0" max="1"
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#475569', marginBottom: '4px' }}>Search Iterations</label>
                    <input 
                      type="number" 
                      value={optimizationConfig.search_iterations} 
                      onChange={(e) => setOptimizationConfig(prev => ({ ...prev, search_iterations: parseInt(e.target.value) || 0 }))}
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#475569', marginBottom: '4px' }}>Paths per Evaluation</label>
                    <input 
                      type="number" 
                      value={optimizationConfig.paths_per_evaluation} 
                      onChange={(e) => setOptimizationConfig(prev => ({ ...prev, paths_per_evaluation: parseInt(e.target.value) || 0 }))}
                      style={inputStyle}
                    />
                  </div>
                </div>

               {optimizationResult && Array.isArray(optimizationResult) && (
  <div style={{ marginTop: '24px', display: 'flex', flexDirection: 'column', gap: '32px' }}>
    {optimizationResult.map((result, idx) => {
      const { model, tax, optimal_strategy, history } = result;
      const modelLabel = dynamicModels.uiModels[model] || model; 
      
      return (
        <div key={`${model}-${tax}`} style={{ border: '1px solid #e2e8f0', borderRadius: '12px', padding: '20px', backgroundColor: '#fff' }}>
          
          <div style={{ marginBottom: '16px', paddingBottom: '12px', borderBottom: '2px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h4 style={{ margin: 0, color: '#1e293b', fontSize: '18px' }}>
              Optimized for: <span style={{ color: '#0284c7' }}>{modelLabel}</span> 
              <span style={{ margin: '0 8px', color: '#cbd5e1' }}>|</span> 
              Tax Residency: <span style={{ color: '#0284c7' }}>{tax}</span>
            </h4>
            <button 
              onClick={() => applyOptimizedStrategy(optimal_strategy)}
              style={{ backgroundColor: '#16a34a', color: '#fff', padding: '8px 16px', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}
            >
              Apply this Strategy
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '250px 1fr', gap: '24px' }}>
{/* Strategy Details Column */}
<div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
  
  {/* Standard Parameters */}
  <div style={{ padding: '12px', backgroundColor: '#f8fafc', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
    <div style={{ fontSize: '12px', color: '#64748b', textTransform: 'uppercase' }}>Best Algorithm</div>
    <div style={{ fontWeight: 'bold' }}>{optimal_strategy.parameters.active_strategy}</div>
  </div>
  
  <div style={{ padding: '12px', backgroundColor: '#f8fafc', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
    <div style={{ fontSize: '12px', color: '#64748b', textTransform: 'uppercase' }}>Cash Buffer Target</div>
    <div style={{ fontWeight: 'bold' }}>{optimal_strategy.parameters.buffer_months} months</div>
  </div>

  <div style={{ padding: '12px', backgroundColor: '#f8fafc', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
    <div style={{ fontSize: '12px', color: '#64748b', textTransform: 'uppercase' }}>Yearly Spending</div>
    <div style={{ fontWeight: 'bold' }}>{formatEur(optimal_strategy.parameters.withdrawal_rate * (params?.initial_investment || 0))}</div>
  </div>

  <div style={{ padding: '12px', backgroundColor: '#f8fafc', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
    <div style={{ fontSize: '12px', color: '#64748b', textTransform: 'uppercase' }}>Success Rate</div>
    <div style={{ fontWeight: 'bold', color: optimal_strategy.metrics.success_rate >= optimizationConfig.target_success_rate ? '#16a34a' : '#dc2626' }}>
      {(optimal_strategy.metrics.success_rate * 100).toFixed(1)}%
    </div>
  </div>

  {/* Conditional Strategy Tuning Parameters */}
  {optimal_strategy.parameters.active_strategy === "Proportional Attenuator" && (
    <div style={{ padding: '12px', backgroundColor: '#eef2ff', borderRadius: '6px', border: '1px solid #c7d2fe' }}>
      <div style={{ fontSize: '12px', color: '#4f46e5', textTransform: 'uppercase', marginBottom: '4px', fontWeight: 'bold' }}>Attenuator Rules</div>
      <div style={{ fontSize: '13px' }}>Max Cut: <strong>{(optimal_strategy.parameters.attenuator_max_cut * 100).toFixed(0)}%</strong></div>
    </div>
  )}

  {optimal_strategy.parameters.active_strategy === "Guyton-Klinger" && (
    <div style={{ padding: '12px', backgroundColor: '#eef2ff', borderRadius: '6px', border: '1px solid #c7d2fe' }}>
      <div style={{ fontSize: '12px', color: '#4f46e5', textTransform: 'uppercase', marginBottom: '4px', fontWeight: 'bold' }}>G-K Rules</div>
      <div style={{ fontSize: '13px', display: 'flex', justifyContent: 'space-between' }}>
        <span>Cut: <strong>{(optimal_strategy.parameters.gk_cut_rate * 100).toFixed(1)}%</strong></span>
        <span>Raise: <strong>{(optimal_strategy.parameters.gk_raise_rate * 100).toFixed(1)}%</strong></span>
      </div>
      <div style={{ fontSize: '13px', display: 'flex', justifyContent: 'space-between', marginTop: '4px' }}>
        <span>Ceiling: <strong>{(optimal_strategy.parameters.gk_withdrawal_limit_upper * 100).toFixed(0)}%</strong></span>
        <span>Floor: <strong>{(optimal_strategy.parameters.gk_withdrawal_limit_lower * 100).toFixed(0)}%</strong></span>
      </div>
    </div>
  )}

  {optimal_strategy.parameters.active_strategy === "Ratcheting" && (
    <div style={{ padding: '12px', backgroundColor: '#eef2ff', borderRadius: '6px', border: '1px solid #c7d2fe' }}>
      <div style={{ fontSize: '12px', color: '#4f46e5', textTransform: 'uppercase', marginBottom: '4px', fontWeight: 'bold' }}>Ratcheting Rules</div>
      <div style={{ fontSize: '13px' }}>Raise Rate: <strong>{(optimal_strategy.parameters.ratchet_raise_rate * 100).toFixed(1)}%</strong></div>
    </div>
  )}
</div>

            <div style={{ height: '100%', minHeight: '230px' }}>
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart margin={{ top: 10, right: 10, bottom: 10, left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis 
                    type="number" 
                    dataKey="parameters.withdrawal_rate" 
                    name="Withdrawal" 
                    tickFormatter={(v) => `${(v*100).toFixed(1)}%`} 
                    domain={['auto', 'auto']}
                  />
                  <YAxis 
                    type="number" 
                    dataKey="metrics.success_rate" 
                    name="Success" 
                    tickFormatter={(v) => `${(v*100).toFixed(0)}%`} 
                    domain={[0, 1]}
                  />
                  <ZAxis type="number" dataKey="metrics.median_total_spend" range={[50, 400]} name="Spend" />
                  <Tooltip 
                    cursor={{ strokeDasharray: '3 3' }}
                    formatter={(value, name) => {
                      if (name === 'Withdrawal') return `${(value*100).toFixed(2)}%`;
                      if (name === 'Success') return `${(value*100).toFixed(1)}%`;
                      if (name === 'Spend') return formatEur(value);
                      return value;
                    }}
                  />
                  <Scatter name="Strategies" data={history} fill="#8b5cf6" fillOpacity={0.6} />
                  <ReferenceLine y={optimizationConfig.target_success_rate} stroke="#ef4444" strokeDasharray="3 3" />
                </ScatterChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      );
    })}
  </div>
)}

              </div>
            )}
            
          </div>
        </div>
      </div>
    );
}