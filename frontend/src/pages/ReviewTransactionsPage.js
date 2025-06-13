import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ReviewProvider, useReview } from '../contexts/ReviewContext';
import ReviewInterface from '../components/transactions/ReviewInterface';
import {
  fetchPendingReview,
  bulkCategorize,
  bulkReject,
  submitReviewComplete,
  saveReviewProgress,
  loadReviewProgress
} from '../services/transactionReview';
import categoryService from '../services/categories';
import { groupTransactionsByVendor } from '../utils/reviewWorkflow';
import './ReviewTransactionsPage.css';

// Main review page component that wraps everything in the context
const ReviewTransactionsPage = () => {
  return (
    <ReviewProvider>
      <ReviewTransactionsContent />
    </ReviewProvider>
  );
};

// Content component that uses the review context
const ReviewTransactionsContent = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const {
    // State
    vendorGroups,
    categories,
    loading,
    processing,
    error,
    isReviewComplete,
    sessionId,
    selectedVendorGroups,
    categoryChanges,
    approvedGroups,
    rejectedGroups,
    reviewProgress,

    // Actions
    setLoading,
    setProcessing,
    setError,
    clearError,
    loadVendorGroups,
    loadCategories,
    updateVendorCategory,
    approveVendorGroup,
    rejectVendorGroup,
    bulkApprove,
    bulkReject,
    completeReview,
    saveProgress,
    loadProgress,

    // Computed
    selectedVendorGroupIds,
    hasSelectedGroups,
    isReviewCompleted,
    canCompleteReview,
    generateCompletionSummary,
    validateBulkOperation
  } = useReview();

  const [categories_local, setCategories_local] = useState([]);
  const [initialLoadComplete, setInitialLoadComplete] = useState(false);

  // Extract session ID or upload ID from URL params or location state
  const urlParams = new URLSearchParams(location.search);
  const uploadSessionId = urlParams.get('session') || location.state?.sessionId || 'default_session';

  // Load categories on component mount
  useEffect(() => {
    const loadCategoriesData = async () => {
      try {
        const categoriesData = await categoryService.getCategories();
        const availableCategories = categoriesData.filter(cat => !cat.parentId); // Only root categories for simplicity
        setCategories_local(availableCategories);
        loadCategories(availableCategories);
      } catch (error) {
        console.error('Failed to load categories:', error);
        setError('Failed to load categories. Please refresh the page.');
      }
    };

    loadCategoriesData();
  }, [loadCategories, setError]);

  // Load pending review data on component mount
  useEffect(() => {
    const loadReviewData = async () => {
      if (initialLoadComplete) return;

      setLoading(true);
      clearError();

      try {
        // Try to load saved progress first
        const savedProgress = loadProgress(uploadSessionId);
        
        // Fetch pending review data
        const response = await fetchPendingReview();
        
        if (!response.success) {
          throw new Error(response.error);
        }

        const { vendorGroups: rawVendorGroups, metadata } = response;
        
        // Group transactions by vendor if not already grouped
        const groupedVendors = Array.isArray(rawVendorGroups) && rawVendorGroups.length > 0
          ? rawVendorGroups
          : groupTransactionsByVendor(rawVendorGroups || []);

        // Load vendor groups into context
        loadVendorGroups(groupedVendors, uploadSessionId);
        
        setInitialLoadComplete(true);
      } catch (error) {
        console.error('Failed to load review data:', error);
        setError(error.message || 'Failed to load review data. Please try again.');
      } finally {
        setLoading(false);
      }
    };

    loadReviewData();
  }, [
    uploadSessionId,
    initialLoadComplete,
    setLoading,
    clearError,
    setError,
    loadVendorGroups,
    loadProgress
  ]);

  // Auto-save progress periodically
  useEffect(() => {
    if (!sessionId || isReviewComplete || !initialLoadComplete) return;

    const autoSave = () => {
      saveProgress();
    };

    const interval = setInterval(autoSave, 30000); // Save every 30 seconds
    return () => clearInterval(interval);
  }, [sessionId, isReviewComplete, initialLoadComplete, saveProgress]);

  // Handle individual vendor category change
  const handleVendorCategoryChange = useCallback(async (vendorGroupId, categoryId) => {
    updateVendorCategory(vendorGroupId, categoryId);
  }, [updateVendorCategory]);

  // Handle individual vendor approve
  const handleVendorApprove = useCallback(async (vendorGroupId) => {
    setProcessing(true);
    try {
      const vendorGroup = vendorGroups.find(g => g.id === vendorGroupId);
      if (!vendorGroup) {
        throw new Error('Vendor group not found');
      }

      const categoryId = categoryChanges.get(vendorGroupId) || vendorGroup.suggested_category_id;
      if (!categoryId) {
        throw new Error('No category assigned for this vendor group');
      }

      // Call API to categorize the vendor group
      const response = await bulkCategorize(
        [vendorGroupId],
        { [vendorGroupId]: categoryId },
        { createRules: true, applyToFuture: true }
      );

      if (!response.success) {
        throw new Error(response.error);
      }

      approveVendorGroup(vendorGroupId);
    } catch (error) {
      console.error('Failed to approve vendor group:', error);
      setError(error.message || 'Failed to approve vendor group');
    } finally {
      setProcessing(false);
    }
  }, [vendorGroups, categoryChanges, setProcessing, setError, approveVendorGroup]);

  // Handle individual vendor reject
  const handleVendorReject = useCallback(async (vendorGroupId) => {
    setProcessing(true);
    try {
      const response = await bulkReject([vendorGroupId], 'Rejected during review');

      if (!response.success) {
        throw new Error(response.error);
      }

      rejectVendorGroup(vendorGroupId);
    } catch (error) {
      console.error('Failed to reject vendor group:', error);
      setError(error.message || 'Failed to reject vendor group');
    } finally {
      setProcessing(false);
    }
  }, [setProcessing, setError, rejectVendorGroup]);

  // Handle bulk approve
  const handleBulkApprove = useCallback(async () => {
    if (!hasSelectedGroups) return;

    const validation = validateBulkOperation('approve');
    if (!validation.isValid) {
      setError(validation.errors.join(', '));
      return;
    }

    setProcessing(true);
    try {
      // Build category mappings for selected groups
      const categoryMappings = {};
      selectedVendorGroupIds.forEach(vendorGroupId => {
        const vendorGroup = vendorGroups.find(g => g.id === vendorGroupId);
        const categoryId = categoryChanges.get(vendorGroupId) || vendorGroup?.suggested_category_id;
        if (categoryId) {
          categoryMappings[vendorGroupId] = categoryId;
        }
      });

      const response = await bulkCategorize(
        selectedVendorGroupIds,
        categoryMappings,
        { createRules: true, applyToFuture: true }
      );

      if (!response.success) {
        throw new Error(response.error);
      }

      bulkApprove(selectedVendorGroupIds);
    } catch (error) {
      console.error('Failed to bulk approve:', error);
      setError(error.message || 'Failed to approve selected vendor groups');
    } finally {
      setProcessing(false);
    }
  }, [
    hasSelectedGroups,
    validateBulkOperation,
    selectedVendorGroupIds,
    vendorGroups,
    categoryChanges,
    setProcessing,
    setError,
    bulkApprove
  ]);

  // Handle bulk reject
  const handleBulkReject = useCallback(async () => {
    if (!hasSelectedGroups) return;

    const validation = validateBulkOperation('reject');
    if (!validation.isValid) {
      setError(validation.errors.join(', '));
      return;
    }

    setProcessing(true);
    try {
      const response = await bulkReject(selectedVendorGroupIds, 'Bulk rejected during review');

      if (!response.success) {
        throw new Error(response.error);
      }

      bulkReject(selectedVendorGroupIds);
    } catch (error) {
      console.error('Failed to bulk reject:', error);
      setError(error.message || 'Failed to reject selected vendor groups');
    } finally {
      setProcessing(false);
    }
  }, [
    hasSelectedGroups,
    validateBulkOperation,
    selectedVendorGroupIds,
    setProcessing,
    setError,
    bulkReject
  ]);

  // Handle save for later
  const handleSaveForLater = useCallback(async () => {
    setProcessing(true);
    try {
      const success = saveProgress();
      if (success) {
        navigate('/dashboard', { 
          state: { 
            message: 'Review progress saved. You can continue later from the dashboard.',
            type: 'success'
          }
        });
      } else {
        throw new Error('Failed to save progress');
      }
    } catch (error) {
      console.error('Failed to save progress:', error);
      setError('Failed to save progress. Please try again.');
    } finally {
      setProcessing(false);
    }
  }, [saveProgress, navigate, setProcessing, setError]);

  // Handle return to dashboard
  const handleReturnToDashboard = useCallback(() => {
    navigate('/dashboard');
  }, [navigate]);

  // Handle finish review
  const handleFinishReview = useCallback(async () => {
    if (!canCompleteReview) return;

    setProcessing(true);
    try {
      const summary = generateCompletionSummary();
      const response = await submitReviewComplete(summary);

      if (!response.success) {
        throw new Error(response.error);
      }

      completeReview();

      // Navigate to dashboard with success message
      navigate('/dashboard', {
        state: {
          message: `Review completed successfully! Processed ${summary.totalGroupsReviewed} vendor groups with ${summary.totalTransactionsProcessed} transactions.`,
          type: 'success'
        }
      });
    } catch (error) {
      console.error('Failed to complete review:', error);
      setError(error.message || 'Failed to complete review');
    } finally {
      setProcessing(false);
    }
  }, [
    canCompleteReview,
    generateCompletionSummary,
    setProcessing,
    setError,
    completeReview,
    navigate
  ]);

  // Handle rule management (placeholder implementations)
  const handleCreateRule = useCallback(async (vendorGroupId, ruleData) => {
    // TODO: Implement rule creation
    console.log('Create rule for vendor group:', vendorGroupId, ruleData);
  }, []);

  const handleUpdateRule = useCallback(async (vendorGroupId, ruleData) => {
    // TODO: Implement rule update
    console.log('Update rule for vendor group:', vendorGroupId, ruleData);
  }, []);

  const handleDeleteRule = useCallback(async (vendorGroupId) => {
    // TODO: Implement rule deletion
    console.log('Delete rule for vendor group:', vendorGroupId);
  }, []);

  // Show loading state
  if (loading) {
    return (
      <div className="review-page">
        <div className="review-page-loading">
          <div className="loading-spinner"></div>
          <p>Loading transaction review data...</p>
        </div>
      </div>
    );
  }

  // Show error state
  if (error) {
    return (
      <div className="review-page">
        <div className="review-page-error">
          <h2>Error Loading Review</h2>
          <p>{error}</p>
          <div className="error-actions">
            <button onClick={() => window.location.reload()} className="btn btn-primary">
              Retry
            </button>
            <button onClick={handleReturnToDashboard} className="btn btn-secondary">
              Return to Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Show empty state
  if (!vendorGroups || vendorGroups.length === 0) {
    return (
      <div className="review-page">
        <div className="review-page-empty">
          <h2>No Transactions to Review</h2>
          <p>All transactions have been processed or there are no pending auto-assignments to review.</p>
          <button onClick={handleReturnToDashboard} className="btn btn-primary">
            Return to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="review-page">
      <div className="review-page-header">
        <h1>Review Auto-Assigned Transactions</h1>
        <p>Review and confirm the automatically assigned categories for your uploaded transactions.</p>
      </div>

      <ReviewInterface
        vendorGroups={vendorGroups}
        availableCategories={categories_local}
        selectedVendorGroups={selectedVendorGroups}
        categoryChanges={categoryChanges}
        reviewProgress={reviewProgress}
        loading={processing}
        error={error}
        onVendorSelect={(vendorGroupId) => {
          // Handle vendor selection if needed
        }}
        onVendorCategoryChange={handleVendorCategoryChange}
        onVendorApprove={handleVendorApprove}
        onVendorReject={handleVendorReject}
        onVendorModify={(vendorGroupId) => {
          // Handle vendor modification if needed
        }}
        onBulkApprove={handleBulkApprove}
        onBulkReject={handleBulkReject}
        onSaveForLater={handleSaveForLater}
        onReturnToDashboard={handleReturnToDashboard}
        onFinishReview={handleFinishReview}
        onCreateRule={handleCreateRule}
        onUpdateRule={handleUpdateRule}
        onDeleteRule={handleDeleteRule}
        onClearError={clearError}
        canCompleteReview={canCompleteReview}
        isReviewCompleted={isReviewCompleted}
      />
    </div>
  );
};

export default ReviewTransactionsPage; 