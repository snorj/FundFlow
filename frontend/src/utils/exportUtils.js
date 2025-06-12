import { formatCurrency } from './formatting';

/**
 * Export transactions to CSV format
 * @param {Array} transactions - Array of transaction objects
 * @param {Object} searchCriteria - Search criteria used
 * @param {Object} summary - Summary statistics
 * @returns {string} CSV content
 */
export const exportToCSV = (transactions, searchCriteria = {}, summary = {}) => {
  const headers = [
    'Date',
    'Description', 
    'Vendor',
    'Category',
    'Amount',
    'Currency',
    'AUD Amount',
    'Type',
    'Source',
    'Created Date'
  ];

  const rows = transactions.map(transaction => [
    transaction.transaction_date,
    `"${(transaction.description || '').replace(/"/g, '""')}"`,
    `"${transaction.vendor_name || ''}"`,
    `"${transaction.category_name || 'Uncategorized'}"`,
    Math.abs(transaction.signed_original_amount || 0),
    transaction.original_currency || '',
    transaction.signed_aud_amount ? Math.abs(transaction.signed_aud_amount) : '',
    transaction.direction === 'CREDIT' ? 'Income' : 'Expense',
    transaction.source || '',
    new Date(transaction.created_at).toLocaleDateString('en-AU')
  ]);

  // Add summary information as comments
  const summaryLines = [
    `# Transaction Export - ${new Date().toLocaleDateString('en-AU')}`,
    `# Total Transactions: ${summary.total_transactions || transactions.length}`,
    `# Total Amount (AUD): ${formatCurrency(summary.total_aud_amount || 0, 'AUD')}`,
    `# Date Range: ${summary.date_range?.earliest || 'N/A'} to ${summary.date_range?.latest || 'N/A'}`,
    `# Search Criteria: ${JSON.stringify(searchCriteria)}`,
    ''
  ];

  return [
    ...summaryLines,
    headers.join(','),
    ...rows.map(row => row.join(','))
  ].join('\n');
};

/**
 * Download CSV file
 * @param {string} csvContent - CSV content string
 * @param {string} filename - Optional filename
 */
export const downloadCSV = (csvContent, filename = null) => {
  const defaultFilename = `transactions_${new Date().toISOString().split('T')[0]}.csv`;
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  
  if (link.download !== undefined) {
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', filename || defaultFilename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }
};

/**
 * Export transactions to PDF format (simplified implementation)
 * Note: This is a basic implementation. For production, consider using libraries like jsPDF or react-pdf
 * @param {Array} transactions - Array of transaction objects
 * @param {Object} searchCriteria - Search criteria used
 * @param {Object} summary - Summary statistics
 */
export const exportToPDF = async (transactions, searchCriteria = {}, summary = {}) => {
  // For now, we'll create a simple HTML-based PDF using the browser's print functionality
  // In a production environment, you'd want to use a proper PDF library
  
  const htmlContent = generatePDFHTML(transactions, searchCriteria, summary);
  
  // Create a new window with the content
  const printWindow = window.open('', '_blank');
  printWindow.document.write(htmlContent);
  printWindow.document.close();
  
  // Wait for content to load, then trigger print
  printWindow.onload = () => {
    printWindow.print();
    // Close the window after printing (optional)
    setTimeout(() => {
      printWindow.close();
    }, 1000);
  };
};

/**
 * Generate HTML content for PDF export
 * @param {Array} transactions - Array of transaction objects
 * @param {Object} searchCriteria - Search criteria used
 * @param {Object} summary - Summary statistics
 * @returns {string} HTML content
 */
const generatePDFHTML = (transactions, searchCriteria, summary) => {
  const currentDate = new Date().toLocaleDateString('en-AU');
  
  const summarySection = `
    <div class="summary-section">
      <h2>Summary</h2>
      <div class="summary-grid">
        <div class="summary-item">
          <strong>Total Transactions:</strong> ${summary.total_transactions || transactions.length}
        </div>
        <div class="summary-item">
          <strong>Total Amount (AUD):</strong> ${formatCurrency(summary.total_aud_amount || 0, 'AUD')}
        </div>
        <div class="summary-item">
          <strong>Date Range:</strong> ${summary.date_range?.earliest || 'N/A'} to ${summary.date_range?.latest || 'N/A'}
        </div>
        <div class="summary-item">
          <strong>Income Transactions:</strong> ${summary.by_direction?.inflow_count || 0}
        </div>
        <div class="summary-item">
          <strong>Expense Transactions:</strong> ${summary.by_direction?.outflow_count || 0}
        </div>
        <div class="summary-item">
          <strong>Categorized:</strong> ${summary.by_categorization?.categorized_count || 0} / ${summary.total_transactions || transactions.length}
        </div>
      </div>
    </div>
  `;

  const transactionRows = transactions.map(transaction => `
    <tr>
      <td>${transaction.transaction_date}</td>
      <td>${transaction.description || ''}</td>
      <td>${transaction.vendor_name || ''}</td>
      <td>${transaction.category_name || 'Uncategorized'}</td>
      <td class="amount ${transaction.direction === 'CREDIT' ? 'positive' : 'negative'}">
        ${formatCurrency(Math.abs(transaction.signed_original_amount || 0), transaction.original_currency)}
      </td>
      <td class="amount">
        ${transaction.signed_aud_amount ? formatCurrency(Math.abs(transaction.signed_aud_amount), 'AUD') : ''}
      </td>
      <td>
        <span class="type-badge ${transaction.direction.toLowerCase()}">
          ${transaction.direction === 'CREDIT' ? 'Income' : 'Expense'}
        </span>
      </td>
      <td>${transaction.source || ''}</td>
    </tr>
  `).join('');

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Transaction Export - ${currentDate}</title>
      <style>
        @media print {
          body { margin: 0; }
          .no-print { display: none; }
        }
        
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          margin: 20px;
          color: #333;
          line-height: 1.4;
        }
        
        .header {
          text-align: center;
          margin-bottom: 30px;
          border-bottom: 2px solid #3182ce;
          padding-bottom: 20px;
        }
        
        .header h1 {
          margin: 0;
          color: #2d3748;
          font-size: 28px;
        }
        
        .header p {
          margin: 5px 0 0 0;
          color: #718096;
          font-size: 14px;
        }
        
        .summary-section {
          margin-bottom: 30px;
          padding: 20px;
          background: #f7fafc;
          border-radius: 8px;
        }
        
        .summary-section h2 {
          margin: 0 0 15px 0;
          color: #2d3748;
          font-size: 20px;
        }
        
        .summary-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
          gap: 10px;
        }
        
        .summary-item {
          padding: 8px 0;
          font-size: 14px;
        }
        
        .transactions-table {
          width: 100%;
          border-collapse: collapse;
          margin-top: 20px;
          font-size: 12px;
        }
        
        .transactions-table th,
        .transactions-table td {
          border: 1px solid #e2e8f0;
          padding: 8px;
          text-align: left;
        }
        
        .transactions-table th {
          background: #f7fafc;
          font-weight: 600;
          color: #4a5568;
        }
        
        .transactions-table tr:nth-child(even) {
          background: #f9f9f9;
        }
        
        .amount {
          text-align: right;
          font-family: 'SF Mono', Monaco, monospace;
          font-weight: 600;
        }
        
        .amount.positive {
          color: #38a169;
        }
        
        .amount.negative {
          color: #e53e3e;
        }
        
        .type-badge {
          padding: 2px 6px;
          border-radius: 3px;
          font-size: 11px;
          font-weight: 600;
          text-transform: uppercase;
        }
        
        .type-badge.credit {
          background: #c6f6d5;
          color: #22543d;
        }
        
        .type-badge.debit {
          background: #fed7d7;
          color: #742a2a;
        }
        
        .footer {
          margin-top: 30px;
          text-align: center;
          font-size: 12px;
          color: #718096;
          border-top: 1px solid #e2e8f0;
          padding-top: 20px;
        }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>FundFlow Transaction Export</h1>
        <p>Generated on ${currentDate}</p>
      </div>
      
      ${summarySection}
      
      <div class="transactions-section">
        <h2>Transactions</h2>
        <table class="transactions-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Description</th>
              <th>Vendor</th>
              <th>Category</th>
              <th>Amount</th>
              <th>AUD Amount</th>
              <th>Type</th>
              <th>Source</th>
            </tr>
          </thead>
          <tbody>
            ${transactionRows}
          </tbody>
        </table>
      </div>
      
      <div class="footer">
        <p>This report contains ${transactions.length} transaction${transactions.length !== 1 ? 's' : ''}</p>
        <p>Exported from FundFlow - Personal Finance Management System</p>
      </div>
    </body>
    </html>
  `;
};

/**
 * Export transactions in the specified format
 * @param {Array} transactions - Array of transaction objects
 * @param {string} format - Export format ('csv' or 'pdf')
 * @param {Object} searchCriteria - Search criteria used
 * @param {Object} summary - Summary statistics
 * @param {string} filename - Optional filename
 */
export const exportTransactions = async (transactions, format, searchCriteria = {}, summary = {}, filename = null) => {
  try {
    switch (format.toLowerCase()) {
      case 'csv':
        const csvContent = exportToCSV(transactions, searchCriteria, summary);
        downloadCSV(csvContent, filename);
        break;
        
      case 'pdf':
        await exportToPDF(transactions, searchCriteria, summary);
        break;
        
      default:
        throw new Error(`Unsupported export format: ${format}`);
    }
  } catch (error) {
    console.error('Export error:', error);
    throw error;
  }
};

export default {
  exportToCSV,
  downloadCSV,
  exportToPDF,
  exportTransactions
}; 