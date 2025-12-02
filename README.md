# Hướng Dẫn Sử Dụng Repository - Backend và Extension

## 📋 Mục Lục

1. [Tổng Quan](#tổng-quan)
2. [Backend Setup](#backend-setup)
3. [Extension Setup](#extension-setup)
4. [Sử Dụng Backend API](#sử-dụng-backend-api)
5. [Sử Dụng Extension](#sử-dụng-extension)
6. [Kết Nối Backend và Extension](#kết-nối-backend-và-extension)
7. [Troubleshooting](#troubleshooting)

---

## 📖 Tổng Quan
Link repo : https://github.com/tdmidas/ScamRadar


Repository này bao gồm:
- **Backend**: API server sử dụng FastAPI để phát hiện scam/phishing trong giao dịch Web3
- **Extension**: Chrome extension để chặn và phân tích giao dịch MetaMask trong thời gian thực


---

## 🚀 Backend Setup

### Yêu Cầu Hệ Thống

- Python 3.8 trở lên
- Model file: `MTL_MLP_best.pth` (đã có trong `backend/models/`)

### Cài Đặt

#### Bước 1: Cài Đặt Dependencies

```bash
cd backend
pip install -r requirements.txt
```

#### Bước 2: Kiểm Tra Cấu Trúc Thư Mục

Đảm bảo bạn có cấu trúc sau:

```
backend/
├── app/
│   ├── main.py
│   ├── config.py
│   ├── routers/
│   │   └── detect.py
│   └── services/
│       ├── detection_service.py
│       ├── model_loader.py
│       ├── feature_engineer.py
│       ├── etherscan_client.py
│       ├── rarible_client.py
│       ├── shap_explainer.py
│       └── llm_explainer.py
├── models/
│   └── MTL_MLP_best.pth  ← File model phải có
├── features/
│   ├── AccountLevel_top15_features.json
│   └── TransactionLevel_top15_features.json
├── requirements.txt
└── run.py
```

#### Bước 3: Cấu Hình Environment Variables

Tạo file `.env` trong thư mục `backend/` (nếu chưa có):

```env
# Etherscan API
ETHERSCAN_API_KEY=

# Rarible API
RARIBLE_API_KEY=

# Gemini API (cho LLM explanations)
GEMINI_API_KEY=

# Model và Features Path
MODEL_DIR=./models
FEATURES_DIR=./features
```

#### Bước 4: Chạy Backend

```bash
# Cách 1: Sử dụng run.py (khuyến nghị)
python run.py

# Cách 2: Sử dụng uvicorn trực tiếp
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Backend sẽ chạy tại: `http://localhost:8000`

Khi khởi động thành công, bạn sẽ thấy:
```
INFO: Loading model at startup...
INFO: ✓ Model loaded successfully
INFO: ✓ Account features: 15
INFO: ✓ Transaction features: 15
INFO: Backend ready!
```

### Kiểm Tra Backend

```bash
# Health check
curl http://localhost:8000/health

# Root endpoint
curl http://localhost:8000/
```

---

## 🌐 Extension Setup

### Yêu Cầu Hệ Thống

- Node.js 16+ và npm
- Google Chrome browser

### Cài Đặt

#### Bước 1: Cài Đặt Dependencies

```bash
cd extension
npm install
```

#### Bước 2: Build Extension

```bash
# Build cho production
npm run build

# Hoặc chạy development mode với hot reload
npm run dev
```

Sau khi build, extension sẽ được tạo trong thư mục `.output/chrome-mv3/`

#### Bước 3: Load Extension vào Chrome

1. Mở Chrome và truy cập `chrome://extensions/`
2. Bật **Developer mode** (góc trên bên phải)
3. Click **Load unpacked**
4. Chọn thư mục: `extension/.output/chrome-mv3`

Extension sẽ xuất hiện trong danh sách extensions của bạn.

### Cấu Hình Extension

Mở file `extension/popup/main.ts` và kiểm tra API URL:

```typescript
const API_BASE_URL = 'http://localhost:8000'; // Đảm bảo đúng với backend
```

Nếu backend chạy trên port khác hoặc domain khác, cập nhật URL này.

---

## 🔌 Sử Dụng Backend API

### API Endpoints

#### 1. Health Check

```bash
GET /health
```

**Response:**
```json
{
  "status": "healthy",
  "model_loaded": true
}
```

#### 2. Phân Tích Account (Account Detection)

```bash
POST /detect
POST /detect/account
```

**Request Body:**
```json
{
  "account_address": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
  "explain": true,
  "explain_with_llm": true,
  "max_transactions": 1000
}
```

**Response:**
```json
{
  "account_address": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
  "account_scam_probability": 0.85,
  "detection_mode": "account_level",
  "explanation": {
    "shap": {...},
    "llm": "This account shows high risk indicators..."
  }
}
```

**Ví dụ sử dụng cURL:**
```bash
curl -X POST http://localhost:8000/detect \
  -H "Content-Type: application/json" \
  -d '{
    "account_address": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
    "explain": true,
    "explain_with_llm": true
  }'
```

#### 3. Phân Tích Transaction (Transaction Detection)

```bash
POST /detect/transaction
```

**Request Body (Mode 1: Manual với transaction hash):**
```json
{
  "transaction_hash": "0x1234...",
  "explain": true,
  "explain_with_llm": true
}
```

**Request Body (Mode 2: Pending transaction từ Extension):**
```json
{
  "from_address": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
  "to_address": "0x1234567890123456789012345678901234567890",
  "value": "1000000000000000000",
  "gasPrice": "20000000000",
  "input": "0x...",
  "contract_address": "0x...",
  "explain": true,
  "explain_with_llm": true
}
```

**Response:**
```json
{
  "transaction_scam_probability": 0.72,
  "detection_mode": "transaction_level",
  "from_address": "0x...",
  "to_address": "0x...",
  "explanation": {
    "shap": {...},
    "llm": "This transaction shows suspicious patterns..."
  }
}
```

### Tham Số API

| Tham Số | Loại | Mô Tả |
|---------|------|-------|
| `account_address` | string | Địa chỉ Ethereum cần phân tích |
| `transaction_hash` | string | Hash của transaction (cho manual analysis) |
| `from_address` | string | Địa chỉ gửi (cho pending transaction) |
| `to_address` | string | Địa chỉ nhận (cho pending transaction) |
| `value` | string | Giá trị giao dịch (wei) |
| `explain` | boolean | Có bao gồm SHAP explanations không |
| `explain_with_llm` | boolean | Có bao gồm LLM explanations không |
| `max_transactions` | int | Số lượng transaction tối đa để fetch (mặc định: 1000) |

---

## 🎯 Sử Dụng Extension

### Chức Năng Chính

1. **Phân Tích Account**: Nhập địa chỉ wallet để kiểm tra rủi ro
2. **Phân Tích Transaction**: Nhập transaction hash để phân tích
3. **Tự Động Chặn Giao Dịch**: Tự động phân tích khi người dùng ký giao dịch MetaMask

### Cách Sử Dụng

#### 1. Phân Tích Account (Manual)

1. Click vào icon extension trên Chrome toolbar
2. Nhập địa chỉ Ethereum vào ô "Analyze Account"
3. Click nút "Analyze"
4. Xem kết quả:
   - Account Risk Score (0-1)
   - Giải thích chi tiết (nếu có)
   - Top features ảnh hưởng

#### 2. Phân Tích Transaction (Manual)

1. Click vào icon extension
2. Nhập transaction hash vào ô "Analyze Transaction"
3. Click nút "Analyze"
4. Xem kết quả phân tích transaction

#### 3. Tự Động Chặn Giao Dịch (Real-time)

1. Mở một dApp sử dụng MetaMask (ví dụ: OpenSea, Uniswap)
2. Thực hiện một giao dịch (transfer NFT, swap token, etc.)
3. Extension sẽ tự động:
   - Chặn giao dịch trước khi ký
   - Mở popup với phân tích rủi ro
   - Hiển thị:
     - Địa chỉ From/To
     - Số lượng ETH/token
     - Thông tin NFT (nếu có)
     - Account Risk Score
     - Transaction Risk Score
     - Giải thích chi tiết
4. Người dùng có thể:
   - **Reject**: Hủy giao dịch
   - **Continue**: Tiếp tục ký giao dịch trong MetaMask
   - **View on Etherscan**: Mở địa chỉ trên Etherscan

### Flow Hoạt Động

```
1. User khởi tạo transaction trong MetaMask
   ↓
2. Content script chặn window.ethereum.request()
   ↓
3. Transaction data được gửi đến background script
   ↓
4. Background script lưu data và mở popup
   ↓
5. Popup gọi backend API:
   ├─> /detect (cho account analysis)
   └─> /detect/transaction (nếu account mới)
   ↓
6. Backend trả về risk scores + explanations
   ↓
7. Popup hiển thị phân tích rủi ro
   ↓
8. User quyết định:
   ├─> Reject → Transaction bị hủy
   └─> Continue → Transaction tiếp tục trong MetaMask
```

---

## 🔗 Kết Nối Backend và Extension

### Cấu Hình Kết Nối

1. **Backend phải chạy trước Extension**
   ```bash
   # Terminal 1: Chạy backend
   cd backend
   python run.py
   ```

2. **Kiểm tra Backend đang chạy**
   ```bash
   curl http://localhost:8000/health
   ```

3. **Cấu hình Extension API URL**
   - Mở `extension/popup/main.ts`
   - Đảm bảo `API_BASE_URL` trỏ đúng backend:
   ```typescript
   const API_BASE_URL = 'http://localhost:8000';
   ```

4. **Rebuild Extension** (nếu thay đổi config)
   ```bash
   cd extension
   npm run build
   ```

5. **Reload Extension trong Chrome**
   - Vào `chrome://extensions/`
   - Click nút reload trên extension card

### Kiểm Tra Kết Nối

1. Mở Chrome DevTools (F12)
2. Vào tab **Console**
3. Click extension icon
4. Thực hiện một phân tích
5. Kiểm tra console logs để xem API calls

---


