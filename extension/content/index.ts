export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_start',
  main() {
    // Intercept MetaMask transaction requests
    interceptMetaMaskTransactions();
  },
});

function interceptMetaMaskTransactions() {
  // Inject script to intercept window.ethereum before page loads
  const script = document.createElement('script');
  script.textContent = `
    (function() {
      // Wait for window.ethereum to be available
      const checkEthereum = setInterval(() => {
        if (window.ethereum) {
          clearInterval(checkEthereum);
          
          const originalRequest = window.ethereum.request.bind(window.ethereum);
          
          window.ethereum.request = async function(args) {
            // Intercept transaction requests
            if (args && (args.method === 'eth_sendTransaction' || args.method === 'eth_signTransaction')) {
              const tx = args.params && args.params[0];
              if (tx) {
                // Send transaction data to extension via postMessage
                window.postMessage({
                  type: 'WEB3_ANTIVIRUS_TRANSACTION',
                  data: {
                    from: tx.from || '',
                    to: tx.to || '',
                    value: tx.value || '0x0',
                    data: tx.data || '0x',
                    gas: tx.gas || tx.gasLimit || '0x0',
                    gasPrice: tx.gasPrice || '0x0',
                    chainId: tx.chainId || '0x1'
                  }
                }, '*');
                
                // Wait for user decision from extension popup
                return new Promise((resolve, reject) => {
                  const checkDecision = setInterval(() => {
                    try {
                      // Access chrome.storage via injected script context
                      if (window.web3AntivirusDecision) {
                        clearInterval(checkDecision);
                        const decision = window.web3AntivirusDecision;
                        delete window.web3AntivirusDecision;
                        
                        if (decision === 'approve') {
                          // Continue with original MetaMask request
                          originalRequest(args).then(resolve).catch(reject);
                        } else {
                          // Reject transaction
                          reject(new Error('Transaction rejected by Web3 Antivirus'));
                        }
                      }
                    } catch (e) {
                      // If chrome.storage not accessible, allow after timeout
                      setTimeout(() => {
                        clearInterval(checkDecision);
                        originalRequest(args).then(resolve).catch(reject);
                      }, 5000);
                    }
                  }, 100);
                });
              }
            }
            
            // For other requests, proceed normally
            return originalRequest(args);
          };
        }
      }, 100);
    })();
  `;
  
  // Inject script before page scripts run
  (document.head || document.documentElement).appendChild(script);
  script.remove();
  
  // Listen for messages from injected script
  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    
    if (event.data && event.data.type === 'WEB3_ANTIVIRUS_TRANSACTION') {
      const transactionData = event.data.data;
      
      // Store decision handler for injected script
      chrome.storage.local.onChanged.addListener((changes) => {
        if (changes.transactionDecision) {
          const decision = changes.transactionDecision.newValue;
          // Send decision to page context
          window.postMessage({
            type: 'WEB3_ANTIVIRUS_DECISION',
            decision: decision
          }, '*');
          
          // Store in window for injected script to access
          const script = document.createElement('script');
          script.textContent = `window.web3AntivirusDecision = '${decision}';`;
          (document.head || document.documentElement).appendChild(script);
          script.remove();
        }
      });
      
      // Send to background script
      chrome.runtime.sendMessage({
        type: 'METAMASK_TRANSACTION',
        data: transactionData
      });
    }
    
    // Listen for decision requests from injected script
    if (event.data && event.data.type === 'WEB3_ANTIVIRUS_CHECK_DECISION') {
      chrome.storage.local.get(['transactionDecision'], (result) => {
        if (result.transactionDecision) {
          window.postMessage({
            type: 'WEB3_ANTIVIRUS_DECISION',
            decision: result.transactionDecision
          }, '*');
        }
      });
    }
  });
}
