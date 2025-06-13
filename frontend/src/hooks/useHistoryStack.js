import { useState, useCallback, useRef } from 'react';

/**
 * Custom hook for managing undo/redo functionality with a history stack
 * Supports operation tracking and reversal for tree editing operations
 */
export const useHistoryStack = (maxHistorySize = 50) => {
  const [historyStack, setHistoryStack] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const isPerformingUndoRedo = useRef(false);

  // Add a new operation to the history stack
  const pushOperation = useCallback((operation) => {
    // Don't record operations if we're currently performing undo/redo
    if (isPerformingUndoRedo.current) {
      return;
    }

    setHistoryStack(prevStack => {
      // Remove any operations after current index (when adding new ops after undo)
      const newStack = prevStack.slice(0, currentIndex + 1);
      
      // Add the new operation
      newStack.push({
        ...operation,
        timestamp: Date.now(),
        id: `op_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      });
      
      // Trim stack if it exceeds max size
      if (newStack.length > maxHistorySize) {
        return newStack.slice(1);
      }
      
      return newStack;
    });
    
    setCurrentIndex(prevIndex => {
      const newIndex = Math.min(prevIndex + 1, maxHistorySize - 1);
      return newIndex;
    });
  }, [currentIndex, maxHistorySize]);

  // Perform undo operation
  const undo = useCallback(async () => {
    if (currentIndex < 0 || currentIndex >= historyStack.length) {
      return null;
    }

    const operation = historyStack[currentIndex];
    
    isPerformingUndoRedo.current = true;
    
    try {
      // Execute the reverse operation
      let result = null;
      if (operation.reverseOperation && typeof operation.reverseOperation === 'function') {
        result = await operation.reverseOperation();
      }
      
      setCurrentIndex(prevIndex => prevIndex - 1);
      return { operation, result };
    } finally {
      isPerformingUndoRedo.current = false;
    }
  }, [currentIndex, historyStack]);

  // Perform redo operation
  const redo = useCallback(async () => {
    const nextIndex = currentIndex + 1;
    if (nextIndex >= historyStack.length) {
      return null;
    }

    const operation = historyStack[nextIndex];
    
    isPerformingUndoRedo.current = true;
    
    try {
      // Execute the forward operation
      let result = null;
      if (operation.forwardOperation && typeof operation.forwardOperation === 'function') {
        result = await operation.forwardOperation();
      }
      
      setCurrentIndex(nextIndex);
      return { operation, result };
    } finally {
      isPerformingUndoRedo.current = false;
    }
  }, [currentIndex, historyStack]);

  // Clear the history stack
  const clearHistory = useCallback(() => {
    setHistoryStack([]);
    setCurrentIndex(-1);
  }, []);

  // Get current operation status
  const getStatus = useCallback(() => {
    return {
      canUndo: currentIndex >= 0,
      canRedo: currentIndex + 1 < historyStack.length,
      historyLength: historyStack.length,
      currentIndex,
      isPerformingOperation: isPerformingUndoRedo.current
    };
  }, [currentIndex, historyStack.length]);

  // Get preview of next undo/redo operation
  const getOperationPreview = useCallback((direction = 'undo') => {
    if (direction === 'undo' && currentIndex >= 0) {
      return historyStack[currentIndex];
    } else if (direction === 'redo' && currentIndex + 1 < historyStack.length) {
      return historyStack[currentIndex + 1];
    }
    return null;
  }, [currentIndex, historyStack]);

  return {
    pushOperation,
    undo,
    redo,
    clearHistory,
    getStatus,
    getOperationPreview,
    historyStack: historyStack.slice(0, currentIndex + 1) // Only show operations up to current index
  };
};

/**
 * Operation factory functions for common tree operations
 */
export const createCategoryOperation = {
  create: (categoryData, createFn, deleteFn) => ({
    type: 'CREATE_CATEGORY',
    description: `Create category "${categoryData.name}"`,
    data: categoryData,
    forwardOperation: () => createFn(categoryData),
    reverseOperation: () => deleteFn(categoryData.id)
  }),

  rename: (categoryId, oldName, newName, renameFn) => ({
    type: 'RENAME_CATEGORY',
    description: `Rename "${oldName}" to "${newName}"`,
    data: { categoryId, oldName, newName },
    forwardOperation: () => renameFn(categoryId, newName),
    reverseOperation: () => renameFn(categoryId, oldName)
  }),

  move: (categoryId, oldParentId, newParentId, categoryName, moveFn) => ({
    type: 'MOVE_CATEGORY',
    description: `Move "${categoryName}" to ${newParentId ? `category ${newParentId}` : 'root'}`,
    data: { categoryId, oldParentId, newParentId, categoryName },
    forwardOperation: () => moveFn(categoryId, newParentId),
    reverseOperation: () => moveFn(categoryId, oldParentId)
  }),

  delete: (categoryData, deleteFn, createFn) => ({
    type: 'DELETE_CATEGORY',
    description: `Delete category "${categoryData.name}"`,
    data: categoryData,
    forwardOperation: () => deleteFn(categoryData.id),
    reverseOperation: () => createFn({
      name: categoryData.name,
      parent: categoryData.parent,
      description: categoryData.description
    })
  })
};

export default useHistoryStack; 