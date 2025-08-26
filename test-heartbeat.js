const { io } = require('socket.io-client');

console.log('🔥 Testing BandSync Day 7 Connection Reliability Features...\n');

const socket = io('http://localhost:3001');

let pingCount = 0;
let pongReceived = 0;

// Test heartbeat functionality
socket.on('connect', () => {
  console.log('✅ Connected to server');
  
  // Join a test session
  socket.emit('join_session', { sessionId: 'test-heartbeat', role: 'leader' });
});

// Test heartbeat ping/pong
socket.on('ping', (data) => {
  console.log(`📡 Received ping from server (ping #${++pingCount})`);
  console.log('   Data:', data);
  
  // Respond with pong
  socket.emit('pong', { 
    id: data.id,
    timestamp: Date.now(),
    sessionId: 'test-heartbeat'
  });
});

socket.on('pong', (data) => {
  pongReceived++;
  console.log(`🏓 Received pong response (pong #${pongReceived})`);
  console.log('   Latency:', data.latency, 'ms');
  console.log('   Quality:', data.quality);
});

socket.on('connection_quality', (data) => {
  console.log('📊 Connection Quality Update:');
  console.log('   Quality:', data.quality);
  console.log('   Latency:', data.latency, 'ms');
  console.log('   Packet Loss:', data.packetLoss, '%');
  console.log('   Status:', data.status);
});

socket.on('heartbeat', (data) => {
  console.log('💓 Heartbeat received:', data);
});

socket.on('session_update', (data) => {
  console.log('🎵 Session update:', data);
});

socket.on('disconnect', (reason) => {
  console.log('❌ Disconnected:', reason);
});

// Test for 15 seconds
setTimeout(() => {
  console.log(`\n📈 Test Results:`);
  console.log(`   Pings received: ${pingCount}`);
  console.log(`   Pongs sent/received: ${pongReceived}`);
  console.log(`   Expected: ~3 heartbeats in 15 seconds (5s intervals)`);
  
  socket.disconnect();
  process.exit(0);
}, 15000);

console.log('⏳ Testing heartbeat for 15 seconds...\n');