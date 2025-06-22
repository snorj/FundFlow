import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import VendorRenameModal from './VendorRenameModal';
import VendorAssignmentModal from './VendorAssignmentModal';
import vendorMappingService from '../../services/vendorMapping';

// Mock the vendor mapping service
jest.mock('../../services/vendorMapping');

describe('VendorRenameModal', () => {
  const defaultProps = {
    isOpen: true,
    onClose: jest.fn(),
    vendor: 'Amazon',
    onRename: jest.fn(),
    onSuccess: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders correctly when open', () => {
    render(<VendorRenameModal {...defaultProps} />);
    
    expect(screen.getByText('Rename Vendor')).toBeInTheDocument();
    expect(screen.getByText('Current Name:')).toBeInTheDocument();
    expect(screen.getByText('Amazon')).toBeInTheDocument();
    expect(screen.getByLabelText(/New Vendor Name/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
  });

  it('does not render when closed', () => {
    render(<VendorRenameModal {...defaultProps} isOpen={false} />);
    
    expect(screen.queryByText('Rename Vendor')).not.toBeInTheDocument();
  });

  it('validates that new name is different from current name', async () => {
    const user = userEvent.setup();
    render(<VendorRenameModal {...defaultProps} />);
    
    const input = screen.getByLabelText(/New Vendor Name/);
    const saveButton = screen.getByRole('button', { name: 'Save' });
    
    await user.type(input, 'Amazon'); // Same as current name
    await user.click(saveButton);
    
    expect(screen.getByText('The new name must be different from the current name')).toBeInTheDocument();
    expect(vendorMappingService.renameVendor).not.toHaveBeenCalled();
  });

  it('submits form with valid data', async () => {
    const user = userEvent.setup();
    const mockResult = { id: 1, original_name: 'Amazon', mapped_vendor: 'Amazon Inc' };
    vendorMappingService.renameVendor.mockResolvedValue(mockResult);
    
    render(<VendorRenameModal {...defaultProps} />);
    
    const input = screen.getByLabelText(/New Vendor Name/);
    const saveButton = screen.getByRole('button', { name: 'Save' });
    
    await user.type(input, 'Amazon Inc');
    await user.click(saveButton);
    
    expect(vendorMappingService.renameVendor).toHaveBeenCalledWith('Amazon', 'Amazon Inc');
    
    await waitFor(() => {
      expect(defaultProps.onRename).toHaveBeenCalledWith('Amazon', 'Amazon Inc');
      expect(defaultProps.onSuccess).toHaveBeenCalledWith(mockResult);
      expect(defaultProps.onClose).toHaveBeenCalled();
    });
  });

  it('handles API errors', async () => {
    const user = userEvent.setup();
    const errorMessage = 'This vendor name already exists. Please use a different name.';
    vendorMappingService.renameVendor.mockRejectedValue(new Error(errorMessage));
    
    render(<VendorRenameModal {...defaultProps} />);
    
    const input = screen.getByLabelText(/New Vendor Name/);
    const saveButton = screen.getByRole('button', { name: 'Save' });
    
    await user.type(input, 'Existing Vendor');
    await user.click(saveButton);
    
    await waitFor(() => {
      expect(screen.getByText(errorMessage)).toBeInTheDocument();
    });
    
    expect(defaultProps.onClose).not.toHaveBeenCalled();
  });
});

describe('VendorAssignmentModal', () => {
  const defaultProps = {
    isOpen: true,
    onClose: jest.fn(),
    vendor: 'AMZN',
    existingVendors: ['Amazon', 'Apple', 'Google'],
    onAssign: jest.fn(),
    onSuccess: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders correctly when open', () => {
    render(<VendorAssignmentModal {...defaultProps} />);
    
    expect(screen.getByText('Assign to Existing Vendor')).toBeInTheDocument();
    expect(screen.getByText('Current Vendor:')).toBeInTheDocument();
    expect(screen.getByText('AMZN')).toBeInTheDocument();
    expect(screen.getByLabelText(/Select Existing Vendor/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Assign' })).toBeInTheDocument();
  });

  it('does not render when closed', () => {
    render(<VendorAssignmentModal {...defaultProps} isOpen={false} />);
    
    expect(screen.queryByText('Assign to Existing Vendor')).not.toBeInTheDocument();
  });
  
  it('submits form with valid data', async () => {
    const user = userEvent.setup();
    const mockResult = { id: 1, original_name: 'AMZN', mapped_vendor: 'Amazon' };
    vendorMappingService.assignToExisting.mockResolvedValue(mockResult);
    vendorMappingService.checkVendorRules.mockResolvedValue(false);
    
    render(<VendorAssignmentModal {...defaultProps} />);
    
    const select = screen.getByLabelText(/Select Existing Vendor/);
    const assignButton = screen.getByRole('button', { name: 'Assign' });
    
    await user.selectOptions(select, 'Amazon');
    
    await waitFor(() => {
      expect(assignButton).not.toBeDisabled();
    });
    
    await user.click(assignButton);
    
    expect(vendorMappingService.assignToExisting).toHaveBeenCalledWith('AMZN', 'Amazon');
    
    await waitFor(() => {
      expect(defaultProps.onAssign).toHaveBeenCalledWith('AMZN', 'Amazon');
      expect(defaultProps.onSuccess).toHaveBeenCalledWith(mockResult);
      expect(defaultProps.onClose).toHaveBeenCalled();
    });
  });
}); 