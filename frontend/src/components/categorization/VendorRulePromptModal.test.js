import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import VendorRulePromptModal from './VendorRulePromptModal';

describe('VendorRulePromptModal', () => {
  const mockOnClose = jest.fn();
  const mockOnDismiss = jest.fn();
  const mockOnConfirm = jest.fn();

  const defaultProps = {
    isOpen: true,
    onClose: mockOnClose,
    onDismiss: mockOnDismiss,
    vendors: ['Vendor A', 'Vendor B', 'Vendor C'],
    category: 'Test Category',
    onConfirm: mockOnConfirm,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('renders modal with all vendors checked by default', () => {
    render(<VendorRulePromptModal {...defaultProps} />);
    
    expect(screen.getByText('Create Vendor Rules')).toBeInTheDocument();
    expect(screen.getByText(/Select which vendors should be automatically assigned to category/)).toBeInTheDocument();
    expect(screen.getByText('Test Category')).toBeInTheDocument();
    
    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes).toHaveLength(3);
    
    checkboxes.forEach(checkbox => {
      expect(checkbox).toBeChecked();
    });
  });

  test('shows single vendor layout for one vendor', () => {
    const singleVendorProps = {
      ...defaultProps,
      vendors: ['Single Vendor'],
    };
    
    render(<VendorRulePromptModal {...singleVendorProps} />);
    
    expect(screen.getByText('Create Vendor Rule')).toBeInTheDocument();
    expect(screen.getByText(/Always assign/)).toBeInTheDocument();
    expect(screen.getByText('Single Vendor')).toBeInTheDocument();
    expect(screen.getByText('Test Category')).toBeInTheDocument();
    
    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes).toHaveLength(1);
    expect(checkboxes[0]).toBeChecked();
  });

  test('allows individual vendor selection/deselection', () => {
    render(<VendorRulePromptModal {...defaultProps} />);
    
    const checkboxes = screen.getAllByRole('checkbox');
    
    // Uncheck the first vendor
    fireEvent.click(checkboxes[0]);
    expect(checkboxes[0]).not.toBeChecked();
    expect(checkboxes[1]).toBeChecked();
    expect(checkboxes[2]).toBeChecked();
    
    // Check it again
    fireEvent.click(checkboxes[0]);
    expect(checkboxes[0]).toBeChecked();
  });

  test('select all button toggles all vendors', () => {
    render(<VendorRulePromptModal {...defaultProps} />);
    
    const selectAllButton = screen.getByText('Deselect All');
    const checkboxes = screen.getAllByRole('checkbox');
    
    // All should be checked initially
    checkboxes.forEach(checkbox => {
      expect(checkbox).toBeChecked();
    });
    
    // Click deselect all
    fireEvent.click(selectAllButton);
    checkboxes.forEach(checkbox => {
      expect(checkbox).not.toBeChecked();
    });
    
    // Button text should change to "Select All"
    expect(screen.getByText('Select All')).toBeInTheDocument();
    
    // Click select all
    fireEvent.click(screen.getByText('Select All'));
    checkboxes.forEach(checkbox => {
      expect(checkbox).toBeChecked();
    });
  });

  test('updates rule explanation based on selection', () => {
    render(<VendorRulePromptModal {...defaultProps} />);
    
    // Initially shows explanation for 3 vendors
    expect(screen.getByText('This will create 3 vendor rules that will automatically categorize future transactions from the selected vendors.')).toBeInTheDocument();
    
    // Deselect all
    const selectAllButton = screen.getByText('Deselect All');
    fireEvent.click(selectAllButton);
    
    expect(screen.getByText('No vendors selected. No rules will be created.')).toBeInTheDocument();
    
    // Select one vendor
    const checkboxes = screen.getAllByRole('checkbox');
    fireEvent.click(checkboxes[0]);
    
    expect(screen.getByText('This will create a vendor rule that will automatically categorize future transactions from this vendor.')).toBeInTheDocument();
  });

  test('button text changes based on selection', () => {
    render(<VendorRulePromptModal {...defaultProps} />);
    
    // Initially shows "Create 3 Rules"
    expect(screen.getByText('Create 3 Rules')).toBeInTheDocument();
    
    // Deselect all
    const selectAllButton = screen.getByText('Deselect All');
    fireEvent.click(selectAllButton);
    
    // Button shows "Don't Create Rules" when no vendors are selected
    expect(screen.getByText("Don't Create Rules")).toBeInTheDocument();
    
    // Select one vendor
    const checkboxes = screen.getAllByRole('checkbox');
    fireEvent.click(checkboxes[0]);
    
    expect(screen.getByText('Create Rule')).toBeInTheDocument();
  });

  test('calls onConfirm with selected vendors', async () => {
    render(<VendorRulePromptModal {...defaultProps} />);
    
    // Uncheck the first vendor
    const checkboxes = screen.getAllByRole('checkbox');
    fireEvent.click(checkboxes[0]);
    
    // Click confirm
    const confirmButton = screen.getByText('Create 2 Rules');
    fireEvent.click(confirmButton);
    
    await waitFor(() => {
      expect(mockOnConfirm).toHaveBeenCalledWith(['Vendor B', 'Vendor C']);
    });
  });

  test('calls onClose when no vendors selected and confirm clicked', async () => {
    render(<VendorRulePromptModal {...defaultProps} />);
    
    // Deselect all
    const selectAllButton = screen.getByText('Deselect All');
    fireEvent.click(selectAllButton);
    
    // Click the "Don't Create Rules" button
    const dontCreateButton = screen.getByText("Don't Create Rules");
    fireEvent.click(dontCreateButton);
    
    await waitFor(() => {
      expect(mockOnClose).toHaveBeenCalled();
    });
  });

  test('shows correct button text for single vendor selection', () => {
    render(<VendorRulePromptModal {...defaultProps} />);
    
    // Deselect all first
    const selectAllButton = screen.getByText('Deselect All');
    fireEvent.click(selectAllButton);
    
    // Select exactly one vendor
    const checkboxes = screen.getAllByRole('checkbox');
    fireEvent.click(checkboxes[0]);
    
    // Should show "Create Rule" (singular)
    expect(screen.getByText('Create Rule')).toBeInTheDocument();
  });

  test('shows correct button text for multiple vendor selection', () => {
    render(<VendorRulePromptModal {...defaultProps} />);
    
    // All vendors should be selected by default
    expect(screen.getByText('Create 3 Rules')).toBeInTheDocument();
    
    // Deselect one vendor (leaving 2)
    const checkboxes = screen.getAllByRole('checkbox');
    fireEvent.click(checkboxes[0]);
    
    // Should show "Create 2 Rules"
    expect(screen.getByText('Create 2 Rules')).toBeInTheDocument();
  });

  test('does not render when isOpen is false', () => {
    render(<VendorRulePromptModal {...defaultProps} isOpen={false} />);
    
    expect(screen.queryByText('Create Vendor Rules')).not.toBeInTheDocument();
  });
}); 