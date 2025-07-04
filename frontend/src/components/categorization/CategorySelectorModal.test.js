import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import CategorySelectorModal from './CategorySelectorModal';

// Mock the category service
jest.mock('../../services/categories', () => ({
  createCategory: jest.fn(),
  getCategories: jest.fn(),
}));

// Mock CategoryTreeNode to simplify testing
jest.mock('./CategoryTreeNode', () => {
  return function MockCategoryTreeNode({ item, onSelectNode, pendingSelectionId }) {
    const isSelected = pendingSelectionId === item.id;
    return (
      <div 
        data-testid={`category-node-${item.id}`}
        className={`mock-category-node ${isSelected ? 'selected' : ''}`}
        onClick={() => onSelectNode && onSelectNode(item.id)}
      >
        {item.name}
      </div>
    );
  };
});

const mockCategories = [
  { id: 1, name: 'Food & Dining', parent: null, is_custom: false, user: null },
  { id: 2, name: 'Restaurants', parent: 1, is_custom: false, user: null },
  { id: 3, name: 'Custom Category', parent: null, is_custom: true, user: 1 },
  { id: 4, name: 'Custom Sub', parent: 3, is_custom: true, user: 1 },
];

const defaultProps = {
  isOpen: true,
  onClose: jest.fn(),
  onSelectCategory: jest.fn(),
  categories: mockCategories,
};

describe('CategorySelectorModal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Backward Compatibility', () => {
    test('works with legacy props', () => {
      const legacyProps = {
        isOpen: true,
        onClose: jest.fn(),
        onSelectCategory: jest.fn(),
        availableCategories: mockCategories, // Legacy prop name
        currentSelectedId: 1, // Legacy prop name
        onCategoriesUpdate: jest.fn(),
      };

      render(<CategorySelectorModal {...legacyProps} />);
      
      expect(screen.getByText('Select Category')).toBeInTheDocument(); // Default title
      // Use more flexible text matching for split elements
      expect(screen.getByText(/Selected:/)).toBeInTheDocument();
      // Check that the category appears in the selection preview specifically
      expect(screen.getByTestId('category-node-1')).toBeInTheDocument();
      expect(screen.getByTestId('category-node-1')).toHaveClass('selected');
    });

    test('defaults to confirm mode with footer', () => {
      render(<CategorySelectorModal {...defaultProps} />);
      
      expect(screen.getByText('Confirm Selection')).toBeInTheDocument();
      expect(screen.getByText('Cancel')).toBeInTheDocument();
    });
  });

  describe('Selection Modes', () => {
    test('immediate mode calls onSelectCategory immediately and closes modal', () => {
      const onSelectCategory = jest.fn();
      const onClose = jest.fn();
      
      render(
        <CategorySelectorModal
          {...defaultProps}
          selectionMode="immediate"
          onSelectCategory={onSelectCategory}
          onClose={onClose}
        />
      );

      // Should not show footer in immediate mode
      expect(screen.queryByText('Confirm Selection')).not.toBeInTheDocument();
      
      // Click on a category using the mocked component
      fireEvent.click(screen.getByTestId('category-node-1'));
      
      expect(onSelectCategory).toHaveBeenCalledWith(expect.objectContaining({ id: 1, name: 'Food & Dining' }));
      expect(onClose).toHaveBeenCalled();
    });

    test('confirm mode requires confirmation', () => {
      const onSelectCategory = jest.fn();
      
      render(
        <CategorySelectorModal
          {...defaultProps}
          selectionMode="confirm"
          onSelectCategory={onSelectCategory}
        />
      );

      // Click on a category using the mocked component
      fireEvent.click(screen.getByTestId('category-node-1'));
      
      // Should not call onSelectCategory yet
      expect(onSelectCategory).not.toHaveBeenCalled();
      
      // Click confirm
      fireEvent.click(screen.getByText('Confirm Selection'));
      
      expect(onSelectCategory).toHaveBeenCalledWith(expect.objectContaining({ id: 1, name: 'Food & Dining' }));
    });

    test('none mode disables selection', () => {
      const onSelectCategory = jest.fn();
      
      render(
        <CategorySelectorModal
          {...defaultProps}
          selectionMode="none"
          onSelectCategory={onSelectCategory}
        />
      );

      // Should not show selection preview
      expect(screen.queryByText(/Selected:/)).not.toBeInTheDocument();
      
      // Click on a category should not trigger selection (onSelectNode will be null/empty function)
      fireEvent.click(screen.getByTestId('category-node-1'));
      expect(onSelectCategory).not.toHaveBeenCalled();
    });
  });

  describe('UI Customization', () => {
    test('custom modal title', () => {
      render(
        <CategorySelectorModal
          {...defaultProps}
          modalTitle="Choose a Category"
        />
      );
      
      expect(screen.getByText('Choose a Category')).toBeInTheDocument();
    });

    test('modal size classes', () => {
      const { container, rerender } = render(
        <CategorySelectorModal {...defaultProps} modalSize="sm" />
      );
      
      expect(container.querySelector('.category-modal--sm')).toBeInTheDocument();
      
      rerender(<CategorySelectorModal {...defaultProps} modalSize="lg" />);
      expect(container.querySelector('.category-modal--lg')).toBeInTheDocument();
    });

    test('allowCreate controls creation UI', () => {
      const { rerender } = render(
        <CategorySelectorModal {...defaultProps} allowCreate={false} />
      );
      
      expect(screen.queryByText('Add Top-Level Category')).not.toBeInTheDocument();
      
      rerender(<CategorySelectorModal {...defaultProps} allowCreate={true} />);
      expect(screen.getByText('Add Top-Level Category')).toBeInTheDocument();
    });
  });

  describe('Category Filtering', () => {
    test('showSystemCategories controls system category display', () => {
      const { rerender } = render(
        <CategorySelectorModal {...defaultProps} showSystemCategories={false} />
      );
      
      expect(screen.queryByText('System Categories')).not.toBeInTheDocument();
      expect(screen.queryByTestId('category-node-1')).not.toBeInTheDocument();
      
      rerender(<CategorySelectorModal {...defaultProps} showSystemCategories={true} />);
      expect(screen.getByText('System Categories')).toBeInTheDocument();
      expect(screen.getByTestId('category-node-1')).toBeInTheDocument();
    });

    test('showUserCategories controls user category display', () => {
      const { rerender } = render(
        <CategorySelectorModal {...defaultProps} showUserCategories={false} />
      );
      
      expect(screen.queryByText('Custom Categories')).not.toBeInTheDocument();
      expect(screen.queryByTestId('category-node-3')).not.toBeInTheDocument();
      
      rerender(<CategorySelectorModal {...defaultProps} showUserCategories={true} />);
      expect(screen.getByText('Custom Categories')).toBeInTheDocument();
      expect(screen.getByTestId('category-node-3')).toBeInTheDocument();
    });
  });

  describe('State Management', () => {
    test('initialCategory sets initial selection', () => {
      render(
        <CategorySelectorModal
          {...defaultProps}
          initialCategory={3}
          selectionMode="confirm"
        />
      );
      
      // Check that the selection preview shows the correct category
      expect(screen.getByText(/Selected:/)).toBeInTheDocument();
      // Check that the correct category node is selected
      expect(screen.getByTestId('category-node-3')).toHaveClass('selected');
    });

    test('modal state resets when reopened', () => {
      const { rerender } = render(
        <CategorySelectorModal
          {...defaultProps}
          isOpen={false}
          initialCategory={1}
        />
      );
      
      // Modal is closed, should not render
      expect(screen.queryByText('Select Category')).not.toBeInTheDocument();
      
      // Open modal
      rerender(
        <CategorySelectorModal
          {...defaultProps}
          isOpen={true}
          initialCategory={3}
        />
      );
      
      expect(screen.getByText(/Selected:/)).toBeInTheDocument();
      // Check that the correct category node is selected
      expect(screen.getByTestId('category-node-3')).toHaveClass('selected');
    });
  });

  describe('Error Handling', () => {
    test('handles empty categories gracefully', () => {
      render(
        <CategorySelectorModal
          {...defaultProps}
          categories={[]}
        />
      );
      
      expect(screen.getByText('No categories available.')).toBeInTheDocument();
    });

    test('handles missing category in selection', () => {
      render(
        <CategorySelectorModal
          {...defaultProps}
          initialCategory={999} // Non-existent category
        />
      );
      
      expect(screen.getByText(/Selected:/)).toBeInTheDocument();
      expect(screen.getByText('None')).toBeInTheDocument();
    });
  });

  describe('Integration Scenarios', () => {
    test('manual transaction creation scenario', () => {
      const onSelectCategory = jest.fn();
      const onClose = jest.fn();
      
      render(
        <CategorySelectorModal
          isOpen={true}
          onClose={onClose}
          categories={mockCategories}
          selectionMode="immediate"
          onSelectCategory={onSelectCategory}
          modalTitle="Select Category"
          modalSize="md"
          allowCreate={true}
        />
      );

      // Should show custom title
      expect(screen.getByText('Select Category')).toBeInTheDocument();
      
      // Should show creation button
      expect(screen.getByText('Add Top-Level Category')).toBeInTheDocument();
      
      // Should not show footer (immediate mode)
      expect(screen.queryByText('Confirm Selection')).not.toBeInTheDocument();
      
      // Select category should immediately trigger callback
      fireEvent.click(screen.getByTestId('category-node-1'));
      expect(onSelectCategory).toHaveBeenCalledWith(expect.objectContaining({ id: 1, name: 'Food & Dining' }));
      expect(onClose).toHaveBeenCalled();
    });

    test('transaction categorization scenario (legacy)', () => {
      const onSelectCategory = jest.fn();
      
      render(
        <CategorySelectorModal
          isOpen={true}
          onClose={jest.fn()}
          availableCategories={mockCategories} // Legacy prop
          currentSelectedId={null} // Legacy prop
          onSelectCategory={onSelectCategory}
          onCategoriesUpdate={jest.fn()}
        />
      );

      // Should use defaults that match legacy behavior
      expect(screen.getByText('Select Category')).toBeInTheDocument(); // Default title
      expect(screen.getByText('Confirm Selection')).toBeInTheDocument(); // Confirm mode
      expect(screen.getByText('Add Top-Level Category')).toBeInTheDocument(); // Creation allowed
      
      // Should require confirmation
      fireEvent.click(screen.getByTestId('category-node-1'));
      expect(onSelectCategory).not.toHaveBeenCalled();
      
      fireEvent.click(screen.getByText('Confirm Selection'));
      expect(onSelectCategory).toHaveBeenCalledWith(expect.objectContaining({ id: 1, name: 'Food & Dining' }));
    });
  });
}); 