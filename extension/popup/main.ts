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
const accountRiskEl = document.getElementById('account-risk');
const transactionRiskEl = document.getElementById('transaction-risk');
const riskExplanationsEl = document.getElementById('risk-explanations');
const etherscanLinkEl = document.getElementById('etherscan-link') as HTMLAnchorElement | null;
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
chrome.storage.local.get(['pendingTransaction'], (result) => {
  if (result.pendingTransaction) {
    showTransactionView(result.pendingTransaction);
  } else {
    showDefaultView();
  }
});

// Show transaction view
async function showTransactionView(transactionData: any) {
  transactionView?.classList.add('active');
  defaultView?.classList.remove('active');
  const { recipientAddress } = resolveTransactionAddresses(transactionData);
  
  // Display transaction details
  if (fromAddressEl) fromAddressEl.textContent = formatAddress(transactionData.from || '');
  if (toAddressEl) toAddressEl.textContent = formatAddress(recipientAddress || transactionData.to || '');
  
  const value = hexToEth(transactionData.value || '0x0');
  if (ethValueEl) ethValueEl.textContent = value.toFixed(4);
  if (usdValueEl) usdValueEl.textContent = `($${(value * 2000).toFixed(2)})`; // Approximate ETH price
  
  // Check if NFT transfer
  const isNFT = transactionData.data && transactionData.data !== '0x' && transactionData.data.length > 10;
  if (isNFT && nftDetailEl && nftInfoEl) {
    nftDetailEl.style.display = 'block';
    nftInfoEl.textContent = 'NFT Transfer Detected';
  } else if (nftDetailEl) {
    nftDetailEl.style.display = 'none';
  }
  
  // Set Etherscan link
  if (etherscanLinkEl) {
    etherscanLinkEl.href = `https://etherscan.io/address/${recipientAddress || transactionData.to || ''}`;
  }
  
  // Analyze transaction
  await analyzeTransactionForPopup(transactionData);
}

// Show default view
function showDefaultView() {
  defaultView?.classList.add('active');
  transactionView?.classList.remove('active');
}

// Analyze transaction for popup
async function analyzeTransactionForPopup(transactionData: any) {
  showLoading('risk-explanations');
  const { recipientAddress, contractAddress } = resolveTransactionAddresses(transactionData);

  try {
    // Try to analyze account first
    const targetAccount = recipientAddress || '';

    const accountResult = await fetch(`${API_BASE_URL}/detect/account`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        // Always analyze the recipient account since that's the risky target
        account_address: targetAccount,
        explain: true,
        explain_with_llm: true
      })
    });
    
    const accountData = await accountResult.json();
    
    // Check if account has no transactions
    if (accountData.detection_mode === 'no_data' || !accountData.account_scam_probability) {
      // Use transaction-level detection only
      await analyzeTransactionOnly(transactionData);
      return;
    }
    
    // Display account risk
    const accountRisk = accountData.account_scam_probability || 0;
    updateRiskDisplay(accountRiskEl, accountRisk, 'Account Risk');
    
    // Analyze transaction
    const txResult = await analyzeTransactionOnly(transactionData, accountData, { recipientAddress, contractAddress });
    
    // Display transaction risk
    const txRisk = txResult.transaction_scam_probability || 0;
    updateRiskDisplay(transactionRiskEl, txRisk, 'Transaction Risk');
    
    // Display explanations
    displayRiskExplanations(accountData, txResult);
    
  } catch (error) {
    console.error('Error analyzing transaction:', error);
    if (riskExplanationsEl) {
      riskExplanationsEl.innerHTML = '<div class="risk-item warning">Error analyzing transaction. Please try again.</div>';
    }
  }
}

// Analyze transaction only (for new accounts)
async function analyzeTransactionOnly(transactionData: any, accountData?: any, resolved?: { recipientAddress: string | null, contractAddress: string | null }) {
  const addresses = resolved || resolveTransactionAddresses(transactionData);
  const recipientAddress = addresses.recipientAddress || transactionData.to || '';
  const contractAddress = addresses.contractAddress || null;

  const response = await fetch(`${API_BASE_URL}/detect/transaction`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from_address: transactionData.from || '',
      to_address: recipientAddress,
      value: transactionData.value || '0x0',
      gasPrice: transactionData.gasPrice || '0x0',
      gasUsed: transactionData.gas || '0x0',
      function_call: extractFunctions(transactionData.data),
      input: transactionData.data || '0x',
      contract_address: contractAddress,
      token_value: '0',
      explain: true,
      explain_with_llm: true
    })
  });
  
  const result = await response.json();
  
  // If account has no data, hide account risk
  if (!accountData || accountData.detection_mode === 'no_data') {
    if (accountRiskEl) {
      accountRiskEl.innerHTML = `
        <div class="score-label">Account Risk</div>
        <div class="score-value na">N/A<br/><span style="font-size: 10px;">New Account</span></div>
      `;
    }
  }
  
  const txRisk = result.transaction_scam_probability || 0;
  updateRiskDisplay(transactionRiskEl, txRisk, 'Transaction Risk');
  
  return result;
}

// Display risk explanations
function displayRiskExplanations(accountData: any, txData: any) {
  if (!riskExplanationsEl) return;
  
  let html = '';
  
  // Account explanations
  if (accountData.llm_explanations?.account) {
    html += `<div class="risk-item ${getRiskClass(accountData.account_scam_probability)}">
      <div class="risk-item-title">Account Risk Analysis</div>
      <div class="risk-item-desc">${accountData.llm_explanations.account}</div>
    </div>`;
  }
  
  // Transaction explanations
  if (txData.llm_explanations?.transaction) {
    html += `<div class="risk-item ${getRiskClass(txData.transaction_scam_probability)}">
      <div class="risk-item-title">Transaction Risk Analysis</div>
      <div class="risk-item-desc">${txData.llm_explanations.transaction}</div>
    </div>`;
  }
  
  // Feature highlights
  if (accountData.explanations?.account?.feature_importance) {
    const topFeature = accountData.explanations.account.feature_importance[0];
    if (topFeature) {
      html += `<div class="risk-item ${topFeature.shap_value > 0 ? 'critical' : 'warning'}">
        <div class="risk-item-title">⚠️ Critical: ${formatFeatureName(topFeature.feature_name)}</div>
        <div class="risk-item-desc">This account's ${formatFeatureName(topFeature.feature_name).toLowerCase()} (${topFeature.feature_value.toFixed(2)}) is ${topFeature.shap_value > 0 ? 'significantly increasing risk' : 'affecting risk assessment'}</div>
      </div>`;
    }
  }
  
  if (txData.explanations?.transaction?.feature_importance) {
    const topFeature = txData.explanations.transaction.feature_importance[0];
    if (topFeature) {
      html += `<div class="risk-item ${topFeature.shap_value > 0 ? 'critical' : 'warning'}">
        <div class="risk-item-title">⚡ Transaction Risk: ${formatFeatureName(topFeature.feature_name)}</div>
        <div class="risk-item-desc">This transaction shows ${formatFeatureName(topFeature.feature_name).toLowerCase()} which ${topFeature.shap_value > 0 ? 'indicates high risk' : 'may be suspicious'}</div>
      </div>`;
    }
  }
  
  riskExplanationsEl.innerHTML = html || '<div class="risk-item">No detailed risk information available.</div>';
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
  const wei = BigInt(hex);
  const eth = Number(wei) / 1e18;
  return eth;
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

function formatFeatureName(name: string): string {
  const map: Record<string, string> = {
    'activity_duration_days': 'Activity Duration',
    'avg_gas_price': 'Average Gas Price',
    'has_suspicious_func': 'Suspicious Functions',
    'is_mint': 'Mint Transaction',
  };
  return map[name] || name.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
}

function getRiskClass(risk: number): string {
  if (risk > 0.7) return 'critical';
  if (risk > 0.4) return 'warning';
  return 'low';
}

function showLoading(elementId: string) {
  const el = document.getElementById(elementId);
  if (el) {
    el.innerHTML = '<div class="loading"><div class="spinner"></div>Analyzing risk...</div>';
  }
}

function resolveTransactionAddresses(transactionData: any): { recipientAddress: string | null, contractAddress: string | null } {
  const rawTo = transactionData.to || '';
  const decodedRecipient = extractRecipientAddress(transactionData.data);
  const isContractCall = !!decodedRecipient;
  const recipientAddress = normalizeAddress(decodedRecipient || rawTo);
  const contractAddress = isContractCall ? normalizeAddress(rawTo) : null;
  return { recipientAddress, contractAddress };
}

function extractRecipientAddress(data?: string): string | null {
  if (!data || data === '0x' || data.length < 10) return null;
  const sanitized = data.startsWith('0x') ? data.slice(2) : data;
  if (sanitized.length < 8) return null;
  const selector = `0x${sanitized.slice(0, 8).toLowerCase()}`;
  const payload = sanitized.slice(8);

  const secondWord = getWord(payload, 1);
  const address = decodeAddressWord(secondWord);

  switch (selector) {
    case '0x23b872dd': // transferFrom(address,address,uint256)
    case '0x42842e0e': // safeTransferFrom(address,address,uint256)
    case '0xb88d4fde': // safeTransferFrom(address,address,uint256,bytes)
    case '0xf242432a': // safeBatchTransferFrom(address,address,uint256[],uint256[],bytes)
      return address;
    default:
      return null;
  }
}

function getWord(payload: string, index: number): string | null {
  const start = index * 64;
  const end = start + 64;
  if (payload.length < end) return null;
  return payload.slice(start, end);
}

function decodeAddressWord(word: string | null): string | null {
  if (!word || word.length !== 64) return null;
  const addr = word.slice(-40);
  return normalizeAddress(`0x${addr}`);
}

function normalizeAddress(address?: string | null): string | null {
  if (!address) return null;
  const lower = address.toLowerCase();
  return lower.startsWith('0x') ? lower : `0x${lower}`;
}

// Event listeners
rejectBtn?.addEventListener('click', () => {
  chrome.storage.local.set({ transactionDecision: 'reject' });
  chrome.storage.local.remove('pendingTransaction');
  window.close();
});

continueBtn?.addEventListener('click', () => {
  chrome.storage.local.set({ transactionDecision: 'approve' });
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
  if (accountRiskScore) accountRiskScore.textContent = 'Loading...';
  if (accountExplanation) accountExplanation.textContent = 'Analyzing account...';
  
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
    
    if (data.detection_mode === 'no_data') {
      if (accountRiskScore) accountRiskScore.textContent = 'N/A (New Account)';
      if (accountExplanation) accountExplanation.textContent = 'This account has no transaction history. Please analyze a specific transaction instead.';
      return;
    }
    
    const risk = data.account_scam_probability || 0;
    if (accountRiskScore) {
      const riskClass = risk > 0.7 ? 'high' : risk > 0.4 ? 'medium' : 'low';
      accountRiskScore.className = `risk-score-display ${riskClass}`;
      accountRiskScore.textContent = `${(risk * 100).toFixed(1)}%`;
    }
    
    if (accountExplanation && data.llm_explanations?.account) {
      accountExplanation.textContent = data.llm_explanations.account;
    }
    
  } catch (error) {
    console.error('Error analyzing account:', error);
    if (accountRiskScore) accountRiskScore.textContent = 'Error';
    if (accountExplanation) accountExplanation.textContent = 'Failed to analyze account. Please try again.';
  }
});

analyzeTransactionBtn?.addEventListener('click', async () => {
  const input = transactionInput?.value.trim();
  if (!input) {
    alert('Please enter transaction hash or details');
    return;
  }
  
  if (transactionResult) transactionResult.style.display = 'block';
  if (transactionRiskScore) transactionRiskScore.textContent = 'Loading...';
  if (transactionExplanation) transactionExplanation.textContent = 'Analyzing transaction...';
  
  // For now, parse as transaction hash
  // In production, would fetch transaction details from Etherscan
  try {
    const response = await fetch(`${API_BASE_URL}/detect/transaction`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        transaction_hash: input,
        explain: true,
        explain_with_llm: true
      })
    });
    
    const data = await response.json();
    const risk = data.transaction_scam_probability || 0;
    
    if (transactionRiskScore) {
      const riskClass = risk > 0.7 ? 'high' : risk > 0.4 ? 'medium' : 'low';
      transactionRiskScore.className = `risk-score-display ${riskClass}`;
      transactionRiskScore.textContent = `${(risk * 100).toFixed(1)}%`;
    }
    
    if (transactionExplanation && data.llm_explanations?.transaction) {
      transactionExplanation.textContent = data.llm_explanations.transaction;
    }
    
  } catch (error) {
    console.error('Error analyzing transaction:', error);
    if (transactionRiskScore) transactionRiskScore.textContent = 'Error';
    if (transactionExplanation) transactionExplanation.textContent = 'Failed to analyze transaction. Please try again.';
  }
});

