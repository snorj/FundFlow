from decimal import Decimal, ROUND_HALF_UP
from datetime import date, timedelta
from django.db.models import Q, F
from .models import HistoricalExchangeRate, BASE_CURRENCY_FOR_CONVERSION
import logging

logger = logging.getLogger(__name__)

# Define the maximum number of days to look back/forward for a rate
MAX_DAYS_GAP = 180 # Approx 6 months

# Placeholder for existing get_historical_exchange_rate if it was in this file
# def get_historical_exchange_rate(date_str, from_currency, to_currency):
#     # This function will be replaced or integrated with the new logic.
#     # For now, we comment it out or ensure it doesn't conflict.
#     logger.warning("Legacy get_historical_exchange_rate called. This should be updated.")
#     return None 

def get_closest_rate_for_pair(lookup_date: date, source_currency: str, target_currency: str, max_days_gap: int) -> tuple[date, Decimal] | None:
    # logger.debug(f"[GET_HISTORICAL_RATE_TRACE] get_closest_rate_for_pair: date={lookup_date}, src={source_currency}, tgt={target_currency}")
    # Rates are stored as AUD to Foreign.
    # If source is AUD, target is Foreign: query directly.
    # If source is Foreign, target is AUD: query for AUD to Source, then invert.
    # If neither is AUD: This function should not be called directly, handled by get_historical_rate's cross-currency logic.

    if source_currency == BASE_CURRENCY_FOR_CONVERSION: # e.g. AUD to USD
        base = source_currency
        foreign = target_currency
        needs_inversion = False
    elif target_currency == BASE_CURRENCY_FOR_CONVERSION: # e.g. USD to AUD
        base = target_currency
        foreign = source_currency
        needs_inversion = True
    else:
        # This sub-function should only be called for pairs involving BASE_CURRENCY
        # logger.error(f"[GET_HISTORICAL_RATE_TRACE] get_closest_rate_for_pair called with non-base currencies: {source_currency}/{target_currency}")
        return None

    # Find rates for the (BASE_CURRENCY, foreign) pair around the lookup_date
    past_rate = HistoricalExchangeRate.objects.filter(
        source_currency=base,
        target_currency=foreign,
        date__lte=lookup_date,
        date__gte=lookup_date - timedelta(days=max_days_gap)
    ).order_by('-date').first()

    future_rate = HistoricalExchangeRate.objects.filter(
        source_currency=base,
        target_currency=foreign,
        date__gte=lookup_date,
        date__lte=lookup_date + timedelta(days=max_days_gap)
    ).order_by('date').first()

    # logger.debug(f"[GET_HISTORICAL_RATE_TRACE] Past rate for {base}/{foreign} near {lookup_date}: {past_rate.date if past_rate else 'None'}")
    # logger.debug(f"[GET_HISTORICAL_RATE_TRACE] Future rate for {base}/{foreign} near {lookup_date}: {future_rate.date if future_rate else 'None'}")

    chosen_rate_obj = None
    if past_rate and future_rate:
        days_to_past = (lookup_date - past_rate.date).days
        days_to_future = (future_rate.date - lookup_date).days
        if days_to_future <= days_to_past: # Prefer future or exact if equidistant
            chosen_rate_obj = future_rate
        else:
            chosen_rate_obj = past_rate
    elif past_rate:
        chosen_rate_obj = past_rate
    elif future_rate:
        chosen_rate_obj = future_rate

    if chosen_rate_obj:
        # logger.debug(f"[GET_HISTORICAL_RATE_TRACE] Chosen rate object for {base}/{foreign} on {chosen_rate_obj.date}: {chosen_rate_obj.rate}")
        rate_value = chosen_rate_obj.rate
        if needs_inversion:
            if rate_value == Decimal('0'): # Avoid division by zero
                # logger.warning(f"[GET_HISTORICAL_RATE_TRACE] Attempted to invert a zero rate for {foreign}->{base} on {chosen_rate_obj.date}")
                return None
            final_rate = Decimal('1.0') / rate_value
        else:
            final_rate = rate_value
        # logger.debug(f"[GET_HISTORICAL_RATE_TRACE] Returning rate: {final_rate} for date {chosen_rate_obj.date}")
        return chosen_rate_obj.date, final_rate
    
    # logger.debug(f"[GET_HISTORICAL_RATE_TRACE] No suitable rate found for {source_currency} to {target_currency} near {lookup_date}")
    return None

def get_historical_rate(lookup_date: date, from_currency: str, to_currency: str) -> Decimal | None:
    # logger.debug(f"[GET_HISTORICAL_RATE_TRACE] Called with: date={lookup_date}, from={from_currency}, to={to_currency}")

    from_currency_upper = from_currency.upper()
    to_currency_upper = to_currency.upper()

    if from_currency_upper == to_currency_upper:
        # logger.debug(f"[GET_HISTORICAL_RATE_TRACE] Currencies are the same ({from_currency_upper}). Returning 1.0")
        return Decimal("1.0")

    latest_rate_obj = HistoricalExchangeRate.objects.order_by('-date').first()
    earliest_rate_obj = HistoricalExchangeRate.objects.order_by('date').first()

    # logger.debug(f"[GET_HISTORICAL_RATE_TRACE] Earliest rate in DB: {earliest_rate_obj.date if earliest_rate_obj else 'None'}. Latest rate in DB: {latest_rate_obj.date if latest_rate_obj else 'None'}")

    if not earliest_rate_obj or not latest_rate_obj:
        # logger.warning("[GET_HISTORICAL_RATE_TRACE] No exchange rates found in the database at all.")
        return None # No rates in DB at all

    days_from_latest = (lookup_date - latest_rate_obj.date).days
    days_from_earliest = (earliest_rate_obj.date - lookup_date).days
    
    # logger.debug(f"[GET_HISTORICAL_RATE_TRACE] lookup_date={lookup_date}, latest_rate_obj.date={latest_rate_obj.date}, earliest_rate_obj.date={earliest_rate_obj.date}")
    # logger.debug(f"[GET_HISTORICAL_RATE_TRACE] days_from_latest (lookup - latest): {days_from_latest}, days_from_earliest (earliest - lookup): {days_from_earliest}, max_days_gap: {MAX_DAYS_GAP}")

    # Check if the lookup_date is too far outside the range of available rates
    # This is a slightly more nuanced check than before.
    # If lookup_date is *between* earliest and latest, it's fine.
    # If it's *outside*, then it must be within MAX_DAYS_GAP of the closest bound.
    if not (earliest_rate_obj.date <= lookup_date <= latest_rate_obj.date):
        # Date is outside the known range. Check if it's too far from the nearest bound.
        if lookup_date > latest_rate_obj.date and days_from_latest > MAX_DAYS_GAP:
            # logger.warning(f"[GET_HISTORICAL_RATE_TRACE] Lookup date {lookup_date} is too far past latest rate {latest_rate_obj.date} (gap: {days_from_latest} > {MAX_DAYS_GAP}).")
            return None
        if lookup_date < earliest_rate_obj.date and days_from_earliest > MAX_DAYS_GAP: # days_from_earliest would be positive here
            # logger.warning(f"[GET_HISTORICAL_RATE_TRACE] Lookup date {lookup_date} is too far before earliest rate {earliest_rate_obj.date} (gap: {days_from_earliest} > {MAX_DAYS_GAP}).")
            return None
    # else:
        # logger.debug(f"[GET_HISTORICAL_RATE_TRACE] Date gap check passed.")


    rate_data = None
    final_rate = None

    # Case 1: Direct conversion involving BASE_CURRENCY_FOR_CONVERSION (e.g., AUD to USD or USD to AUD)
    if from_currency_upper == BASE_CURRENCY_FOR_CONVERSION or to_currency_upper == BASE_CURRENCY_FOR_CONVERSION:
        # logger.debug(f"[GET_HISTORICAL_RATE_TRACE] Case 1: {from_currency_upper} to {to_currency_upper}")
        rate_data = get_closest_rate_for_pair(lookup_date, from_currency_upper, to_currency_upper, MAX_DAYS_GAP)
        if rate_data:
            final_rate = rate_data[1]
    # Case 2: Cross-currency conversion (e.g., USD to EUR, via AUD)
    else:
        # logger.debug(f"[GET_HISTORICAL_RATE_TRACE] Case 2: {from_currency_upper} to {to_currency_upper} (cross-currency)")
        # Step 1: Convert from_currency to BASE_CURRENCY_FOR_CONVERSION (e.g., USD to AUD)
        rate1_data = get_closest_rate_for_pair(lookup_date, from_currency_upper, BASE_CURRENCY_FOR_CONVERSION, MAX_DAYS_GAP)
        if not rate1_data:
            # logger.warning(f"[GET_HISTORICAL_RATE_TRACE] Cross-currency: Failed to get rate for {from_currency_upper} to {BASE_CURRENCY_FOR_CONVERSION}.")
            return None
        
        # logger.debug(f"[GET_HISTORICAL_RATE_TRACE] Cross-currency leg 1 ({from_currency_upper}->{BASE_CURRENCY_FOR_CONVERSION}) on {rate1_data[0]}: {rate1_data[1]}")

        # Step 2: Convert BASE_CURRENCY_FOR_CONVERSION to to_currency (e.g., AUD to EUR)
        # Important: Use the date of the rate found in Step 1 for Step 2's lookup,
        # to maintain consistency for that day's cross-rate.
        # However, current implementation of get_closest_rate_for_pair will use its own
        # closest date logic for the second leg based on the original lookup_date.
        # This is generally acceptable as we want the best rate for AUD->to_currency
        # near the original lookup_date.
        rate2_data = get_closest_rate_for_pair(lookup_date, BASE_CURRENCY_FOR_CONVERSION, to_currency_upper, MAX_DAYS_GAP)
        if not rate2_data:
            # logger.warning(f"[GET_HISTORICAL_RATE_TRACE] Cross-currency: Failed to get rate for {BASE_CURRENCY_FOR_CONVERSION} to {to_currency_upper}.")
            return None

        # logger.debug(f"[GET_HISTORICAL_RATE_TRACE] Cross-currency leg 2 ({BASE_CURRENCY_FOR_CONVERSION}->{to_currency_upper}) on {rate2_data[0]}: {rate2_data[1]}")
        
        # Combine the rates: (Amount in FROM_CUR) * (AUD/FROM_CUR) * (TO_CUR/AUD)
        final_rate = rate1_data[1] * rate2_data[1]

    if final_rate is not None:
        quantized_rate = final_rate.quantize(Decimal('1e-9'), rounding=ROUND_HALF_UP) # Standard 9 decimal places
        # logger.debug(f"[GET_HISTORICAL_RATE_TRACE] Final rate: {final_rate}, Quantized: {quantized_rate}. Returning.")
        return quantized_rate
    else:
        # logger.warning(f"[GET_HISTORICAL_RATE_TRACE] No rate found for {from_currency_upper} to {to_currency_upper} on {lookup_date}.")
        return None 

def get_current_exchange_rate(from_currency: str, to_currency: str) -> Decimal | None:
    """
    Get the most recent exchange rate available for currency conversion.
    Uses the latest HistoricalExchangeRate entry for the currency pair.
    
    Args:
        from_currency: Source currency code (e.g., 'EUR')
        to_currency: Target currency code (e.g., 'AUD')
    
    Returns:
        Latest available exchange rate or None if not found
    """
    logger.debug(f"[GET_CURRENT_RATE] Requesting current rate: {from_currency} -> {to_currency}")
    
    from_currency_upper = from_currency.upper()
    to_currency_upper = to_currency.upper()
    
    # Handle same currency case
    if from_currency_upper == to_currency_upper:
        logger.debug(f"[GET_CURRENT_RATE] Same currencies ({from_currency_upper}). Returning 1.0")
        return Decimal('1.0')
    
    # Try direct conversion first
    latest_rate = HistoricalExchangeRate.objects.filter(
        source_currency=from_currency_upper,
        target_currency=to_currency_upper
    ).order_by('-date').first()
    
    if latest_rate:
        logger.debug(f"[GET_CURRENT_RATE] Found direct rate: {latest_rate.rate} on {latest_rate.date}")
        return latest_rate.rate
    
    # Try reverse conversion
    latest_reverse_rate = HistoricalExchangeRate.objects.filter(
        source_currency=to_currency_upper,
        target_currency=from_currency_upper
    ).order_by('-date').first()
    
    if latest_reverse_rate:
        if latest_reverse_rate.rate == Decimal('0'):
            logger.warning(f"[GET_CURRENT_RATE] Cannot invert zero rate for {to_currency_upper}->{from_currency_upper}")
            return None
        reverse_rate = Decimal('1.0') / latest_reverse_rate.rate
        logger.debug(f"[GET_CURRENT_RATE] Found reverse rate: {reverse_rate} (inverted from {latest_reverse_rate.rate}) on {latest_reverse_rate.date}")
        return reverse_rate
    
    # Try cross-currency conversion via base currency (AUD)
    if to_currency_upper != BASE_CURRENCY_FOR_CONVERSION and from_currency_upper != BASE_CURRENCY_FOR_CONVERSION:
        logger.debug(f"[GET_CURRENT_RATE] Attempting cross-currency conversion via {BASE_CURRENCY_FOR_CONVERSION}")
        
        from_to_base = get_current_exchange_rate(from_currency_upper, BASE_CURRENCY_FOR_CONVERSION)
        base_to_target = get_current_exchange_rate(BASE_CURRENCY_FOR_CONVERSION, to_currency_upper)
        
        if from_to_base and base_to_target:
            cross_rate = from_to_base * base_to_target
            logger.debug(f"[GET_CURRENT_RATE] Cross-currency calculation: {from_to_base} * {base_to_target} = {cross_rate}")
            return cross_rate
    
    logger.warning(f"[GET_CURRENT_RATE] No rate found for {from_currency_upper} -> {to_currency_upper}")
    return None 