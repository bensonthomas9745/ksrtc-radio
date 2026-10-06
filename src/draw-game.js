// ==========================================================================
// KSRTC RADIO - DRAW & GUESS MULTIPLAYER CLIENT ENGINE
// ==========================================================================

class DrawAudio {
  constructor() {
    this.ctx = null;
    this.enabled = localStorage.getItem('ksrtc_draw_sound') !== 'muted';
  }

  init() {
    if (!this.ctx && typeof window.AudioContext !== 'undefined') {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioCtx();
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  toggle() {
    this.enabled = !this.enabled;
    localStorage.setItem('ksrtc_draw_sound', this.enabled ? 'active' : 'muted');
    return this.enabled;
  }

  playTone(freq, duration, type = 'sine', gainVal = 0.15) {
    if (!this.enabled) return;
    try {
      this.init();
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
      gain.gain.setValueAtTime(gainVal, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + duration);
    } catch (_) {}
  }

  playCorrect() {
    if (!this.enabled) return;
    try {
      this.init();
      const notes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
      notes.forEach((freq, idx) => {
        setTimeout(() => this.playTone(freq, 0.25, 'triangle', 0.2), idx * 80);
      });
    } catch (_) {}
  }

  playTick() {
    this.playTone(880, 0.05, 'sine', 0.08);
  }

  playFanfare() {
    if (!this.enabled) return;
    try {
      this.init();
      const chord = [392, 523.25, 659.25, 783.99, 1046.5];
      chord.forEach((freq, idx) => {
        setTimeout(() => this.playTone(freq, 0.6, 'triangle', 0.18), idx * 100);
      });
    } catch (_) {}
  }

  playRoundEnd() {
    this.playTone(330, 0.35, 'sawtooth', 0.12);
  }
}

// Confetti particle system
class ConfettiEngine {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.particles = [];
    this.animId = null;
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    if (!this.canvas) return;
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }

  launch(count = 120) {
    this.resize();
    const colors = ['#f5c871', '#38bdf8', '#ef4444', '#22c55e', '#ec4899', '#a855f7'];
    for (let i = 0; i < count; i++) {
      this.particles.push({
        x: this.canvas.width / 2 + (Math.random() - 0.5) * 200,
        y: this.canvas.height / 2,
        vx: (Math.random() - 0.5) * 16,
        vy: -Math.random() * 18 - 4,
        size: Math.random() * 8 + 5,
        color: colors[Math.floor(Math.random() * colors.length)],
        rotation: Math.random() * 360,
        vr: (Math.random() - 0.5) * 10,
        opacity: 1
      });
    }
    if (!this.animId) {
      this.loop();
    }
  }

  loop() {
    if (!this.ctx) return;
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.45; // gravity
      p.rotation += p.vr;
      p.opacity -= 0.007;

      if (p.opacity <= 0 || p.y > this.canvas.height) {
        this.particles.splice(i, 1);
        continue;
      }

      this.ctx.save();
      this.ctx.translate(p.x, p.y);
      this.ctx.rotate((p.rotation * Math.PI) / 180);
      this.ctx.globalAlpha = p.opacity;
      this.ctx.fillStyle = p.color;
      this.ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
      this.ctx.restore();
    }

    if (this.particles.length > 0) {
      this.animId = requestAnimationFrame(() => this.loop());
    } else {
      this.animId = null;
    }
  }
}

// Main Game Controller
class DrawGameClient {
  constructor() {
    this.audio = new DrawAudio();
    this.confetti = new ConfettiEngine(document.getElementById('confetti-canvas'));

    // State
    this.ws = null;
    this.playerId = null;
    this.roomCode = null;
    this.isHost = false;
    this.isDrawer = false;
    this.currentDrawerId = null;
    this.gameState = 'lobby';
    this.players = [];
    this.strokes = [];
    this.currentStroke = null;
    this.isDrawing = false;
    this.selectedColor = '#000000';
    this.selectedSize = 6;
    this.drawMode = 'draw'; // 'draw' | 'erase'

    // UI Cache
    this.dom = {
      // Header
      headerStatusWrap: document.getElementById('header-status-wrap'),
      headerRoomCode: document.getElementById('header-room-code'),
      headerRoomBadge: document.getElementById('header-room-badge'),
      headerRoundNum: document.getElementById('header-round-num'),
      headerTotalRounds: document.getElementById('header-total-rounds'),
      headerTimerPill: document.getElementById('header-timer-pill'),
      headerTimerVal: document.getElementById('header-timer-val'),
      soundToggleBtn: document.getElementById('sound-toggle-btn'),
      soundIcon: document.getElementById('sound-icon'),

      // Lobby
      lobbySection: document.getElementById('lobby-section'),
      lobbySetupCard: document.getElementById('lobby-setup-card'),
      tabBtnCreate: document.getElementById('tab-btn-create'),
      tabBtnJoin: document.getElementById('tab-btn-join'),
      createRoomPanel: document.getElementById('create-room-panel'),
      joinRoomPanel: document.getElementById('join-room-panel'),
      playerNameInput: document.getElementById('player-name-input'),
      roomCodeInput: document.getElementById('room-code-input'),
      avatarSelector: document.getElementById('avatar-selector'),
      btnCreateRoom: document.getElementById('btn-create-room'),
      btnJoinRoom: document.getElementById('btn-join-room'),

      // Room Lobby
      roomLobbyCard: document.getElementById('room-lobby-card'),
      lobbyCodeDisplay: document.getElementById('lobby-code-display'),
      lobbyPlayersCount: document.getElementById('lobby-players-count'),
      lobbyStatusHint: document.getElementById('lobby-status-hint'),
      lobbyPlayersGrid: document.getElementById('lobby-players-grid'),
      btnStartGame: document.getElementById('btn-start-game'),
      hostStartHint: document.getElementById('host-start-hint'),
      btnCopyRoomLink: document.getElementById('btn-copy-room-link'),
      btnShareWhatsapp: document.getElementById('btn-share-whatsapp'),

      // Active Play
      gamePlaySection: document.getElementById('game-play-section'),
      promptRoleBadge: document.getElementById('prompt-role-badge'),
      promptWordText: document.getElementById('prompt-word-text'),
      promptCategoryTag: document.getElementById('prompt-category-tag'),
      promptHintBox: document.getElementById('prompt-hint-box'),
      promptHintText: document.getElementById('prompt-hint-text'),
      canvasWrapper: document.getElementById('canvas-wrapper'),
      canvas: document.getElementById('drawing-canvas'),
      drawingToolbar: document.getElementById('drawing-toolbar'),
      colorPalette: document.getElementById('color-palette'),
      sizeSelector: document.getElementById('size-selector'),
      toolBrush: document.getElementById('tool-brush'),
      toolEraser: document.getElementById('tool-eraser'),
      toolUndo: document.getElementById('tool-undo'),
      toolClear: document.getElementById('tool-clear'),

      // Scoreboard & Chat
      sidePlayerCount: document.getElementById('side-player-count'),
      sidePlayersList: document.getElementById('side-players-list'),
      feedMessages: document.getElementById('feed-messages'),
      guessForm: document.getElementById('guess-form'),
      guessInput: document.getElementById('guess-input'),
      guessSubmitBtn: document.getElementById('guess-submit-btn'),

      // Modals
      roundEndOverlay: document.getElementById('round-end-overlay'),
      roundSummaryNum: document.getElementById('round-summary-num'),
      roundSummaryWord: document.getElementById('round-summary-word'),
      summaryDrawerName: document.getElementById('summary-drawer-name'),
      summaryDrawerPts: document.getElementById('summary-drawer-pts'),
      roundSummaryGuessers: document.getElementById('round-summary-guessers'),
      roundNextCountdown: document.getElementById('round-next-countdown'),

      gameOverOverlay: document.getElementById('game-over-overlay'),
      podiumContainer: document.getElementById('podium-container'),
      awardsGrid: document.getElementById('awards-grid'),
      btnPlayAgain: document.getElementById('btn-play-again'),
      btnShareResults: document.getElementById('btn-share-results'),
      btnNewRoom: document.getElementById('btn-new-room')
    };

    this.ctx = this.dom.canvas.getContext('2d');
    this.selectedAvatar = '🎨';

    this.init();
  }

  init() {
    this.initSoundToggle();
    this.initLobbyTabs();
    this.initAvatarPicker();
    this.initCanvas();
    this.initCanvasToolbar();
    this.initChatAndGuess();
    this.initModals();
    this.checkUrlParams();
    this.connectWebSocket();
  }

  initSoundToggle() {
    this.dom.soundIcon.textContent = this.audio.enabled ? '🔊' : '🔇';
    this.dom.soundToggleBtn.addEventListener('click', () => {
      const active = this.audio.toggle();
      this.dom.soundIcon.textContent = active ? '🔊' : '🔇';
      this.showToast(active ? 'Sound effects enabled' : 'Sound effects muted');
    });
  }

  initLobbyTabs() {
    this.dom.tabBtnCreate.addEventListener('click', () => {
      this.dom.tabBtnCreate.classList.add('is-active');
      this.dom.tabBtnJoin.classList.remove('is-active');
      this.dom.createRoomPanel.hidden = false;
      this.dom.joinRoomPanel.hidden = true;
    });

    this.dom.tabBtnJoin.addEventListener('click', () => {
      this.dom.tabBtnJoin.classList.add('is-active');
      this.dom.tabBtnCreate.classList.remove('is-active');
      this.dom.joinRoomPanel.hidden = false;
      this.dom.createRoomPanel.hidden = true;
    });

    this.dom.btnCreateRoom.addEventListener('click', () => this.handleCreateRoom());
    this.dom.btnJoinRoom.addEventListener('click', () => this.handleJoinRoom());

    this.dom.roomCodeInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.handleJoinRoom();
    });

    this.dom.btnCopyRoomLink.addEventListener('click', () => this.copyRoomLink());
    this.dom.headerRoomBadge.addEventListener('click', () => this.copyRoomLink());

    this.dom.btnShareWhatsapp.addEventListener('click', () => {
      const url = `${window.location.origin}/draw?room=${this.roomCode}`;
      const text = `🎨 Join my Draw & Guess room on KSRTC Radio! Room Code: *${this.roomCode}*\nPlay here: ${url}`;
      window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, '_blank');
    });

    this.dom.btnStartGame.addEventListener('click', () => {
      this.send({ type: 'start_game' });
    });
  }

  initAvatarPicker() {
    const pills = this.dom.avatarSelector.querySelectorAll('.avatar-pill');
    pills.forEach((pill) => {
      pill.addEventListener('click', () => {
        pills.forEach(p => p.classList.remove('is-selected'));
        pill.classList.add('is-selected');
        this.selectedAvatar = pill.getAttribute('data-avatar') || '🎨';
      });
    });
  }

  checkUrlParams() {
    const params = new URLSearchParams(window.location.search);
    const roomParam = params.get('room') || params.get('game');
    if (roomParam) {
      this.dom.tabBtnJoin.click();
      this.dom.roomCodeInput.value = roomParam.trim().toUpperCase();
      this.dom.playerNameInput.focus();
    }
  }

  connectWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/draw`;

    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      // Start ping heartbeat
      setInterval(() => {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.send({ type: 'ping' });
        }
      }, 15000);
    };

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        this.handleServerMessage(msg);
      } catch (err) {
        console.error('[WS Message Error]', err);
      }
    };

    this.ws.onclose = () => {
      console.warn('[WS Closed] Attempting reconnect in 3s...');
      setTimeout(() => this.connectWebSocket(), 3000);
    };

    this.ws.onerror = (err) => {
      console.error('[WS Error]', err);
    };
  }

  send(data) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  // ==========================================================================
  // ROOM CREATION & JOINING
  // ==========================================================================
  handleCreateRoom() {
    const name = this.dom.playerNameInput.value.trim() || 'Player';
    this.send({
      type: 'create_room',
      name,
      avatar: this.selectedAvatar
    });
  }

  handleJoinRoom() {
    const name = this.dom.playerNameInput.value.trim() || 'Player';
    const code = this.dom.roomCodeInput.value.trim().toUpperCase();
    if (!code) {
      this.showToast('Please enter a room code');
      this.dom.roomCodeInput.focus();
      return;
    }
    this.send({
      type: 'join_room',
      roomCode: code,
      name,
      avatar: this.selectedAvatar,
      playerId: this.playerId
    });
  }

  copyRoomLink() {
    if (!this.roomCode) return;
    const shareUrl = `${window.location.origin}/draw?room=${this.roomCode}`;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(shareUrl).then(() => {
        this.showToast(`Room link copied! Room: ${this.roomCode}`);
      }).catch(() => {
        this.fallbackCopy(shareUrl);
      });
    } else {
      this.fallbackCopy(shareUrl);
    }
  }

  fallbackCopy(text) {
    const input = document.createElement('input');
    input.value = text;
    document.body.appendChild(input);
    input.select();
    document.execCommand('copy');
    document.body.removeChild(input);
    this.showToast(`Room link copied! Room: ${this.roomCode}`);
  }

  // ==========================================================================
  // CANVAS DRAWING & COORDINATE NORMALIZATION
  // ==========================================================================
  initCanvas() {
    const canvas = this.dom.canvas;
    const resizeCanvas = () => {
      const rect = this.dom.canvasWrapper.getBoundingClientRect();
      const pad = 24;
      const targetW = Math.max(300, rect.width - pad);
      const targetH = Math.max(260, rect.height - pad);

      // Maintain internal 800x600 coordinate ratio or match box
      const ratio = 800 / 600;
      let w = targetW;
      let h = targetW / ratio;
      if (h > targetH) {
        h = targetH;
        w = targetH * ratio;
      }

      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = `${Math.round(w)}px`;
      canvas.style.height = `${Math.round(h)}px`;

      this.ctx.scale(dpr, dpr);
      this.redrawCanvas();
    };

    window.addEventListener('resize', resizeCanvas);
    setTimeout(resizeCanvas, 100);

    // Pointer Events (Mouse, Touch, Stylus)
    const getNormalizedPos = (e) => {
      const rect = canvas.getBoundingClientRect();
      const clientX = e.clientX || (e.touches && e.touches[0] ? e.touches[0].clientX : 0);
      const clientY = e.clientY || (e.touches && e.touches[0] ? e.touches[0].clientY : 0);
      const normX = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      const normY = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
      return { x: Number(normX.toFixed(4)), y: Number(normY.toFixed(4)) };
    };

    const startDraw = (e) => {
      if (!this.isDrawer || this.gameState !== 'drawing') return;
      e.preventDefault();
      this.isDrawing = true;
      const pos = getNormalizedPos(e);
      this.currentStroke = {
        points: [pos],
        color: this.drawMode === 'erase' ? '#ffffff' : this.selectedColor,
        size: this.drawMode === 'erase' ? this.selectedSize * 2.5 : this.selectedSize,
        mode: this.drawMode
      };
      this.audio.playTone(400, 0.02, 'sine', 0.05);
    };

    const moveDraw = (e) => {
      if (!this.isDrawing || !this.currentStroke) return;
      e.preventDefault();
      const pos = getNormalizedPos(e);
      const last = this.currentStroke.points[this.currentStroke.points.length - 1];
      // Only record if moved slightly
      const dist = Math.hypot(pos.x - last.x, pos.y - last.y);
      if (dist >= 0.003) {
        this.currentStroke.points.push(pos);
        this.renderStrokeSegment(last, pos, this.currentStroke.color, this.currentStroke.size);
      }
    };

    const endDraw = (e) => {
      if (!this.isDrawing) return;
      if (e) e.preventDefault();
      this.isDrawing = false;
      if (this.currentStroke && this.currentStroke.points.length > 0) {
        this.strokes.push(this.currentStroke);
        this.send({
          type: 'draw_stroke',
          stroke: this.currentStroke
        });
      }
      this.currentStroke = null;
    };

    canvas.addEventListener('pointerdown', startDraw);
    canvas.addEventListener('pointermove', moveDraw);
    canvas.addEventListener('pointerup', endDraw);
    canvas.addEventListener('pointercancel', endDraw);
    canvas.addEventListener('pointerleave', endDraw);
  }

  renderStrokeSegment(p1, p2, color, size) {
    const rect = this.dom.canvas.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;

    this.ctx.save();
    this.ctx.beginPath();
    this.ctx.strokeStyle = color;
    this.ctx.lineWidth = size;
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';
    this.ctx.moveTo(p1.x * w, p1.y * h);
    this.ctx.lineTo(p2.x * w, p2.y * h);
    this.ctx.stroke();
    this.ctx.restore();
  }

  redrawCanvas() {
    const rect = this.dom.canvas.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;

    this.ctx.fillStyle = '#ffffff';
    this.ctx.fillRect(0, 0, w, h);

    for (const stroke of this.strokes) {
      if (!stroke.points || stroke.points.length === 0) continue;
      this.ctx.save();
      this.ctx.strokeStyle = stroke.color;
      this.ctx.lineWidth = stroke.size;
      this.ctx.lineCap = 'round';
      this.ctx.lineJoin = 'round';

      if (stroke.points.length === 1) {
        const pt = stroke.points[0];
        this.ctx.fillStyle = stroke.color;
        this.ctx.beginPath();
        this.ctx.arc(pt.x * w, pt.y * h, stroke.size / 2, 0, Math.PI * 2);
        this.ctx.fill();
      } else {
        this.ctx.beginPath();
        this.ctx.moveTo(stroke.points[0].x * w, stroke.points[0].y * h);
        for (let i = 1; i < stroke.points.length; i++) {
          this.ctx.lineTo(stroke.points[i].x * w, stroke.points[i].y * h);
        }
        this.ctx.stroke();
      }
      this.ctx.restore();
    }
  }

  initCanvasToolbar() {
    // Palette
    const swatches = this.dom.colorPalette.querySelectorAll('.color-swatch');
    swatches.forEach((swatch) => {
      swatch.addEventListener('click', () => {
        swatches.forEach(s => s.classList.remove('is-active'));
        swatch.classList.add('is-active');
        this.selectedColor = swatch.getAttribute('data-color') || '#000000';
        this.drawMode = 'draw';
        this.dom.toolBrush.classList.add('is-active');
        this.dom.toolEraser.classList.remove('is-active');
      });
    });

    // Brush Sizes
    const sizeBtns = this.dom.sizeSelector.querySelectorAll('.size-btn');
    sizeBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        sizeBtns.forEach(b => b.classList.remove('is-active'));
        btn.classList.add('is-active');
        this.selectedSize = parseInt(btn.getAttribute('data-size'), 10) || 6;
      });
    });

    // Brush Tool
    this.dom.toolBrush.addEventListener('click', () => {
      this.drawMode = 'draw';
      this.dom.toolBrush.classList.add('is-active');
      this.dom.toolEraser.classList.remove('is-active');
    });

    // Eraser Tool
    this.dom.toolEraser.addEventListener('click', () => {
      this.drawMode = 'erase';
      this.dom.toolEraser.classList.add('is-active');
      this.dom.toolBrush.classList.remove('is-active');
    });

    // Undo Tool
    this.dom.toolUndo.addEventListener('click', () => {
      if (!this.isDrawer || this.gameState !== 'drawing') return;
      this.send({ type: 'undo_stroke' });
    });

    // Clear Canvas
    this.dom.toolClear.addEventListener('click', () => {
      if (!this.isDrawer || this.gameState !== 'drawing') return;
      this.send({ type: 'clear_canvas' });
    });
  }

  // ==========================================================================
  // CHAT & GUESS FEED
  // ==========================================================================
  initChatAndGuess() {
    this.dom.guessForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const val = this.dom.guessInput.value.trim();
      if (!val) return;
      this.send({
        type: 'guess',
        text: val
      });
      this.dom.guessInput.value = '';
    });
  }

  initModals() {
    this.dom.btnPlayAgain.addEventListener('click', () => {
      this.send({ type: 'play_again' });
    });

    this.dom.btnShareResults.addEventListener('click', () => {
      if (!this.roomCode) return;
      const shareText = `🏆 We just played Draw & Guess on KSRTC Radio! Check it out: ${window.location.origin}/draw`;
      if (navigator.clipboard) {
        navigator.clipboard.writeText(shareText);
        this.showToast('Results copied to clipboard!');
      }
    });

    this.dom.btnNewRoom.addEventListener('click', () => {
      window.location.href = '/draw';
    });
  }

  // ==========================================================================
  // SERVER MESSAGE DISPATCHER
  // ==========================================================================
  handleServerMessage(msg) {
    const { type } = msg;

    switch (type) {
      case 'room_created': {
        this.playerId = msg.playerId;
        this.roomCode = msg.roomCode;
        this.isHost = true;
        this.players = msg.players;
        this.dom.headerRoomCode.textContent = msg.roomCode;
        this.dom.headerTotalRounds.textContent = msg.totalRounds;
        this.dom.lobbyCodeDisplay.textContent = msg.roomCode;
        this.dom.lobbySetupCard.hidden = true;
        this.dom.roomLobbyCard.hidden = false;
        this.renderLobbyPlayers();
        this.showToast(`Room ${msg.roomCode} created! Invite friends.`);
        break;
      }

      case 'room_joined': {
        this.playerId = msg.playerId;
        this.roomCode = msg.roomCode;
        this.isHost = msg.isHost;
        this.players = msg.players;
        this.gameState = msg.gameState;
        this.dom.headerRoomCode.textContent = msg.roomCode;
        this.dom.headerTotalRounds.textContent = msg.totalRounds;
        this.dom.lobbyCodeDisplay.textContent = msg.roomCode;

        if (msg.gameState === 'lobby') {
          this.dom.lobbySetupCard.hidden = true;
          this.dom.roomLobbyCard.hidden = false;
          this.renderLobbyPlayers();
        } else {
          // Mid-game join / reconnect
          this.strokes = msg.strokes || [];
          this.enterGameView();
          this.redrawCanvas();
        }
        break;
      }

      case 'player_joined': {
        this.players = msg.players;
        this.renderLobbyPlayers();
        this.renderSideScoreboard();
        this.addFeedMessage('system', `👋 ${msg.player.name} joined the room.`);
        break;
      }

      case 'player_left': {
        this.players = msg.players;
        this.renderLobbyPlayers();
        this.renderSideScoreboard();
        this.addFeedMessage('system', `🚪 ${msg.name} left.`);
        break;
      }

      case 'host_changed': {
        if (msg.newHostId === this.playerId) {
          this.isHost = true;
          this.showToast('👑 You are now the room host!');
          this.renderLobbyPlayers();
        }
        break;
      }

      case 'game_starting': {
        this.players = msg.players;
        this.showToast('🎮 Game starting! Get ready...');
        this.audio.playTick();
        break;
      }

      case 'round_started': {
        this.gameState = 'drawing';
        this.dom.roundEndOverlay.hidden = true;
        this.dom.gameOverOverlay.hidden = true;
        this.dom.promptHintBox.hidden = true;
        this.strokes = [];
        this.redrawCanvas();

        this.dom.headerRoundNum.textContent = msg.round;
        this.dom.headerTotalRounds.textContent = msg.totalRounds;
        this.dom.headerTimerVal.textContent = msg.duration;
        this.dom.headerTimerPill.classList.remove('urgent');

        this.isDrawer = msg.isDrawer;
        this.currentDrawerId = msg.drawerId;
        this.players = msg.players;

        this.enterGameView();
        this.updateDrawerGuesserUI(msg);
        this.renderSideScoreboard();

        if (this.isDrawer) {
          this.audio.playTone(600, 0.2, 'sine', 0.2);
          this.showToast(`🎨 It's your turn to draw: "${msg.word.toUpperCase()}"!`);
        } else {
          this.addFeedMessage('system', `🎨 ${msg.drawerName} is drawing! Start guessing.`);
        }
        break;
      }

      case 'timer_tick': {
        const val = msg.timeRemaining;
        this.dom.headerTimerVal.textContent = val;
        if (val <= 10) {
          this.dom.headerTimerPill.classList.add('urgent');
          if (val <= 5) this.audio.playTick();
        }
        break;
      }

      case 'hint_revealed': {
        this.dom.promptHintBox.hidden = false;
        this.dom.promptHintText.textContent = msg.hint;
        this.addFeedMessage('hint', `💡 Hint: ${msg.hint}`);
        break;
      }

      case 'draw_stroke': {
        if (!this.isDrawer) {
          this.strokes.push(msg.stroke);
          // Render stroke immediately
          if (msg.stroke.points && msg.stroke.points.length > 1) {
            const pts = msg.stroke.points;
            for (let i = 1; i < pts.length; i++) {
              this.renderStrokeSegment(pts[i - 1], pts[i], msg.stroke.color, msg.stroke.size);
            }
          } else {
            this.redrawCanvas();
          }
        }
        break;
      }

      case 'undo_stroke': {
        this.strokes = msg.strokes || [];
        this.redrawCanvas();
        break;
      }

      case 'clear_canvas': {
        this.strokes = [];
        this.redrawCanvas();
        break;
      }

      case 'player_guessed_correct': {
        this.players = msg.players;
        this.renderSideScoreboard();
        this.audio.playCorrect();
        this.addFeedMessage(
          'correct',
          `🎉 ${msg.name} guessed the word! (+${msg.pointsEarned} pts)`
        );
        break;
      }

      case 'guess_success': {
        this.audio.playCorrect();
        this.dom.guessInput.disabled = true;
        this.dom.guessSubmitBtn.disabled = true;
        this.dom.guessInput.placeholder = '✅ You guessed correctly! Shh, watch the art.';
        this.dom.promptWordText.textContent = msg.word.toUpperCase();
        this.showToast(`🎉 Correct! You ranked #${msg.rank} (+${msg.pointsEarned} pts)!`);
        break;
      }

      case 'chat_message': {
        if (msg.isSystem) {
          this.addFeedMessage('system', `${msg.avatar || ''} ${msg.text}`);
        } else {
          this.addFeedMessage('normal', `${msg.sender}: ${msg.text}`);
        }
        break;
      }

      case 'round_ended': {
        this.gameState = 'round_end';
        this.audio.playRoundEnd();
        this.showRoundSummary(msg);
        break;
      }

      case 'game_over': {
        this.gameState = 'game_over';
        this.dom.roundEndOverlay.hidden = true;
        this.audio.playFanfare();
        this.confetti.launch(150);
        this.showGameOverModal(msg);
        break;
      }

      case 'game_reset_to_lobby': {
        this.gameState = 'lobby';
        this.dom.roundEndOverlay.hidden = true;
        this.dom.gameOverOverlay.hidden = true;
        this.dom.gamePlaySection.hidden = true;
        this.dom.lobbySection.hidden = false;
        this.dom.roomLobbyCard.hidden = false;
        this.players = msg.players;
        this.renderLobbyPlayers();
        break;
      }

      case 'error': {
        this.showToast(`⚠️ ${msg.message}`);
        break;
      }
    }
  }

  // ==========================================================================
  // VIEW RENDERERS & HELPERS
  // ==========================================================================
  enterGameView() {
    this.dom.lobbySection.hidden = true;
    this.dom.gamePlaySection.hidden = false;
    this.dom.headerStatusWrap.hidden = false;
  }

  updateDrawerGuesserUI(msg) {
    if (this.isDrawer) {
      this.dom.drawingCanvas.classList.remove('guesser-mode');
      this.dom.drawingToolbar.hidden = false;
      this.dom.promptRoleBadge.textContent = '🎨 YOU ARE DRAWING';
      this.dom.promptRoleBadge.style.color = 'var(--gold)';
      this.dom.promptWordText.textContent = msg.word.toUpperCase();
      this.dom.promptCategoryTag.textContent = msg.category;
      this.dom.guessInput.disabled = true;
      this.dom.guessSubmitBtn.disabled = true;
      this.dom.guessInput.placeholder = "🎨 You are the artist! Watch your friends guess.";
    } else {
      this.dom.drawingCanvas.classList.add('guesser-mode');
      this.dom.drawingToolbar.hidden = true;
      this.dom.promptRoleBadge.textContent = `🎨 ${msg.drawerName.toUpperCase()} IS DRAWING`;
      this.dom.promptRoleBadge.style.color = 'var(--blue)';
      this.dom.promptWordText.textContent = msg.wordBlanks;
      this.dom.promptCategoryTag.textContent = msg.category;
      this.dom.guessInput.disabled = false;
      this.dom.guessSubmitBtn.disabled = false;
      this.dom.guessInput.placeholder = 'Type your guess here…';
      this.dom.guessInput.focus();
    }
  }

  renderLobbyPlayers() {
    const grid = this.dom.lobbyPlayersGrid;
    grid.innerHTML = '';
    const activeCount = this.players.filter(p => p.isConnected).length;
    this.dom.lobbyPlayersCount.textContent = `👥 ${activeCount}/20 Players`;

    if (activeCount >= 3) {
      this.dom.lobbyStatusHint.textContent = 'Ready to launch!';
      this.dom.lobbyStatusHint.style.color = 'var(--green)';
      if (this.isHost) {
        this.dom.btnStartGame.disabled = false;
        this.dom.hostStartHint.textContent = 'You are the host. Tap Start Game to begin!';
      } else {
        this.dom.btnStartGame.disabled = true;
        this.dom.hostStartHint.textContent = 'Waiting for host to start the game...';
      }
    } else {
      const needed = 3 - activeCount;
      this.dom.lobbyStatusHint.textContent = `Need ${needed} more player${needed > 1 ? 's' : ''} to start`;
      this.dom.lobbyStatusHint.style.color = 'var(--text-muted)';
      this.dom.btnStartGame.disabled = true;
      this.dom.hostStartHint.textContent = `Min 3 players needed (currently ${activeCount}). Share the invite link!`;
    }

    this.players.forEach((p) => {
      const chip = document.createElement('div');
      chip.className = `player-lobby-chip ${p.isHost ? 'is-host' : ''}`;
      chip.innerHTML = `
        <span class="player-avatar">${p.avatar || '🎨'}</span>
        <span class="player-name-text">${this.escapeHtml(p.name)}</span>
        ${p.isHost ? '<span class="badge-host" title="Host">👑</span>' : ''}
      `;
      grid.appendChild(chip);
    });
  }

  renderSideScoreboard() {
    const list = this.dom.sidePlayersList;
    list.innerHTML = '';
    const sorted = [...this.players].sort((a, b) => b.score - a.score);
    this.dom.sidePlayerCount.textContent = `${sorted.length} players`;

    sorted.forEach((p, idx) => {
      const row = document.createElement('div');
      let statusClass = '';
      let statusBadge = '';
      if (p.id === this.currentDrawerId) {
        statusClass = 'is-drawer';
        statusBadge = '🎨';
      } else if (p.hasGuessed) {
        statusClass = 'has-guessed';
        statusBadge = '✅';
      }

      row.className = `side-player-row ${statusClass}`;
      row.innerHTML = `
        <div class="player-meta-left">
          <span>${idx + 1}.</span>
          <span>${p.avatar || '🎨'}</span>
          <span class="side-p-name">${this.escapeHtml(p.name)}</span>
        </div>
        <div class="player-meta-right">
          <span>${statusBadge}</span>
          <span class="side-p-score">${p.score}</span>
        </div>
      `;
      list.appendChild(row);
    });
  }

  addFeedMessage(type, text) {
    const msg = document.createElement('div');
    msg.className = `feed-msg ${type}`;
    msg.textContent = text;
    this.dom.feedMessages.appendChild(msg);
    this.dom.feedMessages.scrollTop = this.dom.feedMessages.scrollHeight;
  }

  showRoundSummary(msg) {
    this.dom.roundSummaryNum.textContent = msg.round;
    this.dom.roundSummaryWord.textContent = msg.secretWord.toUpperCase();
    this.dom.summaryDrawerName.textContent = msg.drawerName;
    this.dom.summaryDrawerPts.textContent = `+${msg.drawerPoints}`;

    const list = this.dom.roundSummaryGuessers;
    list.innerHTML = '';

    if (msg.guessersCorrect && msg.guessersCorrect.length > 0) {
      msg.guessersCorrect.forEach((g) => {
        const row = document.createElement('div');
        row.className = 'round-guesser-row';
        row.innerHTML = `
          <span>#${g.rank} ${g.avatar} ${this.escapeHtml(g.name)}</span>
          <strong style="color:var(--gold);">+${g.points} pts (${(g.timeMs / 1000).toFixed(1)}s)</strong>
        `;
        list.appendChild(row);
      });
    } else {
      const empty = document.createElement('div');
      empty.style.color = 'var(--text-muted)';
      empty.style.textAlign = 'center';
      empty.style.padding = '8px';
      empty.textContent = 'No one guessed this round!';
      list.appendChild(empty);
    }

    this.dom.roundEndOverlay.hidden = false;

    let remaining = msg.nextRoundIn || 5;
    const interval = setInterval(() => {
      remaining -= 1;
      if (remaining > 0) {
        this.dom.roundNextCountdown.textContent = `Next round starts in ${remaining} seconds…`;
      } else {
        clearInterval(interval);
      }
    }, 1000);
  }

  showGameOverModal(msg) {
    const podiumEl = this.dom.podiumContainer;
    podiumEl.innerHTML = '';

    const podiumOrder = [];
    if (msg.podium[1]) podiumOrder.push({ ...msg.podium[1], rank: 2 });
    if (msg.podium[0]) podiumOrder.push({ ...msg.podium[0], rank: 1 });
    if (msg.podium[2]) podiumOrder.push({ ...msg.podium[2], rank: 3 });

    podiumOrder.forEach((p) => {
      const step = document.createElement('div');
      step.className = `podium-step rank-${p.rank}`;
      step.innerHTML = `
        <span class="podium-avatar">${p.avatar || '🎨'}</span>
        <span class="podium-name">${this.escapeHtml(p.name)}</span>
        <span class="podium-score">${p.score} pts</span>
        <div class="podium-pillar">${p.rank === 1 ? '🥇' : p.rank === 2 ? '🥈' : '🥉'}</div>
      `;
      podiumEl.appendChild(step);
    });

    const awardsEl = this.dom.awardsGrid;
    awardsEl.innerHTML = '';

    const awardsList = [
      { key: 'bestArtist', title: 'Best Artist', icon: '🎨' },
      { key: 'fastestGuess', title: 'Lightning Guesser', icon: '⚡' },
      { key: 'longestStreak', title: 'Streak Master', icon: '🔥' },
      { key: 'mostGuesses', title: 'Wild Guesser', icon: '🤪' }
    ];

    awardsList.forEach((a) => {
      const item = msg.awards ? msg.awards[a.key] : null;
      if (item) {
        const box = document.createElement('div');
        box.className = 'award-box';
        box.innerHTML = `
          <span class="award-icon">${a.icon}</span>
          <div class="award-details">
            <span class="award-title">${a.title}</span>
            <span class="award-winner">${this.escapeHtml(item.name)}</span>
            <span class="award-stat">${item.stat}</span>
          </div>
        `;
        awardsEl.appendChild(box);
      }
    });

    this.dom.gameOverOverlay.hidden = false;
  }

  showToast(text) {
    const toast = document.createElement('div');
    toast.className = 'game-toast';
    toast.textContent = text;
    document.body.appendChild(toast);
    setTimeout(() => {
      toast.remove();
    }, 2800);
  }

  escapeHtml(str) {
    return (str || '').replace(/[&<>"']/g, (m) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    }[m]));
  }
}

// Instantiate client once DOM loads
window.addEventListener('DOMContentLoaded', () => {
  new DrawGameClient();
});
