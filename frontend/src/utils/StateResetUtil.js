// src/utils/StateResetUtil.js

// This file provides a central place to manage global state resets

// Event system for state resets
class StateResetManager {
  constructor() {
    this.resetListeners = [];
  }

  // Register a reset listener
  addResetListener(listener) {
    if (typeof listener === 'function') {
      this.resetListeners.push(listener);
      return () => this.removeResetListener(listener);
    }
  }

  // Remove a reset listener
  removeResetListener(listener) {
    this.resetListeners = this.resetListeners.filter(l => l !== listener);
  }

  // Trigger a global state reset
  triggerReset() {
    console.log('Triggering global state reset, calling', this.resetListeners.length, 'listeners');
    this.resetListeners.forEach(listener => {
      try {
        listener();
      } catch (error) {
        console.error('Error in reset listener:', error);
      }
    });
  }
}

// Create and export a singleton instance
export const stateResetManager = new StateResetManager();

// Export a function to trigger global reset
export const resetAllState = () => stateResetManager.triggerReset();