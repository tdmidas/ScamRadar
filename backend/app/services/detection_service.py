"""
Detection Service
Main service that orchestrates the detection flow:
1. Fetch data from Etherscan and Rarible APIs
2. Feature engineering
3. Model prediction
4. SHAP explanation
5. LLM explanation
"""
import torch
import numpy as np
import logging
import time
from typing import Dict, Any, Optional, List
from app.services.etherscan_client import get_account_transactions
from app.services.rarible_client import enrich_transactions_with_nft_data, enrich_transaction_with_nft_data
from app.services.feature_engineer import extract_account_level_features, extract_transaction_level_features
from app.services.model_loader import get_model, get_feature_names
from app.services.shap_explainer import SHAPExplainer
from app.services.llm_explainer import LLMExplainer

logger = logging.getLogger(__name__)


class DetectionService:
    def __init__(self):
        logger.info("Initializing DetectionService components...")
        self.model = get_model()
        self.account_feature_names, self.transaction_feature_names = get_feature_names()
        logger.info(f"Loaded {len(self.account_feature_names)} account features, {len(self.transaction_feature_names)} transaction features")
        
        self.shap_explainer = SHAPExplainer(self.model, device="cpu")
        logger.info("SHAP explainer initialized")
        
        try:
            self.llm_explainer = LLMExplainer()
            logger.info("LLM explainer initialized successfully")
        except Exception as e:
            logger.warning(f"LLM explainer not available: {e}")
            self.llm_explainer = None
    
    async def detect_transaction(
        self,
        transaction_data: Dict[str, Any],
        explain: bool = False,
        explain_with_llm: bool = False
    ) -> Dict[str, Any]:
        """
        Detect phishing/scam activity for a single transaction
        
        Args:
            transaction_data: Transaction data with from_address, to_address, value, etc.
            explain: Include SHAP explanations
            explain_with_llm: Include LLM explanations
        
        Returns:
            Detection results for transaction-level only
        """
        start_time = time.time()
        logger.info("⏱️ [TIMING] Starting transaction detection")
        
        # Enrich transaction with NFT data
        rarible_start = time.time()
        enriched_transaction = await enrich_transaction_with_nft_data(transaction_data)
        rarible_time = time.time() - rarible_start
        logger.info(f"⏱️ [TIMING] Rarible API enrichment: {rarible_time:.2f}s")
        
        # Extract transaction-level features only
        feature_start = time.time()
        transaction_features = extract_transaction_level_features([enriched_transaction])
        feature_time = time.time() - feature_start
        logger.info(f"⏱️ [TIMING] Feature extraction: {feature_time:.3f}s")
        
        # Make prediction using transaction-level model only
        model_start = time.time()
        with torch.no_grad():
            transaction_features_tensor = torch.tensor(transaction_features, dtype=torch.float32).unsqueeze(0)
            transaction_logit = self.model(transaction_features_tensor, task_id='transaction').squeeze()
            transaction_prob = float(torch.sigmoid(transaction_logit).item())
        model_time = time.time() - model_start
        logger.info(f"⏱️ [TIMING] Model inference: {model_time:.3f}s")
        
        response = {
            "account_address": transaction_data.get("from_address", ""),
            "to_address": transaction_data.get("to_address", ""),
            "account_scam_probability": None,  # Not available for new accounts
            "transaction_scam_probability": transaction_prob,
            "transactions_count": 1,
            "detection_mode": "transaction_only"  # Indicate this is transaction-only detection
        }
        
        # Generate SHAP explanations if requested
        if explain or explain_with_llm:
            shap_start = time.time()
            transaction_explanation = self.shap_explainer.explain_prediction(
                transaction_features.reshape(1, -1),
                'transaction',
                self.transaction_feature_names,
                apply_sigmoid=True
            )
            shap_time = time.time() - shap_start
            logger.info(f"⏱️ [TIMING] SHAP explanation: {shap_time:.2f}s")
            
            response["explanations"] = {
                "account": None,  # No account-level explanation
                "transaction": transaction_explanation
            }
            
            # Generate LLM explanations if requested
            if explain_with_llm and self.llm_explainer:
                try:
                    gemini_start = time.time()
                    transaction_llm_explanation = await self.llm_explainer.explain_top_features(
                        transaction_prob,
                        "transaction",
                        transaction_explanation["feature_importance"],
                        max_words=100
                    )
                    gemini_time = time.time() - gemini_start
                    logger.info(f"⏱️ [TIMING] Gemini API call: {gemini_time:.2f}s")
                    
                    # LLM explanation is now a dict with feature_name, feature_value, reason
                    response["llm_explanations"] = {
                        "account": None,
                        "transaction": transaction_llm_explanation
                    }
                except Exception as e:
                    logger.error(f"⏱️ [TIMING] Gemini API failed after {time.time() - gemini_start:.2f}s: {str(e)}")
                    response["llm_explanations"] = {
                        "account": None,
                        "transaction": {
                            "feature_name": "Unknown",
                            "feature_value": "0",
                            "reason": f"Failed to generate LLM explanation: {str(e)}"
                        }
                    }
        
        total_time = time.time() - start_time
        logger.info(f"⏱️ [TIMING] Total transaction detection: {total_time:.2f}s")
        return response

    async def detect_account(
        self,
        account_address: str,
        explain: bool = False,
        explain_with_llm: bool = False,
        max_transactions: int = 1000
    ) -> Dict[str, Any]:
        """
        Main detection function for an account address
        
        Flow:
        1. Fetch transactions from Etherscan
        2. Enrich with NFT data from Rarible
        3. Extract features (account-level and transaction-level)
        4. Make predictions
        5. Generate SHAP explanations (if requested)
        6. Generate LLM explanations (if requested)
        """
        start_time = time.time()
        logger.info("⏱️ [TIMING] Starting account detection")
        
        # Step 1: Fetch transactions from Etherscan
        etherscan_start = time.time()
        transactions = await get_account_transactions(account_address, max_txns=max_transactions)
        etherscan_time = time.time() - etherscan_start
        logger.info(f"⏱️ [TIMING] Etherscan API ({len(transactions)} transactions): {etherscan_time:.2f}s")
        
        if not transactions:
            total_time = time.time() - start_time
            logger.info(f"⏱️ [TIMING] Total account detection (no data): {total_time:.2f}s")
            # Return response indicating transaction-only mode should be used
            return {
                "account_address": account_address,
                "account_scam_probability": None,  # Not available
                "transaction_scam_probability": None,  # Need transaction data
                "transactions_count": 0,
                "detection_mode": "no_data",  # Indicate no data available
                "message": "No transactions found for this address. Please provide transaction data for transaction-level detection."
            }
        
        # Step 2: Enrich with NFT data from Rarible
        rarible_start = time.time()
        enriched_transactions = await enrich_transactions_with_nft_data(transactions)
        rarible_time = time.time() - rarible_start
        logger.info(f"⏱️ [TIMING] Rarible API enrichment ({len(transactions)} transactions): {rarible_time:.2f}s")
        
        # Step 3: Extract features
        feature_start = time.time()
        account_features = extract_account_level_features(account_address, enriched_transactions)
        transaction_features = extract_transaction_level_features(enriched_transactions)
        feature_time = time.time() - feature_start
        logger.info(f"⏱️ [TIMING] Feature extraction: {feature_time:.3f}s")
        
        # Step 4: Make predictions
        model_start = time.time()
        with torch.no_grad():
            account_features_tensor = torch.tensor(account_features, dtype=torch.float32).unsqueeze(0)
            transaction_features_tensor = torch.tensor(transaction_features, dtype=torch.float32).unsqueeze(0)
            
            account_logit = self.model(account_features_tensor, task_id='account').squeeze()
            transaction_logit = self.model(transaction_features_tensor, task_id='transaction').squeeze()
            
            account_prob = float(torch.sigmoid(account_logit).item())
            transaction_prob = float(torch.sigmoid(transaction_logit).item())
        model_time = time.time() - model_start
        logger.info(f"⏱️ [TIMING] Model inference (account + transaction): {model_time:.3f}s")
        
        # Build response
        response = {
            "account_address": account_address,
            "account_scam_probability": account_prob,
            "transaction_scam_probability": transaction_prob,
            "transactions_count": len(enriched_transactions)
        }
        
        # Step 5: Generate SHAP explanations if requested
        if explain or explain_with_llm:
            shap_start = time.time()
            account_explanation = self.shap_explainer.explain_prediction(
                account_features.reshape(1, -1),
                'account',
                self.account_feature_names,
                apply_sigmoid=True
            )
            
            transaction_explanation = self.shap_explainer.explain_prediction(
                transaction_features.reshape(1, -1),
                'transaction',
                self.transaction_feature_names,
                apply_sigmoid=True
            )
            shap_time = time.time() - shap_start
            logger.info(f"⏱️ [TIMING] SHAP explanations (account + transaction): {shap_time:.2f}s")
            
            response["explanations"] = {
                "account": account_explanation,
                "transaction": transaction_explanation
            }
            
            # Step 6: Generate LLM explanations if requested
            if explain_with_llm and self.llm_explainer:
                try:
                    gemini_start = time.time()
                    account_llm_explanation = await self.llm_explainer.explain_top_features(
                        account_prob,
                        "account",
                        account_explanation["feature_importance"],
                        max_words=100
                    )
                    account_gemini_time = time.time() - gemini_start
                    logger.info(f"⏱️ [TIMING] Gemini API (account): {account_gemini_time:.2f}s")
                    
                    transaction_gemini_start = time.time()
                    transaction_llm_explanation = await self.llm_explainer.explain_top_features(
                        transaction_prob,
                        "transaction",
                        transaction_explanation["feature_importance"],
                        max_words=100
                    )
                    transaction_gemini_time = time.time() - transaction_gemini_start
                    logger.info(f"⏱️ [TIMING] Gemini API (transaction): {transaction_gemini_time:.2f}s")
                    
                    total_gemini_time = account_gemini_time + transaction_gemini_time
                    logger.info(f"⏱️ [TIMING] Total Gemini API calls: {total_gemini_time:.2f}s")
                    
                    # LLM explanations are now dicts with feature_name, feature_value, reason
                    response["llm_explanations"] = {
                        "account": account_llm_explanation,
                        "transaction": transaction_llm_explanation
                    }
                except Exception as e:
                    logger.error(f"⏱️ [TIMING] Gemini API failed after {time.time() - gemini_start:.2f}s: {str(e)}")
                    response["llm_explanations"] = {
                        "account": {
                            "feature_name": "Unknown",
                            "feature_value": "0",
                            "reason": f"Failed to generate LLM explanation: {str(e)}"
                        },
                        "transaction": {
                            "feature_name": "Unknown",
                            "feature_value": "0",
                            "reason": f"Failed to generate LLM explanation: {str(e)}"
                        }
                    }
        
        total_time = time.time() - start_time
        logger.info(f"⏱️ [TIMING] Total account detection: {total_time:.2f}s")
        return response

