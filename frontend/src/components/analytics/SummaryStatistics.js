import React, { useState, useEffect, useCallback } from 'react';
import { analyticsService } from '../../services/analyticsService';
import { usePerformanceMonitor } from '../../hooks/usePerformanceMonitor';
import './SummaryStatistics.css';

const SummaryStatistics = ({ viewId, onError, autoRefresh = false, refreshInterval = 30000 }) => {
    const [summary, setSummary] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [lastUpdated, setLastUpdated] = useState(null);
    
    const { startTiming, endTiming } = usePerformanceMonitor('SummaryStatistics');

    const fetchSummary = useCallback(async () => {
        if (!viewId) return;

        const timingId = startTiming('fetchSummary');
        setLoading(true);
        setError(null);

        try {
            const data = await analyticsService.getSummary(viewId);
            setSummary(data);
            setLastUpdated(new Date());
            endTiming(timingId);
        } catch (err) {
            console.error('Failed to fetch summary statistics:', err);
            setError(err.message);
            if (onError) onError(err);
            endTiming(timingId, { error: err.message });
        } finally {
            setLoading(false);
        }
    }, [viewId, onError, startTiming, endTiming]);

    useEffect(() => {
        fetchSummary();
    }, [fetchSummary]);

    // Auto-refresh functionality
    useEffect(() => {
        if (!autoRefresh || !refreshInterval) return;

        const interval = setInterval(fetchSummary, refreshInterval);
        return () => clearInterval(interval);
    }, [autoRefresh, refreshInterval, fetchSummary]);

    const formatCurrency = useCallback((amount) => {
        return analyticsService.formatCurrency(amount);
    }, []);

    const formatDate = useCallback((date) => {
        if (!date) return 'N/A';
        return new Date(date).toLocaleDateString('en-AU', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    }, []);

    const getNetFlowColor = useCallback((netFlow) => {
        if (netFlow > 0) return 'positive';
        if (netFlow < 0) return 'negative';
        return 'neutral';
    }, []);

    const StatCard = React.memo(({ title, value, subtitle, icon, className = '', trend = null }) => (
        <div className={`stat-card ${className}`}>
            <div className="stat-card-header">
                <div className="stat-card-icon">{icon}</div>
                <h3 className="stat-card-title">{title}</h3>
            </div>
            <div className="stat-card-content">
                <div className="stat-card-value">{value}</div>
                {subtitle && <div className="stat-card-subtitle">{subtitle}</div>}
                {trend && (
                    <div className={`stat-card-trend ${trend.direction}`}>
                        <span className="trend-icon">
                            {trend.direction === 'up' ? '↗' : trend.direction === 'down' ? '↘' : '→'}
                        </span>
                        <span className="trend-value">{trend.value}</span>
                    </div>
                )}
            </div>
        </div>
    ));

    if (loading) {
        return (
            <div className="summary-statistics loading">
                <div className="loading-header">
                    <div className="loading-spinner"></div>
                    <h2>Loading Summary Statistics...</h2>
                </div>
                <div className="stat-cards-grid">
                    {[...Array(6)].map((_, index) => (
                        <div key={index} className="stat-card loading-card">
                            <div className="loading-shimmer"></div>
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="summary-statistics error">
                <div className="error-content">
                    <div className="error-icon">⚠️</div>
                    <h3>Failed to Load Statistics</h3>
                    <p>{error}</p>
                    <button 
                        className="retry-button"
                        onClick={fetchSummary}
                        disabled={loading}
                    >
                        {loading ? 'Retrying...' : 'Retry'}
                    </button>
                </div>
            </div>
        );
    }

    if (!summary) {
        return (
            <div className="summary-statistics empty">
                <div className="empty-content">
                    <div className="empty-icon">📊</div>
                    <h3>No Data Available</h3>
                    <p>No summary statistics available for this view.</p>
                </div>
            </div>
        );
    }

    const { view_info, summary: stats, metadata } = summary;

    return (
        <div className="summary-statistics">
            <div className="summary-header">
                <div className="view-info">
                    <h2>{view_info.name}</h2>
                    {view_info.description && (
                        <p className="view-description">{view_info.description}</p>
                    )}
                </div>
                <div className="summary-meta">
                    {lastUpdated && (
                        <span className="last-updated">
                            Last updated: {lastUpdated.toLocaleTimeString()}
                        </span>
                    )}
                    <button 
                        className="refresh-button"
                        onClick={fetchSummary}
                        disabled={loading}
                        title="Refresh statistics"
                    >
                        🔄
                    </button>
                </div>
            </div>

            <div className="stat-cards-grid">
                <StatCard
                    title="Total Transactions"
                    value={stats.total_transactions.toLocaleString()}
                    subtitle={`Over ${stats.date_range.days} days`}
                    icon="📋"
                    className="transactions-card"
                />

                <StatCard
                    title="Total Spending"
                    value={formatCurrency(Math.abs(stats.total_spending))}
                    subtitle={`${stats.total_spending >= 0 ? 'Net inflow' : 'Net outflow'}`}
                    icon="💰"
                    className="spending-card"
                />

                <StatCard
                    title="Net Flow"
                    value={formatCurrency(stats.net_flow)}
                    subtitle={stats.net_flow >= 0 ? 'Positive cash flow' : 'Negative cash flow'}
                    icon={stats.net_flow >= 0 ? '📈' : '📉'}
                    className={`net-flow-card ${getNetFlowColor(stats.net_flow)}`}
                />

                <StatCard
                    title="Total Inflow"
                    value={formatCurrency(stats.total_inflow)}
                    subtitle="Money received"
                    icon="⬆️"
                    className="inflow-card positive"
                />

                <StatCard
                    title="Total Outflow"
                    value={formatCurrency(Math.abs(stats.total_outflow))}
                    subtitle="Money spent"
                    icon="⬇️"
                    className="outflow-card negative"
                />

                <StatCard
                    title="Daily Average"
                    value={formatCurrency(Math.abs(stats.averages.daily))}
                    subtitle={`Weekly: ${formatCurrency(Math.abs(stats.averages.weekly))}`}
                    icon="📅"
                    className="average-card"
                />
            </div>

            <div className="date-range-info">
                <div className="date-range-card">
                    <h3>Date Range</h3>
                    <div className="date-range-content">
                        <div className="date-item">
                            <span className="date-label">From:</span>
                            <span className="date-value">{formatDate(stats.date_range.earliest)}</span>
                        </div>
                        <div className="date-item">
                            <span className="date-label">To:</span>
                            <span className="date-value">{formatDate(stats.date_range.latest)}</span>
                        </div>
                        <div className="date-item">
                            <span className="date-label">Duration:</span>
                            <span className="date-value">{stats.date_range.days} days</span>
                        </div>
                    </div>
                </div>

                <div className="averages-card">
                    <h3>Spending Averages</h3>
                    <div className="averages-content">
                        <div className="average-item">
                            <span className="average-label">Daily:</span>
                            <span className="average-value">{formatCurrency(Math.abs(stats.averages.daily))}</span>
                        </div>
                        <div className="average-item">
                            <span className="average-label">Weekly:</span>
                            <span className="average-value">{formatCurrency(Math.abs(stats.averages.weekly))}</span>
                        </div>
                        <div className="average-item">
                            <span className="average-label">Monthly:</span>
                            <span className="average-value">{formatCurrency(Math.abs(stats.averages.monthly))}</span>
                        </div>
                    </div>
                </div>
            </div>

            {summary.category_distribution && summary.category_distribution.length > 0 && (
                <div className="top-categories">
                    <h3>Top Categories</h3>
                    <div className="categories-list">
                        {summary.category_distribution.slice(0, 5).map((category, index) => (
                            <div key={index} className="category-item">
                                <div className="category-info">
                                    <span className="category-name">{category.category}</span>
                                    <span className="category-count">{category.count} transactions</span>
                                </div>
                                <div className="category-amount">
                                    <span className="amount">{formatCurrency(Math.abs(category.amount))}</span>
                                    <span className="percentage">{category.percentage.toFixed(1)}%</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            <div className="summary-footer">
                <small className="metadata-info">
                    Generated on {new Date(metadata.generated_at).toLocaleString()} • 
                    Currency: {metadata.currency}
                </small>
            </div>
        </div>
    );
};

export default React.memo(SummaryStatistics); 