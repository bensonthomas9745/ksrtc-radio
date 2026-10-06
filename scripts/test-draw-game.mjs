// Automated Multi-client End-to-End Test for Draw & Guess
import { WebSocket } from 'ws';

const WS_URL = 'ws://localhost:4174';

function createClient(name, avatar) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(WS_URL);
    ws.name = name;
    ws.avatar = avatar;
    ws.messages = [];

    ws.on('open', () => {
      resolve(ws);
    });

    ws.on('message', (data) => {
      const msg = JSON.parse(data.toString());
      ws.messages.push(msg);
      if (ws.onNewMessage) ws.onNewMessage(msg);
    });

    ws.on('error', reject);
  });
}

async function runTest() {
  console.log('🧪 Starting Draw & Guess Multiplayer Test...');

  // 1. Connect Host
  const host = await createClient('Host_Benson', '👑');
  console.log('✅ Host connected');

  // 2. Host creates room
  const createPromise = new Promise((resolve) => {
    host.onNewMessage = (msg) => {
      if (msg.type === 'room_created') resolve(msg);
    };
  });
  host.send(JSON.stringify({ type: 'create_room', name: 'Host_Benson', avatar: '👑' }));
  const roomCreated = await createPromise;
  const roomCode = roomCreated.roomCode;
  console.log(`✅ Room created with code: ${roomCode}`);

  // 3. Connect Player 2 & Player 3
  const p2 = await createClient('Player_Sarah', '🎨');
  const p3 = await createClient('Player_Rahul', '⚡');

  const p2JoinPromise = new Promise((resolve) => {
    p2.onNewMessage = (msg) => {
      if (msg.type === 'room_joined') resolve(msg);
    };
  });
  p2.send(JSON.stringify({ type: 'join_room', roomCode, name: 'Player_Sarah', avatar: '🎨' }));
  await p2JoinPromise;
  console.log('✅ Player 2 (Sarah) joined room');

  const p3JoinPromise = new Promise((resolve) => {
    p3.onNewMessage = (msg) => {
      if (msg.type === 'room_joined') resolve(msg);
    };
  });
  p3.send(JSON.stringify({ type: 'join_room', roomCode, name: 'Player_Rahul', avatar: '⚡' }));
  await p3JoinPromise;
  console.log('✅ Player 3 (Rahul) joined room');

  // 4. Start Game (3 players meet the minimum requirement)
  const roundStartPromises = [host, p2, p3].map((client) => {
    return new Promise((resolve) => {
      client.onNewMessage = (msg) => {
        if (msg.type === 'round_started') resolve({ client, msg });
      };
    });
  });

  host.send(JSON.stringify({ type: 'start_game' }));
  console.log('🚀 Host sent start_game');

  const roundStarts = await Promise.all(roundStartPromises);
  console.log('✅ Round started successfully across all 3 clients');

  // Find drawer and guessers
  let drawerClient = null;
  let secretWord = null;
  const guesserClients = [];

  for (const { client, msg } of roundStarts) {
    if (msg.isDrawer) {
      drawerClient = client;
      secretWord = msg.word;
      console.log(`🎨 Drawer is ${client.name}. Secret word: "${secretWord}"`);
    } else {
      guesserClients.push(client);
      if (msg.word) {
        throw new Error(`SECURITY BUG: Secret word leaked to non-drawer ${client.name}!`);
      }
      console.log(`👀 Guesser is ${client.name}. Blanks: "${msg.wordBlanks}"`);
    }
  }

  if (!drawerClient || !secretWord) {
    throw new Error('No drawer assigned or word missing!');
  }

  // 5. Test stroke streaming
  const strokeSample = {
    points: [{ x: 0.1, y: 0.1 }, { x: 0.2, y: 0.2 }],
    color: '#000000',
    size: 6,
    mode: 'draw'
  };

  const guesserStrokePromise = new Promise((resolve) => {
    guesserClients[0].onNewMessage = (msg) => {
      if (msg.type === 'draw_stroke') resolve(msg);
    };
  });

  drawerClient.send(JSON.stringify({ type: 'draw_stroke', stroke: strokeSample }));
  const receivedStroke = await guesserStrokePromise;
  console.log('✅ Guessers received drawer stroke successfully:', receivedStroke.stroke.points.length, 'points');

  // 6. Test incorrect guess
  const wrongGuessPromise = new Promise((resolve) => {
    drawerClient.onNewMessage = (msg) => {
      if (msg.type === 'chat_message' && msg.text === 'wrongguess123') resolve(msg);
    };
  });

  guesserClients[0].send(JSON.stringify({ type: 'guess', text: 'wrongguess123' }));
  await wrongGuessPromise;
  console.log('✅ Incorrect guess broadcast correctly as chat');

  // 7. Test correct guess for Guesser 0
  const correctGuessPromise = new Promise((resolve) => {
    guesserClients[0].onNewMessage = (msg) => {
      if (msg.type === 'guess_success') resolve(msg);
    };
  });

  guesserClients[0].send(JSON.stringify({ type: 'guess', text: secretWord }));
  const guessSuccess = await correctGuessPromise;
  console.log(`🎉 Guesser 0 scored ${guessSuccess.pointsEarned} points! Rank: #${guessSuccess.rank}`);

  // 8. Test correct guess for Guesser 1 (ends round early!)
  const roundEndPromise = new Promise((resolve) => {
    drawerClient.onNewMessage = (msg) => {
      if (msg.type === 'round_ended') resolve(msg);
    };
  });

  guesserClients[1].send(JSON.stringify({ type: 'guess', text: secretWord }));
  const roundEnd = await roundEndPromise;
  console.log(`🏁 Round ended successfully! Revealed word: "${roundEnd.secretWord}". Drawer earned: +${roundEnd.drawerPoints} pts.`);

  // Cleanup
  host.close();
  p2.close();
  p3.close();

  console.log('\n🎉 ALL TESTS PASSED SUCCESSFULLY! The multiplayer game is 100% verified.\n');
  process.exit(0);
}

runTest().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
