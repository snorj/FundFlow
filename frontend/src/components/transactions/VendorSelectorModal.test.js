import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import VendorSelectorModal from './VendorSelectorModal';
import vendorService from '../../services/vendors';

// Mock the vendor service
jest.mock('../../services/vendors');

// Mock the CSS file
jest.mock('./VendorSelectorModal.css', () => ({}));

// Mock React Icons
jest.mock('react-icons/fi', () => ({
  FiX: () => <span data-testid="close-icon">×</span>,
  FiPlus: () => <span data-testid="plus-icon">+</span>,
  FiLoader: ({ className }) => <span data-testid="loader-icon" className={className}>⟳</span>,
  FiSave: () => <span data-testid="save-icon">💾</span>,
  FiXCircle: () => <span data-testid="cancel-icon">⊗</span>,
  FiSearch: () => <span data-testid="search-icon">🔍</span>,
}));

describe('VendorSelectorModal', () => {
  const mockVendors = [
    { id: 1, name: 'Amazon', is_system_vendor: true },
    { id: 2, name: 'Target', is_system_vendor: true },
    { id: 3, name: 'My Custom Vendor', is_system_vendor: false },
    { id: 4, name: 'Another Custom', is_system_vendor: false },
  ];

  const defaultProps = {
    isOpen: true,
    onClose: jest.fn(),
    onSelectVendor: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    vendorService.getVendors.mockResolvedValue(mockVendors);
    vendorService.createVendor.mockResolvedValue({ id: 5, name: 'New Vendor', is_system_vendor: false });
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('Basic Rendering', () => {
    test('should render modal when isOpen is true', async () => {
      render(<VendorSelectorModal {...defaultProps} />);
      
      expect(screen.getByRole('heading', { name: 'Select Vendor' })).toBeInTheDocument();
      expect(screen.getByTestId('close-icon')).toBeInTheDocument();
      
      await waitFor(() => {
        expect(screen.getByText('Amazon')).toBeInTheDocument();
      });
    });

    test('should not render modal when isOpen is false', () => {
      render(<VendorSelectorModal {...defaultProps} isOpen={false} />);
      
      expect(screen.queryByRole('heading', { name: 'Select Vendor' })).not.toBeInTheDocument();
    });

    test('should render custom modal title', async () => {
      render(<VendorSelectorModal {...defaultProps} modalTitle="Choose a Vendor" />);
      
      expect(screen.getByRole('heading', { name: 'Choose a Vendor' })).toBeInTheDocument();
    });
  });

  describe('Vendor Data Loading', () => {
    test('should fetch vendors when modal opens', async () => {
      render(<VendorSelectorModal {...defaultProps} />);
      
      expect(vendorService.getVendors).toHaveBeenCalledTimes(1);
      
      await waitFor(() => {
        expect(screen.getByText('Amazon')).toBeInTheDocument();
        expect(screen.getByText('My Custom Vendor')).toBeInTheDocument();
      });
    });

    test('should not fetch vendors if pre-loaded vendors provided', () => {
      render(<VendorSelectorModal {...defaultProps} vendors={mockVendors} />);
      
      expect(vendorService.getVendors).not.toHaveBeenCalled();
      expect(screen.getByText('Amazon')).toBeInTheDocument();
    });

    test('should display loading state while fetching vendors', () => {
      vendorService.getVendors.mockReturnValue(new Promise(() => {})); // Never resolves
      
      render(<VendorSelectorModal {...defaultProps} />);
      
      expect(screen.getByTestId('loader-icon')).toBeInTheDocument();
      expect(screen.getByText('Loading vendors...')).toBeInTheDocument();
    });

    test('should handle vendor fetch error', async () => {
      vendorService.getVendors.mockRejectedValue(new Error('Network error'));
      
      render(<VendorSelectorModal {...defaultProps} />);
      
      await waitFor(() => {
        expect(screen.getByText('Network error')).toBeInTheDocument();
        expect(screen.getByText('Try Again')).toBeInTheDocument();
      });
    });

    test('should retry fetching vendors when retry button clicked', async () => {
      vendorService.getVendors
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce(mockVendors);
      
      render(<VendorSelectorModal {...defaultProps} />);
      
      await waitFor(() => {
        expect(screen.getByText('Try Again')).toBeInTheDocument();
      });
      
      fireEvent.click(screen.getByText('Try Again'));
      
      await waitFor(() => {
        expect(screen.getByText('Amazon')).toBeInTheDocument();
      });
      
      expect(vendorService.getVendors).toHaveBeenCalledTimes(2);
    });
  });

  describe('Vendor Display and Filtering', () => {
    test('should display system and user vendors in separate sections', async () => {
      render(<VendorSelectorModal {...defaultProps} />);
      
      await waitFor(() => {
        expect(screen.getByText('System Vendors')).toBeInTheDocument();
        expect(screen.getByText('My Vendors')).toBeInTheDocument();
      });
    });

    test('should hide system vendors when showSystemVendors is false', async () => {
      render(<VendorSelectorModal {...defaultProps} showSystemVendors={false} />);
      
      await waitFor(() => {
        expect(screen.queryByText('System Vendors')).not.toBeInTheDocument();
        expect(screen.queryByText('Amazon')).not.toBeInTheDocument();
        expect(screen.getByText('My Vendors')).toBeInTheDocument();
        expect(screen.getByText('My Custom Vendor')).toBeInTheDocument();
      });
    });

    test('should hide user vendors when showUserVendors is false', async () => {
      render(<VendorSelectorModal {...defaultProps} showUserVendors={false} />);
      
      await waitFor(() => {
        expect(screen.getByText('System Vendors')).toBeInTheDocument();
        expect(screen.getByText('Amazon')).toBeInTheDocument();
        expect(screen.queryByText('My Vendors')).not.toBeInTheDocument();
        expect(screen.queryByText('My Custom Vendor')).not.toBeInTheDocument();
      });
    });

    test('should display no vendors message when no vendors available', async () => {
      vendorService.getVendors.mockResolvedValue([]);
      
      render(<VendorSelectorModal {...defaultProps} />);
      
      await waitFor(() => {
        expect(screen.getByText('No vendors available.')).toBeInTheDocument();
      });
    });
  });

  describe('Search Functionality', () => {
    test('should display search input by default', async () => {
      render(<VendorSelectorModal {...defaultProps} />);
      
      expect(screen.getByPlaceholderText('Search vendors...')).toBeInTheDocument();
      expect(screen.getByTestId('search-icon')).toBeInTheDocument();
    });

    test('should hide search input when enableSearch is false', async () => {
      render(<VendorSelectorModal {...defaultProps} enableSearch={false} />);
      
      expect(screen.queryByPlaceholderText('Search vendors...')).not.toBeInTheDocument();
      expect(screen.queryByTestId('search-icon')).not.toBeInTheDocument();
    });

    test('should use custom placeholder text', async () => {
      render(<VendorSelectorModal {...defaultProps} placeholder="Find vendors..." />);
      
      expect(screen.getByPlaceholderText('Find vendors...')).toBeInTheDocument();
    });

    test('should filter vendors based on search term', async () => {
      render(<VendorSelectorModal {...defaultProps} />);
      
      await waitFor(() => {
        expect(screen.getByText('Amazon')).toBeInTheDocument();
        expect(screen.getByText('Target')).toBeInTheDocument();
      });
      
      const searchInput = screen.getByPlaceholderText('Search vendors...');
      await userEvent.type(searchInput, 'amazon');
      
      expect(screen.getByText('Amazon')).toBeInTheDocument();
      expect(screen.queryByText('Target')).not.toBeInTheDocument();
    });

    test('should display no results message when search yields no matches', async () => {
      render(<VendorSelectorModal {...defaultProps} />);
      
      await waitFor(() => {
        expect(screen.getByText('Amazon')).toBeInTheDocument();
      });
      
      const searchInput = screen.getByPlaceholderText('Search vendors...');
      await userEvent.type(searchInput, 'nonexistent');
      
      expect(screen.getByText('No vendors found matching your search.')).toBeInTheDocument();
    });

    test('should clear search when modal reopens', async () => {
      const { rerender } = render(<VendorSelectorModal {...defaultProps} />);
      
      await waitFor(() => {
        expect(screen.getByText('Amazon')).toBeInTheDocument();
      });
      
      const searchInput = screen.getByPlaceholderText('Search vendors...');
      await userEvent.type(searchInput, 'amazon');
      expect(searchInput.value).toBe('amazon');
      
      // Close and reopen modal
      rerender(<VendorSelectorModal {...defaultProps} isOpen={false} />);
      rerender(<VendorSelectorModal {...defaultProps} isOpen={true} />);
      
      await waitFor(() => {
        const newSearchInput = screen.getByPlaceholderText('Search vendors...');
        expect(newSearchInput.value).toBe('');
      });
    });
  });

  describe('Vendor Selection', () => {
    test('should show selection preview in confirm mode', async () => {
      render(<VendorSelectorModal {...defaultProps} selectionMode="confirm" />);
      
      await waitFor(() => {
        expect(screen.getByText(/Selected:/)).toBeInTheDocument();
        expect(screen.getByText('None')).toBeInTheDocument();
      });
    });

    test('should hide selection preview in none mode', async () => {
      render(<VendorSelectorModal {...defaultProps} selectionMode="none" />);
      
      await waitFor(() => {
        expect(screen.queryByText(/Selected:/)).not.toBeInTheDocument();
      });
    });

    test('should update selection preview when vendor clicked in confirm mode', async () => {
      render(<VendorSelectorModal {...defaultProps} selectionMode="confirm" />);
      
      await waitFor(() => {
        expect(screen.getByText('Amazon')).toBeInTheDocument();
      });
      
      // Click on the vendor item (not the selection preview)
      const vendorItem = screen.getByText('Amazon').closest('.vendor-item');
      fireEvent.click(vendorItem);
      
      expect(screen.getByText(/Selected:/)).toBeInTheDocument();
      // Check for the selected vendor in the preview area
      expect(screen.getAllByText('Amazon')).toHaveLength(2); // One in preview, one in list
    });

    test('should immediately select and close in immediate mode', async () => {
      const onSelectVendor = jest.fn();
      const onClose = jest.fn();
      
      render(<VendorSelectorModal 
        {...defaultProps} 
        selectionMode="immediate"
        onSelectVendor={onSelectVendor}
        onClose={onClose}
      />);
      
      await waitFor(() => {
        expect(screen.getByText('Amazon')).toBeInTheDocument();
      });
      
      const vendorItem = screen.getByText('Amazon').closest('.vendor-item');
      fireEvent.click(vendorItem);
      
      expect(onSelectVendor).toHaveBeenCalledWith(mockVendors[0]);
      expect(onClose).toHaveBeenCalled();
    });

    test('should display initial vendor selection', async () => {
      const initialVendor = mockVendors[0];
      
      render(<VendorSelectorModal 
        {...defaultProps} 
        initialVendor={initialVendor}
        selectionMode="confirm"
      />);
      
      await waitFor(() => {
        // Check that Amazon appears in the list
        expect(screen.getAllByText('Amazon')).toHaveLength(2); // One in preview, one in list
      });
    });
  });

  describe('Vendor Creation', () => {
    test('should display add vendor button by default', async () => {
      render(<VendorSelectorModal {...defaultProps} />);
      
      expect(screen.getByText('Add New Vendor')).toBeInTheDocument();
      expect(screen.getByTestId('plus-icon')).toBeInTheDocument();
    });

    test('should hide add vendor button when allowCreate is false', async () => {
      render(<VendorSelectorModal {...defaultProps} allowCreate={false} />);
      
      expect(screen.queryByText('Add New Vendor')).not.toBeInTheDocument();
    });

    test('should show create input when add vendor button clicked', async () => {
      render(<VendorSelectorModal {...defaultProps} />);
      
      fireEvent.click(screen.getByText('Add New Vendor'));
      
      expect(screen.getByPlaceholderText('New vendor name...')).toBeInTheDocument();
      expect(screen.getByTestId('save-icon')).toBeInTheDocument();
      expect(screen.getByTestId('cancel-icon')).toBeInTheDocument();
    });

    test('should cancel vendor creation', async () => {
      render(<VendorSelectorModal {...defaultProps} />);
      
      fireEvent.click(screen.getByText('Add New Vendor'));
      expect(screen.getByPlaceholderText('New vendor name...')).toBeInTheDocument();
      
      fireEvent.click(screen.getByTestId('cancel-icon'));
      
      expect(screen.queryByPlaceholderText('New vendor name...')).not.toBeInTheDocument();
      expect(screen.getByText('Add New Vendor')).toBeInTheDocument();
    });

    test('should create new vendor successfully', async () => {
      const onSelectVendor = jest.fn();
      
      render(<VendorSelectorModal 
        {...defaultProps}
        onSelectVendor={onSelectVendor}
        selectionMode="immediate"
        vendors={mockVendors} // Pre-load vendors to avoid initial fetch
      />);
      
      fireEvent.click(screen.getByText('Add New Vendor'));
      
      const input = screen.getByPlaceholderText('New vendor name...');
      await userEvent.type(input, 'New Test Vendor');
      
      fireEvent.click(screen.getByTestId('save-icon'));
      
      await waitFor(() => {
        expect(vendorService.createVendor).toHaveBeenCalledWith({ name: 'New Test Vendor' });
      });
      
      // Check that the new vendor appears in the UI
      await waitFor(() => {
        expect(screen.getAllByText('New Vendor')).toHaveLength(2); // In selection preview and vendor list
      });
      
      // Check that the selection callback was called (the created vendor gets auto-selected)
      await waitFor(() => {
        expect(onSelectVendor).toHaveBeenCalled();
      }, { timeout: 2000 });
    });

    test('should disable save button when vendor name is empty', async () => {
      render(<VendorSelectorModal {...defaultProps} />);
      
      fireEvent.click(screen.getByText('Add New Vendor'));
      
      const saveButton = screen.getByTestId('save-icon').closest('button');
      expect(saveButton).toBeDisabled();
    });

    test('should show loading state during vendor creation', async () => {
      vendorService.createVendor.mockReturnValue(new Promise(() => {})); // Never resolves
      
      render(<VendorSelectorModal {...defaultProps} vendors={mockVendors} />);
      
      fireEvent.click(screen.getByText('Add New Vendor'));
      
      const input = screen.getByPlaceholderText('New vendor name...');
      await userEvent.type(input, 'New Test Vendor');
      
      fireEvent.click(screen.getByTestId('save-icon'));
      
      // After clicking save, the save icon turns into a loader icon
      await waitFor(() => {
        expect(screen.getByTestId('loader-icon')).toBeInTheDocument();
      });
    });

    test('should handle vendor creation error', async () => {
      vendorService.createVendor.mockRejectedValue(new Error('Creation failed'));
      
      render(<VendorSelectorModal {...defaultProps} vendors={mockVendors} />);
      
      fireEvent.click(screen.getByText('Add New Vendor'));
      
      const input = screen.getByPlaceholderText('New vendor name...');
      await userEvent.type(input, 'New Test Vendor');
      
      fireEvent.click(screen.getByTestId('save-icon'));
      
      await waitFor(() => {
        expect(screen.getByText('Creation failed')).toBeInTheDocument();
      });
    });
  });

  describe('Modal Footer and Confirmation', () => {
    test('should show footer in confirm mode', async () => {
      render(<VendorSelectorModal {...defaultProps} selectionMode="confirm" />);
      
      expect(screen.getByText('Cancel')).toBeInTheDocument();
      expect(screen.getByText('Confirm Selection')).toBeInTheDocument();
    });

    test('should hide footer in immediate mode', async () => {
      render(<VendorSelectorModal {...defaultProps} selectionMode="immediate" />);
      
      expect(screen.queryByText('Cancel')).not.toBeInTheDocument();
      expect(screen.queryByText('Confirm Selection')).not.toBeInTheDocument();
    });

    test('should call onClose when cancel button clicked', async () => {
      const onClose = jest.fn();
      
      render(<VendorSelectorModal 
        {...defaultProps} 
        onClose={onClose}
        selectionMode="confirm" 
      />);
      
      fireEvent.click(screen.getByText('Cancel'));
      
      expect(onClose).toHaveBeenCalled();
    });

    test('should call onSelectVendor when confirm button clicked', async () => {
      const onSelectVendor = jest.fn();
      const onClose = jest.fn();
      
      render(<VendorSelectorModal 
        {...defaultProps} 
        onSelectVendor={onSelectVendor}
        onClose={onClose}
        selectionMode="confirm" 
      />);
      
      await waitFor(() => {
        expect(screen.getByText('Amazon')).toBeInTheDocument();
      });
      
      // Select a vendor first
      const vendorItem = screen.getByText('Amazon').closest('.vendor-item');
      fireEvent.click(vendorItem);
      
      // Then confirm
      fireEvent.click(screen.getByText('Confirm Selection'));
      
      expect(onSelectVendor).toHaveBeenCalledWith(mockVendors[0]);
      expect(onClose).toHaveBeenCalled();
    });

    test('should disable confirm button when no vendor selected', async () => {
      render(<VendorSelectorModal {...defaultProps} selectionMode="confirm" />);
      
      await waitFor(() => {
        const confirmButton = screen.getByText('Confirm Selection');
        expect(confirmButton).toBeDisabled();
      });
    });
  });

  describe('Modal Interactions', () => {
    test('should close modal when close button clicked', async () => {
      const onClose = jest.fn();
      
      render(<VendorSelectorModal {...defaultProps} onClose={onClose} />);
      
      fireEvent.click(screen.getByTestId('close-icon'));
      
      expect(onClose).toHaveBeenCalled();
    });

    test('should close modal when overlay clicked', async () => {
      const onClose = jest.fn();
      
      render(<VendorSelectorModal {...defaultProps} onClose={onClose} />);
      
      const overlay = screen.getByRole('heading', { name: 'Select Vendor' }).closest('.vendor-modal-overlay');
      fireEvent.click(overlay);
      
      expect(onClose).toHaveBeenCalled();
    });

    test('should not close modal when modal content clicked', async () => {
      const onClose = jest.fn();
      
      render(<VendorSelectorModal {...defaultProps} onClose={onClose} />);
      
      const modalContent = screen.getByRole('heading', { name: 'Select Vendor' }).closest('.vendor-modal-content');
      fireEvent.click(modalContent);
      
      expect(onClose).not.toHaveBeenCalled();
    });
  });

  describe('Callback Integration', () => {
    test('should call onVendorsUpdate after vendor creation', async () => {
      const onVendorsUpdate = jest.fn();
      const updatedVendors = [...mockVendors, { id: 5, name: 'New Vendor', is_system_vendor: false }];
      
      // Mock vendorService.getVendors to return updated vendors when called for refresh
      vendorService.getVendors.mockResolvedValue(updatedVendors);
      
      render(<VendorSelectorModal 
        {...defaultProps}
        onVendorsUpdate={onVendorsUpdate}
        vendors={mockVendors} // Pre-load initial vendors
      />);
      
      fireEvent.click(screen.getByText('Add New Vendor'));
      
      const input = screen.getByPlaceholderText('New vendor name...');
      await userEvent.type(input, 'New Test Vendor');
      
      fireEvent.click(screen.getByTestId('save-icon'));
      
      await waitFor(() => {
        expect(vendorService.createVendor).toHaveBeenCalledWith({ name: 'New Test Vendor' });
      });
      
      await waitFor(() => {
        expect(onVendorsUpdate).toHaveBeenCalledWith(updatedVendors);
      });
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