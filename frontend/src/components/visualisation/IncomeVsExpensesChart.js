import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

const IncomeVsExpensesChart = ({ data, currency = 'AUD', loading = false, onMonthClick = null }) => {
  if (loading) {
    return (
      <div className="chart-loading">
        <div>Loading income vs expenses data...</div>
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="chart-empty">
        <div>No income vs expenses data available for the selected period</div>
      </div>
    );
  }

  // Custom tooltip
  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      const monthData = payload[0].payload;
      return (
        <div className="tooltip-container">
          <p className="tooltip-label">{monthData.month_name}</p>
          <div className="tooltip-content">
            <p className="tooltip-income">
              Income: <span style={{ color: '#22c55e' }}>{monthData.formatted_income}</span>
            </p>
            <p className="tooltip-expenses">
              Expenses: <span style={{ color: '#ef4444' }}>{monthData.formatted_expenses}</span>
            </p>
            <p className="tooltip-savings">
              Net Savings: <span style={{ color: monthData.net_savings >= 0 ? '#22c55e' : '#ef4444' }}>
                {monthData.formatted_savings}
              </span>
            </p>
            <p className="tooltip-rate">
              Savings Rate: {monthData.savings_rate}%
            </p>
          </div>
        </div>
      );
    }
    return null;
  };

  // Format X-axis labels
  const formatXAxisLabel = (monthKey) => {
    const [year, month] = monthKey.split('-');
    const date = new Date(parseInt(year), parseInt(month) - 1);
    return date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
  };

  // Custom bar shape for clickable functionality
  const CustomBar = (props) => {
    const { fill, payload, ...otherProps } = props;
    const handleClick = () => {
      if (onMonthClick) {
        onMonthClick(payload.month, payload);
      }
    };

    return (
      <Bar
        {...otherProps}
        fill={fill}
        style={{ cursor: onMonthClick ? 'pointer' : 'default' }}
        onClick={handleClick}
      />
    );
  };

  // Calculate summary statistics
  const totalIncome = data.reduce((sum, item) => sum + parseFloat(item.income), 0);
  const totalExpenses = data.reduce((sum, item) => sum + parseFloat(item.expenses), 0);
  const totalSavings = totalIncome - totalExpenses;
  const averageSavingsRate = totalIncome > 0 ? (totalSavings / totalIncome * 100) : 0;

  return (
    <div className="income-expenses-chart-container">
      <div className="chart-header">
        <h3>Income vs Expenses</h3>
        <div className="chart-summary">
          <div className="summary-item income">
            <span className="label">Total Income:</span>
            <span className="value">{currency} {totalIncome.toLocaleString()}</span>
          </div>
          <div className="summary-item expenses">
            <span className="label">Total Expenses:</span>
            <span className="value">{currency} {totalExpenses.toLocaleString()}</span>
          </div>
          <div className={`summary-item savings ${totalSavings >= 0 ? 'positive' : 'negative'}`}>
            <span className="label">Net Savings:</span>
            <span className="value">{currency} {totalSavings.toLocaleString()}</span>
          </div>
          <div className="summary-item rate">
            <span className="label">Avg Savings Rate:</span>
            <span className="value">{averageSavingsRate.toFixed(1)}%</span>
          </div>
        </div>
      </div>
      
      <ResponsiveContainer width="100%" height={350}>
        <BarChart
          data={data}
          margin={{ top: 20, right: 30, left: 20, bottom: 20 }}
          barCategoryGap="20%"
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis 
            dataKey="month" 
            tickFormatter={formatXAxisLabel}
            stroke="#666"
          />
          <YAxis 
            tickFormatter={(value) => `${currency.charAt(0)}${Math.round(value / 1000)}k`}
            stroke="#666"
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend />
          <Bar 
            dataKey="income" 
            name="Income"
            fill="#22c55e" 
            radius={[2, 2, 0, 0]}
            onClick={onMonthClick ? (data, index) => onMonthClick(data.month, data) : undefined}
            style={{ cursor: onMonthClick ? 'pointer' : 'default' }}
          />
          <Bar 
            dataKey="expenses" 
            name="Expenses"
            fill="#ef4444" 
            radius={[2, 2, 0, 0]}
            onClick={onMonthClick ? (data, index) => onMonthClick(data.month, data) : undefined}
            style={{ cursor: onMonthClick ? 'pointer' : 'default' }}
          />
        </BarChart>
      </ResponsiveContainer>

      {/* Monthly savings rate visualization */}
      <div className="savings-rate-section">
        <h4>Monthly Savings Rate</h4>
        <div className="savings-rate-bars">
          {data.map((item, index) => (
            <div key={index} className="savings-rate-item">
              <div className="month-label">{formatXAxisLabel(item.month)}</div>
              <div className="rate-bar-container">
                <div 
                  className={`rate-bar ${item.savings_rate >= 0 ? 'positive' : 'negative'}`}
                  style={{ 
                    width: `${Math.abs(item.savings_rate)}%`,
                    maxWidth: '100%'
                  }}
                ></div>
              </div>
              <div className="rate-percentage">{item.savings_rate.toFixed(1)}%</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default IncomeVsExpensesChart; 