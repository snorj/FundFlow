// Create ScriptManager.js in the utils folder

// Global registry of loaded scripts
window.__LOADED_SCRIPTS = window.__LOADED_SCRIPTS || {};

/**
 * Utility to load scripts once and manage them globally
 */
const ScriptManager = {
  /**
   * Load a script by URL
   * @param {string} src - Script URL
   * @param {string} id - Unique identifier for the script
   * @returns {Promise} - Resolves when script is loaded
   */
  loadScript: (src, id) => {
    return new Promise((resolve, reject) => {
      // Check if script is already in the process of loading
      if (window.__LOADED_SCRIPTS[id] === 'loading') {
        console.log(`Script ${id} is already loading, waiting...`);
        
        // Poll until script is loaded or failed
        const checkInterval = setInterval(() => {
          if (window.__LOADED_SCRIPTS[id] === 'loaded') {
            clearInterval(checkInterval);
            resolve();
          } else if (window.__LOADED_SCRIPTS[id] === 'error') {
            clearInterval(checkInterval);
            reject(new Error(`Failed to load script: ${id}`));
          }
        }, 100);
        
        return;
      }
      
      // Check if script is already loaded
      if (window.__LOADED_SCRIPTS[id] === 'loaded') {
        console.log(`Script ${id} is already loaded`);
        resolve();
        return;
      }
      
      // Mark script as loading
      window.__LOADED_SCRIPTS[id] = 'loading';
      
      // Create script element
      const script = document.createElement('script');
      script.src = src;
      script.id = id;
      script.async = true;
      
      // Set up event handlers
      script.onload = () => {
        console.log(`Script loaded: ${id}`);
        window.__LOADED_SCRIPTS[id] = 'loaded';
        resolve();
      };
      
      script.onerror = (error) => {
        console.error(`Error loading script: ${id}`, error);
        window.__LOADED_SCRIPTS[id] = 'error';
        reject(error);
      };
      
      // Append script to document
      document.head.appendChild(script);
    });
  },
  
  /**
   * Remove a script
   * @param {string} id - Script identifier
   */
  removeScript: (id) => {
    const script = document.getElementById(id);
    if (script) {
      document.head.removeChild(script);
    }
    delete window.__LOADED_SCRIPTS[id];
  },
  
  /**
   * Check if a script is loaded
   * @param {string} id - Script identifier
   * @returns {boolean} - True if loaded
   */
  isScriptLoaded: (id) => {
    return window.__LOADED_SCRIPTS[id] === 'loaded';
  }
};

export default ScriptManager;