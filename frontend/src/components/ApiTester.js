// src/components/ApiTester.js
import React, { useState } from 'react';
import testAllApis from '../utils/apiTester';

const ApiTester = () => {
  const [testResults, setTestResults] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  
  // Override console.log to capture test results
  const runTests = async () => {
    setIsLoading(true);
    setTestResults([]);
    
    const originalLog = console.log;
    const originalError = console.error;
    
    const results = [];
    
    console.log = (...args) => {
      originalLog(...args);
      results.push({ type: 'log', content: args.join(' ') });
      setTestResults([...results]);
    };
    
    console.error = (...args) => {
      originalError(...args);
      results.push({ type: 'error', content: args.join(' ') });
      setTestResults([...results]);
    };
    
    try {
      await testAllApis();
    } catch (error) {
      console.error('Test execution failed:', error);
    } finally {
      console.log = originalLog;
      console.error = originalError;
      setIsLoading(false);
    }
  };
  
  return (
    <div style={{ padding: '20px', maxWidth: '800px', margin: '0 auto' }}>
      <h1>API Test Utility</h1>
      <p>This utility will test various API endpoints to ensure connectivity with your Django backend.</p>
      
      <button 
        onClick={runTests} 
        disabled={isLoading}
        style={{
          padding: '10px 20px',
          backgroundColor: '#4CAF50',
          color: 'white',
          border: 'none',
          borderRadius: '4px',
          cursor: isLoading ? 'not-allowed' : 'pointer',
          fontSize: '16px',
          marginBottom: '20px'
        }}
      >
        {isLoading ? 'Running Tests...' : 'Run API Tests'}
      </button>
      
      <div style={{ 
        border: '1px solid #ddd', 
        borderRadius: '4px', 
        padding: '10px',
        backgroundColor: '#f5f5f5',
        fontFamily: 'monospace',
        maxHeight: '500px',
        overflow: 'auto'
      }}>
        {testResults.length === 0 ? (
          <p>Click the button to run tests. Results will appear here.</p>
        ) : (
          testResults.map((result, index) => (
            <div 
              key={index} 
              style={{ 
                color: result.type === 'error' ? 'red' : 'black',
                margin: '5px 0',
                borderBottom: '1px solid #eee',
                paddingBottom: '5px'
              }}
            >
              {result.content}
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default ApiTester;