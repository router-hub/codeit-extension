#!/usr/bin/env node

/**
 * Setup script for test environment
 * This script helps developers set up their API key for testing
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

console.log('🔧 codeIt Test Environment Setup\n');

function question(prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
}

async function setupTestEnvironment() {
  try {
    console.log('This script will help you set up your test environment for codeIt.\n');
    
    const apiKey = await question('Enter your Perplexity API key (or press Enter to skip): ');
    
    if (!apiKey.trim()) {
      console.log('\n⏭️  Skipping API key setup. You can set it manually later.');
      console.log('   To set manually, use: export PERPLEXITY_API_KEY="your-api-key"');
      return;
    }
    
    // Validate API key format
    if (!apiKey.startsWith('pplx-') && !apiKey.startsWith('pcl_')) {
      console.log('\n❌ Invalid API key format. API key should start with "pplx-" or "pcl_"');
      return;
    }
    
    // Create .env file for local development
    const envContent = `# codeIt Test Environment
# This file is for local development only - DO NOT COMMIT
PERPLEXITY_API_KEY=${apiKey}
PPLX_API_KEY=${apiKey}
`;
    
    fs.writeFileSync('.env', envContent);
    console.log('\n✅ Test environment configured successfully!');
    console.log('📁 Created .env file with your API key');
    console.log('🔒 The .env file is already in .gitignore and will not be committed');
    
    console.log('\n🚀 You can now run the test:');
    console.log('   node test-perplexity.js');
    
  } catch (error) {
    console.error('\n❌ Error setting up test environment:', error.message);
  } finally {
    rl.close();
  }
}

setupTestEnvironment();
