const WebSocket = require('ws');
const { 
  createAuthRequestMessage, 
  createAuthVerifyMessage, 
  createEIP712AuthMessageSigner, 
  RPCMethod,
  createAppSessionMessage
} = require('@erc7824/nitrolite');
const { ethers } = require('ethers');

// === CONFIGURATION ===
const CLEARNODE_URL = 'wss://clearnet.yellow.com/ws';
const PRIVATE_KEY = '';
const ADDRESS = '';

// === YOU CAN CHANGE THIS TO ANY OTHER WALLET FOR TESTING ===
const OTHER_PARTICIPANT = '0x1111111111111111111111111111111111111111';

// === SETUP OBJECTS ===
const ws = new WebSocket(CLEARNODE_URL);
const wallet = new ethers.Wallet(PRIVATE_KEY);

// === ON CONNECTION OPEN ===
ws.on('open', async () => {
  console.log('✅ Connected to ClearNode!');

  // Step 1: Build and send auth_request message
  const expire = Math.floor(Date.now() / 1000) + 3600; // always use this integer!
  const authMsg = await createAuthRequestMessage({
    wallet: ADDRESS,
    participant: ADDRESS,
    app_name: 'DemoApp',
    expire: expire, // use the integer variable, not expireTime
    scope: 'console',
    application: '0x0000000000000000000000000000000000000000',
    allowances: []
  });
  ws.send(authMsg);
  console.log('➡️ Sent auth request!');
});
// === ON RECEIVING A MESSAGE ===
ws.on('message', async (data) => {
  let msg;
  try {
    msg = JSON.parse(data.toString());
  } catch (err) {
    console.log("❌ Error parsing incoming message:", err, "\nRaw message:", data.toString());
    return;
  }

  console.log('⬅️ Message from node:', msg);

  // Step 2: Handle authentication challenge
if (msg.method === RPCMethod.AuthChallenge) {
  console.log('🔑 Received challenge from node, signing...');

  const expire = Math.floor(Date.now() / 1000) + 3600; // use integer!
  const signer = createEIP712AuthMessageSigner(
    wallet,
    {
      scope: 'console',
      application: '0x0000000000000000000000000000000000000000',
      participant: ADDRESS,
      expire: expire, // use integer
      allowances: [],
    },
    {
      name: 'DemoApp'
    }
  );
  const verifyMsg = await createAuthVerifyMessage(signer, msg);
  ws.send(verifyMsg);
  console.log('➡️ Sent auth verification!');
}
  // Step 3: Handle authentication verification and START APP SESSION
  if (msg.method === RPCMethod.AuthVerify && msg.params && msg.params.success) {
    console.log('🎉 Authenticated! Your JWT token:', msg.params.jwtToken);

    // Start an app session right after auth
    const appSessionParams = [{
      definition: {
        protocol: 'nitroliterpc',
        participants: [ADDRESS, OTHER_PARTICIPANT],
        weights: [100, 0],
        quorum: 100,
        challenge: 0,
        nonce: Date.now()
      },
      token: '0x0000000000000000000000000000000000000000', // ETH
      allocations: ['1000000', '0'] // You start with 1,000,000 units, other gets 0
    }];

    try {
      const appSessionMsg = await createAppSessionMessage(
        async (payload) => await wallet.signMessage(JSON.stringify(payload)),
        appSessionParams
      );
      ws.send(appSessionMsg);
      console.log('➡️ Requested to create app session.');
    } catch (err) {
      console.log('❌ Error creating app session:', err);
    }
  }

  // Listen for the session creation response
  if (msg.method === 'create_app_session') {
    console.log('✅ App session created:', msg.params);
    // Save msg.params.app_session_id for further app logic
  }

  if (msg.method === RPCMethod.AuthVerify && msg.params && !msg.params.success) {
    console.log('❌ Authentication failed! Check your private key and wallet address.');
  }
});

// === ERROR HANDLING ===
ws.on('error', (err) => {
  console.log('❌ WebSocket error:', err);
});

ws.on('close', () => {
  console.log('🔌 Connection closed.');
});
