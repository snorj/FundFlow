import React, { useState } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';

const COLORS = [
  '#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8',
  '#82CA9D', '#FFC658', '#FF7C7C', '#8DD1E1', '#D084D0',
  '#87D068', '#FFA07A', '#98FB98', '#F0E68C', '#DDA0DD'
];

const CategorySpendingChart = ({ data, currency = 'AUD', loading = false, onCategoryClick = null }) => {
  const [activeIndex, setActiveIndex] = useState(null);

  if (loading) {
    return (
      <div className="chart-loading">
        <div>Loading category data...</div>
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="chart-empty">
        <div>No category spending data available for the selected period</div>
      </div>
    );
  }

  // Custom tooltip
  const CustomTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="tooltip-container">
          <p className="tooltip-label">{data.category}</p>
          <p className="tooltip-value">
            Amount: <span style={{ color: payload[0].color }}>{data.formatted_amount}</span>
          </p>
          <p className="tooltip-percentage">
            {data.percentage}% of total spending
          </p>
        </div>
      );
    }
    return null;
  };

  // Custom label function
  const renderLabel = (entry) => {
    if (entry.percentage < 5) return ''; // Don't show labels for small slices
    return `${entry.percentage}%`;
  };

  // Handle pie slice click
  const onPieEnter = (_, index) => {
    setActiveIndex(index);
  };

  const onPieLeave = () => {
    setActiveIndex(null);
  };

  const onPieClick = (data, index) => {
    if (onCategoryClick) {
      onCategoryClick(data);
    }
  };

  // Custom legend content
  const renderLegend = (props) => {
    const { payload } = props;
    return (
      <div className="category-legend">
        {payload.map((entry, index) => (
          <div key={index} className="legend-item">
            <span 
              className="legend-color" 
              style={{ backgroundColor: entry.color }}
            ></span>
            <span className="legend-text">
              {entry.value} ({data[index]?.percentage}%)
            </span>
          </div>
        ))}
      </div>
    );
  };

  // Calculate total for summary
  const totalSpending = data.reduce((sum, item) => sum + parseFloat(item.amount), 0);

  return (
    <div className="category-chart-container">
      <div className="chart-header">
        <h3>Spending by Category</h3>
        <div className="chart-summary">
          <span className="total-spending">
            Total: {currency} {totalSpending.toLocaleString()}
          </span>
        </div>
      </div>
      
      <div className="pie-chart-wrapper">
        <ResponsiveContainer width="100%" height={400}>
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              labelLine={false}
              label={renderLabel}
              outerRadius={120}
              fill="#8884d8"
              dataKey="amount"
              nameKey="category"
              onMouseEnter={onPieEnter}
              onMouseLeave={onPieLeave}
              onClick={onPieClick}
              style={{ cursor: onCategoryClick ? 'pointer' : 'default' }}
            >
              {data.map((entry, index) => (
                <Cell 
                  key={`cell-${index}`} 
                  fill={COLORS[index % COLORS.length]}
                  stroke={activeIndex === index ? '#333' : 'none'}
                  strokeWidth={activeIndex === index ? 2 : 0}
                />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
          </PieChart>
        </ResponsiveContainer>
        
        <div className="category-list">
          {data.slice(0, 8).map((item, index) => (
            <div 
              key={index} 
              className={`category-item ${onCategoryClick ? 'clickable' : ''}`}
              onClick={() => onCategoryClick && onCategoryClick(item)}
            >
              <div className="category-info">
                <span 
                  className="category-color" 
                  style={{ backgroundColor: COLORS[index % COLORS.length] }}
                ></span>
                <span className="category-name">{item.category}</span>
              </div>
              <div className="category-amount">
                <span className="amount">{item.formatted_amount}</span>
                <span className="percentage">{item.percentage}%</span>
              </div>
            </div>
          ))}
          {data.length > 8 && (
            <div className="more-categories">
              +{data.length - 8} more categories
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default CategorySpendingChart; 