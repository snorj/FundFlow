import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import '@testing-library/jest-dom';
import CategoriseTransactionsPage from './CategoriseTransactionsPage';
import transactionService from '../services/transactions';
import categoryService from '../services/categories';
import vendorRuleService from '../services/vendorRules';

// Mock the services
jest.mock('../services/transactions');
jest.mock('../services/categories');
jest.mock('../services/vendorRules');

// Mock react-router-dom
const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

// Mock the modal components
jest.mock('../components/categorization/CategorySelectorModal', () => {
  return function MockCategorySelectorModal({ isOpen, onClose, onSelectCategory }) {
    if (!isOpen) return null;
    return (
      <div data-testid="category-selector-modal">
        <button onClick={() => onSelectCategory({ id: 1, name: 'Grocery' })}>
          Select Grocery
        </button>
        <button onClick={onClose}>Close</button>
      </div>
    );
  };
});

jest.mock('../components/transactions/VendorRenameModal', () => {
  return function MockVendorRenameModal({ isOpen, onClose, vendor, onSuccess }) {
    if (!isOpen) return null;
    return (
      <div data-testid="vendor-rename-modal">
        <p>Rename {vendor}</p>
        <button 
          onClick={() => onSuccess({
            operation: 'merge',
            originalVendor: vendor,
            targetVendor: 'Jumbo'
          })}
        >
          Merge with Jumbo
        </button>
        <button onClick={onClose}>Close</button>
      </div>
    );
  };
});

jest.mock('../components/categorization/VendorRulePromptModal', () => {
  return function MockVendorRulePromptModal() {
    return null;
  };
});

jest.mock('../components/transactions/TransactionDetailsModal', () => {
  return function MockTransactionDetailsModal() {
    return null;
  };
});

const renderWithRouter = (component) => {
  return render(
    <BrowserRouter>
      {component}
    </BrowserRouter>
  );
};

describe('CategoriseTransactionsPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Default mock implementations
    transactionService.getUncategorisedGroups.mockResolvedValue([
      {
        description: 'JUMBO Oosterstraat, GRONINGEN',
        count: 3,
        transaction_ids: [1, 2, 3],
        previews: [
          { id: 1, date: '2024-01-01', amount: 25.50, direction: 'DEBIT', currency: 'EUR' },
          { id: 2, date: '2024-01-02', amount: 30.00, direction: 'DEBIT', currency: 'EUR' },
          { id: 3, date: '2024-01-03', amount: 15.75, direction: 'DEBIT', currency: 'EUR' }
        ]
      }
    ]);
    
    categoryService.getCategories.mockResolvedValue([
      { id: 1, name: 'Grocery', is_custom: false },
      { id: 2, name: 'Transport', is_custom: false }
    ]);
    
    vendorRuleService.getVendorRulesByVendor.mockResolvedValue([]);
    transactionService.batchCategoriseTransactions.mockResolvedValue({ success: true });
  });

  test('automatically applies vendor rules when vendor is merged with existing vendor that has rules', async () => {
    // Setup: Mock vendor rules for "Jumbo"
    vendorRuleService.getVendorRulesByVendor.mockResolvedValue([
      {
        id: 1,
        vendor_name: 'Jumbo',
        category_id: 1, // Grocery category
        is_persistent: true
      }
    ]);

    renderWithRouter(<CategoriseTransactionsPage />);

    // Wait for the page to load
    await waitFor(() => {
      expect(screen.getByText('JUMBO Oosterstraat, GRONINGEN')).toBeInTheDocument();
    });

    // Click the edit vendor button
    const editButton = screen.getByTitle('Edit vendor name');
    fireEvent.click(editButton);

    // Wait for vendor rename modal to appear
    await waitFor(() => {
      expect(screen.getByTestId('vendor-rename-modal')).toBeInTheDocument();
    });

    // Click the merge button (simulates user confirming merge with existing "Jumbo" vendor)
    const mergeButton = screen.getByText('Merge with Jumbo');
    fireEvent.click(mergeButton);

    // Verify that vendor rules were checked
    await waitFor(() => {
      expect(vendorRuleService.getVendorRulesByVendor).toHaveBeenCalledWith('Jumbo');
    });

    // Verify that transactions were categorised using the vendor rule
    await waitFor(() => {
      expect(transactionService.batchCategoriseTransactions).toHaveBeenCalledWith(
        [1, 2, 3], // transaction IDs
        1, // category ID from the vendor rule (Grocery)
        'Jumbo' // target vendor name
      );
    });

    // Verify that the page refreshed the data
          expect(transactionService.getUncategorisedGroups).toHaveBeenCalledTimes(2); // Once on load, once after merge
  });

  test('handles vendor merge when target vendor has no rules', async () => {
    // Setup: No vendor rules for "Jumbo"
    vendorRuleService.getVendorRulesByVendor.mockResolvedValue([]);

    renderWithRouter(<CategoriseTransactionsPage />);

    // Wait for the page to load
    await waitFor(() => {
      expect(screen.getByText('JUMBO Oosterstraat, GRONINGEN')).toBeInTheDocument();
    });

    // Click the edit vendor button
    const editButton = screen.getByTitle('Edit vendor name');
    fireEvent.click(editButton);

    // Wait for vendor rename modal to appear
    await waitFor(() => {
      expect(screen.getByTestId('vendor-rename-modal')).toBeInTheDocument();
    });

    // Click the merge button
    const mergeButton = screen.getByText('Merge with Jumbo');
    fireEvent.click(mergeButton);

    // Verify that vendor rules were checked
    await waitFor(() => {
      expect(vendorRuleService.getVendorRulesByVendor).toHaveBeenCalledWith('Jumbo');
    });

    // Verify that NO automatic categorization occurred (since no rules exist)
    expect(transactionService.batchCategorizeTransactions).not.toHaveBeenCalled();

    // Verify that the page still refreshed the data
    expect(transactionService.getUncategorizedGroups).toHaveBeenCalledTimes(2);
  });

  test('handles vendor rule application errors gracefully', async () => {
    // Setup: Mock vendor rules but make categorization fail
    vendorRuleService.getVendorRulesByVendor.mockResolvedValue([
      {
        id: 1,
        vendor_name: 'Jumbo',
        category_id: 1,
        is_persistent: true
      }
    ]);
    
    transactionService.batchCategorizeTransactions.mockRejectedValue(
      new Error('Categorization failed')
    );

    renderWithRouter(<CategoriseTransactionsPage />);

    // Wait for the page to load
    await waitFor(() => {
      expect(screen.getByText('JUMBO Oosterstraat, GRONINGEN')).toBeInTheDocument();
    });

    // Click the edit vendor button
    const editButton = screen.getByTitle('Edit vendor name');
    fireEvent.click(editButton);

    // Wait for vendor rename modal to appear
    await waitFor(() => {
      expect(screen.getByTestId('vendor-rename-modal')).toBeInTheDocument();
    });

    // Click the merge button
    const mergeButton = screen.getByText('Merge with Jumbo');
    fireEvent.click(mergeButton);

    // Verify that the operation completed despite the categorization error
    await waitFor(() => {
      expect(transactionService.getUncategorizedGroups).toHaveBeenCalledTimes(2);
    });
  });
}); 