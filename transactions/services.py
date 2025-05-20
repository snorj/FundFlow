from decimal import Decimal, ROUND_HALF_UP
from datetime import date, timedelta
from django.db.models import Q, F
from .models import HistoricalExchangeRate # Assuming this function is in a file within the 'transactions' app
import logging

logger = logging.getLogger(__name__)

# Placeholder for existing get_historical_exchange_rate if it was in this file
# def get_historical_exchange_rate(date_str, from_currency, to_currency):
#     # This function will be replaced or integrated with the new logic.
#     # For now, we comment it out or ensure it doesn't conflict.
#     logger.warning("Legacy get_historical_exchange_rate called. This should be updated.")
#     return None 

def get_closest_rate_for_pair(lookup_date: date, currency1: str, currency2: str) -> HistoricalExchangeRate | None:
    """
    Finds the rate for AUD to/from a specific currency, using closest date logic.
    - If currency1 is AUD, finds AUD to currency2.
    - If currency2 is AUD, finds AUD to currency1 (rate will be inverted by caller).
    Returns the HistoricalExchangeRate object or None.
    """
    if currency1 == 'AUD':
        source_curr, target_curr = 'AUD', currency2
    elif currency2 == 'AUD':
        source_curr, target_curr = 'AUD', currency1
    else:
        # This function is designed for direct AUD pairs from the RBA table
        logger.error(f"get_closest_rate_for_pair called with non-AUD pair: {currency1}-{currency2}")
        return None

    # Try exact date match first
    exact_match = HistoricalExchangeRate.objects.filter(
        date=lookup_date,
        source_currency=source_curr,
        target_currency=target_curr
    ).first()
    if exact_match:
        return exact_match

    # If no exact match, find closest past and future rates
    # Past rate: closest date <= lookup_date
    past_rate = HistoricalExchangeRate.objects.filter(
        date__lte=lookup_date,
        source_currency=source_curr,
        target_currency=target_curr
    ).order_by('-date').first()

    # Future rate: closest date > lookup_date
    future_rate = HistoricalExchangeRate.objects.filter(
        date__gt=lookup_date,
        source_currency=source_curr,
        target_currency=target_curr
    ).order_by('date').first()

    if past_rate and future_rate:
        # Both exist, compare distances
        days_to_past = (lookup_date - past_rate.date).days
        days_to_future = (future_rate.date - lookup_date).days

        if days_to_past == days_to_future: # Equidistant
            return future_rate # Prefer more recent
        elif days_to_past < days_to_future:
            return past_rate
        else:
            return future_rate
    elif past_rate:
        return past_rate
    elif future_rate:
        return future_rate
    else:
        return None

def get_historical_rate(lookup_date: date, from_currency: str, to_currency: str) -> Decimal | None:
    """
    Retrieves the historical exchange rate for a given date and currency pair.
    Uses the HistoricalExchangeRate table (populated from RBA CSV which is AUD-based).
    Implements "closest date, prefer most recent if equidistant" logic.
    Can perform cross-conversion via AUD (e.g., USD to EUR).
    """
    from_currency_upper = from_currency.upper()
    to_currency_upper = to_currency.upper()

    if from_currency_upper == to_currency_upper:
        return Decimal("1.0")

    rate_obj = None
    final_rate = None

    # Case 1: Direct AUD to Target (e.g., AUD to USD)
    if from_currency_upper == 'AUD':
        rate_obj = get_closest_rate_for_pair(lookup_date, 'AUD', to_currency_upper)
        if rate_obj:
            final_rate = rate_obj.rate
    
    # Case 2: Source to AUD (e.g., USD to AUD)
    elif to_currency_upper == 'AUD':
        logger.debug(f"[get_historical_rate Case 2] Looking for AUD to {from_currency_upper} for date {lookup_date}")
        rate_obj = get_closest_rate_for_pair(lookup_date, 'AUD', from_currency_upper)
        if rate_obj:
            logger.debug(f"[get_historical_rate Case 2] Found rate_obj for AUD to {from_currency_upper}: Date={rate_obj.date}, Rate={rate_obj.rate}")
            if rate_obj.rate != Decimal(0):
                final_rate = Decimal("1.0") / rate_obj.rate
                logger.debug(f"[get_historical_rate Case 2] Inverted rate: {final_rate}")
            else:
                 logger.warning(f"Cannot invert rate of 0 for AUD to {from_currency_upper} on {rate_obj.date}")
        else:
            logger.debug(f"[get_historical_rate Case 2] No rate_obj found by get_closest_rate_for_pair for AUD to {from_currency_upper} for date {lookup_date}")

    # Case 3: Cross-currency (e.g., USD to EUR)
    # Convert From -> AUD, then AUD -> To
    else:
        # Rate for FromCurrency -> AUD
        rate_from_to_aud_obj = get_closest_rate_for_pair(lookup_date, 'AUD', from_currency_upper)
        
        # Rate for AUD -> ToCurrency
        rate_aud_to_target_obj = get_closest_rate_for_pair(lookup_date, 'AUD', to_currency_upper)

        if rate_from_to_aud_obj and rate_from_to_aud_obj.rate != Decimal(0) and rate_aud_to_target_obj:
            # Rate for From -> AUD is 1 / (AUD -> From)
            rate1_from_to_aud = Decimal("1.0") / rate_from_to_aud_obj.rate
            rate2_aud_to_target = rate_aud_to_target_obj.rate
            final_rate = rate1_from_to_aud * rate2_aud_to_target
            # Log which dates were used if they differ from lookup_date
            if rate_from_to_aud_obj.date != lookup_date or rate_aud_to_target_obj.date != lookup_date:
                logger.info(f"Cross-rate for {from_currency_upper} to {to_currency_upper} on {lookup_date}: used {from_currency_upper}/AUD from {rate_from_to_aud_obj.date} and AUD/{to_currency_upper} from {rate_aud_to_target_obj.date}")
        elif rate_from_to_aud_obj and rate_from_to_aud_obj.rate == Decimal(0):
            logger.warning(f"Cannot calculate cross-rate for {from_currency_upper}->{to_currency_upper} due to zero rate for AUD->{from_currency_upper}")

    if final_rate is not None:
        # Standardize precision, e.g., to 9 decimal places like the stored rate
        return final_rate.quantize(Decimal('1e-9')) 
        
    logger.warning(f"Exchange rate not found for {from_currency_upper} to {to_currency_upper} on {lookup_date} (or closest). Tried AUD based rates.")
    return None 