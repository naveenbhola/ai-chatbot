/**
 * Test script to verify Swagger integration
 * Run this after starting the server to check if Swagger is working
 */

const axios = require('axios');

const BASE_URL = 'http://localhost:5000';

async function testSwaggerIntegration() {
  console.log('🧪 Testing Swagger Integration...\n');

  try {
    // Test 1: Check if server is running
    console.log('1. Testing server health...');
    const healthResponse = await axios.get(`${BASE_URL}/api/health`);
    console.log('✅ Health check passed:', healthResponse.data);
    console.log('');

    // Test 2: Check if Swagger UI endpoint is accessible
    console.log('2. Testing Swagger UI endpoint...');
    const swaggerResponse = await axios.get(`${BASE_URL}/api-docs`);
    console.log('✅ Swagger UI endpoint accessible (status:', swaggerResponse.status, ')');
    console.log('');

    // Test 3: Check if OpenAPI JSON is accessible
    console.log('3. Testing OpenAPI JSON endpoint...');
    const openApiResponse = await axios.get(`${BASE_URL}/api-docs.json`);
    console.log('✅ OpenAPI JSON accessible (status:', openApiResponse.status, ')');
    
    if (openApiResponse.data && openApiResponse.data.info) {
      console.log('📋 API Info:', openApiResponse.data.info.title, 'v' + openApiResponse.data.info.version);
      console.log('🏷️  Available tags:', openApiResponse.data.tags.map(t => t.name).join(', '));
    }
    console.log('');

    // Test 4: Check if routes are documented
    console.log('4. Checking documented routes...');
    if (openApiResponse.data && openApiResponse.data.paths) {
      const routes = Object.keys(openApiResponse.data.paths);
      console.log('📚 Found', routes.length, 'documented endpoints:');
      routes.forEach(route => {
        const methods = Object.keys(openApiResponse.data.paths[route]);
        console.log(`   ${route} (${methods.join(', ')})`);
      });
    }
    console.log('');

    console.log('🎉 All Swagger integration tests passed!');
    console.log('🌐 Access Swagger UI at:', `${BASE_URL}/api-docs`);
    console.log('📄 Access OpenAPI JSON at:', `${BASE_URL}/api-docs.json`);

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    
    if (error.code === 'ECONNREFUSED') {
      console.log('💡 Make sure the server is running on port 5000');
      console.log('   Run: npm run server');
    }
    
    if (error.response) {
      console.log('📊 Response status:', error.response.status);
      console.log('📄 Response data:', error.response.data);
    }
  }
}

// Run the test
testSwaggerIntegration();
