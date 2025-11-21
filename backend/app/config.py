from pydantic import BaseModel
import os
import json

class Settings(BaseModel):
    api_title: str = os.getenv("API_TITLE", "ScamRadar Backend")
    api_version: str = os.getenv("API_VERSION", "0.1.0")
    api_debug: bool = os.getenv("API_DEBUG", "false").lower() == "true"
    database_url: str = os.getenv("DATABASE_URL", "sqlite:///./scamradar.db")
    policy_etag: str = os.getenv("POLICY_ETAG", "v1")
    
    # Etherscan API Key
    etherscan_api_key: str = os.getenv("ETHERSCAN_API_KEY", "ZJYVMX6ET1YKH7SPUPTQAU4H85FQPX8AJI")
    etherscan_keys: list[str] = []
    etherscan_chainid: int = int(os.getenv("ETHERSCAN_CHAINID", "1"))  # 1 for Ethereum mainnet
    
    # Rarible API Key
    rarible_api_key: str = os.getenv("RARIBLE_API_KEY", "272de419-da98-42df-9a13-392bdc064d68")
    
    # Gemini API Key
    gemini_api_key: str = os.getenv("GEMINI_API_KEY", "AIzaSyDkDZqABR8vavJJuBC6u-8_z7l3EcHDJfA")
    
    # Model paths
    model_dir: str = os.getenv("MODEL_DIR", "models")
    features_dir: str = os.getenv("FEATURES_DIR", "features")

settings = Settings()

# Support multiple Etherscan keys
raw_keys = os.getenv("ETHERSCAN_KEYS") or settings.etherscan_api_key
if raw_keys:
    try:
        settings.etherscan_keys = json.loads(raw_keys) if raw_keys.startswith("[") else [raw_keys]
    except Exception:
        settings.etherscan_keys = [k.strip() for k in raw_keys.split(",") if k.strip()]

