import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import dashboardService from '../services/dashboardService';
import BalanceOverTimeChart from '../components/visualisation/BalanceOverTimeChart';
import CategorySpendingChart from '../components/visualisation/CategorySpendingChart';
import IncomeVsExpensesChart from '../components/visualisation/IncomeVsExpensesChart';
import SankeyFlowChart from '../components/visualisation/SankeyFlowChart';
import '../components/visualisation/VisualisationStyles.css';
import './VisualisePage.css';

const VisualisePage = () => {
  const navigate = useNavigate();
  
  // State for time period controls
  const [dateRange, setDateRange] = useState(() => {
    const defaultRange = dashboardService.getDefaultDateRange();
    return {
      startDate: defaultRange.start_date,
      endDate: defaultRange.end_date,
      preset: '3months'
    };
  });
  
  const [currency, setCurrency] = useState('AUD');
  
  // Data state
  const [balanceData, setBalanceData] = useState(null);
  const [categoryData, setCategoryData] = useState(null);
  const [incomeExpensesData, setIncomeExpensesData] = useState(null);
  const [sankeyData, setSankeyData] = useState(null);
  
  // Loading states
  const [loading, setLoading] = useState({
    balance: false,
    category: false,
    incomeExpenses: false,
    sankey: false
  });
  
  const [errors, setErrors] = useState({});

  // Fetch all analytics data
  const fetchAnalyticsData = async () => {
    console.log('📊 Fetching analytics data for period:', dateRange.startDate, 'to', dateRange.endDate);
    
    setLoading({
      balance: true,
      category: true,
      incomeExpenses: true,
      sankey: true
    });
    
    setErrors({});

    try {
      // Fetch all data in parallel
      const [balanceResponse, categoryResponse, incomeExpensesResponse, sankeyResponse] = await Promise.all([
        dashboardService.getBalanceOverTime(currency, dateRange.startDate, dateRange.endDate),
        dashboardService.getCategorySpending(currency, dateRange.startDate, dateRange.endDate),
        dashboardService.getIncomeVsExpenses(currency, dateRange.startDate, dateRange.endDate),
        dashboardService.getSankeyFlow(currency, dateRange.startDate, dateRange.endDate)
      ]);

      console.log('📊 Analytics data fetched successfully');
      setBalanceData(balanceResponse);
      setCategoryData(categoryResponse);
      setIncomeExpensesData(incomeExpensesResponse);
      setSankeyData(sankeyResponse);
      
    } catch (error) {
      console.error('❌ Error fetching analytics data:', error);
      setErrors({
        general: 'Failed to load analytics data. Please try again.'
      });
    } finally {
      setLoading({
        balance: false,
        category: false,
        incomeExpenses: false,
        sankey: false
      });
    }
  };

  // Load data on component mount and when filters change
  useEffect(() => {
    fetchAnalyticsData();
  }, [dateRange.startDate, dateRange.endDate, currency]);

  // Handle date range preset changes
  const handlePresetChange = (preset) => {
    const endDate = new Date();
    const startDate = new Date();
    
    switch (preset) {
      case '1month':
        startDate.setMonth(startDate.getMonth() - 1);
        break;
      case '3months':
        startDate.setMonth(startDate.getMonth() - 3);
        break;
      case '6months':
        startDate.setMonth(startDate.getMonth() - 6);
        break;
      case '1year':
        startDate.setFullYear(startDate.getFullYear() - 1);
        break;
      case 'ytd':
        startDate.setMonth(0, 1); // January 1st of current year
        break;
      default:
        // Custom range, don't change dates
        return;
    }

    setDateRange({
      startDate: startDate.toISOString().split('T')[0],
      endDate: endDate.toISOString().split('T')[0],
      preset
    });
  };

  // Handle custom date range changes
  const handleDateChange = (field, value) => {
    setDateRange(prev => ({
      ...prev,
      [field]: value,
      preset: 'custom'
    }));
  };

  // Chart interaction handlers
  const handleBalanceClick = (date) => {
    console.log('🔍 Balance chart clicked for date:', date);
    // Navigate to transactions for that date
    navigate(`/dashboard?date=${date}`);
  };

  const handleCategoryClick = (categoryData) => {
    console.log('🔍 Category clicked:', categoryData);
    // Navigate to transactions for that category
    navigate(`/categorize?category=${categoryData.id}`);
  };

  const handleMonthClick = (month, monthData) => {
    console.log('🔍 Month clicked:', month, monthData);
    // Navigate to transactions for that month
    const [year, monthNum] = month.split('-');
    navigate(`/dashboard?year=${year}&month=${monthNum}`);
  };

  const handleSankeyClick = (flowData) => {
    console.log('🔍 Sankey flow clicked:', flowData);
    // Could drill down into specific category flows
  };

  return (
    <div className="visualise-page">
      <div className="page-header">
        <h1>Financial Visualizations</h1>
        <p>Interactive charts and insights into your financial data</p>
      </div>

      {/* Time Period Controls */}
      <div className="controls-section">
        <div className="controls-container">
          <div className="preset-controls">
            <label>Time Period:</label>
            <div className="preset-buttons">
              {[
                { value: '1month', label: '1 Month' },
                { value: '3months', label: '3 Months' },
                { value: '6months', label: '6 Months' },
                { value: '1year', label: '1 Year' },
                { value: 'ytd', label: 'Year to Date' }
              ].map(preset => (
                <button
                  key={preset.value}
                  className={`preset-button ${dateRange.preset === preset.value ? 'active' : ''}`}
                  onClick={() => handlePresetChange(preset.value)}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          <div className="custom-range-controls">
            <div className="date-input-group">
              <label>From:</label>
              <input
                type="date"
                value={dateRange.startDate}
                onChange={(e) => handleDateChange('startDate', e.target.value)}
                max={dateRange.endDate}
              />
            </div>
            <div className="date-input-group">
              <label>To:</label>
              <input
                type="date"
                value={dateRange.endDate}
                onChange={(e) => handleDateChange('endDate', e.target.value)}
                min={dateRange.startDate}
                max={new Date().toISOString().split('T')[0]}
              />
            </div>
          </div>

          <div className="currency-control">
            <label>Currency:</label>
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
            >
              <option value="AUD">AUD</option>
              <option value="USD">USD</option>
              <option value="EUR">EUR</option>
              <option value="GBP">GBP</option>
            </select>
          </div>
        </div>
      </div>

      {/* Error Display */}
      {errors.general && (
        <div className="error-banner">
          <p>{errors.general}</p>
          <button onClick={fetchAnalyticsData}>Retry</button>
        </div>
      )}

      {/* Charts Grid */}
      <div className="charts-grid">
        {/* Balance Over Time */}
        <div className="chart-section full-width">
          <BalanceOverTimeChart
            data={balanceData?.balance_over_time}
            currency={currency}
            loading={loading.balance}
            onDateClick={handleBalanceClick}
          />
        </div>

        {/* Income vs Expenses */}
        <div className="chart-section full-width">
          <IncomeVsExpensesChart
            data={incomeExpensesData?.monthly_comparison}
            currency={currency}
            loading={loading.incomeExpenses}
            onMonthClick={handleMonthClick}
          />
        </div>

        {/* Category Spending and Sankey */}
        <div className="chart-section half-width">
          <CategorySpendingChart
            data={categoryData?.category_spending}
            currency={currency}
            loading={loading.category}
            onCategoryClick={handleCategoryClick}
          />
        </div>

        <div className="chart-section half-width">
          <SankeyFlowChart
            data={sankeyData}
            currency={currency}
            loading={loading.sankey}
            onNodeClick={handleSankeyClick}
          />
        </div>
      </div>

      {/* Summary Statistics */}
      {(balanceData || incomeExpensesData) && !loading.balance && !loading.incomeExpenses && (
        <div className="summary-section">
          <h2>Period Summary</h2>
          <div className="summary-grid">
            {balanceData && (
              <div className="summary-card">
                <h3>Account Balance</h3>
                <div className="metric">
                  <span className="label">Final Balance:</span>
                  <span className={`value ${balanceData.final_balance >= 0 ? 'positive' : 'negative'}`}>
                    {currency} {balanceData.final_balance?.toLocaleString()}
                  </span>
                </div>
                <div className="metric">
                  <span className="label">Transactions:</span>
                  <span className="value">{balanceData.total_transactions}</span>
                </div>
              </div>
            )}

            {incomeExpensesData?.totals && (
              <div className="summary-card">
                <h3>Income & Expenses</h3>
                <div className="metric">
                  <span className="label">Total Income:</span>
                  <span className="value positive">{currency} {incomeExpensesData.totals.income?.toLocaleString()}</span>
                </div>
                <div className="metric">
                  <span className="label">Total Expenses:</span>
                  <span className="value negative">{currency} {incomeExpensesData.totals.expenses?.toLocaleString()}</span>
                </div>
                <div className="metric">
                  <span className="label">Savings Rate:</span>
                  <span className={`value ${incomeExpensesData.totals.savings_rate >= 0 ? 'positive' : 'negative'}`}>
                    {incomeExpensesData.totals.savings_rate}%
                  </span>
                </div>
              </div>
            )}

            {categoryData && (
              <div className="summary-card">
                <h3>Category Spending</h3>
                <div className="metric">
                  <span className="label">Total Spending:</span>
                  <span className="value">{currency} {categoryData.total_spending?.toLocaleString()}</span>
                </div>
                <div className="metric">
                  <span className="label">Categories:</span>
                  <span className="value">{categoryData.category_spending?.length || 0}</span>
                </div>
                <div className="metric">
                  <span className="label">Transactions:</span>
                  <span className="value">{categoryData.transaction_count || 0}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default VisualisePage; 