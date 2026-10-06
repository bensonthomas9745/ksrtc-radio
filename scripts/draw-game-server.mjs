// Real-time authoritative Draw & Guess WebSocket server engine
import { WORD_BANK } from './words.mjs';

const ROOM_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const ROUND_DURATION = 45; // 45 seconds per round
const ROUND_SUMMARY_DURATION = 5; // 5 seconds round end review
const TOTAL_ROUNDS = 10;
const MIN_PLAYERS_TO_START = 3;
const MAX_PLAYERS_PER_ROOM = 20;

function generateRoomCode(existingCodes) {
  let code = '';
  do {
    code = '';
    for (let i = 0; i < 5; i++) {
      code += ROOM_CODE_CHARS[Math.floor(Math.random() * ROOM_CODE_CHARS.length)];
    }
  } while (existingCodes.has(code));
  return code;
}

function normalizeBlanks(word) {
  return word
    .split('')
    .map(ch => (/[a-zA-Z0-9]/.test(ch) ? '_' : ch))
    .join(' ');
}

function levenshtein(a, b) {
  const an = a ? a.length : 0;
  const bn = b ? b.length : 0;
  if (an === 0) return bn;
  if (bn === 0) return an;
  const matrix = Array.from({ length: bn + 1 }, () => new Array(an + 1).fill(0));
  for (let i = 0; i <= an; i++) matrix[0][i] = i;
  for (let j = 0; j <= bn; j++) matrix[j][0] = j;
  for (let j = 1; j <= bn; j++) {
    for (let i = 1; i <= an; i++) {
      if (a[i - 1] === b[j - 1]) {
        matrix[j][i] = matrix[j - 1][i - 1];
      } else {
        matrix[j][i] = Math.min(
          matrix[j - 1][i] + 1, // insertion
          matrix[j][i - 1] + 1, // deletion
          matrix[j - 1][i - 1] + 1 // substitution
        );
      }
    }
  }
  return matrix[bn][an];
}

export class DrawGameServer {
  constructor() {
    this.rooms = new Map(); // roomCode -> Room
    this.connections = new Map(); // ws -> { roomCode, playerId }
  }

  handleConnection(ws) {
    ws.isAlive = true;
    ws.on('pong', () => {
      ws.isAlive = true;
    });

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        this.processMessage(ws, msg);
      } catch (err) {
        console.error('[DrawGameServer] Invalid message format:', err);
        this.send(ws, { type: 'error', message: 'Invalid JSON message' });
      }
    });

    ws.on('close', () => {
      this.handleDisconnect(ws);
    });

    ws.on('error', (err) => {
      console.error('[DrawGameServer] WS error:', err);
      this.handleDisconnect(ws);
    });
  }

  send(ws, payload) {
    if (ws && ws.readyState === 1 /* OPEN */) {
      ws.send(JSON.stringify(payload));
    }
  }

  broadcast(room, payload, excludeWs = null) {
    for (const player of room.players.values()) {
      if (player.ws && player.ws !== excludeWs && player.ws.readyState === 1) {
        player.ws.send(JSON.stringify(payload));
      }
    }
  }

  getPublicPlayers(room) {
    return Array.from(room.players.values()).map(p => ({
      id: p.id,
      name: p.name,
      avatar: p.avatar,
      score: p.score,
      isHost: p.id === room.hostId,
      isDrawer: p.id === room.currentDrawerId,
      hasGuessed: p.hasGuessed,
      isConnected: p.isConnected
    }));
  }

  processMessage(ws, msg) {
    const { type } = msg;

    switch (type) {
      case 'ping': {
        this.send(ws, { type: 'pong', timestamp: Date.now() });
        break;
      }

      case 'create_room': {
        const name = (msg.name || 'Player').trim().slice(0, 20) || 'Player';
        const avatar = (msg.avatar || '🎨').slice(0, 4);
        const code = generateRoomCode(this.rooms);
        const playerId = 'p_' + Math.random().toString(36).substring(2, 9);

        const room = {
          code,
          hostId: playerId,
          state: 'lobby', // 'lobby' | 'drawing' | 'round_end' | 'game_over'
          players: new Map(),
          currentRound: 0,
          totalRounds: TOTAL_ROUNDS,
          drawerOrder: [],
          drawerIndex: 0,
          currentDrawerId: null,
          currentWord: null,
          roundStartTime: null,
          timeRemaining: ROUND_DURATION,
          timerInterval: null,
          strokes: [],
          guessersCorrect: [], // [{ playerId, name, timeMs, points }]
          usedWords: new Set(),
          createdAt: Date.now()
        };

        const player = {
          id: playerId,
          name,
          avatar,
          ws,
          score: 0,
          currentStreak: 0,
          maxStreak: 0,
          fastestGuessMs: null,
          correctGuessesCount: 0,
          incorrectGuessesCount: 0,
          drawerPointsEarned: 0,
          hasGuessed: false,
          isConnected: true
        };

        room.players.set(playerId, player);
        this.rooms.set(code, room);
        this.connections.set(ws, { roomCode: code, playerId });

        this.send(ws, {
          type: 'room_created',
          roomCode: code,
          playerId,
          isHost: true,
          players: this.getPublicPlayers(room),
          minPlayers: MIN_PLAYERS_TO_START,
          maxPlayers: MAX_PLAYERS_PER_ROOM,
          totalRounds: TOTAL_ROUNDS
        });
        break;
      }

      case 'join_room': {
        const code = (msg.roomCode || '').toUpperCase().trim();
        const name = (msg.name || 'Player').trim().slice(0, 20) || 'Player';
        const avatar = (msg.avatar || '🎨').slice(0, 4);

        const room = this.rooms.get(code);
        if (!room) {
          this.send(ws, { type: 'error', message: `Room "${code}" not found. Check code or create a new room.` });
          return;
        }

        if (room.players.size >= MAX_PLAYERS_PER_ROOM) {
          this.send(ws, { type: 'error', message: 'Room is full (max 20 players).' });
          return;
        }

        // Reconnect if same playerId provided
        let playerId = msg.playerId;
        let existingPlayer = playerId ? room.players.get(playerId) : null;

        if (existingPlayer) {
          existingPlayer.ws = ws;
          existingPlayer.isConnected = true;
          existingPlayer.name = name;
          existingPlayer.avatar = avatar;
        } else {
          playerId = 'p_' + Math.random().toString(36).substring(2, 9);
          const newPlayer = {
            id: playerId,
            name,
            avatar,
            ws,
            score: 0,
            currentStreak: 0,
            maxStreak: 0,
            fastestGuessMs: null,
            correctGuessesCount: 0,
            incorrectGuessesCount: 0,
            drawerPointsEarned: 0,
            hasGuessed: false,
            isConnected: true
          };
          room.players.set(playerId, newPlayer);
          if (!room.drawerOrder.includes(playerId)) {
            room.drawerOrder.push(playerId);
          }
        }

        this.connections.set(ws, { roomCode: code, playerId });

        this.send(ws, {
          type: 'room_joined',
          roomCode: code,
          playerId,
          isHost: playerId === room.hostId,
          gameState: room.state,
          currentRound: room.currentRound,
          totalRounds: room.totalRounds,
          timeRemaining: room.timeRemaining,
          players: this.getPublicPlayers(room),
          minPlayers: MIN_PLAYERS_TO_START,
          maxPlayers: MAX_PLAYERS_PER_ROOM,
          currentDrawerId: room.currentDrawerId,
          wordBlanks: room.currentWord ? normalizeBlanks(room.currentWord.word) : null,
          wordCategory: room.currentWord ? room.currentWord.category : null,
          strokes: room.strokes
        });

        // Broadcast to others
        this.broadcast(room, {
          type: 'player_joined',
          player: {
            id: playerId,
            name,
            avatar,
            score: room.players.get(playerId).score,
            isHost: playerId === room.hostId
          },
          players: this.getPublicPlayers(room)
        }, ws);

        break;
      }

      case 'start_game': {
        const session = this.connections.get(ws);
        if (!session) return;
        const room = this.rooms.get(session.roomCode);
        if (!room) return;

        if (session.playerId !== room.hostId) {
          this.send(ws, { type: 'error', message: 'Only the host can start the game.' });
          return;
        }

        const activePlayers = Array.from(room.players.values()).filter(p => p.isConnected);
        if (activePlayers.length < MIN_PLAYERS_TO_START) {
          this.send(ws, {
            type: 'error',
            message: `Need at least ${MIN_PLAYERS_TO_START} players to start (currently ${activePlayers.length}).`
          });
          return;
        }

        // Initialize game session
        room.state = 'starting';
        room.currentRound = 0;
        room.usedWords.clear();
        for (const p of room.players.values()) {
          p.score = 0;
          p.currentStreak = 0;
          p.maxStreak = 0;
          p.fastestGuessMs = null;
          p.correctGuessesCount = 0;
          p.incorrectGuessesCount = 0;
          p.drawerPointsEarned = 0;
          p.hasGuessed = false;
        }

        // Shuffle drawer order fairly
        room.drawerOrder = activePlayers.map(p => p.id).sort(() => Math.random() - 0.5);
        room.drawerIndex = 0;

        this.broadcast(room, {
          type: 'game_starting',
          totalRounds: room.totalRounds,
          players: this.getPublicPlayers(room)
        });

        setTimeout(() => {
          this.startNextRound(room);
        }, 1500);
        break;
      }

      case 'draw_stroke': {
        const session = this.connections.get(ws);
        if (!session) return;
        const room = this.rooms.get(session.roomCode);
        if (!room || room.state !== 'drawing') return;

        if (session.playerId !== room.currentDrawerId) {
          return; // only current drawer can draw
        }

        const stroke = msg.stroke;
        if (stroke && stroke.points && Array.isArray(stroke.points)) {
          room.strokes.push(stroke);
          this.broadcast(room, {
            type: 'draw_stroke',
            stroke
          }, ws);
        }
        break;
      }

      case 'clear_canvas': {
        const session = this.connections.get(ws);
        if (!session) return;
        const room = this.rooms.get(session.roomCode);
        if (!room || room.state !== 'drawing') return;

        if (session.playerId !== room.currentDrawerId) return;

        room.strokes = [];
        this.broadcast(room, { type: 'clear_canvas' });
        break;
      }

      case 'undo_stroke': {
        const session = this.connections.get(ws);
        if (!session) return;
        const room = this.rooms.get(session.roomCode);
        if (!room || room.state !== 'drawing') return;

        if (session.playerId !== room.currentDrawerId) return;

        if (room.strokes.length > 0) {
          room.strokes.pop();
          this.broadcast(room, {
            type: 'undo_stroke',
            strokes: room.strokes
          });
        }
        break;
      }

      case 'guess': {
        const session = this.connections.get(ws);
        if (!session) return;
        const room = this.rooms.get(session.roomCode);
        if (!room) return;

        const player = room.players.get(session.playerId);
        if (!player) return;

        const guessText = (msg.text || '').trim();
        if (!guessText) return;

        // If not in drawing state, treat as normal chat
        if (room.state !== 'drawing') {
          this.broadcast(room, {
            type: 'chat_message',
            sender: player.name,
            avatar: player.avatar,
            text: guessText,
            isSystem: false
          });
          return;
        }

        // Drawer cannot guess
        if (player.id === room.currentDrawerId) {
          this.send(ws, {
            type: 'chat_message',
            sender: 'System',
            avatar: '⚠️',
            text: "You are the artist! You can't guess your own word.",
            isSystem: true
          });
          return;
        }

        // Player already guessed this round
        if (player.hasGuessed) {
          this.send(ws, {
            type: 'chat_message',
            sender: 'System',
            avatar: '🎉',
            text: "You already guessed correctly! Shh, don't spoil it.",
            isSystem: true
          });
          return;
        }

        const targetWord = room.currentWord ? room.currentWord.word.toLowerCase() : '';
        const cleanedGuess = guessText.toLowerCase();

        if (cleanedGuess === targetWord) {
          // CORRECT GUESS!
          player.hasGuessed = true;
          player.correctGuessesCount += 1;
          player.currentStreak += 1;
          if (player.currentStreak > player.maxStreak) {
            player.maxStreak = player.currentStreak;
          }

          const timeTakenMs = Date.now() - room.roundStartTime;
          if (!player.fastestGuessMs || timeTakenMs < player.fastestGuessMs) {
            player.fastestGuessMs = timeTakenMs;
          }

          const guessRank = room.guessersCorrect.length + 1;
          let pointsEarned = 25;
          if (guessRank === 1) pointsEarned = 100;
          else if (guessRank === 2) pointsEarned = 75;
          else if (guessRank === 3) pointsEarned = 50;

          player.score += pointsEarned;
          room.guessersCorrect.push({
            playerId: player.id,
            name: player.name,
            avatar: player.avatar,
            timeMs: timeTakenMs,
            points: pointsEarned,
            rank: guessRank
          });

          // Send confirmation to guesser with secret word revealed to them
          this.send(ws, {
            type: 'guess_success',
            word: room.currentWord.word,
            pointsEarned,
            rank: guessRank,
            totalScore: player.score
          });

          // Broadcast to everyone else (DO NOT reveal the secret word text)
          this.broadcast(room, {
            type: 'player_guessed_correct',
            playerId: player.id,
            name: player.name,
            avatar: player.avatar,
            pointsEarned,
            rank: guessRank,
            players: this.getPublicPlayers(room)
          });

          // Check if all eligible guessers have guessed
          const activeGuessers = Array.from(room.players.values()).filter(
            p => p.isConnected && p.id !== room.currentDrawerId
          );
          const allGuessed = activeGuessers.length > 0 && activeGuessers.every(p => p.hasGuessed);

          if (allGuessed) {
            // End round early!
            this.broadcast(room, {
              type: 'chat_message',
              sender: 'System',
              avatar: '🌟',
              text: 'Everyone guessed the word! Outstanding work!',
              isSystem: true
            });
            clearTimeout(room.timerInterval);
            setTimeout(() => {
              this.endCurrentRound(room);
            }, 1000);
          }
        } else {
          // INCORRECT GUESS
          player.incorrectGuessesCount += 1;

          // Check if close (Levenshtein distance 1 or 2)
          const dist = levenshtein(cleanedGuess, targetWord);
          const isClose = dist <= 2 && Math.abs(cleanedGuess.length - targetWord.length) <= 1;

          if (isClose) {
            this.send(ws, {
              type: 'chat_message',
              sender: 'Hint',
              avatar: '🔥',
              text: `"${guessText}" is very close!`,
              isSystem: true
            });
          }

          // Broadcast guess to room chat
          this.broadcast(room, {
            type: 'chat_message',
            sender: player.name,
            avatar: player.avatar,
            text: guessText,
            isSystem: false
          });
        }
        break;
      }

      case 'play_again': {
        const session = this.connections.get(ws);
        if (!session) return;
        const room = this.rooms.get(session.roomCode);
        if (!room) return;

        // Reset room to lobby state
        clearTimeout(room.timerInterval);
        room.state = 'lobby';
        room.currentRound = 0;
        room.currentDrawerId = null;
        room.currentWord = null;
        room.strokes = [];
        room.guessersCorrect = [];
        room.usedWords.clear();

        for (const p of room.players.values()) {
          p.score = 0;
          p.currentStreak = 0;
          p.maxStreak = 0;
          p.fastestGuessMs = null;
          p.correctGuessesCount = 0;
          p.incorrectGuessesCount = 0;
          p.drawerPointsEarned = 0;
          p.hasGuessed = false;
        }

        this.broadcast(room, {
          type: 'game_reset_to_lobby',
          players: this.getPublicPlayers(room)
        });
        break;
      }

      case 'leave_room': {
        this.handleDisconnect(ws);
        break;
      }

      default:
        console.warn('[DrawGameServer] Unhandled action:', type);
    }
  }

  startNextRound(room) {
    if (room.currentRound >= room.totalRounds) {
      this.finishGame(room);
      return;
    }

    room.currentRound += 1;
    room.state = 'drawing';
    room.strokes = [];
    room.guessersCorrect = [];
    room.roundStartTime = Date.now();
    room.timeRemaining = ROUND_DURATION;

    // Reset player round flags
    for (const p of room.players.values()) {
      p.hasGuessed = false;
    }

    // Pick active connected drawer
    const activePlayers = Array.from(room.players.values()).filter(p => p.isConnected);
    if (activePlayers.length === 0) {
      this.cleanupRoom(room.code);
      return;
    }

    // Advance drawer index
    if (room.drawerIndex >= room.drawerOrder.length) {
      room.drawerIndex = 0;
    }
    let chosenDrawerId = room.drawerOrder[room.drawerIndex];
    let chosenDrawer = room.players.get(chosenDrawerId);

    // If drawer is not connected, advance to next connected player
    let attempts = 0;
    while ((!chosenDrawer || !chosenDrawer.isConnected) && attempts < room.drawerOrder.length) {
      room.drawerIndex = (room.drawerIndex + 1) % room.drawerOrder.length;
      chosenDrawerId = room.drawerOrder[room.drawerIndex];
      chosenDrawer = room.players.get(chosenDrawerId);
      attempts++;
    }

    if (!chosenDrawer || !chosenDrawer.isConnected) {
      chosenDrawer = activePlayers[0];
      chosenDrawerId = chosenDrawer.id;
    }

    room.currentDrawerId = chosenDrawerId;
    room.drawerIndex = (room.drawerIndex + 1) % Math.max(1, room.drawerOrder.length);

    // Pick unused word
    const availableWords = WORD_BANK.filter(w => !room.usedWords.has(w.word.toLowerCase()));
    const wordPool = availableWords.length > 0 ? availableWords : WORD_BANK;
    const selected = wordPool[Math.floor(Math.random() * wordPool.length)];
    room.currentWord = selected;
    room.usedWords.add(selected.word.toLowerCase());

    const wordBlanks = normalizeBlanks(selected.word);

    // Notify drawer with the secret word
    if (chosenDrawer.ws && chosenDrawer.ws.readyState === 1) {
      this.send(chosenDrawer.ws, {
        type: 'round_started',
        round: room.currentRound,
        totalRounds: room.totalRounds,
        isDrawer: true,
        drawerId: chosenDrawer.id,
        drawerName: chosenDrawer.name,
        word: selected.word,
        category: selected.category,
        hint: selected.hint,
        duration: ROUND_DURATION,
        players: this.getPublicPlayers(room)
      });
    }

    // Notify guessers (secret word omitted!)
    for (const player of room.players.values()) {
      if (player.id !== chosenDrawerId && player.ws && player.ws.readyState === 1) {
        this.send(player.ws, {
          type: 'round_started',
          round: room.currentRound,
          totalRounds: room.totalRounds,
          isDrawer: false,
          drawerId: chosenDrawer.id,
          drawerName: chosenDrawer.name,
          wordBlanks,
          category: selected.category,
          wordLength: selected.word.length,
          duration: ROUND_DURATION,
          players: this.getPublicPlayers(room)
        });
      }
    }

    // Start authoritative timer
    clearInterval(room.timerInterval);
    room.timerInterval = setInterval(() => {
      room.timeRemaining -= 1;

      // Broadcast hint at 20 seconds remaining
      if (room.timeRemaining === 20 && selected.hint) {
        for (const p of room.players.values()) {
          if (p.id !== chosenDrawerId && p.ws && p.ws.readyState === 1) {
            this.send(p.ws, {
              type: 'hint_revealed',
              hint: selected.hint
            });
          }
        }
      }

      this.broadcast(room, {
        type: 'timer_tick',
        timeRemaining: room.timeRemaining
      });

      if (room.timeRemaining <= 0) {
        clearInterval(room.timerInterval);
        this.endCurrentRound(room);
      }
    }, 1000);
  }

  endCurrentRound(room) {
    clearInterval(room.timerInterval);
    room.state = 'round_end';

    const drawer = room.players.get(room.currentDrawerId);
    let drawerPoints = 0;
    const numGuessed = room.guessersCorrect.length;

    // Drawer scoring:
    // 1 guesser: +50 pts
    // 2-3 guessers: +75 pts
    // 4+ guessers: +100 pts
    if (numGuessed === 1) drawerPoints = 50;
    else if (numGuessed >= 2 && numGuessed <= 3) drawerPoints = 75;
    else if (numGuessed >= 4) drawerPoints = 100;

    if (drawer) {
      drawer.score += drawerPoints;
      drawer.drawerPointsEarned += drawerPoints;
    }

    // Reset streaks for players who didn't guess (excluding drawer)
    for (const p of room.players.values()) {
      if (p.id !== room.currentDrawerId && !p.hasGuessed) {
        p.currentStreak = 0;
      }
    }

    const roundScores = {};
    for (const p of room.players.values()) {
      roundScores[p.id] = p.score;
    }

    this.broadcast(room, {
      type: 'round_ended',
      round: room.currentRound,
      totalRounds: room.totalRounds,
      secretWord: room.currentWord ? room.currentWord.word : '',
      category: room.currentWord ? room.currentWord.category : '',
      drawerId: room.currentDrawerId,
      drawerName: drawer ? drawer.name : 'Unknown',
      drawerPoints,
      guessersCorrect: room.guessersCorrect,
      scores: roundScores,
      players: this.getPublicPlayers(room),
      nextRoundIn: ROUND_SUMMARY_DURATION,
      isLastRound: room.currentRound >= room.totalRounds
    });

    setTimeout(() => {
      if (room.currentRound >= room.totalRounds) {
        this.finishGame(room);
      } else {
        this.startNextRound(room);
      }
    }, ROUND_SUMMARY_DURATION * 1000);
  }

  finishGame(room) {
    clearInterval(room.timerInterval);
    room.state = 'game_over';

    const rankedPlayers = Array.from(room.players.values())
      .filter(p => p.isConnected || p.score > 0)
      .sort((a, b) => b.score - a.score);

    // Compute Fun Awards
    // 1. Best Artist: most drawerPointsEarned
    let bestArtist = null;
    let maxArtistPts = -1;
    for (const p of rankedPlayers) {
      if (p.drawerPointsEarned > maxArtistPts && p.drawerPointsEarned > 0) {
        maxArtistPts = p.drawerPointsEarned;
        bestArtist = { name: p.name, avatar: p.avatar, stat: `${p.drawerPointsEarned} pts earned` };
      }
    }

    // 2. Fastest Guess
    let fastestGuesser = null;
    let minTime = Infinity;
    for (const p of rankedPlayers) {
      if (p.fastestGuessMs && p.fastestGuessMs < minTime) {
        minTime = p.fastestGuessMs;
        fastestGuesser = {
          name: p.name,
          avatar: p.avatar,
          stat: `${(p.fastestGuessMs / 1000).toFixed(1)}s lightning guess`
        };
      }
    }

    // 3. Longest Streak
    let streakMaster = null;
    let maxStreak = 0;
    for (const p of rankedPlayers) {
      if (p.maxStreak > maxStreak && p.maxStreak > 1) {
        maxStreak = p.maxStreak;
        streakMaster = { name: p.name, avatar: p.avatar, stat: `${p.maxStreak} rounds in a row` };
      }
    }

    // 4. Most Guessed (enthusiastic guesser)
    let mostGuesses = null;
    let maxIncorrect = 0;
    for (const p of rankedPlayers) {
      if (p.incorrectGuessesCount > maxIncorrect && p.incorrectGuessesCount > 2) {
        maxIncorrect = p.incorrectGuessesCount;
        mostGuesses = { name: p.name, avatar: p.avatar, stat: `${p.incorrectGuessesCount} wild attempts` };
      }
    }

    const podium = rankedPlayers.slice(0, 3).map((p, idx) => ({
      rank: idx + 1,
      id: p.id,
      name: p.name,
      avatar: p.avatar,
      score: p.score
    }));

    this.broadcast(room, {
      type: 'game_over',
      podium,
      leaderboard: rankedPlayers.map((p, idx) => ({
        rank: idx + 1,
        id: p.id,
        name: p.name,
        avatar: p.avatar,
        score: p.score
      })),
      awards: {
        bestArtist,
        fastestGuess: fastestGuesser,
        longestStreak: streakMaster,
        mostGuesses
      }
    });
  }

  handleDisconnect(ws) {
    const session = this.connections.get(ws);
    if (!session) return;
    this.connections.delete(ws);

    const { roomCode, playerId } = session;
    const room = this.rooms.get(roomCode);
    if (!room) return;

    const player = room.players.get(playerId);
    if (!player) return;

    player.isConnected = false;

    // Check if drawer disconnected mid-round
    if (room.state === 'drawing' && room.currentDrawerId === playerId) {
      this.broadcast(room, {
        type: 'chat_message',
        sender: 'System',
        avatar: '⚠️',
        text: `${player.name} disconnected while drawing! Ending round.`,
        isSystem: true
      });
      clearInterval(room.timerInterval);
      setTimeout(() => {
        this.endCurrentRound(room);
      }, 1500);
    }

    // If host left, reassign host
    if (room.hostId === playerId) {
      const nextActive = Array.from(room.players.values()).find(p => p.isConnected);
      if (nextActive) {
        room.hostId = nextActive.id;
        this.broadcast(room, {
          type: 'host_changed',
          newHostId: nextActive.id,
          newHostName: nextActive.name
        });
      }
    }

    // Broadcast player left
    this.broadcast(room, {
      type: 'player_left',
      playerId,
      name: player.name,
      players: this.getPublicPlayers(room)
    });

    // If room is empty of connected players, clean up after 5 minutes
    const anyConnected = Array.from(room.players.values()).some(p => p.isConnected);
    if (!anyConnected) {
      setTimeout(() => {
        const checkRoom = this.rooms.get(roomCode);
        if (checkRoom && !Array.from(checkRoom.players.values()).some(p => p.isConnected)) {
          this.cleanupRoom(roomCode);
        }
      }, 5 * 60 * 1000);
    }
  }

  cleanupRoom(code) {
    const room = this.rooms.get(code);
    if (room) {
      clearInterval(room.timerInterval);
      this.rooms.delete(code);
    }
  }
}
