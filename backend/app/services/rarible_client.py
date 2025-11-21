"""
Rarible API Client
Fetches NFT collection data from Rarible API
"""
import os
import httpx
import logging
import time
from typing import Optional, Dict, Any
from app.config import settings

logger = logging.getLogger(__name__)

BASE_URL = os.getenv("RARIBLE_BASE_URL", "https://api.rarible.org/v0.1")
RARIBLE_API_KEY = settings.rarible_api_key

HEADERS = {
    "accept": "application/json",
    "x-api-key": RARIBLE_API_KEY,
}

_DEFAULT_TIMEOUT = httpx.Timeout(10.0, connect=5.0)

async def rarible_get(path: str, params: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """Send GET request to Rarible API"""
    if not RARIBLE_API_KEY:
        raise RuntimeError("RARIBLE_API_KEY not set")
    
    url = f"{BASE_URL.rstrip('/')}/{path.lstrip('/')}"
    start_time = time.time()
    async with httpx.AsyncClient(timeout=_DEFAULT_TIMEOUT, headers=HEADERS) as client:
        r = await client.get(url, params=params or {})
        elapsed = time.time() - start_time
        
        # Debug: Print response details if error
        if r.status_code != 200:
            logger.warning(f"⏱️ [TIMING] Rarible API {path}: {elapsed:.2f}s (Status: {r.status_code})")
            print(f"DEBUG - Request URL: {url}")
            print(f"DEBUG - Status Code: {r.status_code}")
            print(f"DEBUG - Response Headers: {dict(r.headers)}")
            try:
                response_body = r.json()
                print(f"DEBUG - Response Body: {response_body}")
            except:
                print(f"DEBUG - Response Text: {r.text[:500]}")
        else:
            logger.debug(f"⏱️ [TIMING] Rarible API {path}: {elapsed:.2f}s")
        
        r.raise_for_status()
        return r.json()

async def items_by_owner(
    owner: str,
    blockchain: str = "ETHEREUM",
    size: int = 20,
    continuation: Optional[str] = None,
) -> Dict[str, Any]:
    """Get items owned by an address"""
    owner_full = f"{blockchain}:{owner}"
    params: Dict[str, Any] = {"owner": owner_full, "size": size}
    if continuation:
        params["continuation"] = continuation
    return await rarible_get("items/byOwner", params=params)

async def collection_by_id(collection_id: str) -> Dict[str, Any]:
    """Get collection by ID"""
    return await rarible_get(f"collections/{collection_id}")

async def collection_statistics(collection_id: str) -> Dict[str, Any]:
    """
    Get NFT Collection statistics from Rarible API v0.1
    
    Args:
        collection_id: Collection ID in format "ETHEREUM:{contract_address}"
    
    Returns:
        Dictionary with statistics:
        - listed: Number of listed items
        - items: Total number of items
        - owners: Number of owners
        - highestSale: [{"currency": "USD|ETH", "value": float}, ...]
        - floorPrice: [{"currency": "USD|ETH", "value": float}, ...]
        - marketCap: [{"currency": "USD|ETH", "value": float}, ...]
        - volume: [{"currency": "USD|ETH", "value": float}, ...]
    """
    return await rarible_get(f"data/collections/{collection_id}/statistics")

async def item_by_id(item_id: str) -> Dict[str, Any]:
    """Get item by ID"""
    return await rarible_get(f"items/{item_id}")

def _extract_eth_value(price_list: list) -> float:
    """
    Extract ETH value from price list
    Price list format: [{"currency": "USD", "value": float}, {"currency": "ETH", "value": float}]
    """
    if not price_list or not isinstance(price_list, list):
        return 0.0
    
    for item in price_list:
        if isinstance(item, dict) and item.get("currency", "").upper() == "ETH":
            value = item.get("value", 0)
            try:
                return float(value) if value is not None else 0.0
            except (ValueError, TypeError):
                return 0.0
    
    # Fallback to USD if ETH not found (convert assuming 1 ETH = 2000 USD for estimation)
    # This is just a fallback, ideally should always have ETH
    for item in price_list:
        if isinstance(item, dict) and item.get("currency", "").upper() == "USD":
            value = item.get("value", 0)
            try:
                usd_value = float(value) if value is not None else 0.0
                # Rough conversion (this should ideally come from API or use a price feed)
                return usd_value / 2000.0 if usd_value > 0 else 0.0
            except (ValueError, TypeError):
                return 0.0
    
    return 0.0

async def enrich_transaction_with_nft_data(transaction: Dict[str, Any]) -> Dict[str, Any]:
    """
    Enrich transaction with NFT collection metrics from Rarible using the statistics API
    
    Uses: GET https://api.rarible.org/v0.1/data/collections/{collection}/statistics
    """
    contract_address = transaction.get("contract_address", "")
    if not contract_address or contract_address == "":
        return transaction
    
    enrich_start = time.time()
    try:
        # Get collection statistics using the new API endpoint
        collection_id = f"ETHEREUM:{contract_address}"
        stats = await collection_statistics(collection_id)
        
        if stats:
            # Extract values, preferring ETH currency
            transaction["nft_num_owners"] = stats.get("owners", 0) or 0
            transaction["nft_total_sales"] = stats.get("items", 0) or 0  # Using items as total sales indicator
            transaction["nft_floor_price"] = _extract_eth_value(stats.get("floorPrice", []))
            transaction["nft_market_cap"] = _extract_eth_value(stats.get("marketCap", []))
            transaction["nft_total_volume"] = _extract_eth_value(stats.get("volume", []))
            
            # Use highestSale as average price indicator, or calculate from volume/sales
            highest_sale = _extract_eth_value(stats.get("highestSale", []))
            if highest_sale > 0:
                transaction["nft_average_price"] = highest_sale
            else:
                # Fallback: estimate from volume/sales if available
                volume = transaction.get("nft_total_volume", 0)
                sales = transaction.get("nft_total_sales", 0)
                if sales > 0 and volume > 0:
                    transaction["nft_average_price"] = volume / sales
                else:
                    transaction["nft_average_price"] = transaction.get("nft_floor_price", 0)
            
            # Set 7-day metrics to 0 (not available in current API response)
            transaction["nft_7day_volume"] = 0
            transaction["nft_7day_sales"] = 0
            transaction["nft_7day_avg_price"] = 0
            
    except Exception as e:
        # If collection statistics not found or error, try fallback to owner's items
        try:
            owner = transaction.get("to_address", "")
            if owner:
                items = await items_by_owner(owner, size=1)
                total = items.get("total", 0) or 0
                # Use owner's item count as a rough indicator
                if total > 0:
                    transaction["nft_num_owners"] = max(1, min(total, 10000))
                    transaction["nft_total_sales"] = total
                # Keep other default values (0)
        except Exception:
            # Keep default values (all 0)
            pass
    finally:
        enrich_time = time.time() - enrich_start
        logger.debug(f"⏱️ [TIMING] NFT enrichment for {contract_address[:10]}...: {enrich_time:.2f}s")
    
    return transaction

async def enrich_transactions_with_nft_data(transactions: list[Dict[str, Any]]) -> list[Dict[str, Any]]:
    """Enrich a list of transactions with NFT data"""
    enriched = []
    for txn in transactions:
        enriched_txn = await enrich_transaction_with_nft_data(txn)
        enriched.append(enriched_txn)
    return enriched

