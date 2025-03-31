import React from 'react';
import './SpendingChart.css';

const SpendingChart = ({ data }) => {
  // Format currency amount
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  // Calculate the total amount
  const totalAmount = data.reduce((sum, item) => sum + item.amount, 0);

  // Calculate percentages and generate colors
  const chartData = data.map((item, index) => {
    const percentage = totalAmount > 0 ? (item.amount / totalAmount) * 100 : 0;
    
    // Generate a color based on the index
    const colors = [
      '#4299e1', // blue
      '#48bb78', // green
      '#ed8936', // orange
      '#9f7aea', // purple
      '#f56565', // red
      '#38b2ac', // teal
      '#ecc94b', // yellow
      '#667eea', // indigo
      '#f687b3', // pink
      '#a0aec0', // gray
    ];
    
    const color = colors[index % colors.length];
    
    return {
      ...item,
      percentage,
      color,
    };
  });

  return (
    <div className="spending-chart">
      {data.length === 0 ? (
        <div className="no-data-message">
          <p>No spending data available for this period.</p>
          <p>Connect accounts or make transactions to see your spending breakdown.</p>
        </div>
      ) : (
        <>
          <div className="chart-visualization">
            <div className="pie-chart">
              <svg viewBox="0 0 100 100">
                {/* Create a circle with a hole in the middle */}
                <circle cx="50" cy="50" r="50" fill="#f7fafc" />
                <circle cx="50" cy="50" r="35" fill="white" />
                
                {/* Draw the pie slices */}
                {chartData.length > 0 && (
                  generatePieSlices(chartData)
                )}
              </svg>
            </div>
            <div className="total-amount">
              <div className="amount-label">Total Spending</div>
              <div className="amount-value">{formatCurrency(totalAmount)}</div>
            </div>
          </div>
          
          <div className="chart-legend">
            {chartData.slice(0, 5).map((item, index) => (
              <div key={index} className="legend-item">
                <div className="legend-color" style={{ backgroundColor: item.color }}></div>
                <div className="legend-label">{item.name}</div>
                <div className="legend-percentage">{item.percentage.toFixed(1)}%</div>
                <div className="legend-amount">{formatCurrency(item.amount)}</div>
              </div>
            ))}
            
            {/* Show a summary item for all other categories */}
            {chartData.length > 5 && (
              <div className="legend-item others">
                <div className="legend-color" style={{ backgroundColor: '#a0aec0' }}></div>
                <div className="legend-label">Others</div>
                <div className="legend-percentage">
                  {chartData.slice(5).reduce((sum, item) => sum + item.percentage, 0).toFixed(1)}%
                </div>
                <div className="legend-amount">
                  {formatCurrency(chartData.slice(5).reduce((sum, item) => sum + item.amount, 0))}
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

// Helper function to generate pie slices
const generatePieSlices = (data) => {
  let cumulativePercentage = 0;
  
  return data.map((item, index) => {
    const startAngle = cumulativePercentage * 3.6; // Convert percentage to degrees
    cumulativePercentage += item.percentage;
    const endAngle = cumulativePercentage * 3.6;
    
    // Skip tiny slices
    if (item.percentage < 1) return null;
    
    // Calculate path coordinates
    const startX = 50 + 35 * Math.cos((startAngle - 90) * Math.PI / 180);
    const startY = 50 + 35 * Math.sin((startAngle - 90) * Math.PI / 180);
    const endX = 50 + 35 * Math.cos((endAngle - 90) * Math.PI / 180);
    const endY = 50 + 35 * Math.sin((endAngle - 90) * Math.PI / 180);
    
    const largeArcFlag = item.percentage > 50 ? 1 : 0;
    
    const pathData = [
      `M 50 50`,
      `L ${startX} ${startY}`,
      `A 35 35 0 ${largeArcFlag} 1 ${endX} ${endY}`,
      `Z`
    ].join(' ');
    
    return (
      <path
        key={index}
        d={pathData}
        fill={item.color}
      />
    );
  });
};

export default SpendingChart;