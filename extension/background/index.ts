import { defineBackground } from 'wxt/sandbox';

let alertWindowId: number | null = null;
let alertTabId: number | null = null;

export default defineBackground(() => {
  console.log('Web3 Antivirus background service worker loaded');

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
    if (message.type === 'METAMASK_TRANSACTION') {
      // Handle MetaMask transaction detection
      handleMetaMaskTransaction(message.data, message.requestId);
      sendResponse({ success: true });
    }
    return true; // Keep channel open for async response
  });
});

async function handleMetaMaskTransaction(transactionData: any, requestId?: string) {
  // Store transaction data for popup/standalone window to access
  await chrome.storage.local.set({
    pendingTransaction: transactionData,
    transactionTimestamp: Date.now(),
    transactionRequestId: requestId || ''
  });
  
  await openOrFocusAlertWindow();
}

async function openOrFocusAlertWindow() {
  const url = chrome.runtime.getURL('popup.html?source=alert');

  if (alertWindowId !== null) {
    try {
      await chrome.windows.update(alertWindowId, { focused: true });
      if (alertTabId !== null) {
        await chrome.tabs.update(alertTabId, { active: true, highlighted: true });
      }
      return;
    } catch (err) {
      console.warn('Existing alert window not available, creating new one', err);
      alertWindowId = null;
      alertTabId = null;
    }
  }

  const createdWindow = await chrome.windows.create({
    url,
    type: 'popup',
    width: 420,
    height: 640,
    focused: true
  });

  alertWindowId = createdWindow.id ?? null;
  alertTabId = createdWindow.tabs && createdWindow.tabs[0]?.id ? createdWindow.tabs[0].id! : null;
}

