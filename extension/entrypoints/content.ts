import { defineContentScript } from 'wxt/sandbox';

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_start',
  main() {
    console.log('[Web3 Antivirus] Content script loaded on:', window.location.href);
    // Intercept MetaMask transaction requests
    interceptMetaMaskTransactions();
    
    // Also try to intercept after page load
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        console.log('[Web3 Antivirus] DOM loaded, re-checking interceptor');
        interceptMetaMaskTransactions();
      });
    }
  },
});

let injectScriptLoaded = false;

function interceptMetaMaskTransactions() {
  // Prevent multiple injections
  if (injectScriptLoaded) {
    console.log('[Web3 Antivirus] Inject script already loaded, skipping...');
    return;
  }
  
  // Inject script file instead of inline script to bypass CSP
  // The file needs to be in web_accessible_resources
  const script = document.createElement('script');
  script.src = chrome.runtime.getURL('inject.js');
  script.onload = () => {
    console.log('[Web3 Antivirus] Inject script loaded successfully');
    injectScriptLoaded = true;
    script.remove();
  };
  script.onerror = () => {
    console.error('[Web3 Antivirus] Failed to load inject script');
  };
  
  // Inject script ASAP
  (document.head || document.documentElement).prepend(script);
}

// Listen for decision messages from popup (register once)
chrome.storage.local.onChanged.addListener((changes) => {
  if (changes.transactionDecision) {
    const decision = changes.transactionDecision.newValue;
    const requestId = changes.transactionRequestId?.newValue;
    
    console.log('[Web3 Antivirus] Decision received in content script:', decision, 'requestId:', requestId);
    
    // Send decision to page context via postMessage as well
    window.postMessage({
      type: 'WEB3_ANTIVIRUS_DECISION',
      decision: decision,
      requestId: requestId || ''
    }, '*');
    
    // Also inject into page context for inject.js to read
    const script = document.createElement('script');
    script.textContent = `
      window._web3AntivirusDecision = {
        decision: '${decision}',
        requestId: '${requestId || ''}'
      };
    `;
    (document.head || document.documentElement).appendChild(script);
    script.remove();
  }
});

// Listen for direct messages from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'WEB3_ANTIVIRUS_DECISION') {
    const decision = message.decision;
    const requestId = message.requestId;
    
    console.log('[Web3 Antivirus] Direct decision message received:', decision, 'requestId:', requestId);
    
    // Send decision to page context via postMessage
    window.postMessage({
      type: 'WEB3_ANTIVIRUS_DECISION',
      decision: decision,
      requestId: requestId || ''
    }, '*');
    
    // Also inject into page context for inject.js to read
    const script = document.createElement('script');
    script.textContent = `
      window._web3AntivirusDecision = {
        decision: '${decision}',
        requestId: '${requestId || ''}'
      };
    `;
    (document.head || document.documentElement).appendChild(script);
    script.remove();
    
    sendResponse({ success: true });
    return true;
  }
});

// Listen for messages from injected script
window.addEventListener('message', async (event) => {
  if (event.source !== window) {
    console.log('[Web3 Antivirus] Message from different source, ignoring');
    return;
  }
  
  console.log('[Web3 Antivirus] Message received in content script:', event.data);
  
  if (event.data && event.data.type === 'WEB3_ANTIVIRUS_TRANSACTION') {
    console.log('[Web3 Antivirus] Transaction message received in content script, data:', event.data.data);
    const transactionData = event.data.data;
    const requestId = event.data.requestId;
    
    // Send to background script to open popup window
    console.log('[Web3 Antivirus] Sending message to background script with requestId:', requestId);
    chrome.runtime.sendMessage({
      type: 'METAMASK_TRANSACTION',
      data: transactionData,
      requestId: requestId
    }).then(() => {
      console.log('[Web3 Antivirus] Message sent to background successfully');
    }).catch(err => {
      console.error('[Web3 Antivirus] Failed to send message to background:', err);
    });
    
    // Note: Modal removed - only popup window will be shown
  }
});

console.log('[Web3 Antivirus] Message listener registered');

// Create in-page modal for transaction analysis
async function showTransactionModal(transactionData: any) {
  console.log('[Web3 Antivirus] Creating transaction analysis modal...');
  
  // Remove existing modal if any
  const existingModal = document.getElementById('web3-antivirus-modal');
  if (existingModal) {
    existingModal.remove();
  }
  
  // Create modal overlay
  const modal = document.createElement('div');
  modal.id = 'web3-antivirus-modal';
  modal.innerHTML = `
    <style>
      #web3-antivirus-modal {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.85);
        z-index: 999999999;
        display: flex;
        align-items: center;
        justify-content: center;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      }
      #web3-antivirus-content {
        background: #1a1b1f;
        border-radius: 16px;
        padding: 32px;
        max-width: 500px;
        width: 90%;
        color: #fff;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
      }
      #web3-antivirus-header {
        display: flex;
        align-items: center;
        gap: 12px;
        margin-bottom: 24px;
      }
      #web3-antivirus-icon {
        width: 48px;
        height: 48px;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        border-radius: 12px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 24px;
      }
      #web3-antivirus-title {
        font-size: 24px;
        font-weight: 700;
        margin: 0;
      }
      #web3-antivirus-status {
        text-align: center;
        padding: 24px;
        margin: 24px 0;
        border-radius: 12px;
        background: #2a2b30;
      }
      .web3-antivirus-loading {
        display: inline-block;
        width: 40px;
        height: 40px;
        border: 4px solid #f3f3f3;
        border-top: 4px solid #667eea;
        border-radius: 50%;
        animation: spin 1s linear infinite;
        margin-bottom: 16px;
      }
      @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
      #web3-antivirus-details {
        background: #2a2b30;
        border-radius: 12px;
        padding: 16px;
        margin: 16px 0;
        font-size: 14px;
      }
      .web3-antivirus-detail-row {
        display: flex;
        justify-content: space-between;
        padding: 8px 0;
        border-bottom: 1px solid #3a3b40;
      }
      .web3-antivirus-detail-row:last-child {
        border-bottom: none;
      }
      .web3-antivirus-label {
        color: #999;
      }
      .web3-antivirus-value {
        color: #fff;
        font-family: monospace;
        font-size: 12px;
      }
      #web3-antivirus-buttons {
        display: flex;
        gap: 12px;
        margin-top: 24px;
      }
      .web3-antivirus-btn {
        flex: 1;
        padding: 14px 24px;
        border: none;
        border-radius: 8px;
        font-size: 16px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s;
      }
      .web3-antivirus-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
      #web3-antivirus-reject {
        background: #ef4444;
        color: white;
      }
      #web3-antivirus-reject:hover:not(:disabled) {
        background: #dc2626;
      }
      #web3-antivirus-approve {
        background: #10b981;
        color: white;
      }
      #web3-antivirus-approve:hover:not(:disabled) {
        background: #059669;
      }
      .web3-antivirus-risk-high {
        color: #ef4444;
        font-weight: 700;
      }
      .web3-antivirus-risk-medium {
        color: #f59e0b;
        font-weight: 700;
      }
      .web3-antivirus-risk-low {
        color: #10b981;
        font-weight: 700;
      }
    </style>
    
    <div id="web3-antivirus-content">
      <div id="web3-antivirus-header">
        <div id="web3-antivirus-icon">🛡️</div>
        <h2 id="web3-antivirus-title">Transaction Security Check</h2>
      </div>
      
      <div id="web3-antivirus-status">
        <div class="web3-antivirus-loading"></div>
        <div id="web3-antivirus-status-text">Analyzing transaction...</div>
      </div>
      
      <div id="web3-antivirus-details">
        <div class="web3-antivirus-detail-row">
          <span class="web3-antivirus-label">To:</span>
          <span class="web3-antivirus-value">${transactionData.to ? transactionData.to.substring(0, 10) + '...' + transactionData.to.substring(transactionData.to.length - 8) : 'N/A'}</span>
        </div>
        <div class="web3-antivirus-detail-row">
          <span class="web3-antivirus-label">Value:</span>
          <span class="web3-antivirus-value">${transactionData.value}</span>
        </div>
        <div class="web3-antivirus-detail-row">
          <span class="web3-antivirus-label">Gas Price:</span>
          <span class="web3-antivirus-value">${transactionData.gasPrice}</span>
        </div>
      </div>
      
      <div id="web3-antivirus-result" style="display: none;"></div>
      
      <div id="web3-antivirus-buttons">
        <button id="web3-antivirus-reject" class="web3-antivirus-btn" disabled>
          ❌ Reject
        </button>
        <button id="web3-antivirus-approve" class="web3-antivirus-btn" disabled>
          ✅ Approve
        </button>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  // Analyze transaction
  try {
    const result = await analyzeTransaction(transactionData);
    displayAnalysisResult(result, modal);
  } catch (error: any) {
    displayError(error, modal);
  }
}

async function analyzeTransaction(transactionData: any) {
  // Call backend API
  const response = await fetch('http://localhost:8000/detect/transaction', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from_address: transactionData.from,
      to_address: transactionData.to,
      value: transactionData.value,
      gasPrice: transactionData.gasPrice,
      gasUsed: transactionData.gas,
      explain: true,
      explain_with_llm: true
    })
  });
  
  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }
  
  return await response.json();
}

function displayAnalysisResult(result: any, modal: HTMLElement) {
  const status = modal.querySelector('#web3-antivirus-status') as HTMLElement;
  const resultDiv = modal.querySelector('#web3-antivirus-result') as HTMLElement;
  const approveBtn = modal.querySelector('#web3-antivirus-approve') as HTMLButtonElement;
  const rejectBtn = modal.querySelector('#web3-antivirus-reject') as HTMLButtonElement;
  
  const prob = result.transaction_scam_probability;
  const isHighRisk = prob > 0.7;
  const isMediumRisk = prob > 0.4 && prob <= 0.7;
  
  status.style.display = 'none';
  resultDiv.style.display = 'block';
  
  const riskClass = isHighRisk ? 'web3-antivirus-risk-high' : 
                     isMediumRisk ? 'web3-antivirus-risk-medium' : 
                     'web3-antivirus-risk-low';
  
  const riskText = isHighRisk ? '🚨 HIGH RISK' :
                   isMediumRisk ? '⚠️ MEDIUM RISK' : 
                   '✅ LOW RISK';
  
  resultDiv.innerHTML = `
    <div style="text-align: center; padding: 20px; background: #2a2b30; border-radius: 12px;">
      <div class="${riskClass}" style="font-size: 20px; margin-bottom: 12px;">
        ${riskText}
      </div>
      <div style="font-size: 24px; font-weight: 700; margin-bottom: 16px;">
        ${(prob * 100).toFixed(1)}% Scam Probability
      </div>
      ${result.llm_explanations?.transaction ? `
        <div style="color: #ccc; font-size: 14px; line-height: 1.6;">
          ${result.llm_explanations.transaction}
        </div>
      ` : ''}
    </div>
  `;
  
  // Enable buttons
  approveBtn.disabled = false;
  rejectBtn.disabled = false;
  
  // Handle user decision
  approveBtn.onclick = () => makeDecision('approve');
  rejectBtn.onclick = () => makeDecision('reject');
}

function displayError(error: any, modal: HTMLElement) {
  const status = modal.querySelector('#web3-antivirus-status-text') as HTMLElement;
  const loadingDiv = modal.querySelector('.web3-antivirus-loading') as HTMLElement;
  const approveBtn = modal.querySelector('#web3-antivirus-approve') as HTMLButtonElement;
  const rejectBtn = modal.querySelector('#web3-antivirus-reject') as HTMLButtonElement;
  
  loadingDiv.style.display = 'none';
  status.innerHTML = `
    <div style="color: #ef4444;">
      ❌ Analysis failed: ${error.message}
    </div>
    <div style="color: #999; font-size: 14px; margin-top: 8px;">
      You can still approve or reject manually
    </div>
  `;
  
  // Enable buttons even on error
  approveBtn.disabled = false;
  rejectBtn.disabled = false;
  
  approveBtn.onclick = () => makeDecision('approve');
  rejectBtn.onclick = () => makeDecision('reject');
}

function makeDecision(decision: 'approve' | 'reject') {
  console.log(`[Web3 Antivirus] User decision: ${decision}`);
  
  // Inject decision into page context for interceptor to read
  const script = document.createElement('script');
  script.textContent = `window._web3AntivirusDecision = '${decision}';`;
  (document.head || document.documentElement).appendChild(script);
  script.remove();
  
  // Remove modal
  const modal = document.getElementById('web3-antivirus-modal');
  if (modal) {
    modal.remove();
  }
}

