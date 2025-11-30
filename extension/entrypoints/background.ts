import { defineBackground } from 'wxt/sandbox';

let alertWindowId: number | null = null;
let alertTabId: number | null = null;

export default defineBackground(() => {
  console.log('[Web3 Antivirus] Background service worker loaded');

  chrome.windows.onRemoved.addListener((windowId) => {
    if (windowId === alertWindowId) {
      alertWindowId = null;
      alertTabId = null;
    }
  });
  
  chrome.tabs.onRemoved.addListener((tabId) => {
    if (tabId === alertTabId) {
      alertTabId = null;
    }
  });

  // Listen for messages from content script and popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('[Web3 Antivirus] Message received in background:', message.action || message.type, 'from tab:', sender.tab?.id);
    
    if (message.type === 'METAMASK_TRANSACTION') {
      console.log('[Web3 Antivirus] Transaction detected from tab:', sender.tab?.id, 'data:', message.data);
      // Handle MetaMask transaction detection
    handleMetaMaskTransaction(message.data, message.requestId);
      sendResponse({ success: true });
    } else if (message.action === 'checkEtherscanWarning') {
      // Handle Etherscan warning check
      checkEtherscanWarning(message.address)
        .then(hasWarning => {
          sendResponse({ hasWarning });
        })
        .catch(error => {
          console.error('[Web3 Antivirus] Error checking Etherscan warning:', error);
          sendResponse({ hasWarning: false });
        });
      return true; // Keep channel open for async response
    } else {
      console.log('[Web3 Antivirus] Unknown message type:', message.type || message.action);
    }
    return true; // Keep channel open for async response
  });
  
  console.log('[Web3 Antivirus] Message listener registered in background');
  
  console.log('[Web3 Antivirus] Ready to intercept transactions');
});

async function handleMetaMaskTransaction(transactionData: any, requestId?: string) {
  console.log('[Web3 Antivirus] Handling transaction:', transactionData, 'requestId:', requestId);
  
  try {
    // Clear previous decision so listeners fire again
    await chrome.storage.local.remove(['transactionDecision', 'transactionRequestId']);
    
    // Store transaction data for popup/standalone window to access
    await chrome.storage.local.set({
      pendingTransaction: transactionData,
      transactionTimestamp: Date.now(),
      transactionRequestId: requestId || ''
    });
    
    console.log('[Web3 Antivirus] Transaction data stored, opening popup window...');
    
    // Open popup window immediately (don't await to avoid blocking)
    openOrFocusAlertWindow().catch(err => {
      console.error('[Web3 Antivirus] Failed to open alert window:', err);
    });
  } catch (err) {
    console.error('[Web3 Antivirus] Error handling transaction:', err);
  }
}

async function openOrFocusAlertWindow() {
  console.log('[Web3 Antivirus] Opening/focusing alert window...');
  const url = chrome.runtime.getURL('popup.html?source=alert');
  console.log('[Web3 Antivirus] Popup URL:', url);

  // Always create a new window for each transaction to ensure it shows
  // Close existing window if any
  if (alertWindowId !== null) {
    try {
      await chrome.windows.remove(alertWindowId);
      console.log('[Web3 Antivirus] Removed existing alert window');
    } catch (err) {
      console.warn('[Web3 Antivirus] Could not remove existing window:', err);
    }
    alertWindowId = null;
    alertTabId = null;
  }

  try {
    console.log('[Web3 Antivirus] Creating new popup window...');
    const createdWindow = await chrome.windows.create({
      url,
      type: 'popup',
      width: 420,
      height: 640,
      focused: true
    });

    alertWindowId = createdWindow.id ?? null;
    alertTabId = createdWindow.tabs && createdWindow.tabs[0]?.id ? createdWindow.tabs[0].id! : null;
    console.log('[Web3 Antivirus] ✅ Successfully created alert window:', alertWindowId, 'tab:', alertTabId);
    
    // Verify window was created
    if (alertWindowId === null || alertWindowId === undefined) {
      console.error('[Web3 Antivirus] ❌ Window ID is null after creation!');
    }
  } catch (err) {
    console.error('[Web3 Antivirus] ❌ Failed to create alert window:', err);
    // Try alternative: open as tab instead of popup
    try {
      console.log('[Web3 Antivirus] Trying to open as tab instead...');
      const tab = await chrome.tabs.create({
        url,
        active: true
      });
      alertTabId = tab.id ?? null;
      console.log('[Web3 Antivirus] ✅ Opened as tab:', alertTabId);
    } catch (tabErr) {
      console.error('[Web3 Antivirus] ❌ Failed to open as tab:', tabErr);
    }
  }
}

// Check Etherscan for phishing/scam warnings
async function checkEtherscanWarning(address: string): Promise<boolean> {
  if (!address || address.length !== 42) {
    return false;
  }
  
  try {
    const url = `https://etherscan.io/address/${address}`;
    console.log('[Web3 Antivirus] Checking Etherscan warning for:', address);
    
    // Try to fetch using chrome.tabs API (more reliable than fetch due to CORS)
    // Create a temporary hidden tab to scrape the page
    return new Promise((resolve) => {
      chrome.tabs.create({ url, active: false }, (tab) => {
        if (!tab.id) {
          console.error('[Web3 Antivirus] Failed to create tab');
          resolve(false);
          return;
        }
        
        // Wait for page to load, then inject script to scrape
        const checkTab = setInterval(() => {
          chrome.tabs.get(tab.id!, (tabInfo) => {
            if (chrome.runtime.lastError) {
              clearInterval(checkTab);
              resolve(false);
              return;
            }
            
            if (tabInfo.status === 'complete') {
              clearInterval(checkTab);
              
              // Inject script to scrape page content
              chrome.scripting.executeScript(
                {
                  target: { tabId: tab.id! },
                  func: () => {
                    const html = document.documentElement.innerHTML.toLowerCase();
                    const warningKeywords = [
                      'fake_phishing',
                      'phish',
                      'hack',
                      'phishing',
                      'scam',
                      'reported',
                      'malicious'
                    ];
                    return warningKeywords.some(keyword => html.includes(keyword));
                  }
                },
                (results) => {
                  // Close the temporary tab
                  chrome.tabs.remove(tab.id!);
                  
                  if (results && results[0] && results[0].result) {
                    console.log('[Web3 Antivirus] Etherscan warning found for:', address);
                    resolve(true);
                  } else {
                    console.log('[Web3 Antivirus] No Etherscan warning for:', address);
                    resolve(false);
                  }
                }
              );
            }
          });
        }, 500);
        
        // Timeout after 10 seconds
        setTimeout(() => {
          clearInterval(checkTab);
          chrome.tabs.remove(tab.id!);
          console.log('[Web3 Antivirus] Timeout checking Etherscan warning');
          resolve(false);
        }, 10000);
      });
    });
  } catch (error) {
    console.error('[Web3 Antivirus] Error checking Etherscan warning:', error);
    return false;
  }
}

