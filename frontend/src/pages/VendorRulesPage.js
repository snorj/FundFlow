import React, { useState, useEffect } from 'react';
import { FiLoader, FiEdit3, FiTrash2, FiSearch, FiFilter } from 'react-icons/fi';
import vendorRuleService from '../services/vendorRules';
import categoryService from '../services/categories';
import CategorySelectorModal from '../components/categorization/CategorySelectorModal';
import './VendorRulesPage.css';

const VendorRulesPage = () => {
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [categories, setCategories] = useState([]);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [currentRule, setCurrentRule] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    fetchVendorRules();
    fetchCategories();
  }, []);

  const fetchVendorRules = async () => {
    setLoading(true);
    try {
      const response = await vendorRuleService.getVendorRules();
      setRules(response);
      setError('');
    } catch (error) {
      console.error('Error fetching vendor rules:', error);
      setError('Failed to load vendor rules. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const fetchCategories = async () => {
    try {
      const response = await categoryService.getCategories();
      setCategories(response);
    } catch (error) {
      console.error('Error fetching categories:', error);
      setError('Failed to load categories.');
    }
  };

  const handleDeleteRule = async (ruleId, vendorName) => {
    if (window.confirm(`Are you sure you want to delete the vendor rule for "${vendorName}"?`)) {
      try {
        await vendorRuleService.deleteVendorRule(ruleId);
        setRules(rules.filter(rule => rule.id !== ruleId));
        setSuccess('Vendor rule deleted successfully.');
        setTimeout(() => setSuccess(''), 3000);
      } catch (error) {
        console.error('Error deleting vendor rule:', error);
        setError('Failed to delete vendor rule. Please try again.');
        setTimeout(() => setError(''), 5000);
      }
    }
  };

  const handleEditRule = (rule) => {
    setCurrentRule(rule);
    setIsEditModalOpen(true);
  };

  const handleUpdateRule = async (categoryId) => {
    if (!currentRule || !categoryId) return;

    try {
      const updatedRule = await vendorRuleService.updateVendorRule(currentRule.id, { 
        category_id: categoryId 
      });
      
      // Update rule in state
      setRules(rules.map(rule => 
        rule.id === currentRule.id 
          ? { ...rule, category_name: updatedRule.category_name }
          : rule
      ));
      
      setIsEditModalOpen(false);
      setCurrentRule(null);
      setSuccess('Vendor rule updated successfully.');
      setTimeout(() => setSuccess(''), 3000);
    } catch (error) {
      console.error('Error updating vendor rule:', error);
      setError('Failed to update vendor rule. Please try again.');
      setTimeout(() => setError(''), 5000);
    }
  };

  const handleCloseEditModal = () => {
    setIsEditModalOpen(false);
    setCurrentRule(null);
  };

  const filteredRules = rules.filter(rule => {
    const matchesSearch = rule.vendor_name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = filterCategory ? rule.category_name === filterCategory : true;
    return matchesSearch && matchesCategory;
  });

  // Get unique category names for the filter dropdown
  const uniqueCategories = [...new Set(rules.map(rule => rule.category_name))].sort();

  return (
    <div className="vendor-rules-page">
      <div className="page-header">
        <h1>Vendor Rules Management</h1>
        <p>Manage automatic categorization rules for vendors</p>
      </div>

      {/* Status Messages */}
      {error && (
        <div className="alert alert-error">
          {error}
        </div>
      )}

      {success && (
        <div className="alert alert-success">
          {success}
        </div>
      )}

      {/* Filters */}
      <div className="filters-section">
        <div className="search-container">
          <FiSearch className="search-icon" />
          <input
            type="text"
            placeholder="Search vendors..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="search-input"
          />
        </div>
        
        <div className="filter-container">
          <FiFilter className="filter-icon" />
          <select 
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className="category-filter"
          >
            <option value="">All Categories</option>
            {uniqueCategories.map(category => (
              <option key={category} value={category}>{category}</option>
            ))}
          </select>
        </div>

        <div className="results-count">
          {filteredRules.length} rule{filteredRules.length !== 1 ? 's' : ''} found
        </div>
      </div>

      {/* Loading State */}
      {loading ? (
        <div className="loading-container">
          <FiLoader className="loading-spinner" />
          <span>Loading vendor rules...</span>
        </div>
      ) : (
        /* Rules Table */
        <div className="table-container">
          <table className="vendor-rules-table">
            <thead>
              <tr>
                <th>Vendor Name</th>
                <th>Category</th>
                <th>Type</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredRules.length > 0 ? (
                filteredRules.map(rule => (
                  <tr key={rule.id}>
                    <td className="vendor-name">{rule.vendor_name}</td>
                    <td className="category-name">{rule.category_name}</td>
                    <td className="rule-type">
                      <span className={`rule-badge ${rule.is_persistent ? 'persistent' : 'manual'}`}>
                        {rule.is_persistent ? 'Auto' : 'Manual'}
                      </span>
                    </td>
                    <td className="created-date">
                      {new Date(rule.created_at).toLocaleDateString()}
                    </td>
                    <td className="actions">
                      <button 
                        onClick={() => handleEditRule(rule)}
                        className="action-button edit-button"
                        title="Edit category assignment"
                      >
                        <FiEdit3 />
                        Edit
                      </button>
                      <button 
                        onClick={() => handleDeleteRule(rule.id, rule.vendor_name)}
                        className="action-button delete-button"
                        title="Delete rule"
                      >
                        <FiTrash2 />
                        Delete
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="5" className="no-results">
                    {searchTerm || filterCategory 
                      ? 'No vendor rules found matching your criteria.' 
                      : 'No vendor rules exist yet. Rules are created automatically when you categorize transactions.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Edit Modal */}
      {isEditModalOpen && currentRule && (
        <CategorySelectorModal
          isOpen={isEditModalOpen}
          onClose={handleCloseEditModal}
          onSelectCategory={handleUpdateRule}
          categories={categories}
          initialCategory={categories.find(c => c.name === currentRule.category_name)?.id}
          modalTitle={`Edit Rule for "${currentRule.vendor_name}"`}
          selectionMode="confirm"
        />
      )}
    </div>
  );
};

export default VendorRulesPage; 