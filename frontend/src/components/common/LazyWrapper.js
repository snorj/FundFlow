import React, { Suspense, useState, useCallback } from 'react';
import PropTypes from 'prop-types';
import { useLazyLoading } from '../../hooks/useLazyLoading';
import './LazyWrapper.css';

/**
 * Loading indicator component
 */
const LoadingIndicator = ({ size = 'medium', message = 'Loading...' }) => (
  <div className={`lazy-loading-indicator lazy-loading-${size}`}>
    <div className="lazy-loading-spinner">
      <div className="lazy-loading-spinner-inner"></div>
    </div>
    <span className="lazy-loading-message">{message}</span>
  </div>
);

LoadingIndicator.propTypes = {
  size: PropTypes.oneOf(['small', 'medium', 'large']),
  message: PropTypes.string
};

/**
 * Error boundary for lazy loaded components
 */
class LazyErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('Lazy loading error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="lazy-error-boundary">
          <div className="lazy-error-content">
            <div className="lazy-error-icon">⚠️</div>
            <h3>Failed to load content</h3>
            <p>Something went wrong while loading this component.</p>
            <button 
              className="lazy-error-retry"
              onClick={() => this.setState({ hasError: false, error: null })}
            >
              Try Again
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

/**
 * Lazy wrapper component with intersection observer
 * Loads content only when visible in viewport
 */
const LazyWrapper = ({
  children,
  fallback = <LoadingIndicator />,
  errorFallback = null,
  threshold = 0.1,
  rootMargin = '50px',
  triggerOnce = true,
  onVisible = null,
  className = '',
  style = {},
  placeholder = null,
  minHeight = 'auto',
  ...props
}) => {
  const [hasError, setHasError] = useState(false);

  const handleIntersect = useCallback((entry) => {
    if (onVisible) {
      onVisible(entry);
    }
  }, [onVisible]);

  const { ref, isVisible, hasTriggered } = useLazyLoading({
    threshold,
    rootMargin,
    triggerOnce,
    onIntersect: handleIntersect
  });

  const handleError = useCallback(() => {
    setHasError(true);
  }, []);

  const handleRetry = useCallback(() => {
    setHasError(false);
  }, []);

  if (hasError) {
    return (
      <div 
        ref={ref}
        className={`lazy-wrapper lazy-wrapper-error ${className}`}
        style={{ minHeight, ...style }}
        {...props}
      >
        {errorFallback || (
          <div className="lazy-error-fallback">
            <div className="lazy-error-content">
              <div className="lazy-error-icon">⚠️</div>
              <p>Failed to load content</p>
              <button className="lazy-error-retry" onClick={handleRetry}>
                Retry
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div 
      ref={ref}
      className={`lazy-wrapper ${isVisible ? 'lazy-wrapper-visible' : 'lazy-wrapper-hidden'} ${className}`}
      style={{ minHeight, ...style }}
      {...props}
    >
      {!isVisible && !hasTriggered ? (
        placeholder || <div className="lazy-placeholder" style={{ minHeight }} />
      ) : (
        <LazyErrorBoundary>
          <Suspense fallback={fallback}>
            {typeof children === 'function' ? children({ isVisible, hasTriggered }) : children}
          </Suspense>
        </LazyErrorBoundary>
      )}
    </div>
  );
};

LazyWrapper.propTypes = {
  children: PropTypes.oneOfType([PropTypes.node, PropTypes.func]).isRequired,
  fallback: PropTypes.node,
  errorFallback: PropTypes.node,
  threshold: PropTypes.number,
  rootMargin: PropTypes.string,
  triggerOnce: PropTypes.bool,
  onVisible: PropTypes.func,
  className: PropTypes.string,
  style: PropTypes.object,
  placeholder: PropTypes.node,
  minHeight: PropTypes.oneOfType([PropTypes.string, PropTypes.number])
};

/**
 * Higher-order component for lazy loading
 */
export const withLazyLoading = (Component, options = {}) => {
  const LazyComponent = React.forwardRef((props, ref) => (
    <LazyWrapper {...options}>
      <Component {...props} ref={ref} />
    </LazyWrapper>
  ));

  LazyComponent.displayName = `withLazyLoading(${Component.displayName || Component.name})`;
  
  return LazyComponent;
};

/**
 * Lazy image component with progressive loading
 */
export const LazyImage = ({
  src,
  alt,
  placeholder = null,
  className = '',
  style = {},
  onLoad = null,
  onError = null,
  ...props
}) => {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);

  const handleLoad = useCallback((e) => {
    setLoaded(true);
    if (onLoad) onLoad(e);
  }, [onLoad]);

  const handleError = useCallback((e) => {
    setError(true);
    if (onError) onError(e);
  }, [onError]);

  return (
    <LazyWrapper
      className={`lazy-image-wrapper ${className}`}
      style={style}
      placeholder={placeholder}
    >
      {({ isVisible }) => (
        isVisible && (
          <div className="lazy-image-container">
            {!loaded && !error && (
              <div className="lazy-image-loading">
                <LoadingIndicator size="small" message="" />
              </div>
            )}
            {error ? (
              <div className="lazy-image-error">
                <span>Failed to load image</span>
              </div>
            ) : (
              <img
                src={src}
                alt={alt}
                onLoad={handleLoad}
                onError={handleError}
                style={{
                  opacity: loaded ? 1 : 0,
                  transition: 'opacity 0.3s ease'
                }}
                {...props}
              />
            )}
          </div>
        )
      )}
    </LazyWrapper>
  );
};

LazyImage.propTypes = {
  src: PropTypes.string.isRequired,
  alt: PropTypes.string.isRequired,
  placeholder: PropTypes.node,
  className: PropTypes.string,
  style: PropTypes.object,
  onLoad: PropTypes.func,
  onError: PropTypes.func
};

/**
 * Lazy list component with infinite scroll
 */
export const LazyList = ({
  items = [],
  renderItem,
  loadMore,
  hasMore = true,
  loading = false,
  pageSize = 20,
  className = '',
  itemClassName = '',
  loadingComponent = <LoadingIndicator />,
  emptyComponent = <div>No items to display</div>,
  errorComponent = null,
  ...props
}) => {
  const { sentinelRef } = useLazyLoading({
    threshold: 0.1,
    rootMargin: '100px',
    triggerOnce: false,
    onIntersect: () => {
      if (hasMore && !loading && loadMore) {
        loadMore();
      }
    }
  });

  if (items.length === 0 && !loading) {
    return <div className={`lazy-list-empty ${className}`}>{emptyComponent}</div>;
  }

  return (
    <div className={`lazy-list ${className}`} {...props}>
      {items.map((item, index) => (
        <div key={item.id || index} className={`lazy-list-item ${itemClassName}`}>
          {renderItem(item, index)}
        </div>
      ))}
      
      {hasMore && (
        <div ref={sentinelRef} className="lazy-list-sentinel">
          {loading && loadingComponent}
        </div>
      )}
      
      {!hasMore && items.length > 0 && (
        <div className="lazy-list-end">
          <span>No more items to load</span>
        </div>
      )}
    </div>
  );
};

LazyList.propTypes = {
  items: PropTypes.array,
  renderItem: PropTypes.func.isRequired,
  loadMore: PropTypes.func,
  hasMore: PropTypes.bool,
  loading: PropTypes.bool,
  pageSize: PropTypes.number,
  className: PropTypes.string,
  itemClassName: PropTypes.string,
  loadingComponent: PropTypes.node,
  emptyComponent: PropTypes.node,
  errorComponent: PropTypes.node
};

export { LoadingIndicator };
export default LazyWrapper; 