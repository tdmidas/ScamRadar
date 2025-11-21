"""
LLM Explainer using Google Gemini API
Provides natural language explanations for model predictions based on SHAP values
"""
import google.generativeai as genai
import logging
import time
from typing import Dict, List, Optional, Any
from app.config import settings

logger = logging.getLogger(__name__)


class LLMExplainer:
    def __init__(self, api_key: Optional[str] = None):
        api_key = api_key or settings.gemini_api_key
        if not api_key:
            raise ValueError("Gemini API key not provided")
        genai.configure(api_key=api_key)
        self.model = genai.GenerativeModel('gemini-2.0-flash')
        
    def _translate_feature_name(self, name: str) -> str:
        """Translate technical feature names to human-readable descriptions"""
        translations = {
            "avg_gas_price": "average transaction fee",
            "activity_duration_days": "account age in days",
            "std_time_between_txns": "irregularity in transaction timing",
            "total_volume": "total amount transferred",
            "inNeighborNum": "number of unique senders",
            "total_txn": "total number of transactions",
            "in_out_ratio": "ratio of incoming to outgoing transactions",
            "total_value_in": "total amount received",
            "outNeighborNum": "number of unique recipients",
            "avg_gas_used": "average transaction complexity",
            "giftinTxn_ratio": "proportion of token transfers",
            "miningTxnNum": "number of mining transactions",
            "avg_value_out": "average amount sent",
            "turnover_ratio": "frequency of fund movements",
            "out_txn": "number of outgoing transactions",
            "gas_price": "transaction fee",
            "gas_used": "transaction complexity",
            "value": "transaction amount",
            "num_functions": "number of contract interactions",
            "has_suspicious_func": "presence of suspicious functions",
            "nft_num_owners": "number of NFT owners",
            "nft_total_sales": "total NFT sales volume",
            "token_value": "token transfer value",
            "nft_total_volume": "total NFT trading volume",
            "is_mint": "is a new token creation",
            "high_gas": "high transaction fee",
            "nft_average_price": "average NFT price",
            "nft_floor_price": "minimum NFT price",
            "nft_market_cap": "total NFT market value",
            "is_zero_value": "zero-value transaction"
        }
        return translations.get(name, name)
    
    def _format_features_for_prompt(self, features: List[Dict]) -> str:
        """Format feature importance data for the prompt"""
        formatted = []
        for f in features:
            feature_name = self._translate_feature_name(f["feature_name"])
            impact = "increasing risk" if f["shap_value"] > 0 else "decreasing risk"
            formatted.append(f"- {feature_name} (value={f['feature_value']:.2f}): {impact}, importance={abs(f['shap_value']):.4f}")
        return "\n".join(formatted)
    
    async def explain_top_features(self, 
                                   prediction_prob: float,
                                   task_type: str,
                                   top_features: List[Dict],
                                   max_words: int = 50) -> Dict[str, Any]:
        """
        Generate explanation for top features using Gemini
        Returns JSON format with feature name, value, and reason
        
        Args:
            prediction_prob: Model prediction probability (0-1)
            task_type: 'account' or 'transaction'
            top_features: List of top features with shap_value and feature_value
            max_words: Maximum words in explanation (default 50, shorter for extension)
        
        Returns:
            Dictionary with format: {
                "feature_name": "Gas price",
                "feature_value": 1000000,
                "reason": "High gas price indicates potential scam..."
            }
        """
        risk_level = "HIGH" if prediction_prob > 0.7 else ("MEDIUM" if prediction_prob > 0.4 else "LOW")
        
        # Get top feature only (most important)
        top_feature = top_features[0] if top_features else None
        if not top_feature:
            return {
                "feature_name": "Unknown",
                "feature_value": 0,
                "reason": "No features available for analysis"
            }
        
        feature_name = self._translate_feature_name(top_feature['feature_name'])
        feature_value = top_feature['feature_value']
        impact = "increasing risk" if top_feature['shap_value'] > 0 else "decreasing risk"
        
        prompt = f"""Analyze Web3 {task_type} risk. Return ONLY valid JSON, no other text.

Risk: {prediction_prob:.1%} ({risk_level})
Top feature: {feature_name} = {feature_value:.2f} ({impact}, importance={abs(top_feature['shap_value']):.4f})

Return JSON:
{{
  "reason": "Explain why this {feature_name} value ({feature_value:.2f}) is {impact} for this {task_type}. Be concise (max 20 words)."
}}"""

        try:
            api_start = time.time()
            response = self.model.generate_content(
                prompt,
                generation_config={
                    "temperature": 0.3,
                    "max_output_tokens": 100,
                }
            )
            api_time = time.time() - api_start
            logger.debug(f"⏱️ [TIMING] Gemini API generate_content ({task_type}): {api_time:.2f}s")
            
            explanation_text = response.text.strip()
            
            # Try to extract JSON from response
            import json
            import re
            
            # Remove markdown code blocks if present
            explanation_text = re.sub(r'```json\s*', '', explanation_text)
            explanation_text = re.sub(r'```\s*', '', explanation_text)
            explanation_text = explanation_text.strip()
            
            try:
                # Try to parse as JSON
                json_data = json.loads(explanation_text)
                reason = json_data.get('reason', '')
                
                # Format feature value based on type
                formatted_value = self._format_feature_value(top_feature['feature_name'], feature_value)
                
                return {
                    "feature_name": feature_name,
                    "feature_value": formatted_value,
                    "reason": reason
                }
            except json.JSONDecodeError:
                # If not valid JSON, use fallback
                logger.warning(f"Failed to parse Gemini JSON response: {explanation_text[:100]}")
                formatted_value = self._format_feature_value(top_feature['feature_name'], feature_value)
                return {
                    "feature_name": feature_name,
                    "feature_value": formatted_value,
                    "reason": f"This {feature_name} value ({formatted_value}) is {impact} for this {task_type}."
                }
            
        except Exception as e:
            logger.error(f"Error generating LLM explanation: {e}")
            # Fallback to simple explanation
            formatted_value = self._format_feature_value(top_feature['feature_name'], feature_value)
            risk_desc = "increasing risk" if top_feature['shap_value'] > 0 else "decreasing risk"
            return {
                "feature_name": feature_name,
                "feature_value": formatted_value,
                "reason": f"This {feature_name} value ({formatted_value}) is {risk_desc}."
            }
    
    def _format_feature_value(self, feature_name: str, value: float) -> str:
        """Format feature value for display"""
        # Format based on feature type
        if 'gas_price' in feature_name or 'gas_used' in feature_name:
            # Format as integer for gas
            return str(int(value))
        elif 'value' in feature_name and 'eth' not in feature_name.lower():
            # Format as integer for token values
            return str(int(value))
        elif 'eth' in feature_name.lower() or 'price' in feature_name.lower():
            # Format with decimals for ETH/price
            return f"{value:.4f}"
        elif 'ratio' in feature_name or 'duration' in feature_name:
            # Format with 2 decimals for ratios/durations
            return f"{value:.2f}"
        else:
            # Default: integer if whole number, else 2 decimals
            if value == int(value):
                return str(int(value))
            return f"{value:.2f}"

