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
      '19': 'images/logo.png',  // Recommended for toolbar
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
      'https://etherscan.io/*',
      'https://api.rarible.org/*',
      'http://localhost:8000/*'
    ],
    action: {
      default_popup: 'popup.html',
      default_icon: {
        '16': 'images/logo.png',
        '19': 'images/logo.png',
        '48': 'images/logo.png',
        '128': 'images/logo.png'
      },
      default_title: 'ScamRadar - Web3 Transaction Security'
    },
    web_accessible_resources: [
      {
        resources: ['inject.js', 'mock-popup.html'],
        matches: ['<all_urls>']
      }
    ]
  }
});

