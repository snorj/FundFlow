// frontend/src/utils/formatting.js

/**
 * Formats a numerical amount as a currency string based on the provided currency code.
 * Uses Intl.NumberFormat for locale-aware formatting and currency symbols.
 *
 * @param {number|string|null|undefined} amount - The numerical value to format.
 * @param {string|null|undefined} direction - 'DEBIT' or 'CREDIT' (case-insensitive). Determines the sign.
 * @param {string} [currencyCode='AUD'] - The ISO 4217 currency code (e.g., 'AUD', 'EUR', 'USD'). Defaults to 'AUD'.
 * @returns {string} The formatted currency string (e.g., "+ $10.50", "- €25.00") or 'N/A' if amount is invalid.
 */
export const formatCurrency = (amount, direction, currencyCode = 'AUD') => {
    // Ensure amount is a number
    const numAmount = Number(amount);
    if (isNaN(numAmount)) {
        // console.warn("formatCurrency received invalid amount:", amount);
        return 'N/A';
    }

    // Default currency code if none provided or invalid type
    const resolvedCurrencyCode = (typeof currencyCode === 'string' && currencyCode.length === 3)
        ? currencyCode.toUpperCase()
        : 'AUD'; // Default to AUD if code is invalid/missing

    // Formatting options
    const options = {
        style: 'currency',
        currency: resolvedCurrencyCode,
        // You can add more options like minimumFractionDigits if needed globally
        // minimumFractionDigits: 2,
    };

    let formattedAmount = 'N/A';
    try {
        // Use Intl.NumberFormat for robust localization and currency formatting
        formattedAmount = Math.abs(numAmount).toLocaleString(undefined, options);
        // 'undefined' lets the browser use the user's default locale
    } catch (error) {
        // Fallback if currency code is invalid for Intl.NumberFormat
        console.warn(`Could not format currency for code: ${resolvedCurrencyCode}. Falling back. Error: ${error.message}`);
        formattedAmount = `${resolvedCurrencyCode} ${Math.abs(numAmount).toFixed(2)}`; // Basic fallback
    }

    // Determine sign based on direction
    const sign = direction?.toUpperCase() === 'DEBIT' ? '-' : '+';

    return `${sign} ${formattedAmount}`;
};


/**
 * Formats a date string (YYYY-MM-DD or parsable) into a locale-aware short date format.
 *
 * @param {string|null|undefined} dateString - The date string to format.
 * @returns {string} The formatted date string (e.g., "May 8, 2025") or 'N/A'.
 */
export const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    try {
        const options = { year: 'numeric', month: 'short', day: 'numeric' };
        // Adding T00:00:00 helps prevent timezone issues when parsing just a date string
        const date = new Date(dateString + 'T00:00:00');
        // Check if the date is valid after parsing
        if (isNaN(date.getTime())) {
            throw new Error("Invalid date created");
        }
        return date.toLocaleDateString(undefined, options);
    } catch (e) {
        console.warn("Error formatting date:", dateString, e);
        return dateString; // Return original string as fallback
    }
};

// Add other formatting utilities here as needed (e.g., formatDateTime)