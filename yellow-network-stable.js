// yellow-network-stable.js
// Stable Yellow Network connection with proper heartbeat

const WebSocket = require('ws');
const { ethers } = require('ethers');

class YellowNetworkStableClient {
  constructor() {
    this.privateKey = process.env.PRIVATE_KEY || '0xbd7a7cea1531789724c61fe8938d9c134373a293fb1ab5dc7e4bdd013c97f348';
    this.address = process.env.WALLET_ADDRESS || '0x9898CD31a9CE1D8bfbB4EdEa77b5C044c882B65D';
    this.wallet = new ethers.Wallet(this.privateKey);
    this.ws = null;
    this.isConnected = false;
    this.assets = [];
    this.eventHandlers = {};
    this.heartbeatInterval = null;
    this.reconnectTimeout = null;
    this.shouldReconnect = true;
    this.reconnectDelay = 5000;
    this.maxReconnectDelay = 30000;
    this.reconnectAttempts = 0;
    
    console.log('🔐 Yellow Network Client Configuration:');
    console.log('   Address:', this.address);
  }

  async connect() {
    return new Promise((resolve, reject) => {
      // Clear any existing reconnect timeout
      if (this.reconnectTimeout) {
        clearTimeout(this.reconnectTimeout);
        this.reconnectTimeout = null;
      }

      console.log('🔌 Connecting to Yellow Network...');
      
      try {
        this.ws = new WebSocket('wss://clearnet.yellow.com/ws', {
          // Add options to maintain connection
          perMessageDeflate: false,
          handshakeTimeout: 10000,
          // Add headers that might help
          headers: {
            'User-Agent': 'MediTrust/1.0',
            'Origin': 'https://apps.yellow.com'
          }
        });

        // Set up connection timeout
        const connectionTimeout = setTimeout(() => {
          if (!this.isConnected) {
            this.ws.terminate();
            reject(new Error('Connection timeout'));
          }
        }, 10000);

        this.ws.on('open', () => {
          clearTimeout(connectionTimeout);
          console.log('✅ Connected to Yellow Network');
          this.isConnected = true;
          this.reconnectAttempts = 0;
          this.reconnectDelay = 5000;
          
          // Start heartbeat immediately
          this.startHeartbeat();
          
          this.emit('connected');
          resolve();
        });
        
        this.ws.on('message', (data) => {
          this.handleMessage(data);
        });
        
        this.ws.on('error', (error) => {
          clearTimeout(connectionTimeout);
          console.error('❌ WebSocket error:', error.message);
          this.emit('error', error);
        });
        
        this.ws.on('close', (code, reason) => {
          clearTimeout(connectionTimeout);
          this.handleDisconnect(code, reason);
        });

        // Handle ping from server
        this.ws.on('ping', () => {
          console.log('💓 Ping received from server');
          if (this.ws.readyState === WebSocket.OPEN) {
            this.ws.pong();
            console.log('💓 Pong sent to server');
          }
        });

        // Handle pong from server  
        this.ws.on('pong', () => {
          console.log('💓 Pong received from server');
        });
        
      } catch (error) {
        console.error('❌ Connection failed:', error);
        reject(error);
      }
    });
  }

  startHeartbeat() {
    // Clear existing heartbeat
    this.stopHeartbeat();
    
    console.log('💓 Starting heartbeat (30s interval)');
    
    // Send initial ping after 5 seconds
    setTimeout(() => {
      this.sendPing();
    }, 5000);
    
    // Then send ping every 30 seconds
    this.heartbeatInterval = setInterval(() => {
      if (this.isConnected && this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.sendPing();
      } else {
        console.log('⚠️ Skipping heartbeat - connection not ready');
      }
    }, 30000);
  }

  stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
      console.log('💔 Heartbeat stopped');
    }
  }

  sendPing() {
    try {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        return;
      }

      // Try multiple ping formats to see what Yellow accepts
      
      // Format 1: Simple ping frame (preferred)
      if (this.ws.ping) {
        this.ws.ping();
        console.log('💓 Sent WebSocket ping frame');
      }
      
      // Format 2: JSON message ping
      const pingMessage = JSON.stringify({
        method: 'ping',
        timestamp: Date.now()
      });
      this.ws.send(pingMessage);
      console.log('💓 Sent ping message');
      
    } catch (error) {
      console.error('❌ Failed to send ping:', error.message);
    }
  }

  handleMessage(data) {
    try {
      const msg = JSON.parse(data.toString());
      
      // Keep connection alive on any message
      this.lastMessageTime = Date.now();
      
      if (msg.res && Array.isArray(msg.res)) {
        const [timestamp, method, params, id] = msg.res;
        
        switch(method) {
          case 'assets':
            console.log('📦 Assets received:', params.assets?.length || 0, 'tokens');
            this.assets = params.assets || [];
            this.emit('assets', this.assets);
            
            // Assets received means connection is good - send a ping to keep it alive
            setTimeout(() => {
              if (this.isConnected) {
                this.sendPing();
              }
            }, 2000);
            break;
            
          case 'pong':
            console.log('💓 Pong received - connection alive');
            break;
            
          case 'error':
            // Only log non-critical errors
            if (!params.error?.includes('validation') && !params.error?.includes('parse')) {
              console.error('❌ Server error:', params.error);
            }
            break;
            
          default:
            // Don't log every message to reduce noise
            if (method !== 'ping') {
              console.log(`📨 Message [${method}]`);
            }
        }
      }
    } catch (error) {
      // Ignore parse errors
    }
  }

  handleDisconnect(code, reason) {
    this.isConnected = false;
    this.stopHeartbeat();
    
    console.log(`🔌 Disconnected (Code: ${code}, Reason: ${reason || 'None'})`);
    
    // Different handling based on close code
    switch(code) {
      case 1000: // Normal closure
        console.log('ℹ️ Normal disconnect');
        break;
      case 1001: // Going away
        console.log('ℹ️ Server going away');
        break;
      case 1006: // Abnormal closure
        console.log('⚠️ Abnormal disconnect - will reconnect');
        break;
      default:
        console.log('⚠️ Unexpected disconnect code');
    }
    
    this.emit('disconnected');
    
    // Only reconnect if we should and it wasn't a manual disconnect
    if (this.shouldReconnect && code !== 1000) {
      this.scheduleReconnect();
    }
  }

  scheduleReconnect() {
    // Clear any existing reconnect timeout
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }
    
    this.reconnectAttempts++;
    
    // Exponential backoff with max delay
    const delay = Math.min(
      this.reconnectDelay * Math.pow(1.5, this.reconnectAttempts - 1),
      this.maxReconnectDelay
    );
    
    console.log(`🔄 Reconnecting in ${delay/1000}s (Attempt ${this.reconnectAttempts})...`);
    
    this.reconnectTimeout = setTimeout(() => {
      if (this.shouldReconnect) {
        this.connect().catch(error => {
          console.error('❌ Reconnection failed:', error.message);
        });
      }
    }, delay);
  }

  disconnect() {
    console.log('👋 Disconnecting from Yellow Network...');
    
    this.shouldReconnect = false;
    this.stopHeartbeat();
    
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    
    if (this.ws) {
      this.ws.close(1000, 'Manual disconnect');
      this.ws = null;
    }
    
    this.isConnected = false;
  }

  // Event emitter
  on(event, callback) {
    if (!this.eventHandlers[event]) {
      this.eventHandlers[event] = [];
    }
    this.eventHandlers[event].push(callback);
  }

  emit(event, data) {
    if (this.eventHandlers[event]) {
      this.eventHandlers[event].forEach(cb => {
        try {
          cb(data);
        } catch (error) {
          console.error(`Error in event handler for ${event}:`, error);
        }
      });
    }
  }

  getStatus() {
    return {
      connected: this.isConnected,
      address: this.address,
      assetsCount: this.assets.length,
      reconnectAttempts: this.reconnectAttempts,
      lastMessage: this.lastMessageTime ? new Date(this.lastMessageTime).toISOString() : null
    };
  }
}

module.exports = YellowNetworkStableClient;