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

  // Listen for messages from content script
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('[Web3 Antivirus] Message received in background:', message.type, 'from tab:', sender.tab?.id);
    
    if (message.type === 'METAMASK_TRANSACTION') {
      console.log('[Web3 Antivirus] Transaction detected from tab:', sender.tab?.id, 'data:', message.data);
      // Handle MetaMask transaction detection
      handleMetaMaskTransaction(message.data);
      sendResponse({ success: true });
    } else {
      console.log('[Web3 Antivirus] Unknown message type:', message.type);
    }
    return true; // Keep channel open for async response
  });
  
  console.log('[Web3 Antivirus] Message listener registered in background');
  
  console.log('[Web3 Antivirus] Ready to intercept transactions');
});

async function handleMetaMaskTransaction(transactionData: any) {
  console.log('[Web3 Antivirus] Handling transaction:', transactionData);
  
  // Store transaction data for popup/standalone window to access
  await chrome.storage.local.set({
    pendingTransaction: transactionData,
    transactionTimestamp: Date.now()
  });
  
  await openOrFocusAlertWindow();
}

async function openOrFocusAlertWindow() {
  console.log('[Web3 Antivirus] Opening/focusing alert window...');
  const url = chrome.runtime.getURL('popup.html?source=alert');

  if (alertWindowId !== null) {
    try {
      await chrome.windows.update(alertWindowId, { focused: true });
      if (alertTabId !== null) {
        await chrome.tabs.update(alertTabId, { active: true, highlighted: true });
      }
      console.log('[Web3 Antivirus] Focused existing alert window');
      return;
    } catch (err) {
      console.warn('[Web3 Antivirus] Existing alert window not available, creating new one', err);
      alertWindowId = null;
      alertTabId = null;
    }
  }

  try {
    const createdWindow = await chrome.windows.create({
      url,
      type: 'popup',
      width: 420,
      height: 640,
      focused: true
    });

    alertWindowId = createdWindow.id ?? null;
    alertTabId = createdWindow.tabs && createdWindow.tabs[0]?.id ? createdWindow.tabs[0].id! : null;
    console.log('[Web3 Antivirus] Created new alert window:', alertWindowId, 'tab:', alertTabId);
  } catch (err) {
    console.error('[Web3 Antivirus] Failed to create alert window:', err);
  }
}

