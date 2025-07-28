import React, { useEffect, useRef } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import { Chart } from 'react-chartjs-2';
import { SankeyController, Flow } from 'chartjs-chart-sankey';

// Register Chart.js components and Sankey plugin
ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  SankeyController,
  Flow
);

const COLORS = [
  '#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8',
  '#82CA9D', '#FFC658', '#FF7C7C', '#8DD1E1', '#D084D0',
  '#87D068', '#FFA07A', '#98FB98', '#F0E68C', '#DDA0DD',
  '#FFB347', '#20B2AA', '#9370DB', '#32CD32', '#FF6347'
];

const SankeyFlowChart = ({ data, currency = 'AUD', loading = false, onNodeClick = null }) => {
  const chartRef = useRef(null);

  if (loading) {
    return (
      <div className="chart-loading">
        <div>Loading Sankey flow data...</div>
      </div>
    );
  }

  if (!data || !data.links || data.links.length === 0) {
    return (
      <div className="chart-empty">
        <div>No flow data available for the selected period</div>
      </div>
    );
  }

  // Create color mapping for consistent node colors
  const nodeColors = {};
  let colorIndex = 0;
  
  const getColor = (nodeName) => {
    if (!nodeColors[nodeName]) {
      nodeColors[nodeName] = COLORS[colorIndex % COLORS.length];
      colorIndex++;
    }
    return nodeColors[nodeName];
  };

  // Prepare data for Chart.js Sankey
  const sankeyData = {
    datasets: [{
      label: 'Money Flow',
      data: data.links.map(link => ({
        from: link.source,
        to: link.target,
        flow: link.value
      })),
      colorFrom: (context) => {
        const link = context.dataset.data[context.dataIndex];
        return getColor(link.from);
      },
      colorTo: (context) => {
        const link = context.dataset.data[context.dataIndex];
        return getColor(link.to);
      },
      colorMode: 'gradient',
      alpha: 0.6,
      labels: data.nodes.reduce((acc, node) => {
        acc[node.id] = node.name;
        return acc;
      }, {}),
      size: 'min' // Prefer flow overlap for cleaner layout
    }]
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      intersect: false,
      mode: 'point'
    },
    plugins: {
      title: {
        display: true,
        text: `Money Flow Diagram (${currency})`,
        font: {
          size: 16,
          weight: 'bold'
        }
      },
      tooltip: {
        callbacks: {
          title: () => '',
          label: (context) => {
            const item = context.dataset.data[context.dataIndex];
            return [
              `${item.from} → ${item.to}`,
              `${currency} ${item.flow.toLocaleString()}`
            ];
          }
        },
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        titleColor: 'white',
        bodyColor: 'white',
        borderColor: 'rgba(255, 255, 255, 0.2)',
        borderWidth: 1
      },
      legend: {
        display: false // Hide default legend as Sankey creates its own visual legend
      }
    },
    onClick: (event, elements) => {
      if (onNodeClick && elements.length > 0) {
        const element = elements[0];
        const dataIndex = element.dataIndex;
        const link = sankeyData.datasets[0].data[dataIndex];
        onNodeClick(link);
      }
    },
    scales: {
      x: {
        type: 'linear',
        display: false
      },
      y: {
        type: 'linear',
        display: false
      }
    }
  };

  // Calculate summary statistics
  const totalIncome = data.total_income || 0;
  const totalExpenses = data.total_expenses || 0;
  const flowEfficiency = totalIncome > 0 ? ((totalIncome - totalExpenses) / totalIncome * 100) : 0;

  return (
    <div className="sankey-chart-container">
      <div className="chart-header">
        <h3>Money Flow Analysis</h3>
        <div className="chart-summary">
          <div className="flow-stats">
            <div className="stat-item income">
              <span className="label">Income:</span>
              <span className="value">{currency} {totalIncome.toLocaleString()}</span>
            </div>
            <div className="stat-item expenses">
              <span className="label">Expenses:</span>
              <span className="value">{currency} {totalExpenses.toLocaleString()}</span>
            </div>
            <div className="stat-item efficiency">
              <span className="label">Savings Rate:</span>
              <span className={`value ${flowEfficiency >= 0 ? 'positive' : 'negative'}`}>
                {flowEfficiency.toFixed(1)}%
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="sankey-chart-wrapper">
        <Chart
          ref={chartRef}
          type="sankey"
          data={sankeyData}
          options={options}
          height={400}
        />
      </div>

      {/* Node color legend */}
      <div className="sankey-legend">
        <h4>Categories</h4>
        <div className="legend-grid">
          {data.nodes.slice(0, 12).map((node, index) => (
            <div key={node.id} className="legend-item">
              <span 
                className="legend-color" 
                style={{ backgroundColor: getColor(node.name) }}
              ></span>
              <span className="legend-text">{node.name}</span>
            </div>
          ))}
          {data.nodes.length > 12 && (
            <div className="legend-item more">
              <span>+{data.nodes.length - 12} more</span>
            </div>
          )}
        </div>
      </div>

      {/* Flow insights */}
      <div className="flow-insights">
        <h4>Flow Insights</h4>
        <div className="insights-list">
          <div className="insight-item">
            <span className="insight-icon">💰</span>
            <span className="insight-text">
              Money flows from income through {data.nodes.filter(n => n.name !== 'Total Income').length} different categories
            </span>
          </div>
          <div className="insight-item">
            <span className="insight-icon">📊</span>
            <span className="insight-text">
              {data.links.length} total spending flows tracked
            </span>
          </div>
          <div className="insight-item">
            <span className="insight-icon">🎯</span>
            <span className="insight-text">
              {flowEfficiency >= 20 ? 'Great' : flowEfficiency >= 10 ? 'Good' : 'Needs improvement'} savings rate
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SankeyFlowChart; 