// test-stable-connection.js
// Quick test to verify stable connection

require('dotenv').config();
const YellowNetworkStableClient = require('./yellow-network-stable');

async function testConnection() {
  console.log('=================================');
  console.log('Testing Stable Yellow Connection');
  console.log('=================================\n');

  const client = new YellowNetworkStableClient();
  
  // Track connection events
  let connectCount = 0;
  let disconnectCount = 0;
  
  client.on('connected', () => {
    connectCount++;
    console.log(`\n✅ Connected (Count: ${connectCount})`);
  });
  
  client.on('disconnected', () => {
    disconnectCount++;
    console.log(`\n❌ Disconnected (Count: ${disconnectCount})`);
  });
  
  client.on('assets', (assets) => {
    console.log(`\n📦 Assets updated: ${assets.length} tokens`);
  });
  
  client.on('error', (error) => {
    console.error(`\n⚠️ Error: ${error}`);
  });
  
  try {
    // Connect to Yellow Network
    await client.connect();
    
    // Monitor connection for 2 minutes
    console.log('\n📊 Monitoring connection for 2 minutes...\n');
    console.log('If connection is stable, you should see:');
    console.log('- Regular heartbeat messages every 30s');
    console.log('- NO disconnect/reconnect cycles\n');
    
    // Check status every 20 seconds
    const statusInterval = setInterval(() => {
      const status = client.getStatus();
      console.log('\n📊 Status Check:');
      console.log(`   Connected: ${status.connected}`);
      console.log(`   Assets: ${status.assetsCount}`);
      console.log(`   Reconnects: ${status.reconnectAttempts}`);
      console.log(`   Connects: ${connectCount}, Disconnects: ${disconnectCount}`);
      
      // Alert if there are disconnections
      if (disconnectCount > 0) {
        console.log('\n⚠️ WARNING: Connection instability detected!');
        console.log('   The connection is still experiencing issues.');
      }
    }, 20000);
    
    // After 2 minutes, show final summary
    setTimeout(() => {
      clearInterval(statusInterval);
      
      console.log('\n=================================');
      console.log('Test Complete - Final Summary:');
      console.log('=================================');
      console.log(`Total Connections: ${connectCount}`);
      console.log(`Total Disconnections: ${disconnectCount}`);
      
      if (disconnectCount === 0 && connectCount === 1) {
        console.log('\n✅ SUCCESS: Connection was stable!');
      } else {
        console.log('\n❌ FAILURE: Connection was unstable');
        console.log('The issue persists and may be on Yellow Network\'s side');
      }
      
      // Disconnect cleanly
      client.disconnect();
      
      // Exit after cleanup
      setTimeout(() => {
        process.exit(0);
      }, 1000);
    }, 120000); // 2 minutes
    
  } catch (error) {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  }
}

// Run test
console.log('Starting Yellow Network stability test...\n');
testConnection();

// Handle Ctrl+C
process.on('SIGINT', () => {
  console.log('\n\n⚠️ Test interrupted by user');
  process.exit(0);
});