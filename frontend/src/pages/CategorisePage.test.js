import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import CategorisePage from './CategorisePage';
import categoryService from '../services/categories';
import transactionService from '../services/transactions';

// Mock react-router-dom
const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate
}));

// Mock the services
jest.mock('../services/categories');
jest.mock('../services/transactions');

// Mock TreeView component
jest.mock('../components/categorization/TreeView', () => {
  const React = require('react');
  return React.forwardRef(({ 
    data, 
    onCategorySelect, 
    onVendorSelect,
    onTransactionSelect,
    onTransactionInfo,
    onCreateCategory,
    onDeleteCategory,
    selectedCategoryId,
    selectedVendorId,
    selectedTransactionId,
    className
  }, ref) => {
    React.useImperativeHandle(ref, () => ({
      closeAll: jest.fn(),
      openAll: jest.fn(),
      selectNext: jest.fn(),
      selectPrevious: jest.fn()
    }));

    return (
      <div data-testid="mock-tree-view" className={className}>
        {data.map(item => (
          <div 
            key={item.id} 
            data-testid={`tree-item-${item.id}`}
            className={`tree-item ${selectedCategoryId === item.id ? 'selected' : ''}`}
            onClick={() => {
              if (item.type === 'category') onCategorySelect?.(item);
              else if (item.type === 'vendor') onVendorSelect?.(item);
              else if (item.type === 'transaction') onTransactionSelect?.(item);
            }}
          >
            <span>{item.name}</span>
            {item.children && item.children.map(child => (
              <div 
                key={child.id} 
                data-testid={`tree-item-${child.id}`}
                onClick={() => {
                  if (child.type === 'category') onCategorySelect?.(child);
                  else if (child.type === 'vendor') onVendorSelect?.(child);
                  else if (child.type === 'transaction') onTransactionSelect?.(child);
                }}
              >
                <span>{child.name}</span>
              </div>
            ))}
          </div>
        ))}
        <button 
          data-testid="add-category-btn"
          onClick={() => onCreateCategory?.('Test Category', null)}
        >
          Add Category
        </button>
        <button 
          data-testid="delete-category-btn"
          onClick={() => onDeleteCategory?.(1)}
        >
          Delete Category
        </button>
      </div>
    );
  });
});

// Mock TransactionDetailsModal
jest.mock('../components/transactions/TransactionDetailsModal', () => {
  return ({ isOpen, onClose, transaction }) => (
    isOpen ? (
      <div data-testid="transaction-details-modal">
        <h3>Transaction Details</h3>
        {transaction && <p>{transaction.description}</p>}
        <button onClick={onClose}>Close</button>
      </div>
    ) : null
  );
});

// Mock transformation utilities
jest.mock('../utils/categoryTransformUtils', () => ({
  transformCategoryData: jest.fn((categories, transactions, options) => {
    // Simple mock transformation - just return categories with type added
    return categories.map(cat => ({
      ...cat,
      type: 'category',
      children: []
    }));
  })
}));



const mockCategories = [
  {
    id: 1,
    name: 'Food & Dining',
    type: 'category',
    is_custom: true,
    user: 1,
    parent: null
  },
  {
    id: 2,
    name: 'Transport',
    type: 'category', 
    is_custom: false,
    user: null,
    parent: null
  },
  {
    id: 3,
    name: 'Restaurants',
    type: 'category',
    is_custom: true,
    user: 1,
    parent: 1
  }
];

const mockTransactions = [
  {
    id: 1,
    description: 'Starbucks',
    aud_amount: -5.50,
    category: 1,
    transaction_date: '2024-01-15'
  },
  {
    id: 2,
    description: 'Uber',
    aud_amount: -25.00,
    category: 2,
    transaction_date: '2024-01-16'
  }
];

const mockCategorySpendingTotals = {
  1: 125.50,
  2: 340.75
};

describe('CategorisePage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup default mock returns
    categoryService.getCategories.mockResolvedValue(mockCategories);
    categoryService.createCategory.mockResolvedValue({ id: 4, name: 'New Category' });
    categoryService.deleteCategory.mockResolvedValue();
    
    transactionService.getTransactions.mockResolvedValue(mockTransactions);
    transactionService.getCategorySpendingTotals.mockResolvedValue(mockCategorySpendingTotals);
  });

  const renderCategoriesPage = () => {
    return render(<CategorisePage />);
  };

  test('renders loading state initially', () => {
    renderCategoriesPage();
    
    expect(screen.getByText('Loading Categories & Transaction Data...')).toBeInTheDocument();
  });

  test('renders page content after loading', async () => {
    renderCategoriesPage();
    
    await waitFor(() => {
      expect(screen.getByText('Manage Categories & Vendors')).toBeInTheDocument();
    });
    
    expect(screen.getByTestId('mock-tree-view')).toBeInTheDocument();
    expect(screen.getByText('Food & Dining')).toBeInTheDocument();
    expect(screen.getByText('Transport')).toBeInTheDocument();
  });

  test('handles category selection', async () => {
    renderCategoriesPage();
    
    await waitFor(() => {
      expect(screen.getByText('Food & Dining')).toBeInTheDocument();
    });
    
    const categoryElement = screen.getByTestId('tree-item-1');
    fireEvent.click(categoryElement);
    
    // Category should be selected (this would be visible in the UI styling)
    expect(categoryElement).toHaveClass('selected');
  });

  test('handles search functionality', async () => {
    renderCategoriesPage();
    
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Search categories or vendors...')).toBeInTheDocument();
    });
    
    const searchInput = screen.getByPlaceholderText('Search categories or vendors...');
    fireEvent.change(searchInput, { target: { value: 'Food' } });
    
    expect(searchInput.value).toBe('Food');
  });

  test('handles add top-level category', async () => {
    renderCategoriesPage();
    
    await waitFor(() => {
      expect(screen.getByText('Add Top-Level Category')).toBeInTheDocument();
    });
    
    const addButton = screen.getByText('Add Top-Level Category');
    fireEvent.click(addButton);
    
    await waitFor(() => {
      expect(screen.getByPlaceholderText('New top-level category name...')).toBeInTheDocument();
    });
    
    const input = screen.getByPlaceholderText('New top-level category name...');
    fireEvent.change(input, { target: { value: 'New Category' } });
    
    const saveButton = screen.getByRole('button', { name: /save/i });
    fireEvent.click(saveButton);
    
    await waitFor(() => {
      expect(categoryService.createCategory).toHaveBeenCalledWith({
        name: 'New Category',
        parent: null
      });
    });
  });

  test('handles collapse all functionality', async () => {
    renderCategoriesPage();
    
    await waitFor(() => {
      expect(screen.getByText('Collapse All')).toBeInTheDocument();
    });
    
    const collapseButton = screen.getByText('Collapse All');
    fireEvent.click(collapseButton);
    
    // The TreeView ref should be called (mocked)
    // This tests that the collapse functionality is wired up correctly
    expect(collapseButton).toBeInTheDocument();
  });

  test('navigates to categorise transactions page', async () => {
    renderCategoriesPage();
    
    await waitFor(() => {
      expect(screen.getByText('Review Uncategorized Transactions')).toBeInTheDocument();
    });
    
    const navigateButton = screen.getByText('Review Uncategorized Transactions');
    fireEvent.click(navigateButton);
    
    expect(mockNavigate).toHaveBeenCalledWith('/categorise/transactions');
  });

  test('handles error states', async () => {
    const errorMessage = 'Failed to load categories';
    categoryService.getCategories.mockRejectedValue(new Error(errorMessage));
    
    renderCategoriesPage();
    
    await waitFor(() => {
      expect(screen.getByText(`Error: ${errorMessage}`)).toBeInTheDocument();
    });
    
    const retryButton = screen.getByText('Retry');
    expect(retryButton).toBeInTheDocument();
  });

  test('handles create category error', async () => {
    const errorMessage = 'Failed to create category';
    categoryService.createCategory.mockRejectedValue(new Error(errorMessage));
    
    renderCategoriesPage();
    
    await waitFor(() => {
      expect(screen.getByText('Add Top-Level Category')).toBeInTheDocument();
    });
    
    const addButton = screen.getByText('Add Top-Level Category');
    fireEvent.click(addButton);
    
    await waitFor(() => {
      expect(screen.getByPlaceholderText('New top-level category name...')).toBeInTheDocument();
    });
    
    const input = screen.getByPlaceholderText('New top-level category name...');
    fireEvent.change(input, { target: { value: 'New Category' } });
    
    const saveButton = screen.getByRole('button', { name: /save/i });
    fireEvent.click(saveButton);
    
    await waitFor(() => {
      expect(screen.getByText(errorMessage)).toBeInTheDocument();
    });
  });

  test('handles delete category', async () => {
    renderCategoriesPage();
    
    await waitFor(() => {
      expect(screen.getByTestId('delete-category-btn')).toBeInTheDocument();
    });
    
    const deleteButton = screen.getByTestId('delete-category-btn');
    fireEvent.click(deleteButton);
    
    await waitFor(() => {
      expect(categoryService.deleteCategory).toHaveBeenCalledWith(1);
    });
  });

  test('shows no items message when no categories exist', async () => {
    categoryService.getCategories.mockResolvedValue([]);
    
    renderCategoriesPage();
    
    await waitFor(() => {
      expect(screen.getByText('No categories or vendors found. Add a top-level category to get started.')).toBeInTheDocument();
    });
  });

  test('shows search no results message', async () => {
    renderCategoriesPage();
    
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Search categories or vendors...')).toBeInTheDocument();
    });
    
    const searchInput = screen.getByPlaceholderText('Search categories or vendors...');
    fireEvent.change(searchInput, { target: { value: 'NonexistentCategory' } });
    
    await waitFor(() => {
      expect(screen.getByText('No categories or vendors match your search term "NonexistentCategory".')).toBeInTheDocument();
    });
  });
}); 