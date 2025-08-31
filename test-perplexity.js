const https = require('https');

// Configuration
const API_KEY = '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'; // Replace with your actual API key
const API_URL = 'https://api.perplexity.ai/chat/completions';

// Test request data
const testRequest = {
  model: 'gpt-4o-mini',
  messages: [
    {
      role: 'system',
      content: 'You are a helpful AI coding assistant. Provide clear, concise responses with code examples when appropriate.'
    },
    {
      role: 'user',
      content: 'Hello! Can you help me write a simple JavaScript function that adds two numbers?'
    }
  ],
  max_tokens: 1000,
  temperature: 0.7,
  top_p: 0.9,
  top_k: 40,
  frequency_penalty: 0
};

// Function to make the API call
function callPerplexityAPI() {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(testRequest);
    
    const options = {
      hostname: 'api.perplexity.ai',
      port: 443,
      path: '/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
        'Authorization': `Bearer ${API_KEY}`
      }
    };

    console.log('🌐 Making request to Perplexity API...');
    console.log('📤 Request URL:', API_URL);
    console.log('🔑 Using API Key:', API_KEY.substring(0, 10) + '...');
    console.log('📋 Request Data:', JSON.stringify(testRequest, null, 2));

    const req = https.request(options, (res) => {
      console.log(`📡 Response Status: ${res.statusCode}`);
      console.log(`📡 Response Headers:`, res.headers);

      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const response = JSON.parse(data);
          console.log('✅ Success! Response:');
          console.log(JSON.stringify(response, null, 2));
          
          if (response.choices && response.choices[0]) {
            console.log('\n🤖 AI Response:');
            console.log(response.choices[0].message.content);
          }
          
          resolve(response);
        } catch (error) {
          console.error('❌ Error parsing response:', error);
          console.log('Raw response:', data);
          reject(error);
        }
      });
    });

    req.on('error', (error) => {
      console.error('❌ Request error:', error);
      reject(error);
    });

    req.write(postData);
    req.end();
  });
}

// Test different scenarios
async function runTests() {
  console.log('🧪 Testing Perplexity API Integration\n');
  
  if (API_KEY === 'YOUR_API_KEY_HERE') {
    console.log('❌ Please set your API key in the API_KEY variable at the top of this file');
    console.log('   Get your API key from: https://www.perplexity.ai/');
    return;
  }

  try {
    console.log('🚀 Starting API test...\n');
    await callPerplexityAPI();
    console.log('\n✅ Test completed successfully!');
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
  }
}

// Run the tests
runTests(); 
