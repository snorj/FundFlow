import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AddTransactionModal from './AddTransactionModal';
import transactionService from '../../services/transactions';
import CategorySelectorModal from '../categorization/CategorySelectorModal';
import VendorSelectorModal from './VendorSelectorModal';

// Mock the services
jest.mock('../../services/transactions');
jest.mock('../categorization/CategorySelectorModal');
jest.mock('./VendorSelectorModal');

// Mock the CSS file
jest.mock('./AddTransactionModal.css', () => ({}));

// Mock React Icons
jest.mock('react-icons/fi', () => ({
  FiX: () => <span data-testid="close-icon">×</span>,
  FiLoader: ({ className }) => <span data-testid="loader-icon" className={className}>⟳</span>,
  FiSave: () => <span data-testid="save-icon">💾</span>,
  FiCalendar: () => <span data-testid="calendar-icon">📅</span>,
  FiDollarSign: () => <span data-testid="dollar-icon">💰</span>,
  FiTag: () => <span data-testid="tag-icon">🏷️</span>,
  FiUser: () => <span data-testid="user-icon">👤</span>,
}));

describe('AddTransactionModal', () => {
  const defaultProps = {
    isOpen: true,
    onClose: jest.fn(),
    onSuccess: jest.fn(),
  };

  const mockCategory = { id: 1, name: 'Food & Dining', type: 'EXPENSE' };
  const mockVendor = { id: 1, name: 'Amazon', is_system_vendor: true };

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock successful transaction creation
    transactionService.createManualTransaction.mockResolvedValue({
      id: 1,
      description: 'Test Transaction',
      original_amount: 50.00,
      direction: 'outflow'
    });

    // Mock CategorySelectorModal
    CategorySelectorModal.mockImplementation(({ isOpen, onSelectCategory, onClose }) => 
      isOpen ? (
        <div data-testid="category-selector-modal">
          <button onClick={() => onSelectCategory(mockCategory)}>Select Food & Dining</button>
          <button onClick={onClose}>Close Category Modal</button>
        </div>
      ) : null
    );

    // Mock VendorSelectorModal
    VendorSelectorModal.mockImplementation(({ isOpen, onSelectVendor, onClose }) => 
      isOpen ? (
        <div data-testid="vendor-selector-modal">
          <button onClick={() => onSelectVendor(mockVendor)}>Select Amazon</button>
          <button onClick={onClose}>Close Vendor Modal</button>
        </div>
      ) : null
    );
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('Basic Rendering', () => {
    test('should render modal when isOpen is true', () => {
      render(<AddTransactionModal {...defaultProps} />);
      
      expect(screen.getByRole('heading', { name: 'Add Transaction' })).toBeInTheDocument();
      expect(screen.getByTestId('close-icon')).toBeInTheDocument();
      expect(screen.getByLabelText(/Description/)).toBeInTheDocument();
    });

    test('should not render modal when isOpen is false', () => {
      render(<AddTransactionModal {...defaultProps} isOpen={false} />);
      
      expect(screen.queryByRole('heading', { name: 'Add Transaction' })).not.toBeInTheDocument();
    });

    test('should render custom modal title', () => {
      render(<AddTransactionModal {...defaultProps} modalTitle="Create New Transaction" />);
      
      expect(screen.getByRole('heading', { name: 'Create New Transaction' })).toBeInTheDocument();
    });

    test('should render all form fields', () => {
      render(<AddTransactionModal {...defaultProps} />);
      
      expect(screen.getByLabelText(/Description/)).toBeInTheDocument();
      expect(screen.getByLabelText(/Date/)).toBeInTheDocument();
      expect(screen.getByLabelText(/Amount/)).toBeInTheDocument();
      expect(screen.getByLabelText(/Currency/)).toBeInTheDocument();
      expect(screen.getByLabelText(/Direction/)).toBeInTheDocument();
      expect(screen.getByLabelText(/Category/)).toBeInTheDocument();
      expect(screen.getByLabelText(/Vendor/)).toBeInTheDocument();
    });
  });

  describe('Form Field Behavior', () => {
    test('should show default values for form fields', () => {
      render(<AddTransactionModal {...defaultProps} />);
      
      const currencyInput = screen.getByDisplayValue('AUD');
      expect(currencyInput).toBeInTheDocument();
      
      const outflowRadio = screen.getByDisplayValue('outflow');
      expect(outflowRadio).toBeChecked();
      
      const dateInput = screen.getByLabelText(/Date/);
      expect(dateInput.value).toBe(new Date().toISOString().split('T')[0]);
    });

    test('should update form fields when user types', async () => {
      render(<AddTransactionModal {...defaultProps} />);
      
      const descriptionInput = screen.getByPlaceholderText('Enter transaction description');
      await userEvent.type(descriptionInput, 'Coffee purchase');
      expect(descriptionInput.value).toBe('Coffee purchase');
      
      const amountInput = screen.getByPlaceholderText('0.00');
      await userEvent.type(amountInput, '15.50');
      expect(amountInput.value).toBe('15.50');
      
      const currencyInput = screen.getByDisplayValue('AUD');
      await userEvent.clear(currencyInput);
      await userEvent.type(currencyInput, 'USD');
      expect(currencyInput.value).toBe('USD');
    });

    test('should handle radio button selection', async () => {
      render(<AddTransactionModal {...defaultProps} />);
      
      const inflowRadio = screen.getByDisplayValue('inflow');
      await userEvent.click(inflowRadio);
      
      expect(inflowRadio).toBeChecked();
      expect(screen.getByDisplayValue('outflow')).not.toBeChecked();
    });

    test('should handle date field changes', async () => {
      render(<AddTransactionModal {...defaultProps} />);
      
      const dateInput = screen.getByLabelText(/Date/);
      await userEvent.clear(dateInput);
      await userEvent.type(dateInput, '2024-06-15');
      
      expect(dateInput.value).toBe('2024-06-15');
    });
  });

  describe('Form Validation', () => {
    test('should show validation errors for empty required fields', async () => {
      render(<AddTransactionModal {...defaultProps} />);
      
      const saveButton = screen.getByText('Save Transaction');
      fireEvent.click(saveButton);
      
      await waitFor(() => {
        expect(screen.getByText('Description is required')).toBeInTheDocument();
        expect(screen.getByText('Please enter a valid amount greater than 0')).toBeInTheDocument();
        expect(screen.getByText('Please select a category')).toBeInTheDocument();
      });
      
      expect(transactionService.createManualTransaction).not.toHaveBeenCalled();
    });

    test('should validate amount field properly', async () => {
      render(<AddTransactionModal {...defaultProps} />);
      
      const amountInput = screen.getByPlaceholderText('0.00');
      const saveButton = screen.getByText('Save Transaction');
      
      // Test negative amount
      await userEvent.type(amountInput, '-10');
      fireEvent.click(saveButton);
      
      await waitFor(() => {
        expect(screen.getByText('Please enter a valid amount greater than 0')).toBeInTheDocument();
      });
      
      // Test zero amount
      await userEvent.clear(amountInput);
      await userEvent.type(amountInput, '0');
      fireEvent.click(saveButton);
      
      await waitFor(() => {
        expect(screen.getByText('Please enter a valid amount greater than 0')).toBeInTheDocument();
      });
    });

    test('should validate currency field length', async () => {
      render(<AddTransactionModal {...defaultProps} />);
      
      const currencyInput = screen.getByDisplayValue('AUD');
      const saveButton = screen.getByText('Save Transaction');
      
      await userEvent.clear(currencyInput);
      await userEvent.type(currencyInput, 'USDT'); // 4 characters
      fireEvent.click(saveButton);
      
      await waitFor(() => {
        expect(screen.getByText('Currency must be 3 characters (e.g., AUD, USD)')).toBeInTheDocument();
      });
    });

    test('should clear validation errors when user corrects field', async () => {
      render(<AddTransactionModal {...defaultProps} />);
      
      const descriptionInput = screen.getByPlaceholderText('Enter transaction description');
      const saveButton = screen.getByText('Save Transaction');
      
      // Trigger validation error
      fireEvent.click(saveButton);
      
      await waitFor(() => {
        expect(screen.getByText('Description is required')).toBeInTheDocument();
      });
      
      // Fix the error
      await userEvent.type(descriptionInput, 'Fixed description');
      
      await waitFor(() => {
        expect(screen.queryByText('Description is required')).not.toBeInTheDocument();
      });
    });
  });

  describe('Category and Vendor Selection', () => {
    test('should open category selector when select button clicked', async () => {
      render(<AddTransactionModal {...defaultProps} />);
      
      const categorySelectButton = screen.getByText('Select');
      fireEvent.click(categorySelectButton);
      
      expect(screen.getByTestId('category-selector-modal')).toBeInTheDocument();
    });

    test('should select category and close modal', async () => {
      render(<AddTransactionModal {...defaultProps} />);
      
      // Open category selector
      const categorySelectButton = screen.getByText('Select');
      fireEvent.click(categorySelectButton);
      
      // Select a category
      const selectCategoryButton = screen.getByText('Select Food & Dining');
      fireEvent.click(selectCategoryButton);
      
      await waitFor(() => {
        expect(screen.getByDisplayValue('Food & Dining')).toBeInTheDocument();
        expect(screen.queryByTestId('category-selector-modal')).not.toBeInTheDocument();
      });
    });

    test('should open vendor selector when select button clicked', async () => {
      render(<AddTransactionModal {...defaultProps} />);
      
      const vendorSelectButtons = screen.getAllByText('Select');
      const vendorSelectButton = vendorSelectButtons[1]; // Second "Select" button is for vendor
      fireEvent.click(vendorSelectButton);
      
      expect(screen.getByTestId('vendor-selector-modal')).toBeInTheDocument();
    });

    test('should select vendor and close modal', async () => {
      render(<AddTransactionModal {...defaultProps} />);
      
      // Open vendor selector
      const vendorSelectButtons = screen.getAllByText('Select');
      const vendorSelectButton = vendorSelectButtons[1];
      fireEvent.click(vendorSelectButton);
      
      // Select a vendor
      const selectVendorButton = screen.getByText('Select Amazon');
      fireEvent.click(selectVendorButton);
      
      await waitFor(() => {
        expect(screen.getByDisplayValue('Amazon')).toBeInTheDocument();
        expect(screen.queryByTestId('vendor-selector-modal')).not.toBeInTheDocument();
      });
    });

    test('should hide category field when showCategoryField is false', () => {
      render(<AddTransactionModal {...defaultProps} showCategoryField={false} />);
      
      expect(screen.queryByLabelText(/Category/)).not.toBeInTheDocument();
    });

    test('should hide vendor field when showVendorField is false', () => {
      render(<AddTransactionModal {...defaultProps} showVendorField={false} />);
      
      expect(screen.queryByLabelText(/Vendor/)).not.toBeInTheDocument();
    });
  });

  describe('Form Submission', () => {
    test('should submit form with valid data', async () => {
      render(<AddTransactionModal {...defaultProps} />);
      
      // Fill in required fields
      await userEvent.type(screen.getByPlaceholderText('Enter transaction description'), 'Coffee');
      await userEvent.type(screen.getByPlaceholderText('0.00'), '5.50');
      
      // Select category
      fireEvent.click(screen.getByText('Select'));
      fireEvent.click(screen.getByText('Select Food & Dining'));
      
      // Submit form
      fireEvent.click(screen.getByText('Save Transaction'));
      
      await waitFor(() => {
        expect(transactionService.createManualTransaction).toHaveBeenCalledWith({
          description: 'Coffee',
          transaction_date: new Date().toISOString().split('T')[0],
          original_amount: 5.50,
          original_currency: 'AUD',
          direction: 'outflow',
          category_id: 1,
          vendor_id: null,
        });
      });
      
      expect(defaultProps.onSuccess).toHaveBeenCalled();
      expect(defaultProps.onClose).toHaveBeenCalled();
    });

    test('should show loading state during submission', async () => {
      // Mock a delayed response
      let resolveTransaction;
      transactionService.createManualTransaction.mockReturnValue(
        new Promise(resolve => { resolveTransaction = resolve; })
      );
      
      render(<AddTransactionModal {...defaultProps} />);
      
      // Fill in required fields
      await userEvent.type(screen.getByPlaceholderText('Enter transaction description'), 'Coffee');
      await userEvent.type(screen.getByPlaceholderText('0.00'), '5.50');
      
      // Select category
      fireEvent.click(screen.getByText('Select'));
      fireEvent.click(screen.getByText('Select Food & Dining'));
      
      // Submit form
      fireEvent.click(screen.getByText('Save Transaction'));
      
      // Check loading state
      await waitFor(() => {
        expect(screen.getByTestId('loader-icon')).toBeInTheDocument();
        expect(screen.getByText('Saving...')).toBeInTheDocument();
      });
      
      // Resolve the promise
      resolveTransaction({ id: 1 });
      
      await waitFor(() => {
        expect(screen.queryByTestId('loader-icon')).not.toBeInTheDocument();
      });
    });

    test('should handle API errors gracefully', async () => {
      transactionService.createManualTransaction.mockRejectedValue(
        new Error('Network error occurred')
      );
      
      render(<AddTransactionModal {...defaultProps} />);
      
      // Fill in required fields
      await userEvent.type(screen.getByPlaceholderText('Enter transaction description'), 'Coffee');
      await userEvent.type(screen.getByPlaceholderText('0.00'), '5.50');
      
      // Select category
      fireEvent.click(screen.getByText('Select'));
      fireEvent.click(screen.getByText('Select Food & Dining'));
      
      // Submit form
      fireEvent.click(screen.getByText('Save Transaction'));
      
      await waitFor(() => {
        expect(screen.getByText('Network error occurred')).toBeInTheDocument();
      });
      
      expect(defaultProps.onSuccess).not.toHaveBeenCalled();
      expect(defaultProps.onClose).not.toHaveBeenCalled();
    });
  });

  describe('Modal Interactions', () => {
    test('should close modal when close button clicked', () => {
      render(<AddTransactionModal {...defaultProps} />);
      
      fireEvent.click(screen.getByTestId('close-icon'));
      
      expect(defaultProps.onClose).toHaveBeenCalled();
    });

    test('should close modal when cancel button clicked', () => {
      render(<AddTransactionModal {...defaultProps} />);
      
      fireEvent.click(screen.getByText('Cancel'));
      
      expect(defaultProps.onClose).toHaveBeenCalled();
    });

    test('should close modal when overlay clicked', () => {
      render(<AddTransactionModal {...defaultProps} />);
      
      const overlay = screen.getByRole('heading', { name: 'Add Transaction' }).closest('.transaction-modal-overlay');
      fireEvent.click(overlay);
      
      expect(defaultProps.onClose).toHaveBeenCalled();
    });

    test('should not close modal when modal content clicked', () => {
      render(<AddTransactionModal {...defaultProps} />);
      
      const modalContent = screen.getByRole('heading', { name: 'Add Transaction' }).closest('.transaction-modal-content');
      fireEvent.click(modalContent);
      
      expect(defaultProps.onClose).not.toHaveBeenCalled();
    });
  });

  describe('Initial Data', () => {
    test('should populate form with initial data', () => {
      const initialData = {
        description: 'Initial Transaction',
        transaction_date: '2024-06-01',
        original_amount: '25.00',
        original_currency: 'USD',
        direction: 'inflow',
        category: mockCategory,
        vendor: mockVendor,
      };
      
      render(<AddTransactionModal {...defaultProps} initialData={initialData} />);
      
      expect(screen.getByDisplayValue('Initial Transaction')).toBeInTheDocument();
      expect(screen.getByDisplayValue('2024-06-01')).toBeInTheDocument();
      expect(screen.getByDisplayValue('25.00')).toBeInTheDocument();
      expect(screen.getByDisplayValue('USD')).toBeInTheDocument();
      expect(screen.getByDisplayValue('inflow')).toBeChecked();
      expect(screen.getByDisplayValue('Food & Dining')).toBeInTheDocument();
      expect(screen.getByDisplayValue('Amazon')).toBeInTheDocument();
    });
  });

  describe('Modal Size Variations', () => {
    test('should apply correct CSS class for modal size', () => {
      const { rerender } = render(<AddTransactionModal {...defaultProps} modalSize="sm" />);
      
      expect(document.querySelector('.transaction-modal--sm')).toBeInTheDocument();
      
      rerender(<AddTransactionModal {...defaultProps} modalSize="lg" />);
      expect(document.querySelector('.transaction-modal--lg')).toBeInTheDocument();
    });
  });
});

// Suppress console.error messages during tests
const originalError = console.error;
beforeAll(() => {
  console.error = jest.fn();
});

afterAll(() => {
  console.error = originalError;
}); 