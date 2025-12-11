import '../popup/style.css';

// Web3 Antivirus Popup Main Script

const API_BASE_URL = 'http://localhost:8000';

// Views
const transactionView = document.getElementById('transaction-view');
const defaultView = document.getElementById('default-view');

// Transaction View Elements
const fromAddressEl = document.getElementById('from-address');
const toAddressEl = document.getElementById('to-address');
const ethValueEl = document.getElementById('eth-value');
const usdValueEl = document.getElementById('usd-value');
const nftDetailEl = document.getElementById('nft-detail');
const nftInfoEl = document.getElementById('nft-info');
const nftSendInfoEl = document.getElementById('nft-send-info');
const nftTokenIdEl = document.getElementById('nft-token-id');
const nftContractEl = document.getElementById('nft-contract');
const ethValueDisplayEl = document.getElementById('eth-value-display');
const networkDisplayEl = document.getElementById('network-display');
const requestFromDisplayEl = document.getElementById('request-from-display');
const networkFeeDisplayEl = document.getElementById('network-fee-display');
const gasPriceDisplayEl = document.getElementById('gas-price-display');
const gasUsedDisplayEl = document.getElementById('gas-used-display');
const etherscanWarningEl = document.getElementById('etherscan-warning');
const accountRiskEl = document.getElementById('account-risk');
const transactionRiskEl = document.getElementById('transaction-risk');
const riskExplanationsEl = document.getElementById('risk-explanations');
const etherscanLinkEl = document.getElementById('etherscan-link');
const rejectBtn = document.getElementById('reject-btn');
const continueBtn = document.getElementById('continue-btn');

// Default View Elements
const accountInput = document.getElementById('account-input') as HTMLInputElement;
const analyzeAccountBtn = document.getElementById('analyze-account-btn');
const accountResult = document.getElementById('account-result');
const accountRiskScore = document.getElementById('account-risk-score');
const accountExplanation = document.getElementById('account-explanation');

const transactionInput = document.getElementById('transaction-input') as HTMLInputElement;
const analyzeTransactionBtn = document.getElementById('analyze-transaction-btn');
const transactionResult = document.getElementById('transaction-result');
const transactionRiskScore = document.getElementById('transaction-risk-score');
const transactionExplanation = document.getElementById('transaction-explanation');

// Check for pending transaction on load
// Also check URL parameter for alert mode
const urlParams = new URLSearchParams(window.location.search);
const isAlertMode = urlParams.get('source') === 'alert';

console.log('[Web3 Antivirus] Popup loaded, isAlertMode:', isAlertMode);

chrome.storage.local.get(['pendingTransaction', 'transactionTimestamp'], (result) => {
  console.log('[Web3 Antivirus] Storage result:', result);
  console.log('[Web3 Antivirus] Transaction data:', JSON.stringify(result.pendingTransaction, null, 2));
  
  if (result.pendingTransaction) {
    // Check if transaction is recent (within last 30 seconds)
    const now = Date.now();
    const txTime = result.transactionTimestamp || 0;
    const isRecent = (now - txTime) < 30000; // 30 seconds
    
    console.log('[Web3 Antivirus] Transaction details:', {
      from: result.pendingTransaction.from,
      to: result.pendingTransaction.to,
      data: result.pendingTransaction.data,
      dataLength: result.pendingTransaction.data?.length,
      isRecent,
      isAlertMode
    });
    
    if (isAlertMode || isRecent) {
      console.log('[Web3 Antivirus] Showing transaction view');
      showTransactionView(result.pendingTransaction);
    } else {
      console.log('[Web3 Antivirus] Transaction too old, showing default view');
      showDefaultView();
    }
  } else {
    console.log('[Web3 Antivirus] No pending transaction, showing default view');
    showDefaultView();
  }
});

// Decode recipient address from NFT transfer calldata
function extractRecipientAddressFromCalldata(data: string): string | null {
  console.log('[Web3 Antivirus] extractRecipientAddressFromCalldata called with data:', data);
  
  if (!data || data === '0x' || data === '0x0') {
    console.log('[Web3 Antivirus] No data or empty data');
    return null;
  }
  
  // Need at least 4 (selector) + 32 (from) + 32 (to) = 138 chars including 0x
  if (data.length < 138) {
    console.log('[Web3 Antivirus] Data too short:', data.length, 'expected at least 138');
    return null;
  }
  
  const sanitized = data.startsWith('0x') ? data.slice(2) : data;
  if (sanitized.length < 136) {
    console.log('[Web3 Antivirus] Sanitized data too short:', sanitized.length, 'expected at least 136');
    return null;
  }
  
  // Extract function selector (first 4 bytes = 8 hex chars)
  const selector = `0x${sanitized.slice(0, 8).toLowerCase()}`;
  console.log('[Web3 Antivirus] Function selector:', selector);
  
  // NFT transfer function selectors
  const nftTransferSelectors = [
    '0x23b872dd', // transferFrom(address,address,uint256)
    '0x42842e0e', // safeTransferFrom(address,address,uint256)
    '0xb88d4fde', // safeTransferFrom(address,address,uint256,bytes)
  ];
  
  if (!nftTransferSelectors.includes(selector)) {
    console.log('[Web3 Antivirus] Not an NFT transfer function selector');
    return null; // Not an NFT transfer function
  }
  
  // Extract recipient address (word 1: bytes 36-67 = hex chars 72-135)
  // Skip selector (8 chars) + from address (64 chars) = start at char 72
  const recipientHex = sanitized.slice(72, 136);
  
  console.log('[Web3 Antivirus] Extracted recipient hex (64 chars):', recipientHex);
  console.log('[Web3 Antivirus] Recipient hex length:', recipientHex.length);
  
  // Address is padded with zeros, extract last 40 hex chars (20 bytes = address)
  // The address is right-aligned in the 32-byte word
  const addressHex = recipientHex.slice(-40); // Last 40 hex chars
  const recipientAddress = `0x${addressHex}`;
  
  console.log('[Web3 Antivirus] Extracted address hex (40 chars):', addressHex);
  console.log('[Web3 Antivirus] Extracted recipient address:', recipientAddress);
  
  // Validate address (should be 42 chars including 0x)
  if (recipientAddress.length === 42 && recipientAddress.match(/^0x[a-fA-F0-9]{40}$/)) {
    const normalized = recipientAddress.toLowerCase();
    console.log('[Web3 Antivirus] ✅ Valid recipient address found:', normalized);
    return normalized;
  }
  
  console.log('[Web3 Antivirus] ❌ Invalid recipient address format:', recipientAddress);
  return null;
}

// Extract NFT info (token ID and contract address) from calldata
function extractNFTInfo(data: string, contractAddress: string): { tokenId: string | null, contractAddress: string } | null {
  console.log('[Web3 Antivirus] extractNFTInfo called with data:', data, 'contract:', contractAddress);
  
  if (!data || data === '0x' || data === '0x0') {
    return null;
  }
  
  const sanitized = data.startsWith('0x') ? data.slice(2) : data;
  if (sanitized.length < 136) {
    return null;
  }
  
  // Extract function selector
  const selector = `0x${sanitized.slice(0, 8).toLowerCase()}`;
  
  // NFT transfer function selectors
  const nftTransferSelectors = [
    '0x23b872dd', // transferFrom(address,address,uint256)
    '0x42842e0e', // safeTransferFrom(address,address,uint256)
    '0xb88d4fde', // safeTransferFrom(address,address,uint256,bytes)
  ];
  
  if (!nftTransferSelectors.includes(selector)) {
    return null;
  }
  
  // Extract token ID (word 2: bytes 68-99 = hex chars 136-199)
  // Skip selector (8) + from (64) + to (64) = start at char 136
  if (sanitized.length < 200) {
    return null;
  }
  
  const tokenIdHex = sanitized.slice(136, 200);
  const tokenId = BigInt(`0x${tokenIdHex}`).toString();
  
  console.log('[Web3 Antivirus] Extracted NFT info:', { tokenId, contractAddress });
  
  return { tokenId, contractAddress };
}

// Check Etherscan for phishing/scam warnings
async function checkEtherscanWarning(address: string): Promise<boolean> {
  if (!address || address.length !== 42) {
    return false;
  }
  
  try {
    // Use CORS proxy or fetch directly (if extension has permissions)
    const url = `https://etherscan.io/address/${address}`;
    
    // Try to fetch via background script or use CORS proxy
    const response = await fetch(url, {
      method: 'GET',
      mode: 'no-cors', // This won't work for reading response, need alternative
    });
    
    // Alternative: Use chrome.tabs API to scrape (requires background script)
    // For now, we'll use a simple approach: try to detect via content script message
    // Or use a CORS proxy service
    
    // Since direct fetch won't work due to CORS, we'll use chrome.runtime.sendMessage
    // to ask background script to fetch
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(
        {
          action: 'checkEtherscanWarning',
          address: address
        },
        (response: any) => {
          if (chrome.runtime.lastError) {
            console.log('[Web3 Antivirus] Error checking Etherscan:', chrome.runtime.lastError);
            resolve(false);
          } else {
            resolve(response?.hasWarning || false);
          }
        }
      );
    });
  } catch (error) {
    console.error('[Web3 Antivirus] Error checking Etherscan warning:', error);
    return false;
  }
}

// Resolve transaction addresses (for NFT transfers, decode from calldata)
function resolveTransactionAddresses(transactionData: any): { recipientAddress: string, contractAddress: string } {
  const rawTo = transactionData.to || '';
  const data = transactionData.data || '';
  
  console.log('[Web3 Antivirus] resolveTransactionAddresses - rawTo:', rawTo, 'data length:', data.length);
  
  // Try to extract recipient from calldata (for NFT transfers)
  const decodedRecipient = extractRecipientAddressFromCalldata(data);
  
  // If we decoded a recipient from calldata, use it; otherwise use raw 'to' address
  const recipientAddress = decodedRecipient || rawTo;
  
  // Contract address is always the 'to' field (the NFT contract)
  const contractAddress = rawTo;
  
  console.log('[Web3 Antivirus] resolveTransactionAddresses result:', {
    decodedRecipient,
    recipientAddress,
    contractAddress
  });
  
  return { recipientAddress, contractAddress };
}

// Show transaction view
async function showTransactionView(transactionData: any) {
  console.log('[Web3 Antivirus] showTransactionView called with data:', transactionData);
  console.log('[Web3 Antivirus] Raw transaction data:', {
    from: transactionData.from,
    to: transactionData.to,
    data: transactionData.data,
    dataLength: transactionData.data?.length
  });
  
  // Resolve recipient address (decode from calldata if NFT transfer)
  const { recipientAddress, contractAddress } = resolveTransactionAddresses(transactionData);
  
  console.log('[Web3 Antivirus] Resolved addresses:', { 
    rawTo: transactionData.to, 
    recipientAddress, 
    contractAddress,
    willUseRecipient: recipientAddress !== transactionData.to
  });
  
  // Force use decoded recipient if available
  const finalRecipientAddress = recipientAddress && recipientAddress !== transactionData.to 
    ? recipientAddress 
    : transactionData.to;
  
  console.log('[Web3 Antivirus] Final recipient address to display:', finalRecipientAddress);
  
  // Remove hidden class and add active
  transactionView?.classList.remove('hidden');
  transactionView?.classList.add('active');
  defaultView?.classList.remove('active');
  defaultView?.classList.add('hidden');
  
  // Display transaction details
  if (fromAddressEl) fromAddressEl.textContent = formatAddress(transactionData.from || '');
  
  // Always use resolved recipient address for display
  const displayToAddress = finalRecipientAddress || transactionData.to || '';
  console.log('[Web3 Antivirus] Displaying to address:', displayToAddress);
  console.log('[Web3 Antivirus] toAddressEl element:', toAddressEl);
  if (toAddressEl) {
    toAddressEl.textContent = formatAddress(displayToAddress);
    console.log('[Web3 Antivirus] ✅ toAddressEl updated with:', displayToAddress, 'formatted:', formatAddress(displayToAddress));
  } else {
    console.error('[Web3 Antivirus] ❌ toAddressEl is null!');
  }
  
  // Helper function to parse hex or decimal to BigInt
  function parseToBigInt(value: string | number | undefined, defaultValue: bigint = BigInt(0)): bigint {
    if (!value) return defaultValue;
    if (typeof value === 'number') return BigInt(value);
    if (typeof value === 'string' && value.startsWith('0x')) {
      return BigInt(value);
    }
    if (typeof value === 'string') {
      const parsed = parseInt(value, 10);
      return isNaN(parsed) ? defaultValue : BigInt(parsed);
    }
    return defaultValue;
  }
  
  // Helper function to get network name from chainId
  function getNetworkName(chainId: string | number | undefined): string {
    if (!chainId) return 'Unknown';
    let chainIdNum: number;
    if (typeof chainId === 'string') {
      if (chainId.startsWith('0x')) {
        chainIdNum = parseInt(chainId, 16);
      } else {
        chainIdNum = parseInt(chainId, 10);
      }
    } else {
      chainIdNum = chainId;
    }
    
    const networkMap: { [key: number]: string } = {
      1: 'Ethereum',
      5: 'Goerli',
      11155111: 'Sepolia',
      137: 'Polygon',
      80001: 'Mumbai',
      56: 'BSC',
      97: 'BSC Testnet',
      42161: 'Arbitrum',
      10: 'Optimism'
    };
    
    return networkMap[chainIdNum] || `Chain ${chainIdNum}`;
  }
  
  // Display "You send" section
  const value = hexToEth(transactionData.value || '0x0');
  const isNFT = transactionData.data && transactionData.data !== '0x' && transactionData.data.length > 10;
  
  if (isNFT) {
    // Show NFT info in "You send" section
    const nftInfo = extractNFTInfo(transactionData.data, contractAddress);
    if (nftInfo && nftSendInfoEl && nftTokenIdEl && nftContractEl) {
      if (ethValueDisplayEl) ethValueDisplayEl.style.display = 'none';
      nftSendInfoEl.style.display = 'block';
      nftTokenIdEl.textContent = `#${nftInfo.tokenId}`;
      nftContractEl.textContent = formatAddress(nftInfo.contractAddress);
    } else {
      if (ethValueDisplayEl) ethValueDisplayEl.style.display = 'flex';
      if (nftSendInfoEl) nftSendInfoEl.style.display = 'none';
      if (ethValueEl) ethValueEl.textContent = value.toFixed(4);
      if (usdValueEl) usdValueEl.textContent = `($${(value * 2000).toFixed(2)})`;
    }
  } else {
    // Show ETH value
    if (ethValueDisplayEl) ethValueDisplayEl.style.display = 'flex';
    if (nftSendInfoEl) nftSendInfoEl.style.display = 'none';
    if (ethValueEl) ethValueEl.textContent = value.toFixed(4);
    if (usdValueEl) usdValueEl.textContent = `($${(value * 2000).toFixed(2)})`;
  }
  
  // Display network
  const chainId = transactionData.chainId || '0x1';
  const networkName = getNetworkName(chainId);
  if (networkDisplayEl) {
    networkDisplayEl.textContent = networkName;
  }
  
  // Display request from (origin) - try to get from active tab
  if (requestFromDisplayEl) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs && tabs[0] && tabs[0].url) {
        try {
          const url = new URL(tabs[0].url);
          // Only show hostname if it's not a chrome-extension:// URL
          if (url.protocol === 'chrome-extension:') {
            // Try to get the original tab that initiated the transaction
            // For now, show a more user-friendly message
            requestFromDisplayEl.textContent = 'Extension';
          } else {
            requestFromDisplayEl.textContent = url.hostname;
          }
        } catch {
          // If origin is an extension ID, show something more user-friendly
          const origin = transactionData.origin || 'Unknown';
          if (origin.length === 32 && !origin.includes('.')) {
            // Likely an extension ID
            requestFromDisplayEl.textContent = 'Extension';
          } else {
            requestFromDisplayEl.textContent = origin;
          }
        }
      } else {
        // If origin is an extension ID, show something more user-friendly
        const origin = transactionData.origin || 'Unknown';
        if (origin.length === 32 && !origin.includes('.')) {
          // Likely an extension ID
          requestFromDisplayEl.textContent = 'Extension';
        } else {
          requestFromDisplayEl.textContent = origin;
        }
      }
    });
  }
  
  // Calculate and display network fee (gas price * gas limit)
  const gasPrice = transactionData.gasPrice || transactionData.maxFeePerGas || transactionData.maxPriorityFeePerGas || '0x0';
  const gasLimit = transactionData.gas || transactionData.gasLimit || '0x0';
  const gasUsed = transactionData.gasUsed || gasLimit; // Use gasUsed if available, otherwise use gasLimit
  
  console.log('[Web3 Antivirus] Gas price raw value:', gasPrice, 'type:', typeof gasPrice);
  
  try {
    const gasPriceWei = parseToBigInt(gasPrice);
    const gasLimitWei = parseToBigInt(gasLimit);
    const gasUsedWei = parseToBigInt(gasUsed);
    const totalFeeWei = gasPriceWei * gasLimitWei;
    const totalFeeEth = Number(totalFeeWei) / 1e18;
    
    console.log('[Web3 Antivirus] Gas price parsed:', {
      raw: gasPrice,
      wei: gasPriceWei.toString(),
      gwei: Number(gasPriceWei) / 1e9
    });
    
    // Display network fee
    if (networkFeeDisplayEl) {
      if (totalFeeEth > 0 && isFinite(totalFeeEth)) {
        networkFeeDisplayEl.textContent = `${totalFeeEth.toFixed(6)} ${networkName}ETH`;
      } else {
        networkFeeDisplayEl.textContent = `0 ${networkName}ETH`;
      }
    }
    
    // Display gas price in gwei
    if (gasPriceDisplayEl) {
      if (gasPriceWei > BigInt(0)) {
        const gasPriceGwei = Number(gasPriceWei) / 1e9;
        console.log('[Web3 Antivirus] Gas price in gwei:', gasPriceGwei);
        
        if (gasPriceGwei >= 1000) {
          gasPriceDisplayEl.textContent = `${(gasPriceGwei / 1000).toFixed(2)}k gwei`;
        } else if (gasPriceGwei < 0.00000001) {
          // For very small values, show in wei
          gasPriceDisplayEl.textContent = `${Number(gasPriceWei).toLocaleString()} wei`;
        } else if (gasPriceGwei < 0.01) {
          // Show with more decimal places for small values
          gasPriceDisplayEl.textContent = `${gasPriceGwei.toFixed(8)} gwei`;
        } else {
          gasPriceDisplayEl.textContent = `${gasPriceGwei.toFixed(2)} gwei`;
        }
      } else {
        gasPriceDisplayEl.textContent = '0.00000000 gwei';
      }
    }
    
    // Display gas used
    if (gasUsedDisplayEl) {
      if (gasUsedWei > BigInt(0)) {
        const gasUsedNum = Number(gasUsedWei);
        if (gasUsedNum >= 1000000) {
          gasUsedDisplayEl.textContent = `${(gasUsedNum / 1000000).toFixed(2)}M`;
        } else if (gasUsedNum >= 1000) {
          gasUsedDisplayEl.textContent = `${(gasUsedNum / 1000).toFixed(2)}k`;
        } else {
          gasUsedDisplayEl.textContent = gasUsedNum.toLocaleString();
        }
      } else {
        gasUsedDisplayEl.textContent = '0';
      }
    }
  } catch (error) {
    console.error('[Web3 Antivirus] Error calculating gas info:', error);
    if (networkFeeDisplayEl) {
      networkFeeDisplayEl.textContent = `0 ${networkName}ETH`;
    }
    if (gasPriceDisplayEl) {
      gasPriceDisplayEl.textContent = '0 gwei';
    }
    if (gasUsedDisplayEl) {
      gasUsedDisplayEl.textContent = '0';
    }
  }
  
  // Check Etherscan warning for recipient address
  if (finalRecipientAddress && etherscanWarningEl) {
    checkEtherscanWarning(finalRecipientAddress).then(hasWarning => {
      if (hasWarning && etherscanWarningEl) {
        etherscanWarningEl.style.display = 'block';
      } else if (etherscanWarningEl) {
        etherscanWarningEl.style.display = 'none';
      }
    }).catch(err => {
      console.error('[Web3 Antivirus] Error checking Etherscan warning:', err);
    });
  }
  
  // Set Etherscan link to recipient address
  if (etherscanLinkEl && etherscanLinkEl instanceof HTMLAnchorElement) {
    etherscanLinkEl.href = `https://etherscan.io/address/${finalRecipientAddress || transactionData.to || ''}`;
    console.log('[Web3 Antivirus] Etherscan link set to:', etherscanLinkEl.href);
  }
  
  // Hide warning section initially (will show after analysis)
  const warningSection = document.getElementById('warning-section');
  if (warningSection) {
    warningSection.style.display = 'none';
  }
  
  // Analyze transaction (pass resolved addresses)
  await analyzeTransactionForPopup(transactionData, finalRecipientAddress, contractAddress);
}

// Show default view
function showDefaultView() {
  defaultView?.classList.remove('hidden');
  defaultView?.classList.add('active');
  transactionView?.classList.remove('active');
  transactionView?.classList.add('hidden');
}

// Progress tracker that syncs with actual backend steps
class ProgressTracker {
  private startTime: number;
  private isAccount: boolean;
  private isTransaction: boolean;
  private circle: SVGCircleElement | null;
  private percentEl: HTMLElement | null;
  private stageEl: HTMLElement | null;
  private fillEl: HTMLElement | null;
  private textEl: HTMLElement | null;
  private intervalId: number | null = null;
  private currentProgress: number = 0;
  private circumference: number = 0;

  // Estimated time percentages for each step (based on actual backend timing)
  private readonly ACCOUNT_STEPS = [
    { name: 'Fetching transactions', progress: 0.40, duration: 5000 },  // 40% in ~5s
    { name: 'Enriching NFT data', progress: 0.70, duration: 3000 },    // 30% in ~3s
    { name: 'Extracting features', progress: 0.80, duration: 1000 },    // 10% in ~1s
    { name: 'Running model', progress: 0.90, duration: 1000 },          // 10% in ~1s
    { name: 'Generating explanations', progress: 0.98, duration: 2000 } // 8% in ~2s
  ];

  private readonly TRANSACTION_STEPS = [
    { name: 'Enriching NFT data', progress: 0.30, duration: 2000 },     // 30% in ~2s
    { name: 'Extracting features', progress: 0.50, duration: 500 },     // 20% in ~0.5s
    { name: 'Running model', progress: 0.60, duration: 500 },          // 10% in ~0.5s
    { name: 'Generating explanations', progress: 0.85, duration: 2000 }, // 25% in ~2s
    { name: 'Finalizing', progress: 0.98, duration: 1000 }             // 13% in ~1s
  ];

  constructor(baseId: string, isAccount: boolean, isTransaction: boolean) {
    this.startTime = Date.now();
    this.isAccount = isAccount;
    this.isTransaction = isTransaction;
    
    // Get circle elements
    this.circle = document.getElementById(`circle-progress-${baseId}`) as SVGCircleElement | null;
    this.percentEl = document.getElementById(`circle-percent-${baseId}`);
    this.stageEl = document.getElementById(`circle-stage-${baseId}`);
    
    // Get progress bar elements (if exists)
    this.fillEl = document.getElementById(`progress-fill-${baseId}`);
    this.textEl = document.getElementById(`progress-text-${baseId}`);

    if (this.circle) {
      const radius = this.circle.r.baseVal.value;
      this.circumference = 2 * Math.PI * radius;
      this.circle.style.strokeDasharray = `${this.circumference} ${this.circumference}`;
      this.circle.style.strokeDashoffset = `${this.circumference}`;
    }

    this.start();
  }

  private start() {
    const steps = this.isAccount ? this.ACCOUNT_STEPS : this.TRANSACTION_STEPS;
    let currentStepIndex = 0;
    const elapsedStart = Date.now();

    const updateProgress = () => {
      const elapsed = Date.now() - elapsedStart;
      let targetProgress = 0;
      let currentStep = null;

      // Find current step based on elapsed time
      let cumulativeTime = 0;
      for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        cumulativeTime += step.duration;
        
        if (elapsed <= cumulativeTime) {
          currentStep = step;
          // Calculate progress within this step
          const stepStartTime = cumulativeTime - step.duration;
          const stepElapsed = elapsed - stepStartTime;
          const stepProgress = Math.min(stepElapsed / step.duration, 1);
          
          // Get previous step progress
          const prevProgress = i > 0 ? steps[i - 1].progress : 0;
          targetProgress = prevProgress + (step.progress - prevProgress) * stepProgress;
          break;
        }
      }

      // If all steps completed, stay at 98% until API response
      if (!currentStep) {
        targetProgress = 0.98;
      }

      this.setProgress(targetProgress, currentStep?.name || 'Finalizing...');
    };

    // Update every 50ms for smooth animation
    this.intervalId = window.setInterval(updateProgress, 50);
  }

  private setProgress(progress: number, stage: string) {
    this.currentProgress = Math.max(0, Math.min(98, progress)); // Cap at 98% until API response
    
    // Update circle
    if (this.circle && this.circumference > 0) {
      const offset = this.circumference - (this.currentProgress / 100) * this.circumference;
      this.circle.style.strokeDashoffset = `${offset}`;
    }
    
    // Update percentage
    if (this.percentEl) {
      this.percentEl.textContent = `${Math.round(this.currentProgress)}%`;
    }
    
    // Update stage (hidden but kept for debugging)
    if (this.stageEl) {
      this.stageEl.textContent = stage;
    }

    // Update progress bar if exists
    if (this.fillEl) {
      this.fillEl.style.width = `${this.currentProgress}%`;
    }
    if (this.textEl) {
      this.textEl.textContent = `${Math.round(this.currentProgress)}% • ${stage}`;
    }
  }

  complete() {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.setProgress(100, 'Complete');
  }

  stop() {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }
}

// Trackers for account and transaction
let accountProgressTracker: ProgressTracker | null = null;
let transactionProgressTracker: ProgressTracker | null = null;

// Helper: circular progress animation for popup (synced with backend)
function animateCircularProgress(baseId: string, isAccount: boolean = false, isTransaction: boolean = false) {
  // Stop existing tracker if any
  if (isAccount && accountProgressTracker) {
    accountProgressTracker.stop();
  }
  if (isTransaction && transactionProgressTracker) {
    transactionProgressTracker.stop();
  }

  // Create new tracker
  const tracker = new ProgressTracker(baseId, isAccount, isTransaction);
  
  if (isAccount) {
    accountProgressTracker = tracker;
  }
  if (isTransaction) {
    transactionProgressTracker = tracker;
  }

  return tracker;
}

// Helper: show circular progress in the popup risk score cards
function showPopupRiskProgress() {
  const makeCard = (label: string, idSuffix: string) => `
    <div class="score-label">${label}</div>
    <div class="score-value loading">
      <div class="circle-progress-wrapper">
        <svg class="circle-svg" width="92" height="92">
          <circle class="circle-bg" cx="46" cy="46" r="36"></circle>
          <circle class="circle-progress" id="circle-progress-${idSuffix}" cx="46" cy="46" r="36"></circle>
        </svg>
        <div class="circle-inner">
          <div class="circle-percent" id="circle-percent-${idSuffix}">0%</div>
          <div class="circle-stage" id="circle-stage-${idSuffix}">Initializing...</div>
        </div>
      </div>
    </div>
  `;

  if (accountRiskEl) {
    accountRiskEl.innerHTML = makeCard('Account Risk', 'account-popup');
  }
  if (transactionRiskEl) {
    transactionRiskEl.innerHTML = makeCard('Transaction Risk', 'tx-popup');
  }

  // Kick off animations after DOM paint (with proper flags)
  setTimeout(() => {
    animateCircularProgress('account-popup', true, false);
    animateCircularProgress('tx-popup', false, true);
  }, 50);
}

// Helper: show linear progress bar in Risk Detail section (popup alert)
function showRiskDetailProgress() {
  if (!riskExplanationsEl) return;

  riskExplanationsEl.innerHTML = `
    <div class="progress-container">
      <div class="progress-bar-wrapper">
        <div class="progress-bar">
          <div class="progress-fill" id="progress-fill-risk-detail" style="width: 5%;"></div>
          <div class="progress-shine" id="progress-shine-risk-detail"></div>
        </div>
        <div class="progress-text" id="progress-text-risk-detail">10% • Initializing...</div>
      </div>
    </div>
  `;

  setTimeout(() => {
    animateProgressBar('progress-fill-risk-detail', 'progress-text-risk-detail', 'progress-shine-risk-detail');
  }, 50);
}

// Analyze transaction for popup
async function analyzeTransactionForPopup(transactionData: any, recipientAddress?: string, contractAddress?: string) {
  // Show linear progress bar in Risk Detail + circular progress in score cards
  showRiskDetailProgress();
  showPopupRiskProgress();
  
  try {
    // Use resolved recipient address if provided, otherwise resolve it
    const resolvedRecipient = recipientAddress || resolveTransactionAddresses(transactionData).recipientAddress;
    const resolvedContract = contractAddress || resolveTransactionAddresses(transactionData).contractAddress;
    
    console.log('[Web3 Antivirus] Analyzing account:', resolvedRecipient);
    
    // Analyze account (recipient address) using /detect/account endpoint
    const accountResult = await fetch(`${API_BASE_URL}/detect/account`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        account_address: resolvedRecipient,
        explain: true,
        explain_with_llm: true
      })
    });
    
    const accountData = await accountResult.json();
    
    // Complete progress when API response received
    if (accountProgressTracker) {
      accountProgressTracker.complete();
    }
    
    // Check if account has no NFT transactions (ERC721/ERC1155)
    if (accountData.detection_mode === 'no_data') {
      // Account has no ERC721/ERC1155 transactions - show N/A
      if (accountRiskEl) {
        accountRiskEl.innerHTML = `
          <div class="score-label">Account Risk</div>
          <div class="score-value na">N/A<br/><span style="font-size: 10px;">New Account</span></div>
        `;
      }
      
      // Analyze transaction only (pass resolved addresses)
      const { recipientAddress: resolvedRecipient, contractAddress: resolvedContract } = resolveTransactionAddresses(transactionData);
      const txResult = await analyzeTransactionOnly(transactionData, accountData, resolvedRecipient, resolvedContract);
      displayRiskExplanations(accountData, txResult, transactionData);
      return;
    }
    
    // Account has transactions - display account risk
    const accountRisk = accountData.account_scam_probability || 0;
    updateRiskDisplay(accountRiskEl, accountRisk, 'Account Risk');
    
    // Analyze transaction (pass resolved addresses)
    const txResult = await analyzeTransactionOnly(transactionData, accountData, resolvedRecipient, resolvedContract);
    
    // Display transaction risk
    const txRisk = txResult.transaction_scam_probability || 0;
    updateRiskDisplay(transactionRiskEl, txRisk, 'Transaction Risk');
    
    // Show warning section only after analysis is complete
    showWarningSection(txRisk, accountRisk);
    
    // Display explanations (this will also hide loading)
    displayRiskExplanations(accountData, txResult, transactionData);
    
  } catch (error) {
    console.error('Error analyzing transaction:', error);
    hideLoading('risk-explanations');
    if (riskExplanationsEl) {
      riskExplanationsEl.innerHTML = '<div class="risk-item warning">Error analyzing transaction. Please try again.</div>';
    }
    // Show error in risk displays
    if (accountRiskEl) {
      accountRiskEl.innerHTML = `
        <div class="score-label">Account Risk</div>
        <div class="score-value">Error</div>
      `;
    }
    if (transactionRiskEl) {
      transactionRiskEl.innerHTML = `
        <div class="score-label">Transaction Risk</div>
        <div class="score-value">Error</div>
      `;
    }
  } finally {
    hideLoading('risk-explanations');
  }
}

// Show warning section based on risk level
function showWarningSection(txRisk: number, accountRisk: number | null) {
  const warningSection = document.getElementById('warning-section');
  const riskBadge = document.getElementById('risk-badge');
  const warningMessage = document.getElementById('warning-message');
  
  if (!warningSection) return;
  
  // Determine overall risk (use transaction risk if account risk not available)
  const overallRisk = accountRisk !== null ? Math.max(txRisk, accountRisk) : txRisk;
  
  if (overallRisk > 0.7) {
    // High risk
    warningSection.style.display = 'block';
    if (riskBadge) {
      riskBadge.className = 'risk-badge high-risk';
      const riskText = riskBadge.querySelector('.risk-text');
      if (riskText) riskText.textContent = 'High-risk transaction';
    }
    if (warningMessage) {
      warningMessage.textContent = 'We found critical risks.';
    }
  } else if (overallRisk > 0.4) {
    // Medium risk
    warningSection.style.display = 'block';
    if (riskBadge) {
      riskBadge.className = 'risk-badge medium-risk';
      const riskText = riskBadge.querySelector('.risk-text');
      if (riskText) riskText.textContent = 'Medium-risk transaction';
    }
    if (warningMessage) {
      warningMessage.textContent = 'Some risks detected.';
    }
  } else {
    // Low risk - hide warning
    warningSection.style.display = 'none';
  }
}

// Analyze transaction only (for new accounts)
async function analyzeTransactionOnly(transactionData: any, accountData?: any, recipientAddress?: string, contractAddress?: string) {
  // Use resolved addresses if provided, otherwise resolve them
  const resolvedRecipient = recipientAddress || resolveTransactionAddresses(transactionData).recipientAddress;
  const resolvedContract = contractAddress || resolveTransactionAddresses(transactionData).contractAddress;
  
  console.log('[Web3 Antivirus] Transaction analysis - recipient:', resolvedRecipient, 'contract:', resolvedContract);
  
  const response = await fetch(`${API_BASE_URL}/detect/transaction`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from_address: transactionData.from || '',
      to_address: resolvedRecipient, // Use resolved recipient address
      value: transactionData.value || '0x0',
      gasPrice: transactionData.gasPrice || '0x0',
      gasUsed: transactionData.gas || '0x0',
      function_call: extractFunctions(transactionData.data),
      input: transactionData.data || '0x',
      contract_address: resolvedContract, // Use resolved contract address
      token_value: '0',
      explain: true,
      explain_with_llm: true
    })
  });
  
  const result = await response.json();
  
  // Complete progress when API response received
  if (transactionProgressTracker) {
    transactionProgressTracker.complete();
  }
  
  // Account risk display is handled in analyzeTransactionForPopup
  // Only update if accountData is provided and has data
  if (accountData && accountData.detection_mode !== 'no_data' && accountData.account_scam_probability !== undefined) {
    const accountRisk = accountData.account_scam_probability || 0;
    updateRiskDisplay(accountRiskEl, accountRisk, 'Account Risk');
  }
  
  const txRisk = result.transaction_scam_probability || 0;
  updateRiskDisplay(transactionRiskEl, txRisk, 'Transaction Risk');
  
  // Show warning section after analysis
  const accountRisk = accountData?.account_scam_probability || null;
  showWarningSection(txRisk, accountRisk);
  
  // Hide loading (will be shown again in displayRiskExplanations if needed)
  hideLoading('risk-explanations');
  
  return result;
}

// Display risk explanations with correct format: [Risk_tag_box] - [feature_box] - value, then explanation
// Priority: Rule-based patterns first, then LLM explanations, then SHAP only if LLM not available
function displayRiskExplanations(accountData: any, txData: any, transactionData?: any) {
  if (!riskExplanationsEl) return;
  
  let html = '';
  const processedFeatures = new Set(); // Track processed features to avoid duplicates
  
  // Rule-based phishing pattern detection (highest priority - show first)
  if (transactionData) {
    const phishingPatterns = detectPhishingPatterns(transactionData);
    for (const pattern of phishingPatterns) {
      const severityClass = pattern.severity === 'high' ? 'critical' : pattern.severity === 'medium' ? 'warning' : 'low';
      html += `<div class="risk-item ${severityClass}">
        <div class="risk-header-row">
          <span class="risk-level-badge ${severityClass}">${pattern.severity.toUpperCase()}</span>
          <span class="risk-feature-box">${pattern.pattern}</span>
        </div>
        <div class="risk-item-desc">
          ${pattern.message}
          ${pattern.category ? `<div style="margin-top: 6px; font-size: 11px; color: var(--muted);">Category: ${pattern.category}</div>` : ''}
        </div>
        <div class="risk-numerical-details">
          <a href="${pattern.learnMoreUrl}" target="_blank" style="color: #667eea; text-decoration: none; font-size: 12px;">
            Learn more about this phishing pattern →
          </a>
        </div>
      </div>`;
    }
  }
  
  // Account LLM explanations (highest priority)
  if (accountData.llm_explanations?.account) {
    const accountExpl = accountData.llm_explanations.account;
    if (typeof accountExpl === 'object' && accountExpl.feature_name) {
      const featureName = formatFeatureName(accountExpl.feature_name);
      const featureValue = parseFloat(accountExpl.feature_value) || 0;
      const formattedValue = formatNumber(featureValue, accountExpl.feature_name);
      
      // Get SHAP value from explanations if available
      const shapValue = accountData.explanations?.account?.feature_importance?.find(
        (f: any) => f.feature_name === accountExpl.feature_name
      )?.shap_value || 0;
      
      // Calculate feature-specific risk level
      const featureRisk = getFeatureRiskLevel(shapValue, featureValue, accountExpl.feature_name);
      const riskLevel = featureRisk.level;
      const riskClass = featureRisk.class;
      
      const numericalDetails = formatNumericalDetails(accountExpl.feature_name, featureValue, accountData, null);
      
      // Embed transaction count in explanation if available
      let explanationText = accountExpl.reason || 'No explanation available.';
      if (accountData && accountData.transactions_count && accountData.transactions_count > 1) {
        // Insert transaction count into the explanation text naturally
        explanationText = explanationText.replace(/\.$/, ` (based on ${accountData.transactions_count} transactions).`);
      }
      
      processedFeatures.add(accountExpl.feature_name);
      
      html += `<div class="risk-item ${riskClass}">
        <div class="risk-header-row">
          <span class="risk-level-badge ${riskClass}">${riskLevel}</span>
          <span class="risk-feature-box">${featureName}</span>
        </div>
        <div class="risk-item-desc">${explanationText}</div>
        ${numericalDetails && numericalDetails.trim() ? `<div class="risk-numerical-details">${numericalDetails}</div>` : ''}
      </div>`;
    }
  }
  
  // Transaction LLM explanations (highest priority)
  if (txData.llm_explanations?.transaction) {
    const txExpl = txData.llm_explanations.transaction;
    if (typeof txExpl === 'object' && txExpl.feature_name && !processedFeatures.has(txExpl.feature_name)) {
      const featureName = formatFeatureName(txExpl.feature_name);
      const featureValue = parseFloat(txExpl.feature_value) || 0;
      const formattedValue = formatNumber(featureValue, txExpl.feature_name);
      
      // Get SHAP value from explanations if available
      const shapValue = txData.explanations?.transaction?.feature_importance?.find(
        (f: any) => f.feature_name === txExpl.feature_name
      )?.shap_value || 0;
      
      // Calculate feature-specific risk level
      const featureRisk = getFeatureRiskLevel(shapValue, featureValue, txExpl.feature_name);
      const riskLevel = featureRisk.level;
      const riskClass = featureRisk.class;
      
      const numericalDetails = formatNumericalDetails(txExpl.feature_name, featureValue, null, txData);
      
      processedFeatures.add(txExpl.feature_name);
      
      html += `<div class="risk-item ${riskClass}">
        <div class="risk-header-row">
          <span class="risk-level-badge ${riskClass}">${riskLevel}</span>
          <span class="risk-feature-box">${featureName}</span>
        </div>
        <div class="risk-item-desc">${txExpl.reason || 'No explanation available.'}</div>
        ${numericalDetails && numericalDetails.trim() ? `<div class="risk-numerical-details">${numericalDetails}</div>` : ''}
      </div>`;
    }
  }
  
  // SHAP/gradient explanations (only if LLM explanation not available for that feature)
  if (accountData.explanations?.account?.feature_importance) {
    const topFeature = accountData.explanations.account.feature_importance[0];
    if (topFeature && !processedFeatures.has(topFeature.feature_name)) {
      const featureName = formatFeatureName(topFeature.feature_name);
      const formattedValue = formatNumber(topFeature.feature_value, topFeature.feature_name);
      
      // Calculate feature-specific risk level
      const featureRisk = getFeatureRiskLevel(topFeature.shap_value, topFeature.feature_value, topFeature.feature_name);
      const riskLevel = featureRisk.level;
      const riskClass = featureRisk.class;
      
      const numericalDetails = formatNumericalDetails(topFeature.feature_name, topFeature.feature_value, accountData, null);
      
      processedFeatures.add(topFeature.feature_name);
      
      // Generate natural explanation with value embedded
      let shapExplanation = topFeature.shap_value > 0 
        ? `This account has ${featureName.toLowerCase()} of ${formattedValue}, which significantly increases risk and may indicate malicious activity.`
        : `This account's ${featureName.toLowerCase()} (${formattedValue}) is affecting risk assessment.`;
      
      // Embed transaction count in explanation if available
      if (accountData && accountData.transactions_count && accountData.transactions_count > 1) {
        shapExplanation = shapExplanation.replace(/\.$/, ` (based on ${accountData.transactions_count} transactions).`);
      }
      
      html += `<div class="risk-item ${riskClass}">
        <div class="risk-header-row">
          <span class="risk-level-badge ${riskClass}">${riskLevel}</span>
          <span class="risk-feature-box">${featureName}</span>
        </div>
        <div class="risk-item-desc">${shapExplanation}</div>
        ${numericalDetails && numericalDetails.trim() ? `<div class="risk-numerical-details">${numericalDetails}</div>` : ''}
      </div>`;
    }
  }
  
  if (txData.explanations?.transaction?.feature_importance) {
    const topFeature = txData.explanations.transaction.feature_importance[0];
    if (topFeature && !processedFeatures.has(topFeature.feature_name)) {
      const featureName = formatFeatureName(topFeature.feature_name);
      const formattedValue = formatNumber(topFeature.feature_value, topFeature.feature_name);
      
      // Calculate feature-specific risk level
      const featureRisk = getFeatureRiskLevel(topFeature.shap_value, topFeature.feature_value, topFeature.feature_name);
      const riskLevel = featureRisk.level;
      const riskClass = featureRisk.class;
      
      const numericalDetails = formatNumericalDetails(topFeature.feature_name, topFeature.feature_value, null, txData);
      
      processedFeatures.add(topFeature.feature_name);
      
      // Generate natural explanation with value embedded
      const shapExplanation = topFeature.shap_value > 0
        ? `This transaction has ${featureName.toLowerCase()} of ${formattedValue}, which indicates high risk and may be a phishing attempt.`
        : `This transaction's ${featureName.toLowerCase()} (${formattedValue}) may be suspicious.`;
      
      html += `<div class="risk-item ${riskClass}">
        <div class="risk-header-row">
          <span class="risk-level-badge ${riskClass}">${riskLevel}</span>
          <span class="risk-feature-box">${featureName}</span>
        </div>
        <div class="risk-item-desc">${shapExplanation}</div>
        ${numericalDetails && numericalDetails.trim() ? `<div class="risk-numerical-details">${numericalDetails}</div>` : ''}
      </div>`;
    }
  }
  
  riskExplanationsEl.innerHTML = html || '<div class="risk-item">No detailed risk information available.</div>';
  hideLoading('risk-explanations');
}

// Update risk display
function updateRiskDisplay(element: HTMLElement | null, risk: number, label: string) {
  if (!element) return;
  
  const riskClass = risk > 0.7 ? 'high' : risk > 0.4 ? 'medium' : 'low';
  const riskPercent = (risk * 100).toFixed(1);
  
  element.innerHTML = `
    <div class="score-label">${label}</div>
    <div class="score-value ${riskClass}">${riskPercent}%</div>
  `;
}

// Utility functions
function formatAddress(address: string): string {
  if (!address) return '-';
  if (address.length <= 10) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function hexToEth(hex: string): number {
  if (!hex || hex === '0x0' || hex === '0x') return 0;
  try {
    const wei = BigInt(hex);
    const eth = Number(wei) / 1e18;
    return eth;
  } catch {
    return 0;
  }
}

function extractFunctions(data: string): string[] {
  if (!data || data === '0x' || data.length < 10) return [];
  const selector = data.slice(0, 10);
  // Map common function selectors
  const functionMap: Record<string, string> = {
    '0x095ea7b3': 'approve',
    '0xa22cb465': 'setApprovalForAll',
    '0x23b872dd': 'transferFrom',
    '0x42842e0e': 'safeTransferFrom',
  };
  return functionMap[selector] ? [functionMap[selector]] : [];
}

// Rule-based phishing pattern detection
interface PhishingPattern {
  pattern: string;
  severity: 'high' | 'medium' | 'low';
  message: string;
  learnMoreUrl: string;
  category: string;
}

function detectPhishingPatterns(transactionData: any): PhishingPattern[] {
  const patterns: PhishingPattern[] = [];
  const data = transactionData.data || '0x';
  const value = transactionData.value || '0x0';
  const to = transactionData.to || '';
  
  if (!data || data === '0x' || data.length < 10) {
    // Even without data, check for dust transfer or other value-based patterns
    const valueNum = BigInt(value === '0x' || value === '0x0' ? '0x0' : value);
    if (valueNum > BigInt(0) && valueNum < BigInt('1000000000000000')) {
      patterns.push({
        pattern: 'dustValueTransfer',
        severity: 'low',
        message: '⚠️ Very small value transfer detected (dust transfer). This might be an address poisoning attack to contaminate your transaction history.',
        learnMoreUrl: 'https://www.coindesk.com/learn/what-is-address-poisoning-in-crypto/',
        category: 'Address Poisoning'
      });
    }
    return patterns;
  }
  
  const selector = data.slice(0, 10).toLowerCase();
  const valueNum = BigInt(value === '0x' || value === '0x0' ? '0x0' : value);
  
  // Track which patterns we've detected to avoid duplicates and enable combination detection
  let hasApprovalPattern = false;
  let hasTransferPattern = false;
  let hasZeroValue = valueNum === BigInt(0);
  let hasDustValue = valueNum > BigInt(0) && valueNum < BigInt('1000000000000000');
  
  // ========== PATTERN 2: Fraudulent Authorization (Category I: Ice Phishing) ==========
  
  // I-C: setApprovalForAll - HIGH RISK
  if (selector === '0xa22cb465') {
    hasApprovalPattern = true;
    patterns.push({
      pattern: 'setApprovalForAll',
      severity: 'high',
      message: '⚠️ SetApprovalForAll is used in this transaction. This grants unlimited permission to transfer ALL your NFTs from this collection to any address.',
      learnMoreUrl: 'https://ethereum.org/en/developers/docs/standards/tokens/erc-721/#approval',
      category: 'Fraudulent Authorization'
    });
  }
  
  // I-A: approve - HIGH RISK
  if (selector === '0x095ea7b3') {
    hasApprovalPattern = true;
    patterns.push({
      pattern: 'approve',
      severity: 'high',
      message: '⚠️ Approve function is used in this transaction. This grants permission to transfer your tokens/NFTs to a specific address.',
      learnMoreUrl: 'https://ethereum.org/en/developers/docs/standards/tokens/erc-20/#approve',
      category: 'Fraudulent Authorization'
    });
  }
  
  // I-A: increaseAllowance - HIGH RISK (ERC-20 optional)
  if (selector === '0x39509351') {
    hasApprovalPattern = true;
    patterns.push({
      pattern: 'increaseAllowance',
      severity: 'high',
      message: '⚠️ IncreaseAllowance function is used. This increases the approved amount for token transfers.',
      learnMoreUrl: 'https://ethereum.org/en/developers/docs/standards/tokens/erc-20/#approve',
      category: 'Fraudulent Authorization'
    });
  }
  
  // I-B: permit - HIGH RISK (off-chain signing)
  if (selector === '0xd505accf' || selector === '0x8fcb4ce1') {
    hasApprovalPattern = true;
    patterns.push({
      pattern: 'permit',
      severity: 'high',
      message: '⚠️ Permit function detected. This allows off-chain signing for token approvals.',
      learnMoreUrl: 'https://eips.ethereum.org/EIPS/eip-2612',
      category: 'Fraudulent Authorization'
    });
  }
  
  // ========== Transfer patterns ==========
  const isTransferFunction = selector === '0x23b872dd' || selector === '0x42842e0e' || selector === '0xb88d4fde';
  
  if (isTransferFunction) {
    hasTransferPattern = true;
    
    // ========== PATTERN 4: Induced Transfer ==========
    // Zero value NFT transfer - MEDIUM RISK
    if (hasZeroValue) {
      patterns.push({
        pattern: 'zeroValueTransfer',
        severity: 'medium',
        message: '⚠️ Zero value NFT transfer detected. This might be an address poisoning attack or induced transfer scam.',
        learnMoreUrl: 'https://www.coindesk.com/learn/what-is-address-poisoning-in-crypto/',
        category: 'Address Poisoning'
      });
    }
    
    // ========== PATTERN 2: Fraudulent Authorization - Transfer after approval ==========
    // If this is a transfer and we also detected approval, it's highly suspicious
    if (hasApprovalPattern) {
      patterns.push({
        pattern: 'approvalThenTransfer',
        severity: 'high',
        message: '🚨 CRITICAL: This transaction combines approval and transfer functions. This is a classic Fraudulent Authorization attack pattern where scammers get permission and immediately steal your NFTs.',
        learnMoreUrl: 'https://ethereum.org/en/developers/docs/standards/tokens/erc-721/#approval',
        category: 'Fraudulent Authorization'
      });
    } else {
      // Transfer without detected approval (could still be suspicious if approval happened earlier)
      patterns.push({
        pattern: 'suspiciousTransfer',
        severity: 'medium',
        message: '⚠️ NFT transfer function detected. If you recently approved this address, this could be part of a Fraudulent Authorization attack.',
        learnMoreUrl: 'https://ethereum.org/en/developers/docs/standards/tokens/erc-721/#approval',
        category: 'Fraudulent Authorization'
      });
    }
  }
  
  // ========== CATEGORY II: NFT Order Scam ==========
  
  // II-A: bulkTransfer - HIGH RISK
  // Common selectors for bulk transfer functions
  const bulkTransferSelectors = [
    '0x646cf558', // bulkTransfer (some implementations)
    '0x4e1273f4', // bulkTransfer (OpenSea-like)
  ];
  if (bulkTransferSelectors.includes(selector)) {
    patterns.push({
      pattern: 'bulkTransfer',
      severity: 'high',
      message: '⚠️ Bulk transfer function detected. Scammers often replace recipient addresses in bulk transfers to steal multiple NFTs.',
      learnMoreUrl: 'https://support.opensea.io/hc/en-us/articles/1500006975482',
      category: 'NFT Order Scam'
    });
  }
  
  // II-B: Proxy upgrade - CRITICAL RISK
  // Common upgrade function selectors
  const upgradeSelectors = [
    '0x3659cfe6', // upgradeTo (UUPS)
    '0x4f1ef286', // upgradeToAndCall (UUPS)
    '0x8f283970', // changeAdmin (Transparent Proxy)
  ];
  if (upgradeSelectors.includes(selector)) {
    patterns.push({
      pattern: 'proxyUpgrade',
      severity: 'high',
      message: '🚨 Proxy upgrade function detected. This is extremely dangerous! Scammers use this to replace proxy implementation and steal your NFTs.',
      learnMoreUrl: 'https://blog.openzeppelin.com/proxy-patterns/',
      category: 'NFT Order Scam'
    });
  }
  
  // ========== CATEGORY III: Address Poisoning ==========
  
  // III-A: Zero value transfer (already covered above in transfer section)
  
  // III-C: Dust value transfer - LOW RISK (small ETH value)
  // Check this separately from transfer functions, as dust can be sent with any transaction
  if (hasDustValue && !isTransferFunction) {
    patterns.push({
      pattern: 'dustValueTransfer',
      severity: 'low',
      message: '⚠️ Very small value transfer detected (dust transfer). This might be an address poisoning attack to contaminate your transaction history.',
      learnMoreUrl: 'https://www.coindesk.com/learn/what-is-address-poisoning-in-crypto/',
      category: 'Address Poisoning'
    });
  }
  
  // Combined pattern: Dust transfer + suspicious function
  if (hasDustValue && (hasApprovalPattern || isTransferFunction)) {
    patterns.push({
      pattern: 'dustWithSuspiciousFunction',
      severity: 'medium',
      message: '⚠️ This transaction combines a dust value transfer with a suspicious function. This could be a sophisticated address poisoning attack combined with other phishing patterns.',
      learnMoreUrl: 'https://www.coindesk.com/learn/what-is-address-poisoning-in-crypto/',
      category: 'Address Poisoning'
    });
  }
  
  // ========== CATEGORY IV: Payable Function Scam ==========
  
  // IV-A: Airdrop/Claim functions - MEDIUM RISK
  const airdropSelectors = [
    '0x379607f5', // claim()
    '0x4e71d92d', // claimReward()
    '0x372500ab', // claimRewards()
    '0x2e7ba6ef', // claimAirdrop()
  ];
  if (airdropSelectors.includes(selector) && valueNum > BigInt(0)) {
    patterns.push({
      pattern: 'airdropFunction',
      severity: 'medium',
      message: '⚠️ Airdrop/Claim function detected with ETH value. This might be a Payable Function Scam. Scammers steal your native tokens when you call these functions.',
      learnMoreUrl: 'https://ethereum.org/en/developers/docs/smart-contracts/security/',
      category: 'Payable Function Scam'
    });
  }
  
  // IV-B: Wallet-like functions - HIGH RISK
  const walletFunctionSelectors = [
    '0x3af32abf', // SecurityUpdate() or similar
    '0x8da5cb5b', // update() or similar
  ];
  // Check for payable functions with suspicious names (via function selector or if value > 0)
  if (valueNum > BigInt(0) && to && to.length === 42) {
    // If transaction sends ETH to a contract, it might be a payable function scam
    // We can't detect function name from selector alone, but we flag suspicious payable calls
    const suspiciousPatterns = ['update', 'upgrade', 'connect', 'security'];
    // This is heuristic - in real implementation, we'd decode function name
  }
  
  // ========== PATTERN 1: Deceptive Signature ==========
  // This is harder to detect from transaction data alone as it involves off-chain signatures
  // But we can detect atomicMatch() calls with suspicious parameters
  const isAtomicMatch = selector === '0xab834bab' || selector === '0x88316456'; // atomicMatch variants
  if (isAtomicMatch) {
    patterns.push({
      pattern: 'atomicMatch',
      severity: 'high',
      message: '⚠️ Atomic match function detected (OpenSea/Blur order matching). This could be a Deceptive Signature attack if the order price is 0 ETH or malicious.',
      learnMoreUrl: 'https://support.opensea.io/hc/en-us/articles/1500006975482',
      category: 'Deceptive Signature'
    });
    
    // Combined: Atomic match with zero value = highly suspicious
    if (hasZeroValue) {
      patterns.push({
        pattern: 'freeBuyOrder',
        severity: 'high',
        message: '🚨 CRITICAL: Atomic match with zero value detected. This is a Free Buy Order scam where scammers set malicious parameters to buy your NFTs at 0 ETH.',
        learnMoreUrl: 'https://support.opensea.io/hc/en-us/articles/1500006975482',
        category: 'Deceptive Signature'
      });
    }
  }
  
  // ========== Multiple Pattern Detection Summary ==========
  // If we detected multiple high-severity patterns, add a summary warning
  const highSeverityPatterns = patterns.filter(p => p.severity === 'high');
  if (highSeverityPatterns.length > 1) {
    patterns.push({
      pattern: 'multipleHighRiskPatterns',
      severity: 'high',
      message: `🚨 CRITICAL: This transaction contains ${highSeverityPatterns.length} high-risk phishing patterns simultaneously. This is extremely suspicious and likely a sophisticated multi-vector attack.`,
      learnMoreUrl: 'https://ethereum.org/en/developers/docs/smart-contracts/security/',
      category: 'Multi-Pattern Attack'
    });
  }
  
  // ========== PATTERN 3: Stealing Identity Credentials ==========
  // This is hard to detect from single transaction as it's an off-chain attack
  // But we can flag if transaction transfers multiple types of tokens (heuristic)
  // This would require analyzing multiple transactions, which is beyond single tx scope
  
  return patterns;
}

function formatFeatureName(name: string): string {
  const map: Record<string, string> = {
    'activity_duration_days': 'Activity Duration',
    'avg_gas_price': 'Average Transaction Fee',
    'gas_price': 'Transaction Fee',
    'gas_used': 'Gas Used',
    'value': 'Transaction Value',
    'has_suspicious_func': 'Suspicious Functions',
    'is_mint': 'Mint Transaction',
    'nft_num_owners': 'NFT Owners',
    'nft_total_volume': 'NFT Total Volume',
    'token_value': 'Token Value',
    'is_zero_value': 'Zero Value',
    'high_gas': 'High Gas',
    'num_functions': 'Function Calls',
  };
  return map[name] || name.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
}

// Format number with commas and appropriate units
function formatNumber(value: number, featureName: string): string {
  // Handle invalid/negative values
  if (value < 0) {
    // Negative values are invalid, treat as 0
    value = 0;
  }
  
  // Handle zero values
  if (value === 0) {
    // For gas price, show a simple 0 gwei to avoid misleading precision
    if (featureName.includes('gas_price') || featureName.includes('gasPrice')) {
      return '0 gwei';
    }
    return '0';
  }
  
  // Gas price in gwei
  if (featureName.includes('gas_price') || featureName.includes('gasPrice')) {
    const gwei = value / 1e9;
    if (gwei >= 1000) {
      return `${(gwei / 1000).toFixed(2)}k gwei`;
    }
    if (gwei < 0.00000001) {
      // Very small values, show in wei
      return `${value.toLocaleString()} wei`;
    }
    if (gwei < 0.01) {
      // Small values, show with more decimal places for precision
      return `${gwei.toFixed(8)} gwei`;
    }
    return `${gwei.toFixed(2)} gwei`;
  }
  
  // Gas used
  if (featureName.includes('gas_used') || featureName.includes('gasUsed')) {
    if (value >= 1000000) {
      return `${(value / 1000000).toFixed(2)}M`;
    }
    if (value >= 1000) {
      return `${(value / 1000).toFixed(2)}k`;
    }
    return Math.round(value).toLocaleString();
  }
  
  // ETH value
  if (featureName.includes('value') && !featureName.includes('token')) {
    const eth = value / 1e18;
    if (eth >= 1) {
      return `${eth.toFixed(4)} ETH`;
    }
    return `${(eth * 1000).toFixed(2)} mETH`;
  }
  
  // Large numbers with commas
  if (value >= 1000000) {
    return `${(value / 1000000).toFixed(2)}M`;
  }
  if (value >= 1000) {
    return `${(value / 1000).toFixed(2)}k`;
  }
  
  // Format with commas
  return Math.round(value).toLocaleString();
}

// Get normal/expected values for comparison
function getNormalValue(featureName: string): { value: number; unit: string; source: string } {
  const normalValues: Record<string, { value: number; unit: string; source: string }> = {
    'gas_price': { value: 30e9, unit: 'gwei', source: 'https://etherscan.io/gastracker' },
    'avg_gas_price': { value: 30e9, unit: 'gwei', source: 'https://etherscan.io/gastracker' },
    'gas_used': { value: 21000, unit: '', source: 'https://ethereum.org/en/developers/docs/gas/' },
    'value': { value: 0, unit: 'ETH', source: '' },
  };
  
  return normalValues[featureName] || { value: 0, unit: '', source: '' };
}

// Compare value with normal and generate comparison text
function generateComparisonText(featureName: string, featureValue: number, shapValue: number): string {
  const normal = getNormalValue(featureName);
  if (!normal.value || normal.value === 0) {
    return '';
  }
  
  let comparison = '';
  const ratio = featureValue / normal.value;
  
  if (featureName.includes('gas_price') || featureName.includes('gasPrice')) {
    const normalGwei = normal.value / 1e9;
    const valueGwei = featureValue / 1e9;
    
    if (ratio > 10) {
      comparison = `This gas price (${formatNumber(featureValue, featureName)}) is ${ratio.toFixed(1)}x higher than the normal range (${normalGwei.toFixed(0)} gwei).`;
    } else if (ratio < 0.1) {
      comparison = `This gas price (${formatNumber(featureValue, featureName)}) is unusually low compared to the normal range (${normalGwei.toFixed(0)} gwei).`;
    } else {
      comparison = `Gas price (${formatNumber(featureValue, featureName)}) is within normal range (${normalGwei.toFixed(0)} gwei).`;
    }
    
    if (normal.source) {
      comparison += ` See <a href="${normal.source}" target="_blank" class="reference-link">current gas prices</a>.`;
    }
  } else if (featureName.includes('gas_used') || featureName.includes('gasUsed')) {
    if (ratio > 5) {
      comparison = `Gas used (${formatNumber(featureValue, featureName)}) is ${ratio.toFixed(1)}x higher than a standard transfer (${formatNumber(normal.value, featureName)}).`;
    } else if (featureValue < normal.value * 0.5) {
      comparison = `Gas used (${formatNumber(featureValue, featureName)}) is lower than expected for a standard transfer (${formatNumber(normal.value, featureName)}).`;
    }
  }
  
  return comparison;
}

function getRiskClass(risk: number | null | undefined): string {
  if (!risk) return 'low';
  if (risk > 0.7) return 'critical';
  if (risk > 0.4) return 'warning';
  return 'low';
}

function getRiskLevelText(risk: number | null | undefined): string {
  if (!risk) return 'LOW';
  if (risk > 0.7) return 'HIGH';
  if (risk > 0.4) return 'MEDIUM';
  return 'LOW';
}

// Calculate feature-specific risk level based on SHAP value and feature value
function getFeatureRiskLevel(shapValue: number, featureValue: number, featureName: string): { level: string; class: string } {
  // If SHAP value is positive, it increases risk
  if (shapValue > 0.1) {
    // High positive SHAP = high risk
    if (shapValue > 0.3) {
      return { level: 'HIGH', class: 'critical' };
    }
    return { level: 'MEDIUM', class: 'warning' };
  }
  
  // Check for suspicious feature values even with low SHAP
  // Zero gas price is suspicious ONLY if SHAP is positive or neutral (not negative)
  // If SHAP is negative, 0 gwei actually decreases risk (gasless relay is less risky)
  if (featureName.includes('gas_price') || featureName.includes('gasPrice')) {
    if ((featureValue === 0 || featureValue < 1e6) && shapValue >= 0) {
      return { level: 'HIGH', class: 'critical' };
    }
    // If SHAP is negative and gas price is 0, it's actually less risky
    if ((featureValue === 0 || featureValue < 1e6) && shapValue < 0) {
      return { level: 'LESS RISKY', class: 'low' };
    }
  }
  
  // Zero value transactions are suspicious
  if (featureName.includes('value') && featureValue === 0) {
    return { level: 'MEDIUM', class: 'warning' };
  }
  
  // Negative SHAP or neutral = low risk
  return { level: 'LOW', class: 'low' };
}

function formatNumericalDetails(featureName: string, featureValue: number, accountData?: any, txData?: any): string {
  const details: string[] = [];
  
  // Only show meaningful numerical details
  // Don't show $0.00 or transaction counts that don't add value
  
  // Format value if applicable and meaningful (only for value/volume/price features with non-zero values)
  if ((featureName.includes('value') || featureName.includes('volume') || featureName.includes('price')) && featureValue > 0) {
    const usdValue = (featureValue / 1e18) * 2000; // Approximate ETH price
    if (usdValue >= 0.01) { // Only show if >= 1 cent
      details.push(`$${usdValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
    }
  }
  
  // Transaction count will be embedded in the explanation text, not shown separately
  // Return empty string to avoid showing "243 txs" separately
  
  return details.length > 0 ? details.join(' • ') : '';
}

function showLoading(elementId: string) {
  const el = document.getElementById(elementId);
  if (el) {
    el.innerHTML = '<div class="loading"><div class="spinner"></div>Analyzing risk...</div>';
  }
}

function hideLoading(elementId: string) {
  const el = document.getElementById(elementId);
  // Don't clear the content here, let displayRiskExplanations set it
  // This function is mainly for error cases
}

// Progress bar functions for account/transaction analysis
function showProgressBar(scoreElementId: string, explanationElementId: string) {
  const scoreEl = document.getElementById(scoreElementId);
  const explanationEl = document.getElementById(explanationElementId);

  if (scoreEl) {
    // Keep score box simple: label + "Loading..." text, avoid duplicate bars
    scoreEl.className = '';
    scoreEl.innerHTML = `
      <div class="score-label">${scoreElementId.includes('account') ? 'Account Risk' : 'Transaction Risk'}</div>
      <div class="score-value loading-text">Loading...</div>
    `;
  }
  
  if (explanationEl) {
    // Clear any existing classes that might interfere
    explanationEl.className = '';
    explanationEl.innerHTML = `
      <div class="progress-container">
        <div class="progress-bar-wrapper">
          <div class="progress-bar">
            <div class="progress-fill" id="progress-fill-${explanationElementId}" style="width: 5%;"></div>
            <div class="progress-shine" id="progress-shine-${explanationElementId}"></div>
          </div>
          <div class="progress-text" id="progress-text-${explanationElementId}">Initializing analysis...</div>
        </div>
      </div>
    `;
    // Small delay to ensure DOM is updated
    const isAccount = scoreElementId.includes('account');
    setTimeout(() => {
      animateProgressBar(`progress-fill-${scoreElementId}`, `progress-text-${scoreElementId}`, `progress-shine-${scoreElementId}`, isAccount);
      animateProgressBar(`progress-fill-${explanationElementId}`, `progress-text-${explanationElementId}`, `progress-shine-${explanationElementId}`, isAccount);
    }, 50);
  }
}

function hideProgressBar(scoreElementId: string, explanationElementId: string) {
  const scoreEl = document.getElementById(scoreElementId);
  const explanationEl = document.getElementById(explanationElementId);
  
  // Progress bar will be replaced by actual results
  // No need to clear here
}

function animateProgressBar(fillId: string, textId: string, shineId?: string, isAccount: boolean = false) {
  const fillEl = document.getElementById(fillId);
  const textEl = document.getElementById(textId);
  const shineEl = shineId ? document.getElementById(shineId) : null;
  
  if (!fillEl || !textEl) {
    console.warn(`[Progress Bar] Elements not found: fillId=${fillId}, textId=${textId}`);
    return;
  }
  
  // Ensure elements are visible
  fillEl.style.display = 'block';
  fillEl.style.visibility = 'visible';
  fillEl.style.opacity = '1';
  
  // Use same progress steps as circle progress (synced with backend)
  const steps = isAccount ? [
    { progress: 40, text: '40% • Fetching transactions...' },
    { progress: 70, text: '70% • Enriching NFT data...' },
    { progress: 80, text: '80% • Extracting features...' },
    { progress: 90, text: '90% • Running model...' },
    { progress: 98, text: '98% • Generating explanations...' }
  ] : [
    { progress: 30, text: '30% • Enriching NFT data...' },
    { progress: 50, text: '50% • Extracting features...' },
    { progress: 60, text: '60% • Running model...' },
    { progress: 85, text: '85% • Generating explanations...' },
    { progress: 98, text: '98% • Finalizing...' }
  ];
  
  const startTime = Date.now();
  const durations = isAccount ? [5000, 3000, 1000, 1000, 2000] : [2000, 500, 500, 2000, 1000];
  
  const updateProgress = () => {
    const elapsed = Date.now() - startTime;
    let cumulativeTime = 0;
    let targetProgress = 0;
    let currentText = 'Initializing...';
    
    for (let i = 0; i < steps.length; i++) {
      cumulativeTime += durations[i];
      if (elapsed <= cumulativeTime) {
        const stepStartTime = cumulativeTime - durations[i];
        const stepElapsed = elapsed - stepStartTime;
        const stepProgress = Math.min(stepElapsed / durations[i], 1);
        
        const prevProgress = i > 0 ? steps[i - 1].progress : 0;
        targetProgress = prevProgress + (steps[i].progress - prevProgress) * stepProgress;
        currentText = steps[i].text;
        break;
      }
    }
    
    // Cap at 98% until API response
    targetProgress = Math.min(98, targetProgress);
    
    fillEl.style.width = `${targetProgress}%`;
    textEl.textContent = `${Math.round(targetProgress)}% • ${currentText.split('•')[1]?.trim() || 'Processing...'}`;
    if (shineEl) {
      shineEl.style.left = `${targetProgress}%`;
      shineEl.style.display = 'block';
    }
  };
  
  // Update every 50ms for smooth animation
  const interval = setInterval(updateProgress, 50);
  
  // Store interval ID for cleanup
  (fillEl as any).__progressInterval = interval;
}

// Event listeners
rejectBtn?.addEventListener('click', async () => {
  // Get requestId from storage
  const result = await chrome.storage.local.get(['transactionRequestId']);
  const requestId = result.transactionRequestId || '';
  
  console.log('[Web3 Antivirus] Reject button clicked, requestId:', requestId);
  
  // Set decision with requestId - this will trigger the content script listener
  await chrome.storage.local.set({ 
    transactionDecision: 'reject',
    transactionRequestId: requestId
  });
  
  // Also send message to content script directly to ensure it's received
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs && tabs[0] && tabs[0].id) {
      chrome.tabs.sendMessage(tabs[0].id, {
        type: 'WEB3_ANTIVIRUS_DECISION',
        decision: 'reject',
        requestId: requestId
      }).catch(err => {
        console.log('[Web3 Antivirus] Could not send message to content script:', err);
      });
    }
  } catch (err) {
    console.log('[Web3 Antivirus] Error sending message:', err);
  }
  
  chrome.storage.local.remove('pendingTransaction');
  window.close();
});

continueBtn?.addEventListener('click', async () => {
  // Get requestId from storage
  const result = await chrome.storage.local.get(['transactionRequestId']);
  const requestId = result.transactionRequestId || '';
  
  console.log('[Web3 Antivirus] Continue button clicked, requestId:', requestId);
  
  // Set decision with requestId - this will trigger the content script listener
  await chrome.storage.local.set({ 
    transactionDecision: 'approve',
    transactionRequestId: requestId
  });
  
  // Also send message to content script directly to ensure it's received
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs && tabs[0] && tabs[0].id) {
      chrome.tabs.sendMessage(tabs[0].id, {
        type: 'WEB3_ANTIVIRUS_DECISION',
        decision: 'approve',
        requestId: requestId
      }).catch(err => {
        console.log('[Web3 Antivirus] Could not send message to content script:', err);
      });
    }
  } catch (err) {
    console.log('[Web3 Antivirus] Error sending message:', err);
  }
  
  chrome.storage.local.remove('pendingTransaction');
  window.close();
});

analyzeAccountBtn?.addEventListener('click', async () => {
  const address = accountInput?.value.trim();
  if (!address || !address.startsWith('0x')) {
    alert('Please enter a valid Ethereum address');
    return;
  }
  
  if (accountResult) accountResult.style.display = 'block';
  
  // Show progress bar instead of text
  showProgressBar('account-risk-score', 'account-explanation');
  
  try {
    const response = await fetch(`${API_BASE_URL}/detect/account`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        account_address: address,
        explain: true,
        explain_with_llm: true
      })
    });
    
    const data = await response.json();
    
    // Complete progress when API response received
    if (accountProgressTracker) {
      accountProgressTracker.complete();
    }
    
    if (data.detection_mode === 'no_data') {
      hideProgressBar('account-risk-score', 'account-explanation');
      if (accountRiskScore) {
        accountRiskScore.className = 'risk-score-display na';
        accountRiskScore.textContent = 'N/A (New Account)';
      }
      if (accountExplanation) {
        accountExplanation.textContent = 'This account has no transaction history. Please analyze a specific transaction instead.';
      }
      return;
    }
    
    const risk = data.account_scam_probability || 0;
    hideProgressBar('account-risk-score', 'account-explanation');
    
    if (accountRiskScore) {
      const riskClass = risk > 0.7 ? 'high' : risk > 0.4 ? 'medium' : 'low';
      accountRiskScore.className = `risk-score-display ${riskClass}`;
      accountRiskScore.innerHTML = `
        <div class="risk-label">${riskClass.toUpperCase()} RISK</div>
        <div class="risk-percentage">${(risk * 100).toFixed(1)}%</div>
      `;
    }
    
    // Handle LLM explanation with proper format
    if (accountExplanation && data.llm_explanations?.account) {
      const accountExpl = data.llm_explanations.account;
      
      if (typeof accountExpl === 'object' && accountExpl.feature_name) {
        const featureName = formatFeatureName(accountExpl.feature_name);
        const featureValue = parseFloat(accountExpl.feature_value) || 0;
        const formattedValue = formatNumber(featureValue, accountExpl.feature_name);
        
        // Get SHAP value from explanations if available
        const shapValue = data.explanations?.account?.feature_importance?.find(
          (f: any) => f.feature_name === accountExpl.feature_name
        )?.shap_value || 0;
        
        // Calculate feature-specific risk level
        const featureRisk = getFeatureRiskLevel(shapValue, featureValue, accountExpl.feature_name);
        const riskLevel = featureRisk.level;
        const riskClass = featureRisk.class;
        
        const numericalDetails = formatNumericalDetails(accountExpl.feature_name, featureValue, data);
        
        accountExplanation.innerHTML = `
          <div class="risk-item ${riskClass}">
            <div class="risk-header-row">
              <span class="risk-level-badge ${riskClass}">${riskLevel}</span>
              <span class="risk-feature-box">${featureName}</span>
            </div>
            <div class="risk-item-desc">${accountExpl.reason || 'No explanation available.'}</div>
            ${numericalDetails && numericalDetails.trim() ? `<div class="risk-numerical-details">${numericalDetails}</div>` : ''}
          </div>
        `;
      } else if (typeof accountExpl === 'string') {
        const riskLevel = getRiskLevelText(risk);
        const riskClass = getRiskClass(risk);
        accountExplanation.innerHTML = `
          <div class="risk-item ${riskClass}">
            <div class="risk-header-row">
              <span class="risk-level-badge ${riskClass}">${riskLevel}</span>
              <span class="risk-feature-box">Account Analysis</span>
            </div>
            <div class="risk-item-desc">${accountExpl}</div>
          </div>
        `;
      }
    } else if (accountExplanation) {
      const riskLevel = getRiskLevelText(risk);
      const riskClass = getRiskClass(risk);
      accountExplanation.innerHTML = `
        <div class="risk-item ${riskClass}">
          <div class="risk-header-row">
            <span class="risk-level-badge ${riskClass}">${riskLevel}</span>
            <span class="risk-feature-box">Account Analysis</span>
          </div>
          <div class="risk-item-desc">Analysis completed.</div>
        </div>
      `;
    }
    
  } catch (error) {
    console.error('Error analyzing account:', error);
    hideProgressBar('account-risk-score', 'account-explanation');
    if (accountRiskScore) {
      accountRiskScore.className = 'risk-score-display';
      accountRiskScore.textContent = 'Error';
    }
    if (accountExplanation) {
      accountExplanation.textContent = 'Failed to analyze account. Please try again.';
    }
  }
});

analyzeTransactionBtn?.addEventListener('click', async () => {
  const input = transactionInput?.value.trim();
  if (!input) {
    alert('Please enter transaction hash or details');
    return;
  }
  
  if (transactionResult) transactionResult.style.display = 'block';
  
  // Show progress bar instead of text
  showProgressBar('transaction-risk-score', 'transaction-explanation');
  
  try {
    // Check if input is a transaction hash (starts with 0x and is 66 chars)
    const isTxHash = input.startsWith('0x') && input.length === 66;
    
    const response = await fetch(`${API_BASE_URL}/detect/transaction`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(
        isTxHash
          ? {
              transaction_hash: input,
              explain: true,
              explain_with_llm: true
            }
          : {
              from_address: '0x0000000000000000000000000000000000000000',
              to_address: input,
              value: '0x0',
              gasPrice: '0x0',
              explain: true,
              explain_with_llm: true
            }
      )
    });
    
    const data = await response.json();
    
    // Complete progress when API response received
    if (transactionProgressTracker) {
      transactionProgressTracker.complete();
    }
    
    const risk = data.transaction_scam_probability || 0;
    
    hideProgressBar('transaction-risk-score', 'transaction-explanation');
    
    if (transactionRiskScore) {
      const riskClass = risk > 0.7 ? 'high' : risk > 0.4 ? 'medium' : 'low';
      transactionRiskScore.className = `risk-score-display ${riskClass}`;
      transactionRiskScore.innerHTML = `
        <div class="risk-label">${riskClass.toUpperCase()} RISK</div>
        <div class="risk-percentage">${(risk * 100).toFixed(1)}%</div>
      `;
    }
    
    // Handle LLM explanation with proper format
    if (transactionExplanation && data.llm_explanations?.transaction) {
      const txExpl = data.llm_explanations.transaction;
      
      if (typeof txExpl === 'object' && txExpl.feature_name) {
        const featureName = formatFeatureName(txExpl.feature_name);
        const featureValue = parseFloat(txExpl.feature_value) || 0;
        const formattedValue = formatNumber(featureValue, txExpl.feature_name);
        
        // Get SHAP value from explanations if available
        const shapValue = data.explanations?.transaction?.feature_importance?.find(
          (f: any) => f.feature_name === txExpl.feature_name
        )?.shap_value || 0;
        
        // Calculate feature-specific risk level
        const featureRisk = getFeatureRiskLevel(shapValue, featureValue, txExpl.feature_name);
        const riskLevel = featureRisk.level;
        const riskClass = featureRisk.class;
        
        const numericalDetails = formatNumericalDetails(txExpl.feature_name, featureValue, null, data);
        
        transactionExplanation.innerHTML = `
          <div class="risk-item ${riskClass}">
            <div class="risk-header-row">
              <span class="risk-level-badge ${riskClass}">${riskLevel}</span>
              <span class="risk-feature-box">${featureName}</span>
            </div>
            <div class="risk-item-desc">${txExpl.reason || 'No explanation available.'}</div>
            ${numericalDetails && numericalDetails.trim() ? `<div class="risk-numerical-details">${numericalDetails}</div>` : ''}
          </div>
        `;
      } else if (typeof txExpl === 'string') {
        const riskLevel = getRiskLevelText(risk);
        const riskClass = getRiskClass(risk);
        transactionExplanation.innerHTML = `
          <div class="risk-item ${riskClass}">
            <div class="risk-header-row">
              <span class="risk-level-badge ${riskClass}">${riskLevel}</span>
              <span class="risk-feature-box">Transaction Analysis</span>
            </div>
            <div class="risk-item-desc">${txExpl}</div>
          </div>
        `;
      }
    } else if (transactionExplanation) {
      const riskLevel = getRiskLevelText(risk);
      const riskClass = getRiskClass(risk);
      transactionExplanation.innerHTML = `
        <div class="risk-item ${riskClass}">
          <div class="risk-header-row">
            <span class="risk-level-badge ${riskClass}">${riskLevel}</span>
            <span class="risk-feature-box">Transaction Analysis</span>
          </div>
          <div class="risk-item-desc">Analysis completed.</div>
        </div>
      `;
    }
    
  } catch (error) {
    console.error('Error analyzing transaction:', error);
    hideProgressBar('transaction-risk-score', 'transaction-explanation');
    if (transactionRiskScore) {
      transactionRiskScore.className = 'risk-score-display';
      transactionRiskScore.textContent = 'Error';
    }
    if (transactionExplanation) {
      transactionExplanation.textContent = 'Failed to analyze transaction. Please try again.';
    }
  }
});

