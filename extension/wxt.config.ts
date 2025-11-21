import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  extensionApi: 'chrome',
  manifest: {
    name: 'ScamRadar',
    description: 'Real-time scam protection for Web3 transactions',
    version: '1.0.0',
    icons: {
      '16': 'images/logo.png',
      '48': 'images/logo.png',
      '128': 'images/logo.png'
    },
    permissions: [
      'activeTab',
      'storage',
      'scripting',
      'webRequest',
      'webNavigation',
      'notifications',
      'tabs'
    ],
    host_permissions: [
      'https://api.etherscan.io/*',
      'https://api.rarible.org/*',
      'http://localhost:8000/*'
    ],
    action: {
      default_popup: 'popup.html'
    },
    web_accessible_resources: [
      {
        resources: ['inject.js'],
        matches: ['<all_urls>']
      }
    ]
  }
});

