import React from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const BalanceOverTimeChart = ({ data, currency = 'AUD', loading = false, onDateClick = null }) => {
  if (loading) {
    return (
      <div className="chart-loading">
        <div>Loading balance data...</div>
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="chart-empty">
        <div>No balance data available for the selected period</div>
      </div>
    );
  }

  // Custom tooltip
  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="tooltip-container">
          <p className="tooltip-label">{new Date(label).toLocaleDateString()}</p>
          <p className="tooltip-value">
            Balance: <span style={{ color: payload[0].color }}>{data.formatted_balance}</span>
          </p>
        </div>
      );
    }
    return null;
  };

  // Format date for X-axis
  const formatXAxisDate = (dateStr) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  // Custom dot for clickable points
  const CustomDot = (props) => {
    const { cx, cy, payload } = props;
    if (!onDateClick) return null;
    
    return (
      <circle
        cx={cx}
        cy={cy}
        r={4}
        fill="#8884d8"
        stroke="#fff"
        strokeWidth={2}
        style={{ cursor: 'pointer' }}
        onClick={() => onDateClick(payload.date)}
      />
    );
  };

  // Determine line color based on final balance
  const finalBalance = data[data.length - 1]?.balance || 0;
  const lineColor = finalBalance >= 0 ? '#22c55e' : '#ef4444'; // Green for positive, red for negative

  return (
    <div className="balance-chart-container">
      <div className="chart-header">
        <h3>Balance Over Time</h3>
        <div className="chart-summary">
          <span className={`final-balance ${finalBalance >= 0 ? 'positive' : 'negative'}`}>
            Current: {currency} {finalBalance.toLocaleString()}
          </span>
        </div>
      </div>
      
      <ResponsiveContainer width="100%" height={300}>
        <LineChart
          data={data}
          margin={{ top: 20, right: 30, left: 20, bottom: 20 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis 
            dataKey="date" 
            tickFormatter={formatXAxisDate}
            stroke="#666"
          />
          <YAxis 
            tickFormatter={(value) => `${currency.charAt(0)}${Math.round(value).toLocaleString()}`}
            stroke="#666"
          />
          <Tooltip content={<CustomTooltip />} />
          <Line 
            type="monotone" 
            dataKey="balance" 
            stroke={lineColor}
            strokeWidth={2}
            dot={onDateClick ? <CustomDot /> : false}
            activeDot={{ r: 6, stroke: lineColor, strokeWidth: 2 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

export default BalanceOverTimeChart; 