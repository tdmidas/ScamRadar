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
  
  if (result.pendingTransaction) {
    // Check if transaction is recent (within last 30 seconds)
    const now = Date.now();
    const txTime = result.transactionTimestamp || 0;
    const isRecent = (now - txTime) < 30000; // 30 seconds
    
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

// Show transaction view
async function showTransactionView(transactionData: any) {
  console.log('[Web3 Antivirus] showTransactionView called with data:', transactionData);
  
  // Remove hidden class and add active
  transactionView?.classList.remove('hidden');
  transactionView?.classList.add('active');
  defaultView?.classList.remove('active');
  defaultView?.classList.add('hidden');
  
  // Display transaction details
  if (fromAddressEl) fromAddressEl.textContent = formatAddress(transactionData.from || '');
  if (toAddressEl) toAddressEl.textContent = formatAddress(transactionData.to || '');
  
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
  
  // Set Etherscan link (moved to below to-address in HTML)
  if (etherscanLinkEl && etherscanLinkEl instanceof HTMLAnchorElement) {
    etherscanLinkEl.href = `https://etherscan.io/address/${transactionData.to || ''}`;
  }
  
  // Hide warning section initially (will show after analysis)
  const warningSection = document.getElementById('warning-section');
  if (warningSection) {
    warningSection.style.display = 'none';
  }
  
  // Analyze transaction
  await analyzeTransactionForPopup(transactionData);
}

// Show default view
function showDefaultView() {
  defaultView?.classList.remove('hidden');
  defaultView?.classList.add('active');
  transactionView?.classList.remove('active');
  transactionView?.classList.add('hidden');
}

// Analyze transaction for popup
async function analyzeTransactionForPopup(transactionData: any) {
  showLoading('risk-explanations');
  
  try {
    // Try to analyze account first
    const accountResult = await fetch(`${API_BASE_URL}/detect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        account_address: transactionData.from || '',
        explain: true,
        explain_with_llm: true
      })
    });
    
    const accountData = await accountResult.json();
    
    // Check if account has no transactions
    if (accountData.detection_mode === 'no_data' || !accountData.account_scam_probability) {
      // Use transaction-level detection only
      const txResult = await analyzeTransactionOnly(transactionData);
      displayRiskExplanations(accountData, txResult);
      return;
    }
    
    // Display account risk
    const accountRisk = accountData.account_scam_probability || 0;
    updateRiskDisplay(accountRiskEl, accountRisk, 'Account Risk');
    
    // Analyze transaction
    const txResult = await analyzeTransactionOnly(transactionData, accountData);
    
    // Display transaction risk
    const txRisk = txResult.transaction_scam_probability || 0;
    updateRiskDisplay(transactionRiskEl, txRisk, 'Transaction Risk');
    
    // Show warning section only after analysis is complete
    showWarningSection(txRisk, accountRisk);
    
    // Display explanations (this will also hide loading)
    displayRiskExplanations(accountData, txResult);
    
  } catch (error) {
    console.error('Error analyzing transaction:', error);
    hideLoading('risk-explanations');
    if (riskExplanationsEl) {
      riskExplanationsEl.innerHTML = '<div class="risk-item warning">Error analyzing transaction. Please try again.</div>';
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
async function analyzeTransactionOnly(transactionData: any, accountData?: any) {
  const response = await fetch(`${API_BASE_URL}/detect/transaction`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from_address: transactionData.from || '',
      to_address: transactionData.to || '',
      value: transactionData.value || '0x0',
      gasPrice: transactionData.gasPrice || '0x0',
      gasUsed: transactionData.gas || '0x0',
      function_call: extractFunctions(transactionData.data),
      contract_address: transactionData.to || null,
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
  
  // Show warning section after analysis
  const accountRisk = accountData?.account_scam_probability || null;
  showWarningSection(txRisk, accountRisk);
  
  // Hide loading (will be shown again in displayRiskExplanations if needed)
  hideLoading('risk-explanations');
  
  return result;
}

// Display risk explanations
function displayRiskExplanations(accountData: any, txData: any) {
  if (!riskExplanationsEl) return;
  
  let html = '';
  
  // Account explanations (new format: {feature_name, feature_value, reason})
  if (accountData.llm_explanations?.account) {
    const accountExpl = accountData.llm_explanations.account;
    // Check if it's new format (object) or old format (string)
    if (typeof accountExpl === 'object' && accountExpl.feature_name) {
      html += `<div class="risk-item ${getRiskClass(accountData.account_scam_probability)}">
        <div class="risk-item-title">${accountExpl.feature_name} ${accountExpl.feature_value}</div>
        <div class="risk-item-desc">${accountExpl.reason}</div>
      </div>`;
    } else if (typeof accountExpl === 'string') {
      // Fallback for old format
      html += `<div class="risk-item ${getRiskClass(accountData.account_scam_probability)}">
        <div class="risk-item-title">Account Risk Analysis</div>
        <div class="risk-item-desc">${accountExpl}</div>
      </div>`;
    }
  }
  
  // Transaction explanations (new format: {feature_name, feature_value, reason})
  if (txData.llm_explanations?.transaction) {
    const txExpl = txData.llm_explanations.transaction;
    // Check if it's new format (object) or old format (string)
    if (typeof txExpl === 'object' && txExpl.feature_name) {
      html += `<div class="risk-item ${getRiskClass(txData.transaction_scam_probability)}">
        <div class="risk-item-title">${txExpl.feature_name} ${txExpl.feature_value}</div>
        <div class="risk-item-desc">${txExpl.reason}</div>
      </div>`;
    } else if (typeof txExpl === 'string') {
      // Fallback for old format
      html += `<div class="risk-item ${getRiskClass(txData.transaction_scam_probability)}">
        <div class="risk-item-title">Transaction Risk Analysis</div>
        <div class="risk-item-desc">${txExpl}</div>
      </div>`;
    }
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

function formatFeatureName(name: string): string {
  const map: Record<string, string> = {
    'activity_duration_days': 'Activity Duration',
    'avg_gas_price': 'Average Gas Price',
    'has_suspicious_func': 'Suspicious Functions',
    'is_mint': 'Mint Transaction',
  };
  return map[name] || name.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
}

function getRiskClass(risk: number | null | undefined): string {
  if (!risk) return 'low';
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

function hideLoading(elementId: string) {
  const el = document.getElementById(elementId);
  // Don't clear the content here, let displayRiskExplanations set it
  // This function is mainly for error cases
}

// Event listeners
rejectBtn?.addEventListener('click', async () => {
  // Get requestId from storage
  const result = await chrome.storage.local.get(['transactionRequestId']);
  const requestId = result.transactionRequestId || '';
  
  chrome.storage.local.set({ 
    transactionDecision: 'reject',
    transactionRequestId: requestId
  });
  chrome.storage.local.remove('pendingTransaction');
  window.close();
});

continueBtn?.addEventListener('click', async () => {
  // Get requestId from storage
  const result = await chrome.storage.local.get(['transactionRequestId']);
  const requestId = result.transactionRequestId || '';
  
  chrome.storage.local.set({ 
    transactionDecision: 'approve',
    transactionRequestId: requestId
  });
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
    const response = await fetch(`${API_BASE_URL}/detect`, {
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
        from_address: '0x0000000000000000000000000000000000000000', // Would parse from transaction
        to_address: input,
        value: '0x0',
        gasPrice: '0x0',
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

