// yellow-network-correct.js
const WebSocket = require('ws');
const { 
  createAppSessionMessage,
  createCloseAppSessionMessage,
  createGetLedgerBalancesMessage,
  parseRPCResponse,
  RPCMethod
} = require('@erc7824/nitrolite');
const { ethers } = require('ethers');

class YellowNetworkClient {
  constructor(config) {
    this.privateKey = config.privateKey;
    this.address = config.address;
    this.wallet = new ethers.Wallet(this.privateKey);
    this.ws = null;
    this.isConnected = false;
    this.appSessionId = null;
  }

  async connect() {
    return new Promise((resolve, reject) => {
      console.log('🔌 Connecting to Yellow Network ClearNode...');
      
      this.ws = new WebSocket('wss://clearnet.yellow.com/ws');
      
      this.ws.on('open', () => {
        console.log('✅ Connected to ClearNode');
        this.isConnected = true;
        
        // No auth needed - channel handles it!
        // Yellow Network identifies you by your channel created at apps.yellow.com
        resolve();
      });
      
      this.ws.on('message', (data) => {
        this.handleMessage(data);
      });
      
      this.ws.on('error', (error) => {
        console.error('❌ WebSocket error:', error);
        reject(error);
      });
      
      this.ws.on('close', () => {
        console.log('🔌 Disconnected');
        this.isConnected = false;
      });
    });
  }
  
  handleMessage(data) {
    try {
      const msg = JSON.parse(data.toString());
      
      if (msg.res && Array.isArray(msg.res)) {
        const [timestamp, method, params, id] = msg.res;
        
        switch(method) {
          case 'assets':
            console.log('📦 Assets received:', params.assets?.length || 0);
            break;
          case 'create_app_session':
            this.appSessionId = params.app_session_id;
            console.log('✅ App session created:', this.appSessionId);
            break;
          case 'get_ledger_balances':
            console.log('💰 Balances:', params);
            break;
          default:
            console.log(`📨 ${method}:`, params);
        }
      }
    } catch (error) {
      // Ignore parse errors
    }
  }
  
  async createAppSession(participantA, participantB) {
    const messageSigner = async (payload) => {
      const message = JSON.stringify(payload);
      const digestHex = ethers.utils.id(message);
      const messageBytes = ethers.utils.arrayify(digestHex);
      const signature = await this.wallet.signMessage(messageBytes);
      return signature;
    };
    
    const appDefinition = {
      protocol: 'nitroliterpc',
      participants: [participantA, participantB],
      weights: [100, 0],
      quorum: 100,
      challenge: 0,
      nonce: Date.now()
    };
    
    const allocations = [
      { participant: participantA, asset: 'usdc', amount: '1000000' },
      { participant: participantB, asset: 'usdc', amount: '0' }
    ];
    
    const message = await createAppSessionMessage(
      messageSigner,
      [{ definition: appDefinition, allocations }]
    );
    
    this.ws.send(message);
    console.log('📤 App session request sent');
  }
  
  async getLedgerBalances(participant) {
    const messageSigner = async (payload) => {
      const message = JSON.stringify(payload);
      const digestHex = ethers.utils.id(message);
      const messageBytes = ethers.utils.arrayify(digestHex);
      const signature = await this.wallet.signMessage(messageBytes);
      return signature;
    };
    
    const message = await createGetLedgerBalancesMessage(
      messageSigner,
      participant
    );
    
    this.ws.send(message);
    console.log('📤 Balance request sent');
  }
}

// Test it
async function test() {
  const client = new YellowNetworkClient({
    privateKey: '',
    address: ''
  });
  
  await client.connect();
  
  // Wait for assets message
  setTimeout(() => {
    // Try to get balances
    client.getLedgerBalances(client.address);
    
    // Try to create app session
    client.createAppSession(
      client.address,
      '0x0000000000000000000000000000000000000001'
    );
  }, 2000);
}

test().catch(console.error);
