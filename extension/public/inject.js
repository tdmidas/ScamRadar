// This script runs in page context (MAIN world) to REPLACE MetaMask completely
// It's injected as a file to bypass CSP restrictions
// This script runs at document_start to intercept MetaMask before it injects

(function() {
  'use strict';
  console.log('[Web3 Antivirus] Injecting MetaMask REPLACEMENT in page context...');
  
  // Store original MetaMask provider if it exists
  let originalMetaMaskProvider = null;
  
  // Create our own provider that will replace MetaMask
  function createReplacementProvider() {
    // If MetaMask already injected, save it but hide it
    if (window.ethereum && !window.ethereum._web3AntivirusReplacement) {
      originalMetaMaskProvider = window.ethereum;
      console.log('[Web3 Antivirus] Found existing MetaMask provider, storing reference');
    }
    
    // Create replacement provider
    const replacementProvider = {
      _web3AntivirusReplacement: true,
      _originalProvider: originalMetaMaskProvider,
      _isMetaMask: true, // Pretend to be MetaMask for compatibility
      _metamask: {
        isUnlocked: async () => {
          if (originalMetaMaskProvider && originalMetaMaskProvider._metamask) {
            return originalMetaMaskProvider._metamask.isUnlocked();
          }
          return true;
        }
      },
      
      // Store pending requests
      _pendingRequests: new Map(),
      _requestId: 0,
      
      // EIP-1193 request method
      request: async function(args) {
        console.log('[Web3 Antivirus] Request intercepted:', args && args.method, 'args:', args);
        
        // Intercept transaction and signing requests
        if (args && (
          args.method === 'eth_sendTransaction' || 
          args.method === 'eth_signTransaction' ||
          args.method === 'eth_sign' ||
          args.method === 'personal_sign' ||
          args.method === 'eth_signTypedData' ||
          args.method === 'eth_signTypedData_v3' ||
          args.method === 'eth_signTypedData_v4'
        )) {
          return handleTransactionOrSignRequest(args);
        }
        
        // For other requests, forward to original provider if available
        if (originalMetaMaskProvider) {
          try {
            return await originalMetaMaskProvider.request(args);
          } catch (err) {
            console.error('[Web3 Antivirus] Error forwarding request:', err);
            throw err;
          }
        }
        
        // If no original provider, return error
        throw new Error('No wallet provider available');
      },
      
      // Legacy send method
      send: function(method, params) {
        console.log('[Web3 Antivirus] Legacy send method called:', method);
        if (method === 'eth_sendTransaction' || method === 'eth_signTransaction') {
          return this.request({ method: method, params: params });
        }
        if (originalMetaMaskProvider && originalMetaMaskProvider.send) {
          return originalMetaMaskProvider.send(method, params);
        }
        return Promise.reject(new Error('No wallet provider available'));
      },
      
      // Legacy sendAsync method
      sendAsync: function(payload, callback) {
        console.log('[Web3 Antivirus] Legacy sendAsync method called:', payload);
        if (payload.method === 'eth_sendTransaction' || payload.method === 'eth_signTransaction') {
          this.request({ method: payload.method, params: payload.params || [] })
            .then(result => callback(null, { result: result }))
            .catch(err => callback(err));
          return;
        }
        if (originalMetaMaskProvider && originalMetaMaskProvider.sendAsync) {
          return originalMetaMaskProvider.sendAsync(payload, callback);
        }
        callback(new Error('No wallet provider available'));
      },
      
      // Event emitter methods
      on: function(event, handler) {
        if (originalMetaMaskProvider && originalMetaMaskProvider.on) {
          return originalMetaMaskProvider.on(event, handler);
        }
      },
      
      removeListener: function(event, handler) {
        if (originalMetaMaskProvider && originalMetaMaskProvider.removeListener) {
          return originalMetaMaskProvider.removeListener(event, handler);
        }
      },
      
      // Chain ID and network
      chainId: originalMetaMaskProvider ? originalMetaMaskProvider.chainId : '0x1',
      networkVersion: originalMetaMaskProvider ? originalMetaMaskProvider.networkVersion : '1',
      
      // Selected address
      selectedAddress: originalMetaMaskProvider ? originalMetaMaskProvider.selectedAddress : null,
      
      // Provider state
      isConnected: () => originalMetaMaskProvider ? originalMetaMaskProvider.isConnected() : false,
      
      // Enable method (connect to wallet)
      enable: async function() {
        if (originalMetaMaskProvider && originalMetaMaskProvider.enable) {
          return await originalMetaMaskProvider.enable();
        }
        if (originalMetaMaskProvider && originalMetaMaskProvider.request) {
          return await originalMetaMaskProvider.request({ method: 'eth_requestAccounts' });
        }
        throw new Error('No wallet provider available');
      }
    };
    
    // Proxy events from original provider
    if (originalMetaMaskProvider) {
      ['accountsChanged', 'chainChanged', 'connect', 'disconnect'].forEach(event => {
        if (originalMetaMaskProvider.on) {
          originalMetaMaskProvider.on(event, (...args) => {
            if (replacementProvider.on) {
              // Forward event to replacement provider listeners
              const listeners = replacementProvider._listeners || {};
              if (listeners[event]) {
                listeners[event].forEach(handler => handler(...args));
              }
            }
          });
        }
      });
    }
    
    return replacementProvider;
  }
  
  // Handle transaction or signing requests
  async function handleTransactionOrSignRequest(args) {
    const tx = args.params && args.params[0];
    if (!tx) {
      throw new Error('Invalid transaction parameters');
    }
    
    console.log('[Web3 Antivirus] Transaction/Sign request detected, analyzing...', tx);
    
    const requestData = {
      from: tx.from || '',
      to: tx.to || '',
      value: tx.value || '0x0',
      data: tx.data || '0x',
      gas: tx.gas || tx.gasLimit || '0x0',
      gasPrice: tx.gasPrice || tx.maxFeePerGas || '0x0',
      chainId: tx.chainId || '0x1',
      method: args.method,
      params: args.params
    };
    
    // Generate unique request ID
    const requestId = 'req_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    
    console.log('[Web3 Antivirus] Sending postMessage with data:', requestData);
    
    // Send transaction data to extension via postMessage
    window.postMessage({
      type: 'WEB3_ANTIVIRUS_TRANSACTION',
      data: requestData,
      requestId: requestId
    }, '*');
    
    // Wait for user decision
    return new Promise(function(resolve, reject) {
      let timeoutId;
      const checkDecision = setInterval(function() {
        if (window._web3AntivirusDecision && window._web3AntivirusDecision.requestId === requestId) {
          clearInterval(checkDecision);
          clearTimeout(timeoutId);
          
          const decision = window._web3AntivirusDecision.decision;
          const decisionRequestId = window._web3AntivirusDecision.requestId;
          delete window._web3AntivirusDecision;
          
          if (decision === 'approve') {
            console.log('[Web3 Antivirus] Transaction APPROVED by user, forwarding to MetaMask (silent)');
            // Forward to original MetaMask provider
            if (originalMetaMaskProvider) {
              // Use the original provider directly without changing window.ethereum
              // This way MetaMask won't detect that window.ethereum changed
              originalMetaMaskProvider.request(args)
                .then(result => {
                  resolve(result);
                })
                .catch(err => {
                  reject(err);
                });
            } else {
              // If no original provider, try to find MetaMask provider
              // MetaMask might be in window.ethereum.providers array
              if (window.ethereum && window.ethereum.providers) {
                const metamaskProvider = window.ethereum.providers.find((p: any) => p.isMetaMask);
                if (metamaskProvider) {
                  originalMetaMaskProvider = metamaskProvider;
                  metamaskProvider.request(args)
                    .then(result => resolve(result))
                    .catch(err => reject(err));
                } else {
                  reject(new Error('No wallet provider available'));
                }
              } else {
                reject(new Error('No wallet provider available'));
              }
            }
          } else {
            console.log('[Web3 Antivirus] Transaction REJECTED by user');
            reject(new Error('Transaction rejected by Web3 Antivirus'));
          }
        }
      }, 100);
      
      // Timeout after 5 minutes
      timeoutId = setTimeout(function() {
        clearInterval(checkDecision);
        console.warn('[Web3 Antivirus] Decision timeout, rejecting transaction');
        reject(new Error('Transaction request timeout'));
      }, 300000);
    });
  }
  
  // Block MetaMask popup by overriding window.open
  function blockMetaMaskPopup() {
    const originalOpen = window.open;
    window.open = function(...args) {
      const url = args[0];
      // Block MetaMask popup URLs
      if (url && (
        url.includes('chrome-extension://nkbihfbeogaeaoehlefnkodbefgpgknn') || // MetaMask extension ID
        url.includes('metamask') ||
        url.includes('popup.html') && url.includes('extension')
      )) {
        console.log('[Web3 Antivirus] Blocked MetaMask popup:', url);
        return null; // Block the popup
      }
      // Allow other popups
      return originalOpen.apply(window, args);
    };
    console.log('[Web3 Antivirus] MetaMask popup blocker installed');
  }
  
  // Replace window.ethereum immediately
  function replaceMetaMaskProvider() {
    if (window.ethereum && window.ethereum._web3AntivirusReplacement) {
      console.log('[Web3 Antivirus] Already replaced');
      return;
    }
    
    console.log('[Web3 Antivirus] Replacing window.ethereum with our provider');
    const replacement = createReplacementProvider();
    window.ethereum = replacement;
    
    // Also replace window.web3 if it exists
    if (window.web3 && window.web3.currentProvider === originalMetaMaskProvider) {
      window.web3.currentProvider = replacement;
    }
  }
  
  // Block popup immediately
  blockMetaMaskPopup();
  
  // Try to replace immediately
  replaceMetaMaskProvider();
  
  // Watch for MetaMask trying to inject (it might inject later)
  let checkCount = 0;
  const watchInterval = setInterval(function() {
    checkCount++;
    
    // If MetaMask injects after us, replace it again
    if (window.ethereum && !window.ethereum._web3AntivirusReplacement) {
      console.log('[Web3 Antivirus] MetaMask injected after us, replacing again');
      originalMetaMaskProvider = window.ethereum;
      replaceMetaMaskProvider();
    }
    
    // Stop watching after 10 seconds
    if (checkCount > 100) {
      clearInterval(watchInterval);
    }
  }, 100);
  
  // Use Object.defineProperty to prevent MetaMask from overwriting
  try {
    let currentProvider = window.ethereum;
    Object.defineProperty(window, 'ethereum', {
      get: function() {
        return currentProvider;
      },
      set: function(value) {
        if (value && !value._web3AntivirusReplacement) {
          console.log('[Web3 Antivirus] MetaMask trying to set window.ethereum, intercepting...');
          originalMetaMaskProvider = value;
          currentProvider = createReplacementProvider();
        } else {
          currentProvider = value;
        }
      },
      configurable: true
    });
    console.log('[Web3 Antivirus] Protected window.ethereum from being overwritten');
  } catch (e) {
    console.warn('[Web3 Antivirus] Could not protect window.ethereum:', e);
  }
  
  console.log('[Web3 Antivirus] MetaMask replacement installed successfully!');
})();
