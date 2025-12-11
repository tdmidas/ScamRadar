# Local NFT Dapp (Hardhat + Static Frontend)

Mục tiêu: mô phỏng blockchain cục bộ và gửi NFT để kích hoạt alert popup của extension.

## Cấu trúc
- `hardhat.config.js`: cấu hình mạng localhost.
- `contracts/LocalNFT.sol`: ERC721 tối giản.
- `scripts/deploy.js`: deploy + mint sẵn 1 NFT cho account deployer.
- `dapp/index.html`: web dapp đơn giản gọi MetaMask, chuyển NFT.

## Chuẩn bị
```bash
cd scamradar/local-dapp
npm install
```
Dependencies chính: `hardhat`, `@nomicfoundation/hardhat-toolbox`, `@openzeppelin/contracts`.

## Chạy mạng cục bộ
```bash
npx hardhat node
# RPC: http://127.0.0.1:8545, chainId 31337
```

## Deploy NFT
Trong terminal khác:
```bash
npx hardhat run scripts/deploy.js --network localhost
```
Log sẽ in địa chỉ contract (paste vào dapp nếu cần). Script sẽ mint tokenId 0 cho account deployer.

## Cấu hình MetaMask
- Add network: RPC `http://127.0.0.1:8545`, chainId `31337`.
- Import private key account #0 từ hardhat node (có sẵn ETH và NFT).

## Chạy dapp frontend
```bash
cd dapp
npx serve -l 8080 .
# hoặc: python -m http.server 8080
```
Mở `http://localhost:8080`.

## Dùng dapp để trigger alert
1) Click Connect → MetaMask request accounts.  
2) Click Send NFT → nhập địa chỉ nhận (ví dụ account #1 từ node).  
3) MetaMask sẽ mở cửa sổ ký `safeTransferFrom`; extension sẽ intercept và bật popup cảnh báo (khi backend đang chạy và API URL đúng).

## Lưu ý
- Backend phải chạy (vd: `python run.py` ở thư mục `scamradar/backend`).
- Extension phải build/load và trỏ đúng API.  
- Nếu đổi địa chỉ contract, cập nhật `nftAddress` trong `dapp/index.html`.


