import { journeyConfig, playlist } from './config.js?v=5';

// High-entropy cryptographic random number generator between [0, 1)
function secureRandom() {
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    return buf[0] / (0xffffffff + 1);
  }
  return Math.random();
}

// Multi-pass Fisher-Yates shuffle with cryptographic entropy
function shuffle(array) {
  if (!Array.isArray(array) || array.length <= 1) return array;
  for (let pass = 0; pass < 2; pass++) {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(secureRandom() * (i + 1));
      const temp = array[i];
      array[i] = array[j];
      array[j] = temp;
    }
  }
  return array;
}

// Pre-load locally cached global/community songs before initial shuffle
// so community songs are mixed uniformly across the entire playlist
const SHARED_SONGS_STORAGE_KEY = 'ksrtc_community_songs_v1';
function getStoredCommunitySongs() {
  try {
    const raw = localStorage.getItem(SHARED_SONGS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (_) {
    return [];
  }
}

try {
  const cachedSongs = getStoredCommunitySongs();
  if (Array.isArray(cachedSongs)) {
    cachedSongs.forEach(s => {
      if (s && s.id && !playlist.some(p => p.id === s.id)) {
        playlist.push({
          id: s.id,
          title: s.title,
          artist: s.artist || 'Community Added',
          albumArt: s.albumArt || `https://img.youtube.com/vi/${s.id}/hqdefault.jpg`,
          isCommunityAdded: true
        });
      }
    });
  }
} catch (_) {}

// Always shuffle playlist whenever refreshed or loaded
shuffle(playlist);

// Ensure starting song is always different from the previous session / refresh
const PREV_START_SONG_KEY = 'ksrtc_prev_start_song_id';
try {
  const prevStartId = sessionStorage.getItem(PREV_START_SONG_KEY) || localStorage.getItem(PREV_START_SONG_KEY);
  if (playlist.length > 1 && playlist[0].id === prevStartId) {
    const swapIdx = 1 + Math.floor(secureRandom() * (playlist.length - 1));
    [playlist[0], playlist[swapIdx]] = [playlist[swapIdx], playlist[0]];
  }
  if (playlist[0] && playlist[0].id) {
    sessionStorage.setItem(PREV_START_SONG_KEY, playlist[0].id);
    localStorage.setItem(PREV_START_SONG_KEY, playlist[0].id);
  }
} catch (_) {}

const $ = (id) => document.getElementById(id);
const state = { isJourneyStarted:false, isRainMode:false, isStopping:false, currentVideo:'journey', currentSongIndex:0, isPlaying:false, currentTime:0, duration:0, startTimer:null, unblurTimer:null };
const app = $('app');
const journey = $('journey-video'), rainVideo = $('rain-video'), stopVideo = $('stop-video'), scene = $('scene-video');
const loadingBar = $('loading-bar'), loadingStatus = $('loading-status');
const els = { intro:$('intro'), player:$('player'), start:$('start-journey'), replay:$('replay'), fullscreenBtn:$('fullscreen-btn'), playlistToggle:$('playlist-toggle'), album:$('album-art'), title:$('track-title'), artist:$('track-artist'), progress:$('progress'), current:$('current-time'), duration:$('duration'), play:$('play'), previous:$('previous'), next:$('next'), stop:$('make-stop'), rain:$('rain'), horn:$('horn'), bell:$('bell'), toast:$('toast'), brand:document.querySelector('.brand'), boardNow:$('board-now-btn'), busSoundToggle:$('bus-sound-toggle'), busSoundSlider:$('bus-sound-slider'), busSoundValue:$('bus-sound-value'), busSoundLabel:$('bus-sound-label'), rainSoundBar:$('rain-sound-bar'), rainSoundToggle:$('rain-sound-toggle'), rainSoundSlider:$('rain-sound-slider'), rainSoundValue:$('rain-sound-value'), rainSoundLabel:$('rain-sound-label') };

// Persistent tab session ID for live presence and chat
const mySessionId = (() => {
  try {
    let id = sessionStorage.getItem('ksrtc_session_id_v1');
    if (!id) {
      id = 's_' + Math.random().toString(36).substring(2, 9) + '_' + Date.now();
      sessionStorage.setItem('ksrtc_session_id_v1', id);
    }
    return id;
  } catch (e) {
    return 's_' + Math.random().toString(36).substring(2, 9) + '_' + Date.now();
  }
})();

// In-app browser detection (Instagram, Facebook, etc.)
const isInstagramOrInApp = /(Instagram|FBAN|FBAV|Snapchat|TikTok|Line|Threads)/i.test(navigator.userAgent || '') || window.location.search.includes('inapp');
let hasShownInstaModal = false;

function showInstaModal() {
  const modal = $('insta-modal');
  if (!modal) return;
  modal.hidden = false;
  hasShownInstaModal = true;
}

function hideInstaModal() {
  const modal = $('insta-modal');
  if (!modal) return;
  modal.hidden = true;
}

// Apple-Style "What's New" Dialog Controller
const whatsNewModal = $('whats-new-modal');
const whatsNewCloseBtn = $('whats-new-close-btn');
const whatsNewActionBtn = $('whats-new-action-btn');
const whatsNewBackdrop = $('whats-new-backdrop');
const whatsNewOpenBtn = $('whats-new-open-btn');
const whatsNewDontShow = $('whats-new-dont-show');

const WHATS_NEW_DISMISSED_KEY = 'ksrtc_whats_new_dismissed_v1';

function isWhatsNewDismissed() {
  try {
    return localStorage.getItem(WHATS_NEW_DISMISSED_KEY) === 'true';
  } catch (_) {
    return false;
  }
}

function setWhatsNewDismissed(dismissed) {
  try {
    if (dismissed) {
      localStorage.setItem(WHATS_NEW_DISMISSED_KEY, 'true');
    } else {
      localStorage.removeItem(WHATS_NEW_DISMISSED_KEY);
    }
  } catch (_) {}
}

function showWhatsNewModal() {
  const modal = $('whats-new-modal');
  if (!modal) return;
  if (whatsNewDontShow) {
    whatsNewDontShow.checked = isWhatsNewDismissed();
  }
  modal.hidden = false;
  modal.classList.remove('is-closing');
}

function hideWhatsNewModal() {
  const modal = $('whats-new-modal');
  if (!modal) return;
  if (whatsNewDontShow) {
    setWhatsNewDismissed(whatsNewDontShow.checked);
  }
  modal.classList.add('is-closing');
  setTimeout(() => {
    modal.hidden = true;
    modal.classList.remove('is-closing');
  }, 180);
}

if (whatsNewCloseBtn) {
  whatsNewCloseBtn.addEventListener('click', hideWhatsNewModal);
}
if (whatsNewActionBtn) {
  whatsNewActionBtn.addEventListener('click', hideWhatsNewModal);
}
if (whatsNewBackdrop) {
  whatsNewBackdrop.addEventListener('click', hideWhatsNewModal);
}
if (whatsNewOpenBtn) {
  whatsNewOpenBtn.addEventListener('click', () => {
    showWhatsNewModal();
  });
}
if (whatsNewDontShow) {
  whatsNewDontShow.addEventListener('change', (e) => {
    setWhatsNewDismissed(Boolean(e.target.checked));
  });
}
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    const modal = $('whats-new-modal');
    if (modal && !modal.hidden) {
      hideWhatsNewModal();
    }
    const gModal = $('global-add-modal');
    if (gModal && !gModal.hidden) {
      hideGlobalAddModal();
    }
  }
});

// Apple-Style Global Song Add Confirmation Modal Controller
const globalAddModal = $('global-add-modal');
const globalAddBackdrop = $('global-add-backdrop');
const globalAddConfirmBtn = $('global-add-confirm-btn');
const globalAddCancelBtn = $('global-add-cancel-btn');
const globalAddThumb = $('global-add-thumb');
const globalAddTitle = $('global-add-song-title');
const globalAddArtist = $('global-add-song-artist');

let pendingGlobalAddSong = null;
let pendingGlobalAddBtn = null;

function showGlobalAddModal(song, btn) {
  if (!globalAddModal || !song) return;
  pendingGlobalAddSong = song;
  pendingGlobalAddBtn = btn;

  if (globalAddTitle) globalAddTitle.textContent = song.title;
  if (globalAddArtist) globalAddArtist.textContent = song.artist || 'YouTube';
  if (globalAddThumb) globalAddThumb.src = song.albumArt || `https://img.youtube.com/vi/${song.id}/hqdefault.jpg`;

  globalAddModal.hidden = false;
  globalAddModal.classList.remove('is-closing');
}

function hideGlobalAddModal() {
  if (!globalAddModal) return;
  globalAddModal.classList.add('is-closing');
  setTimeout(() => {
    globalAddModal.hidden = true;
    globalAddModal.classList.remove('is-closing');
    pendingGlobalAddSong = null;
    pendingGlobalAddBtn = null;
  }, 160);
}

if (globalAddConfirmBtn) {
  globalAddConfirmBtn.addEventListener('click', () => {
    if (pendingGlobalAddSong) {
      addSongToGlobalPlaylist(pendingGlobalAddSong);
      if (pendingGlobalAddBtn) {
        pendingGlobalAddBtn.classList.add('is-added');
        pendingGlobalAddBtn.textContent = '✓ Added';
      }
    }
    hideGlobalAddModal();
  });
}
if (globalAddCancelBtn) {
  globalAddCancelBtn.addEventListener('click', hideGlobalAddModal);
}
if (globalAddBackdrop) {
  globalAddBackdrop.addEventListener('click', hideGlobalAddModal);
}

// Initialize first track metadata in DOM
els.title.textContent = playlist[0].title;
els.artist.textContent = playlist[0].artist;
els.album.src = playlist[0].albumArt;

// Song / Music state & user volume preference (default: 82%)
const SONG_VOLUME_STORAGE_KEY = 'ksrtc_song_volume';
const savedSongVolume = (() => {
  try { return localStorage.getItem(SONG_VOLUME_STORAGE_KEY); } catch (e) { return null; }
})();
let currentSongVolume = savedSongVolume !== null ? Math.max(0, Math.min(100, parseInt(savedSongVolume, 10))) : Math.round((journeyConfig.volumes.music ?? 0.82) * 100);
let lastNonZeroSongVolume = currentSongVolume > 0 ? currentSongVolume : 82;
journeyConfig.volumes.music = currentSongVolume / 100;

const songVolumeWrap = $('song-volume-wrap');
const songVolumeBtn = $('song-volume-btn');
const songVolumePopover = $('song-volume-popover');
const songVolumeSlider = $('song-volume-slider');
const songVolumeVal = $('song-volume-val');

function updateSongVolumeUI() {
  if (songVolumeSlider) {
    songVolumeSlider.value = currentSongVolume;
    songVolumeSlider.style.setProperty('--progress', `${currentSongVolume}%`);
  }
  if (songVolumeVal) {
    songVolumeVal.textContent = `${currentSongVolume}%`;
  }
  if (songVolumeBtn) {
    const state = currentSongVolume === 0 ? 'mute' : (currentSongVolume <= 50 ? 'med' : 'high');
    songVolumeBtn.setAttribute('data-state', state);
    songVolumeBtn.setAttribute('title', `Song Volume: ${currentSongVolume}%`);
    songVolumeBtn.setAttribute('aria-label', `Song Volume: ${currentSongVolume}%`);
  }
}

function setSongVolume(vol, persist = true) {
  const clamped = Math.max(0, Math.min(100, Math.round(Number(vol) || 0)));
  currentSongVolume = clamped;
  journeyConfig.volumes.music = clamped / 100;
  if (clamped > 0) lastNonZeroSongVolume = clamped;

  if (persist) {
    try { localStorage.setItem(SONG_VOLUME_STORAGE_KEY, String(clamped)); } catch (e) {}
  }

  try {
    if (ytPlayer && ytReady) {
      if (clamped === 0) {
        if (ytPlayer.mute) ytPlayer.mute();
      } else {
        if (ytPlayer.unMute) ytPlayer.unMute();
        if (ytPlayer.setVolume) ytPlayer.setVolume(clamped);
      }
    }
  } catch (e) {}

  updateSongVolumeUI();
}

updateSongVolumeUI();

// Rain sound state & user volume preference (default: 80%)
const savedRainVolume = (() => {
  try { return localStorage.getItem('ksrtc_rain_sound_volume_v2'); } catch (e) { return null; }
})();
let currentRainVolume = savedRainVolume !== null ? Math.max(0, Math.min(100, parseInt(savedRainVolume, 10))) : Math.round((journeyConfig.volumes.rain ?? 0.8) * 100);
let lastNonZeroRainVolume = currentRainVolume > 0 ? currentRainVolume : 80;

// Bus running sound state & user volume preference
const savedRunVolume = (() => {
  try { return localStorage.getItem('ksrtc_bus_sound_volume_v2') ?? localStorage.getItem('ksrtc_bus_sound_volume'); } catch (e) { return null; }
})();
let currentRunVolume = savedRunVolume !== null ? Math.max(0, Math.min(100, parseInt(savedRunVolume, 10))) : Math.round((journeyConfig.volumes.run ?? 0.25) * 100);
let lastNonZeroRunVolume = currentRunVolume > 0 ? currentRunVolume : 25;

const rainAudio = new Audio(journeyConfig.sounds.rain);
rainAudio.loop = true;
rainAudio.preload = 'auto';
rainAudio.volume = currentRainVolume / 100;

const runAudio = new Audio(journeyConfig.sounds.run);
runAudio.loop = true;
runAudio.preload = 'auto';
runAudio.volume = currentRunVolume / 100;

const hornAudio = new Audio(journeyConfig.sounds.horn);
hornAudio.preload = 'auto';
hornAudio.volume = journeyConfig.volumes.effects;

const bellAudio = new Audio(journeyConfig.sounds.busBell);
bellAudio.preload = 'auto';
bellAudio.volume = journeyConfig.volumes.effects;

const startAudio = new Audio(journeyConfig.sounds.journeyStart);
startAudio.preload = 'auto';
startAudio.volume = 1;

const messageAudio = new Audio('./assets/audio/messagesound.wav');
messageAudio.preload = 'auto';
messageAudio.volume = journeyConfig.volumes.effects ?? 0.8;

function preloadAudioAssets() {
  try {
    runAudio.load();
    rainAudio.load();
    hornAudio.load();
    bellAudio.load();
    startAudio.load();
    messageAudio.load();
  } catch (e) {}
}

function playSoundEffect(audioObj) {
  if (!audioObj) return;
  try {
    audioObj.currentTime = 0;
    const p = audioObj.play();
    if (p && typeof p.catch === 'function') {
      p.catch(() => {});
    }
  } catch (e) {}
}

function updateRainSoundUI(volume) {
  if (els.rainSoundSlider) {
    els.rainSoundSlider.value = volume;
    els.rainSoundSlider.style.setProperty('--rain-volume', `${volume}%`);
  }
  if (els.rainSoundValue) {
    els.rainSoundValue.textContent = volume === 0 ? 'Off' : `${volume}%`;
  }
  if (els.rainSoundToggle) {
    const isOff = volume === 0;
    els.rainSoundToggle.classList.toggle('is-muted', isOff);
    els.rainSoundToggle.setAttribute('aria-label', isOff ? 'Turn on rain sound' : 'Turn off rain sound');
    if (els.rainSoundLabel) {
      els.rainSoundLabel.textContent = 'Rain Sound';
    }
  }
}

function updateRainBarState(isRainActive) {
  if (els.rainSoundBar) {
    els.rainSoundBar.classList.toggle('is-disabled', !isRainActive);
    els.rainSoundBar.setAttribute('aria-disabled', String(!isRainActive));
  }
  if (els.rainSoundToggle) {
    els.rainSoundToggle.disabled = !isRainActive;
  }
  if (els.rainSoundSlider) {
    els.rainSoundSlider.disabled = !isRainActive;
  }
}

updateRainSoundUI(currentRainVolume);
updateRainBarState(false);

function updateBusSoundUI(volume) {
  if (els.busSoundSlider) {
    els.busSoundSlider.value = volume;
    els.busSoundSlider.style.setProperty('--bus-volume', `${volume}%`);
  }
  if (els.busSoundValue) {
    els.busSoundValue.textContent = volume === 0 ? 'Off' : `${volume}%`;
  }
  if (els.busSoundToggle) {
    const isOff = volume === 0;
    els.busSoundToggle.classList.toggle('is-muted', isOff);
    els.busSoundToggle.setAttribute('aria-label', isOff ? 'Turn on bus sound' : 'Turn off bus sound');
    if (els.busSoundLabel) {
      els.busSoundLabel.textContent = 'Bus Sound';
    }
  }
}

updateBusSoundUI(currentRunVolume);

const preloadStatus = {
  journey: false,
  minTimerPassed: false
};
let hasFinished = false;
let hasTriggeredEarlySong = false;
let userExplicitlyPaused = false;

function checkAllLoadedAndFinish() {
  if (!state.isJourneyStarted || hasFinished) return;
  if (preloadStatus.journey && preloadStatus.minTimerPassed) {
    finishLoading();
  }
}

let journeyBlobUrl = null;

function initJourneyVideo() {
  journey.preload = 'auto';
  journey.loop = true;

  const onReady = () => {
    preloadStatus.journey = true;
    checkAllLoadedAndFinish();
  };

  journey.src = journeyConfig.videos.journey;
  if (journey.readyState >= 3) {
    preloadStatus.journey = true;
  } else {
    journey.addEventListener('canplay', onReady, { once: true });
    journey.addEventListener('loadeddata', onReady, { once: true });
    journey.addEventListener('error', onReady, { once: true });
  }
  journey.load();
}

function initSecondaryVideos() {
  if (!rainVideo.src || rainVideo.src === window.location.href) {
    rainVideo.src = journeyConfig.videos.rain;
  }
  rainVideo.loop = true;
  rainVideo.preload = 'auto';
  rainVideo.load();

  if (!stopVideo.src || stopVideo.src === window.location.href) {
    stopVideo.src = journeyConfig.videos.stop;
  }
  stopVideo.loop = false;
  stopVideo.preload = 'auto';
  stopVideo.load();
}

// Immediately initialize primary journey video
initJourneyVideo();

function preloadSecondaryVideos() {
  initSecondaryVideos();
}

let ytPlayer = null;
let ytReady = false;
let pendingTrack = null;

function initYTPlayer() {
  if (ytPlayer || !window.YT || !window.YT.Player) return;
  try {
    const originParam = window.location.origin && window.location.origin !== 'null' ? window.location.origin : undefined;
    ytPlayer = new YT.Player('yt-player', {
      height: '200',
      width: '200',
      videoId: playlist[state.currentSongIndex].id,
      playerVars: {
        autoplay: 0,
        controls: 0,
        disablekb: 1,
        fs: 0,
        rel: 0,
        playsinline: 1,
        enablejsapi: 1,
        ...(originParam ? { origin: originParam } : {})
      },
      events: {
        onReady: () => {
          ytReady = true;
          try {
            if (currentSongVolume === 0) {
              if (ytPlayer.mute) ytPlayer.mute();
            } else {
              if (ytPlayer.unMute) ytPlayer.unMute();
              if (ytPlayer.setVolume) ytPlayer.setVolume(currentSongVolume);
            }
            // Only play if the journey has actually started and finished the loading screen!
            if (hasFinished && state.isPlaying) {
              if (currentSongVolume > 0 && ytPlayer.unMute) ytPlayer.unMute();
              if (ytPlayer.playVideo) ytPlayer.playVideo();
            }
          } catch (e) {
            console.warn('Initial play check error:', e);
          }
          if (pendingTrack !== null && hasFinished) {
            setTrack(pendingTrack.index, pendingTrack.shouldPlay !== false);
            pendingTrack = null;
          }
        },
        onStateChange: (event) => {
          if (event.data === YT.PlayerState.PLAYING) {
            state.isPlaying = true;
            els.play.classList.add('is-playing');
            els.play.setAttribute('aria-label', 'Pause');
            syncRunAudio();
            syncRainAudio();
            updatePlaylistActiveState();
          } else if (event.data === YT.PlayerState.PAUSED) {
            state.isPlaying = false;
            els.play.classList.remove('is-playing');
            els.play.setAttribute('aria-label', 'Play');
            syncRunAudio();
            syncRainAudio();
            updatePlaylistActiveState();
          } else if (event.data === YT.PlayerState.ENDED) {
            setTrack(state.currentSongIndex + 1, true);
          }
        },
        onError: (err) => {
          console.warn('YouTube playback error:', err);
          // If a track encounters an embed restriction, seamlessly advance to the next song
          setTrack(state.currentSongIndex + 1, true);
        }
      }
    });
  } catch (err) {
    console.error('Error creating YouTube player:', err);
  }
}

if (window.YT && window.YT.Player) {
  initYTPlayer();
} else {
  const prevReady = window.onYouTubeIframeAPIReady;
  window.onYouTubeIframeAPIReady = () => {
    if (typeof prevReady === 'function') prevReady();
    initYTPlayer();
  };
}

const ytInitInterval = setInterval(() => {
  if (window.YT && window.YT.Player) {
    if (!ytPlayer) initYTPlayer();
    clearInterval(ytInitInterval);
  }
}, 200);
setTimeout(() => clearInterval(ytInitInterval), 10000);

function formatTime(seconds) { if (!Number.isFinite(seconds)) return '0:00'; return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2,'0')}`; }
function notify(message) { els.toast.textContent=message; els.toast.classList.add('show'); clearTimeout(notify.timer); notify.timer=setTimeout(()=>els.toast.classList.remove('show'),3200); }
function playSafe(media, label) { return media.play().catch(()=> label && notify(`${label} is ready when its file is added.`)); }
function effect(path) { const sound=new Audio(path); sound.volume=journeyConfig.volumes.effects; sound.play().catch(()=>notify('Sound effect is ready when its file is added.')); return sound; }

function syncRunAudio() {
  const shouldPlay = state.isJourneyStarted && !els.player.hidden && !state.isStopping && state.isPlaying;
  if (shouldPlay && runAudio.volume > 0) {
    if (runAudio.paused) {
      playSafe(runAudio, 'Bus running sound');
    }
  } else {
    if (!runAudio.paused) {
      runAudio.pause();
    }
  }
}

function setBusSoundVolume(volume, savePref = true) {
  currentRunVolume = Math.max(0, Math.min(100, volume));
  if (currentRunVolume > 0) {
    lastNonZeroRunVolume = currentRunVolume;
  }
  runAudio.volume = currentRunVolume / 100;
  updateBusSoundUI(currentRunVolume);
  if (savePref) {
    try {
      localStorage.setItem('ksrtc_bus_sound_volume', currentRunVolume);
    } catch (e) {}
  }
  syncRunAudio();
}

function toggleBusSound() {
  if (currentRunVolume > 0) {
    lastNonZeroRunVolume = currentRunVolume;
    setBusSoundVolume(0);
    notify('Bus running sound muted.');
  } else {
    const target = lastNonZeroRunVolume > 0 ? lastNonZeroRunVolume : 25;
    setBusSoundVolume(target);
    notify(`Bus running sound on (${target}%).`);
  }
}

function syncRainAudio() {
  const shouldPlay = state.isJourneyStarted && !els.player.hidden && state.isRainMode;
  if (shouldPlay && rainAudio.volume > 0) {
    if (rainAudio.paused) {
      playSafe(rainAudio, 'Rain sound');
    }
  } else {
    if (!rainAudio.paused) {
      rainAudio.pause();
    }
  }
}

function setRainSoundVolume(volume, savePref = true) {
  currentRainVolume = Math.max(0, Math.min(100, volume));
  if (currentRainVolume > 0) {
    lastNonZeroRainVolume = currentRainVolume;
  }
  rainAudio.volume = currentRainVolume / 100;
  updateRainSoundUI(currentRainVolume);
  if (savePref) {
    try {
      localStorage.setItem('ksrtc_rain_sound_volume_v2', currentRainVolume);
    } catch (e) {}
  }
  syncRainAudio();
}

function toggleRainSound() {
  if (currentRainVolume > 0) {
    lastNonZeroRainVolume = currentRainVolume;
    setRainSoundVolume(0);
    notify('Rain sound muted.');
  } else {
    const target = lastNonZeroRainVolume > 0 ? lastNonZeroRainVolume : 80;
    setRainSoundVolume(target);
    notify(`Rain sound on (${target}%).`);
  }
}

function setTrack(index, shouldPlay = true) {
  if (playlist.length > 1 && index >= playlist.length) {
    const lastTrack = playlist[state.currentSongIndex];
    shuffle(playlist);
    if (lastTrack && playlist[0].id === lastTrack.id && playlist.length > 1) {
      const swapIdx = 1 + Math.floor(secureRandom() * (playlist.length - 1));
      [playlist[0], playlist[swapIdx]] = [playlist[swapIdx], playlist[0]];
    }
    state.currentSongIndex = 0;
    if (typeof renderPlaylist === 'function') {
      const activeFilter = (typeof currentSearchFilter !== 'undefined') ? currentSearchFilter : '';
      if (!activeFilter) renderPlaylist('');
    }
  } else {
    state.currentSongIndex = (index + playlist.length) % playlist.length;
  }
  const track = playlist[state.currentSongIndex];
  els.title.textContent = track.title;
  els.artist.textContent = track.artist;
  els.album.src = track.albumArt;
  els.album.onerror = () => { els.album.src = journeyConfig.videos.fallbackImage; };
  els.progress.value = 0;
  els.progress.style.setProperty('--progress', '0%');
  els.current.textContent = '0:00';
  els.duration.textContent = '0:00';

  if (!ytReady || !ytPlayer) {
    pendingTrack = { index: state.currentSongIndex, shouldPlay };
    return;
  }
  try {
    if (currentSongVolume === 0) {
      if (ytPlayer.mute) ytPlayer.mute();
    } else {
      if (ytPlayer.unMute) ytPlayer.unMute();
      if (ytPlayer.setVolume) ytPlayer.setVolume(currentSongVolume);
    }
    if (shouldPlay) {
      userExplicitlyPaused = false;
      state.isPlaying = true;
      els.play.classList.add('is-playing');
      els.play.setAttribute('aria-label', 'Pause');
      if (ytPlayer.loadVideoById) {
        ytPlayer.loadVideoById(track.id);
      } else if (ytPlayer.playVideo) {
        ytPlayer.playVideo();
      }
    } else {
      if (ytPlayer.cueVideoById) {
        ytPlayer.cueVideoById(track.id);
      }
      state.isPlaying = false;
      els.play.classList.remove('is-playing');
      els.play.setAttribute('aria-label', 'Play');
    }
  } catch (err) {
    console.error('Error updating track:', err);
  }
  updatePlaylistActiveState();
  syncRunAudio();
}

function playMusic() {
  userExplicitlyPaused = false;
  state.isPlaying = true;
  els.play.classList.add('is-playing');
  els.play.setAttribute('aria-label', 'Pause');
  updatePlaylistActiveState();
  if (ytPlayer && ytReady) {
    try {
      if (currentSongVolume === 0) {
        if (ytPlayer.mute) ytPlayer.mute();
      } else {
        if (ytPlayer.unMute) ytPlayer.unMute();
        if (ytPlayer.setVolume) ytPlayer.setVolume(currentSongVolume);
      }
      if (ytPlayer.playVideo) {
        ytPlayer.playVideo();
      } else {
        setTrack(state.currentSongIndex, true);
      }
    } catch (e) {
      setTrack(state.currentSongIndex, true);
    }
  } else {
    setTrack(state.currentSongIndex, true);
  }
  syncRunAudio();
}

function pauseMusic() {
  state.isPlaying = false;
  els.play.classList.remove('is-playing');
  els.play.setAttribute('aria-label', 'Play');
  updatePlaylistActiveState();
  if (ytPlayer && ytReady && ytPlayer.pauseVideo) {
    try {
      ytPlayer.pauseVideo();
    } catch (e) {}
  }
  syncRunAudio();
}
function toggleRain() {
  if (state.isStopping) return;
  state.isRainMode = !state.isRainMode;
  els.rain.classList.toggle('active', state.isRainMode);
  els.rain.querySelector('small').textContent = state.isRainMode ? 'Rain On' : 'Rain Off';
  els.rain.setAttribute('aria-label', state.isRainMode ? 'Turn rain off' : 'Turn rain on');
  updateRainBarState(state.isRainMode);
  if (state.isRainMode) {
    if (!rainVideo.src || rainVideo.src === window.location.href) {
      rainVideo.src = journeyConfig.videos.rain;
    }
    const startRainPlayback = () => {
      journey.pause();
      journey.classList.remove('is-visible');
      rainVideo.currentTime = 0;
      rainVideo.classList.add('is-visible');
      playSafe(rainVideo);
      state.currentVideo = 'rain';
      rainAudio.volume = currentRainVolume / 100;
      rainAudio.currentTime = 0;
      syncRainAudio();
      notify('Rain on.');
    };
    if (rainVideo.readyState >= 3) {
      startRainPlayback();
    } else {
      rainVideo.load();
      rainVideo.addEventListener('canplay', startRainPlayback, { once: true });
      setTimeout(startRainPlayback, 500);
    }
  } else {
    rainAudio.pause();
    rainAudio.currentTime = 0;
    rainVideo.pause();
    rainVideo.classList.remove('is-visible');
    journey.classList.add('is-visible');
    playSafe(journey);
    state.currentVideo = 'journey';
    notify('Rain off.');
  }
  syncRunAudio();
}

let stopFallbackTimer = null;

function makeStop() {
  if (state.isStopping || !state.isJourneyStarted) return;
  if (state.isRainMode) {
    notify('Please turn off rain mode to make a stop.');
    return;
  }
  state.isStopping = true;
  syncRunAudio();
  els.stop.disabled = true;
  els.stop.classList.add('is-stopping');
  const label = els.stop.querySelector('small');
  if (label) label.textContent = 'Stopping…';
  playSoundEffect(bellAudio);
  notify('Stopping at the next stop…');

  if (!stopVideo.src || stopVideo.src === window.location.href) {
    stopVideo.src = journeyConfig.videos.stop;
  }

  // Enable audio for stop video and set realistic volume
  stopVideo.muted = false;
  stopVideo.volume = journeyConfig.volumes.effects ?? 0.9;

  let hasStartedStopVideo = false;
  const startStopPlayback = () => {
    if (hasStartedStopVideo) return;
    hasStartedStopVideo = true;

    try {
      stopVideo.currentTime = 0;
    } catch (e) {}

    journey.pause();
    journey.classList.remove('is-visible');
    stopVideo.classList.add('is-visible');

    // Keep music playing continuously during the stop sequence as requested

    try {
      const playPromise = stopVideo.play();
      if (playPromise && typeof playPromise.catch === 'function') {
        playPromise.catch(() => {
          // Fallback: if browser blocks unmuted playback, play muted
          stopVideo.muted = true;
          stopVideo.play().catch(() => {});
        });
      }
    } catch (e) {
      stopVideo.muted = true;
      stopVideo.play().catch(() => {});
    }

    state.currentVideo = 'stop';

    // Watchdog timer: guarantees journey resumes even if device freezes, stalls, or drops video playback
    clearTimeout(stopFallbackTimer);
    const dur = (Number.isFinite(stopVideo.duration) && stopVideo.duration > 0)
      ? stopVideo.duration
      : 7.5;
    const timeoutMs = Math.ceil(dur * 1000) + 1200;

    stopFallbackTimer = setTimeout(() => {
      if (state.isStopping) {
        onStopEnded();
      }
    }, timeoutMs);
  };

  // If already buffered enough to play without delay, play immediately!
  if (stopVideo.readyState >= 3) {
    startStopPlayback();
  } else {
    stopVideo.load();
    stopVideo.addEventListener('canplay', startStopPlayback, { once: true });
    stopVideo.addEventListener('loadeddata', startStopPlayback, { once: true });
    setTimeout(startStopPlayback, 600);
  }
}

let currentStartupSound = null;

function startJourney() {
  if (state.isJourneyStarted) return;
  state.isJourneyStarted = true;
  hasFinished = false;
  hasTriggeredEarlySong = false;
  els.start.disabled = true;
  els.intro.classList.add('is-starting');

  // Preload all audio assets on this user gesture so they are ready when loading finishes
  preloadAudioAssets();

  // Start buffering secondary videos immediately during the 8-second countdown!
  initSecondaryVideos();

  currentStartupSound = startAudio;
  playSoundEffect(startAudio);

  const STARTUP_DURATION_MS = 8000;
  let animId = null;
  const startTime = performance.now();

  function animateProgress(now) {
    if (hasFinished) {
      if (loadingBar) {
        loadingBar.style.width = '100%';
        loadingBar.style.setProperty('--loading-progress', '100%');
      }
      return;
    }
    const elapsed = now - startTime;
    const progress = Math.min(elapsed / STARTUP_DURATION_MS, 1);
    const eased = 1 - Math.pow(1 - progress, 1.8);
    const visualPct = Math.min(eased * 100, 99.5);

    if (loadingBar) {
      loadingBar.style.width = `${visualPct}%`;
      loadingBar.style.setProperty('--loading-progress', `${visualPct}%`);
    }

    if (loadingStatus) {
      const remainingMs = Math.max(0, STARTUP_DURATION_MS - elapsed);
      const remainingSec = Math.max(1, Math.ceil(remainingMs / 1000));
      if (progress >= 1) {
        loadingStatus.textContent = 'All aboard! Welcome aboard KSRTC Radio…';
      } else {
        loadingStatus.textContent = `Starting your ride in ${remainingSec} second${remainingSec === 1 ? '' : 's'}…`;
      }

      // Start the song when the countdown reads 2 seconds remaining
      if (remainingSec <= 2 && !hasTriggeredEarlySong && !hasFinished) {
        hasTriggeredEarlySong = true;
        playMusic();
      }
    }

    if (progress < 1 && !hasFinished) {
      animId = requestAnimationFrame(animateProgress);
    }
  }

  animId = requestAnimationFrame(animateProgress);

  const onEngineComplete = () => {
    cancelAnimationFrame(animId);
    preloadStatus.minTimerPassed = true;
    checkAllLoadedAndFinish();
  };

  startAudio.addEventListener('ended', onEngineComplete, { once: true });
  startAudio.addEventListener('error', onEngineComplete, { once: true });

  state.startTimer = setTimeout(onEngineComplete, STARTUP_DURATION_MS);

  // Safety timeout: never hang forever
  setTimeout(() => {
    if (!hasFinished) {
      cancelAnimationFrame(animId);
      preloadStatus.journey = true;
      preloadStatus.minTimerPassed = true;
      finishLoading();
    }
  }, 9500);
}

const finishLoading = () => {
  if (hasFinished) return;
  hasFinished = true;
  clearTimeout(state.startTimer);
  try {
    if (currentStartupSound) {
      currentStartupSound.pause();
      currentStartupSound.currentTime = 0;
    }
  } catch (e) {}
  currentStartupSound = null;

  if (loadingBar) {
    loadingBar.style.width = '100%';
    loadingBar.style.setProperty('--loading-progress', '100%');
  }
  if (loadingStatus) {
    loadingStatus.textContent = 'All aboard! Welcome aboard KSRTC Radio…';
  }

  journey.classList.add('is-visible');
  playSafe(journey);

  els.intro.classList.remove('is-starting');
  els.intro.classList.add('is-unblurring');
  app.classList.remove('intro-active');
  els.player.hidden = false;
  els.replay.hidden = false;
  updateRainBarState(state.isRainMode);

  // Ensure music playback is active
  if (!state.isPlaying) {
    playMusic();
  }

  // When opened in Instagram browser only: pop in guidance message in song screen
  if (isInstagramOrInApp && !hasShownInstaModal) {
    setTimeout(() => {
      showInstaModal();
    }, 600);
  }

  // Open Apple-style "What's New" dialog when loading finishes if not dismissed by user
  if (!isWhatsNewDismissed()) {
    setTimeout(() => {
      showWhatsNewModal();
    }, 750);
  }

  // Preload secondary scenes smoothly in background now that ride is active
  preloadSecondaryVideos();

  els.player.classList.remove('ui-blur-in');
  els.replay.classList.remove('ui-blur-in');
  if (els.fullscreenBtn) els.fullscreenBtn.classList.remove('ui-blur-in');
  els.brand.classList.remove('ui-blur-in');
  if (els.playlistToggle) els.playlistToggle.classList.remove('ui-blur-in');
  const topNav = $('top-nav-actions');
  if (topNav) topNav.classList.remove('ui-blur-in');
  void els.player.offsetWidth;
  els.player.classList.add('ui-blur-in');
  els.replay.classList.add('ui-blur-in');
  if (els.fullscreenBtn) els.fullscreenBtn.classList.add('ui-blur-in');
  els.brand.classList.add('ui-blur-in');
  if (els.playlistToggle) els.playlistToggle.classList.add('ui-blur-in');
  if (topNav) topNav.classList.add('ui-blur-in');

  state.unblurTimer = setTimeout(() => {
    els.intro.classList.remove('is-unblurring');
    els.intro.classList.add('is-hidden');
  }, 1000);
};

function resetJourney() {
  hideInstaModal();
  hideWhatsNewModal();
  clearTimeout(state.startTimer);
  clearTimeout(state.unblurTimer);
  clearTimeout(hornTimer);
  clearTimeout(bellTimer);
  clearTimeout(stopFallbackTimer);
  if (currentStartupSound) {
    try {
      currentStartupSound.pause();
      currentStartupSound.currentTime = 0;
    } catch (e) {}
    currentStartupSound = null;
  }
  els.horn.classList.remove('is-pressed');
  els.bell.classList.remove('is-pressed');
  rainAudio.pause();
  rainAudio.currentTime = 0;
  runAudio.pause();
  runAudio.currentTime = 0;
  pauseMusic();
  if (ytPlayer && ytReady && ytPlayer.cueVideoById) {
    try {
      ytPlayer.cueVideoById(playlist[0].id);
    } catch (e) {}
  }
  stopVideo.pause();
  stopVideo.currentTime = 0;
  stopVideo.muted = true;
  stopVideo.classList.remove('is-visible');
  wasMusicPlayingBeforeStop = false;
  rainVideo.pause();
  rainVideo.currentTime = 0;
  rainVideo.classList.remove('is-visible');
  journey.pause();
  journey.currentTime = 0;
  journey.classList.remove('is-visible');
  Object.assign(state, {
    isJourneyStarted: false,
    isRainMode: false,
    isStopping: false,
    currentVideo: 'journey',
    currentSongIndex: 0,
    isPlaying: false,
    currentTime: 0,
    duration: 0
  });
  els.player.hidden = true;
  els.replay.hidden = true;
  updateRainBarState(false);
  els.player.classList.remove('ui-blur-in');
  els.replay.classList.remove('ui-blur-in');
  els.brand.classList.remove('ui-blur-in');
  els.stop.disabled = false;
  els.stop.classList.remove('is-stopping');
  const stopLabel = els.stop.querySelector('small');
  if (stopLabel) stopLabel.textContent = 'Make a Stop';
  els.rain.classList.remove('active');
  els.rain.querySelector('small').textContent = 'Rain Off';
  els.rain.setAttribute('aria-label', 'Turn rain on');
  els.progress.value = 0;
  els.progress.style.setProperty('--progress', '0%');
  els.current.textContent = '0:00';
  els.duration.textContent = '0:00';
  shuffle(playlist);
  els.title.textContent = playlist[0].title;
  els.artist.textContent = playlist[0].artist;
  els.album.src = playlist[0].albumArt;
  els.intro.classList.remove('is-hidden', 'is-starting', 'is-unblurring');
  app.classList.add('intro-active');
  els.start.disabled = false;
  hasFinished = false;
  hasTriggeredEarlySong = false;
  preloadStatus.minTimerPassed = false;
  if (loadingBar) {
    loadingBar.style.width = '0%';
    loadingBar.style.setProperty('--loading-progress', '0%');
  }
  if (loadingStatus) {
    loadingStatus.textContent = 'Starting your ride in 8 seconds…';
  }
  userExplicitlyPaused = false;
  hasFirstTouchUnlocked = false;
  cleanupUnlockListeners();
  window.addEventListener('pointerdown', unlockAudioOnFirstTouch, { passive: true });
  window.addEventListener('touchstart', unlockAudioOnFirstTouch, { passive: true });
  window.addEventListener('click', unlockAudioOnFirstTouch, { passive: true });
}

// Track seek & progress polling from YouTube player
setInterval(() => {
  if (!ytPlayer || !ytReady || !state.isPlaying || !ytPlayer.getCurrentTime) return;
  try {
    const cur = ytPlayer.getCurrentTime() || 0;
    const dur = ytPlayer.getDuration() || 0;
    state.currentTime = cur;
    if (dur > 0) {
      state.duration = dur;
      els.duration.textContent = formatTime(dur);
      const pct = (cur / dur) * 100;
      els.progress.value = pct;
      els.progress.style.setProperty('--progress', `${pct}%`);
    }
    els.current.textContent = formatTime(cur);
  } catch (e) {}
}, 250);

els.progress.addEventListener('input', () => {
  if (!ytPlayer || !ytReady || !ytPlayer.getDuration) return;
  try {
    const dur = ytPlayer.getDuration();
    if (dur > 0) {
      const target = (els.progress.value / 100) * dur;
      ytPlayer.seekTo(target, true);
      els.current.textContent = formatTime(target);
      els.progress.style.setProperty('--progress', `${els.progress.value}%`);
    }
  } catch (e) {}
});

let hornTimer = null;
let bellTimer = null;

function triggerHorn() {
  playSoundEffect(hornAudio);
  els.horn.classList.add('is-pressed');
  clearTimeout(hornTimer);
  hornTimer = setTimeout(() => els.horn.classList.remove('is-pressed'), 1400);
}

function triggerBell() {
  playSoundEffect(bellAudio);
  els.bell.classList.add('is-pressed');
  clearTimeout(bellTimer);
  bellTimer = setTimeout(() => els.bell.classList.remove('is-pressed'), 1200);
}

els.start.addEventListener('click', startJourney);
if (els.boardNow) {
  els.boardNow.addEventListener('click', () => {
    if (!hasFinished && state.isJourneyStarted) {
      preloadStatus.journey = true;
      preloadStatus.minTimerPassed = true;
      finishLoading();
    }
  });
}
els.replay.addEventListener('click', () => {
  window.location.reload();
});
els.previous.addEventListener('click', () => setTrack(state.currentSongIndex - 1, true));
els.play.addEventListener('click', (e) => {
  e.stopPropagation();
  if (state.isPlaying) {
    userExplicitlyPaused = true;
    pauseMusic();
  } else {
    userExplicitlyPaused = false;
    playMusic();
    if (isInstagramOrInApp) {
      setTimeout(() => {
        if (!state.isPlaying) {
          showInstaModal();
        }
      }, 700);
    }
  }
});
els.next.addEventListener('click', () => setTrack(state.currentSongIndex + 1, true));
els.horn.addEventListener('click', triggerHorn);
els.bell.addEventListener('click', triggerBell);
els.rain.addEventListener('click', toggleRain);
els.stop.addEventListener('click', makeStop);

if (els.busSoundSlider) {
  els.busSoundSlider.addEventListener('input', (e) => {
    setBusSoundVolume(parseInt(e.target.value, 10));
  });
}
if (els.busSoundToggle) {
  els.busSoundToggle.addEventListener('click', toggleBusSound);
}

if (els.rainSoundSlider) {
  els.rainSoundSlider.addEventListener('input', (e) => {
    setRainSoundVolume(parseInt(e.target.value, 10));
  });
}
if (els.rainSoundToggle) {
  els.rainSoundToggle.addEventListener('click', toggleRainSound);
}

// Song Volume Listeners
if (songVolumeBtn) {
  songVolumeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!songVolumePopover) return;
    const isHidden = songVolumePopover.hidden;
    if (isHidden) {
      songVolumePopover.hidden = false;
      songVolumeBtn.setAttribute('aria-expanded', 'true');
    } else {
      // Toggle mute if clicked while popover is open
      setSongVolume(currentSongVolume > 0 ? 0 : lastNonZeroSongVolume, true);
    }
  });

  songVolumeBtn.addEventListener('wheel', (e) => {
    e.preventDefault();
    const delta = e.deltaY < 0 ? 5 : -5;
    setSongVolume(currentSongVolume + delta, true);
  }, { passive: false });
}

if (songVolumeSlider) {
  songVolumeSlider.addEventListener('input', (e) => {
    setSongVolume(e.target.value, false);
  });
  songVolumeSlider.addEventListener('change', (e) => {
    setSongVolume(e.target.value, true);
  });
}

if (songVolumePopover) {
  songVolumePopover.addEventListener('click', (e) => {
    e.stopPropagation();
  });
  songVolumePopover.addEventListener('wheel', (e) => {
    e.preventDefault();
    const delta = e.deltaY < 0 ? 5 : -5;
    setSongVolume(currentSongVolume + delta, true);
  }, { passive: false });
}

// Close volume popover when clicking outside or pressing Escape
document.addEventListener('click', (e) => {
  if (songVolumePopover && !songVolumePopover.hidden) {
    if (!songVolumePopover.contains(e.target) && (!songVolumeBtn || !songVolumeBtn.contains(e.target))) {
      songVolumePopover.hidden = true;
      if (songVolumeBtn) songVolumeBtn.setAttribute('aria-expanded', 'false');
    }
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && songVolumePopover && !songVolumePopover.hidden) {
    songVolumePopover.hidden = true;
    if (songVolumeBtn) songVolumeBtn.setAttribute('aria-expanded', 'false');
  }
});

function onStopEnded() {
  clearTimeout(stopFallbackTimer);
  if (state.isStopping) {
    state.isStopping = false;
    els.stop.disabled = false;
    els.stop.classList.remove('is-stopping');
    const stopLabel = els.stop.querySelector('small');
    if (stopLabel) stopLabel.textContent = 'Make a Stop';
    try {
      stopVideo.pause();
      stopVideo.muted = true;
    } catch (e) {}
    stopVideo.classList.remove('is-visible');
    journey.classList.add('is-visible');
    playSafe(journey);
    state.currentVideo = 'journey';
    syncRunAudio();
    notify('Journey resumed.');
  }
}
stopVideo.addEventListener('ended', onStopEnded);
stopVideo.addEventListener('error', () => {
  if (state.isStopping) onStopEnded();
});
scene.addEventListener('ended', onStopEnded);

document.addEventListener('keydown', (e) => {
  if (e.target.matches('input')) return;
  if (e.code === 'Space') {
    e.preventDefault();
    if (state.isPlaying) {
      userExplicitlyPaused = true;
      pauseMusic();
    } else {
      userExplicitlyPaused = false;
      playMusic();
    }
  }
  if (e.key === 'ArrowRight') setTrack(state.currentSongIndex + 1, true);
  if (e.key === 'ArrowLeft') setTrack(state.currentSongIndex - 1, true);
});

let hasFirstTouchUnlocked = false;

function cleanupUnlockListeners() {
  window.removeEventListener('pointerdown', unlockAudioOnFirstTouch);
  window.removeEventListener('touchstart', unlockAudioOnFirstTouch);
  window.removeEventListener('click', unlockAudioOnFirstTouch);
}

// Auto-unlock and unmute music on user interaction only AFTER the loading screen has finished
const unlockAudioOnFirstTouch = (e) => {
  if (!hasFinished || !state.isJourneyStarted || hasFirstTouchUnlocked) return;

  // If user interacted with controls directly, let that control manage playback
  if (e && e.target && e.target.closest('button, input, a, .playlist-item')) {
    hasFirstTouchUnlocked = true;
    cleanupUnlockListeners();
    return;
  }

  hasFirstTouchUnlocked = true;
  cleanupUnlockListeners();

  if (ytPlayer && ytReady) {
    try {
      if (currentSongVolume > 0 && ytPlayer.isMuted && ytPlayer.isMuted()) {
        ytPlayer.unMute();
      }
      if (ytPlayer.getVolume && ytPlayer.getVolume() === 0 && currentSongVolume > 0) {
        ytPlayer.setVolume(currentSongVolume);
      }
    } catch (e) {}
  }
  if (!userExplicitlyPaused && !state.isPlaying && ytPlayer && ytReady) {
    playMusic();
  }
};
window.addEventListener('pointerdown', unlockAudioOnFirstTouch, { passive: true });
window.addEventListener('touchstart', unlockAudioOnFirstTouch, { passive: true });
window.addEventListener('click', unlockAudioOnFirstTouch, { passive: true });

function openInExternalBrowser() {
  const isAndroid = /Android/i.test(navigator.userAgent || '');
  const isIOS = /(iPhone|iPad|iPod)/i.test(navigator.userAgent || '');
  const rawUrl = window.location.href;
  const cleanUrl = rawUrl.replace(/^https?:\/\//, '');
  const scheme = window.location.protocol.replace(':', '');

  if (isAndroid) {
    // Android Intent triggers opening in the system's default browser (Chrome)
    const intentUrl = `intent://${cleanUrl}#Intent;scheme=${scheme};action=android.intent.action.VIEW;end`;
    window.location.href = intentUrl;
    setTimeout(() => {
      window.open(rawUrl, '_system');
    }, 400);
  } else if (isIOS) {
    const chromeUrl = `googlechromes://${cleanUrl}`;
    window.location.href = chromeUrl;
    setTimeout(() => {
      notify('Tap ⋮ at top right → Open in Safari');
    }, 600);
  } else {
    window.open(rawUrl, '_blank');
  }
}

const instaModalClose = $('insta-modal-close');
const instaOpenBtn = $('insta-open-btn');
const instaDismissBtn = $('insta-dismiss-btn');
const instaModalBackdrop = $('insta-modal-backdrop');

if (instaModalClose) instaModalClose.addEventListener('click', hideInstaModal);
if (instaDismissBtn) instaDismissBtn.addEventListener('click', hideInstaModal);
if (instaModalBackdrop) instaModalBackdrop.addEventListener('click', hideInstaModal);
if (instaOpenBtn) {
  instaOpenBtn.addEventListener('click', () => {
    openInExternalBrowser();
    hideInstaModal();
  });
}

/* ==========================================================================
   Apple-Style Playlist Drawer Logic & YouTube Search
   ========================================================================== */
const playlistToggle = $('playlist-toggle');
const playlistDrawerWrap = $('playlist-drawer-wrap');
const playlistDrawer = $('playlist-drawer');
const playlistBackdrop = $('playlist-backdrop');
const playlistCloseBtn = $('playlist-close-btn');
const playlistItemsScroll = $('playlist-items-scroll');
const playlistSearch = $('playlist-search');
const playlistSearchClear = $('playlist-search-clear');
const playlistSuggestionsContainer = $('playlist-suggestions-container');
const playlistSuggestionsChips = $('playlist-suggestions-chips');
const playlistCountBadge = $('playlist-count-badge');
const playlistSubtitle = $('playlist-subtitle');
const drawerCurrentTitle = $('drawer-current-title');
const drawerCurrentArtist = $('drawer-current-artist');
const drawerJumpBtn = $('drawer-jump-btn');

let drawerCloseTimer = null;
let currentSearchFilter = '';
let ytSuggestTimer = null;
let ytSearchTimer = null;
let ytSearchRequestId = 0;
let lastYtQuery = '';
let activeYtResults = [];
let isSearchingYt = false;

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function extractYouTubeVideoId(input) {
  if (!input) return null;
  const str = input.trim();
  const match = str.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|shorts\/))([\w-]{11})/i);
  if (match) return match[1];
  if (/^[\w-]{11}$/.test(str)) return str;
  return null;
}

function fetchYouTubeSuggestions(query) {
  return new Promise((resolve) => {
    const q = (query || '').trim();
    if (!q || q.length < 2) {
      resolve([]);
      return;
    }
    const callbackName = `ytSuggest_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
    const script = document.createElement('script');
    let isDone = false;

    const timeout = setTimeout(() => {
      cleanup();
      resolve([]);
    }, 2500);

    function cleanup() {
      if (isDone) return;
      isDone = true;
      clearTimeout(timeout);
      try { delete window[callbackName]; } catch (_) { window[callbackName] = undefined; }
      if (script.parentNode) script.parentNode.removeChild(script);
    }

    window[callbackName] = (data) => {
      cleanup();
      try {
        if (data && Array.isArray(data[1])) {
          const suggestions = data[1].map(item => (Array.isArray(item) ? item[0] : item)).filter(Boolean);
          resolve(suggestions);
        } else {
          resolve([]);
        }
      } catch (e) {
        resolve([]);
      }
    };

    script.onerror = () => {
      cleanup();
      resolve([]);
    };

    script.src = `https://suggestqueries.google.com/complete/search?client=youtube&ds=yt&q=${encodeURIComponent(q)}&jsonp=${callbackName}`;
    document.head.appendChild(script);
  });
}

const PIPED_SEARCH_MIRRORS = [
  'https://api.piped.private.coffee',
  'https://pipedapi.ducks.party'
];

async function searchYouTubeSongs(query, requestId) {
  const q = (query || '').trim();
  if (!q) return [];

  // Check if query is a direct video ID or URL
  const directId = extractYouTubeVideoId(q);
  if (directId) {
    try {
      const res = await fetch(`https://noembed.com/embed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${directId}`)}`);
      if (res.ok) {
        const info = await res.json();
        return [{
          id: directId,
          title: info.title || `YouTube Video (${directId})`,
          artist: info.author_name || 'YouTube',
          durationStr: '',
          albumArt: `https://img.youtube.com/vi/${directId}/hqdefault.jpg`,
          isDirect: true
        }];
      }
    } catch (_) {
      return [{
        id: directId,
        title: `YouTube Video (${directId})`,
        artist: 'YouTube',
        durationStr: '',
        albumArt: `https://img.youtube.com/vi/${directId}/hqdefault.jpg`,
        isDirect: true
      }];
    }
  }

  for (const base of PIPED_SEARCH_MIRRORS) {
    if (requestId !== ytSearchRequestId) return [];
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 4500);
      const res = await fetch(`${base}/search?q=${encodeURIComponent(q)}&filter=all`, {
        signal: controller.signal
      });
      clearTimeout(timer);
      if (!res.ok) continue;
      const data = await res.json();
      if (requestId !== ytSearchRequestId) return [];

      const rawItems = (data.items || []).filter(item => {
        return (item.type === 'stream' || (item.url && item.url.includes('/watch?v='))) && !item.isShort;
      });

      const parsed = rawItems.map(item => {
        const videoId = (item.url || '').replace('/watch?v=', '').split('&')[0];
        const dur = typeof item.duration === 'number' && item.duration > 0 ? formatTime(item.duration) : '';
        return {
          id: videoId,
          title: item.title || 'YouTube Track',
          artist: item.uploaderName || 'YouTube',
          durationStr: dur,
          albumArt: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
          isDirect: false
        };
      }).filter(item => Boolean(item.id) && item.id.length === 11);

      if (parsed.length > 0) {
        return parsed;
      }
    } catch (_) {
      // try next mirror
    }
  }

  return [];
}

const ADMIN_PASSKEY_HASH = '4a1d5cc9d2ab47b32a1d81c93290bba7e549e7871f1e2babaa224b7ab2e6c946';
const VERIFIED_TICK_SVG = `<span class="verified-tick-wrap" title="Verified Station Admin" aria-label="Verified Station Admin"><svg class="verified-tick-icon" viewBox="0 0 24 24" width="14" height="14" fill="#38bdf8" aria-hidden="true"><path d="m10.06 2.37.89-.9c.58-.59 1.52-.59 2.1 0l.89.9a1.5 1.5 0 0 0 1.25.43l1.26-.14c.83-.09 1.59.46 1.76 1.28l.26 1.24c.17.82.77 1.48 1.57 1.71l1.21.36c.8.24 1.28 1.07 1.11 1.9l-.26 1.24a1.5 1.5 0 0 0 .43 1.25l.9.89c.59.58.59 1.52 0 2.1l-.9.89a1.5 1.5 0 0 0-.43 1.25l.26 1.24c.17.83-.31 1.66-1.11 1.9l-1.21.36a1.5 1.5 0 0 0-1.57 1.71l-.26 1.24c-.17.82-.93 1.37-1.76 1.28l-1.26-.14a1.5 1.5 0 0 0-1.25.43l-.89.9c-.58.59-1.52.59-2.1 0l-.89-.9a1.5 1.5 0 0 0-1.25-.43l-1.26.14c-.83.09-1.59-.46-1.76-1.28l-.26-1.24a1.5 1.5 0 0 0-1.57-1.71l-1.21-.36c-.8-.24-1.28-1.07-1.11-1.9l.26-1.24a1.5 1.5 0 0 0-.43-1.25l-.9-.89c-.59-.58-.59-1.52 0-2.1l.9-.89a1.5 1.5 0 0 0 .43-1.25l-.26-1.24c-.17-.83.31-1.66 1.11-1.9l1.21-.36a1.5 1.5 0 0 0 1.57-1.71l.26-1.24c.17-.82.93-1.37 1.76-1.28l1.26.14a1.5 1.5 0 0 0 1.25-.43Zm3.82 7.05-3.88 3.88-1.76-1.76a.75.75 0 0 0-1.06 1.06l2.29 2.29c.3.3.77.3 1.06 0l4.41-4.41a.75.75 0 0 0-1.06-1.06Z"/></svg></span>`;

async function sha256Hex(str) {
  try {
    if (!str || !window.crypto || !window.crypto.subtle) return '';
    const buf = await window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(str.trim()));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
  } catch (e) {
    return '';
  }
}

let isAdminVerified = false;
try {
  if (localStorage.getItem('ksrtc_admin_auth_hash') === ADMIN_PASSKEY_HASH) {
    isAdminVerified = true;
  }
} catch (e) {}

let addSongToGlobalPlaylistFn = null;

function saveStoredCommunitySong(song) {
  try {
    const list = getStoredCommunitySongs();
    if (!list.some(s => s.id === song.id)) {
      list.push({
        id: song.id,
        title: song.title,
        artist: song.artist || 'Community Added',
        albumArt: song.albumArt || `https://img.youtube.com/vi/${song.id}/hqdefault.jpg`,
        isCommunityAdded: true
      });
      localStorage.setItem(SHARED_SONGS_STORAGE_KEY, JSON.stringify(list));
    }
  } catch (_) {}
}

function integrateGlobalSong(songData) {
  if (!songData || !songData.id) return;
  const existing = playlist.find(s => s.id === songData.id);
  if (!existing) {
    const newSong = {
      id: songData.id,
      title: songData.title,
      artist: songData.artist || 'Community Added',
      albumArt: songData.albumArt || `https://img.youtube.com/vi/${songData.id}/hqdefault.jpg`,
      isCommunityAdded: true
    };
    if (playlist.length > state.currentSongIndex + 1) {
      const remainingCount = playlist.length - (state.currentSongIndex + 1);
      const insertOffset = Math.floor(secureRandom() * (remainingCount + 1));
      playlist.splice(state.currentSongIndex + 1 + insertOffset, 0, newSong);
    } else {
      playlist.push(newSong);
    }
    saveStoredCommunitySong(songData);
    if (playlistCountBadge) playlistCountBadge.textContent = String(playlist.length);
    if (playlistSubtitle) playlistSubtitle.textContent = `${playlist.length} songs`;
    if (!currentSearchFilter) {
      renderPlaylist('');
    }
  } else {
    existing.isCommunityAdded = true;
    saveStoredCommunitySong(songData);
    if (!currentSearchFilter) {
      renderPlaylist('');
    }
  }
}

// Ensure all cached community songs are marked in the active playlist
getStoredCommunitySongs().forEach(s => integrateGlobalSong(s));

function addSongToGlobalPlaylist(song) {
  if (!song || !song.id) return;
  integrateGlobalSong(song);
  if (typeof addSongToGlobalPlaylistFn === 'function') {
    addSongToGlobalPlaylistFn(song)
      .then(() => notify(`Added "${song.title}" to Global List for everyone! 🚍`))
      .catch(() => notify(`Added "${song.title}" to Station Playlist! 🚍`));
  } else {
    notify(`Added "${song.title}" to Station Playlist! 🚍`);
  }
}

let deleteSongFromGlobalPlaylistFn = null;

function removeCommunitySongFromPlaylist(songId) {
  if (!songId) return;
  // Remove from localStorage
  try {
    const list = getStoredCommunitySongs().filter(s => s.id !== songId);
    localStorage.setItem(SHARED_SONGS_STORAGE_KEY, JSON.stringify(list));
  } catch (_) {}

  // Remove from playlist array if it was community added
  const idx = playlist.findIndex(s => s.id === songId);
  if (idx !== -1 && playlist[idx].isCommunityAdded) {
    playlist.splice(idx, 1);
    if (state.currentSongIndex >= playlist.length) {
      state.currentSongIndex = Math.max(0, playlist.length - 1);
    }
    if (playlistCountBadge) playlistCountBadge.textContent = String(playlist.length);
    if (playlistSubtitle) playlistSubtitle.textContent = `${playlist.length} songs`;
    renderPlaylist(currentSearchFilter || '');
  }
}

function deleteSongFromGlobalPlaylist(songId) {
  if (!songId || !isAdminVerified) return;
  removeCommunitySongFromPlaylist(songId);
  if (typeof deleteSongFromGlobalPlaylistFn === 'function') {
    deleteSongFromGlobalPlaylistFn(songId)
      .then(() => notify('Song removed from Global List! 🗑️'))
      .catch(() => notify('Failed to remove song.'));
  } else {
    notify('Song removed from Global List! 🗑️');
  }
}

function queueTrackNext(song) {
  if (!song || !song.id) return;
  const insertIndex = state.currentSongIndex >= 0 ? state.currentSongIndex + 1 : playlist.length;

  const existingIdx = playlist.findIndex(s => s.id === song.id);
  if (existingIdx !== -1) {
    if (existingIdx === insertIndex) {
      notify(`"${song.title}" is already playing next! ⏭`);
      return;
    }
    const [item] = playlist.splice(existingIdx, 1);
    const targetIdx = existingIdx < state.currentSongIndex ? state.currentSongIndex : state.currentSongIndex + 1;
    playlist.splice(targetIdx, 0, item);
  } else {
    playlist.splice(insertIndex, 0, {
      id: song.id,
      title: song.title,
      artist: song.artist || 'YouTube',
      albumArt: song.albumArt || `https://img.youtube.com/vi/${song.id}/hqdefault.jpg`
    });
    if (playlistCountBadge) playlistCountBadge.textContent = String(playlist.length);
    if (playlistSubtitle) playlistSubtitle.textContent = `${playlist.length} songs`;
  }

  notify(`Up Next: ${song.title} ⏭`);
  if (!currentSearchFilter) {
    renderPlaylist('');
  }
  updatePlaylistActiveState();
}

function playCustomSong(song) {
  if (!song || !song.id) return;
  let existingIndex = playlist.findIndex(s => s.id === song.id);
  if (existingIndex === -1) {
    const insertIdx = state.currentSongIndex >= 0 ? state.currentSongIndex + 1 : playlist.length;
    playlist.splice(insertIdx, 0, {
      id: song.id,
      title: song.title,
      artist: song.artist,
      albumArt: song.albumArt || `https://img.youtube.com/vi/${song.id}/hqdefault.jpg`
    });
    existingIndex = insertIdx;
    if (playlistCountBadge) playlistCountBadge.textContent = String(playlist.length);
    if (playlistSubtitle) playlistSubtitle.textContent = `${playlist.length} songs`;
  }

  if (!state.isJourneyStarted) {
    startJourney();
  }

  setTrack(existingIndex, true);
  updatePlaylistActiveState();
  notify(`Playing: ${song.title}`);
}

function renderSuggestions(suggestions) {
  if (!playlistSuggestionsContainer || !playlistSuggestionsChips) return;
  if (!suggestions || suggestions.length === 0) {
    playlistSuggestionsContainer.hidden = true;
    playlistSuggestionsChips.innerHTML = '';
    return;
  }

  playlistSuggestionsChips.innerHTML = suggestions.slice(0, 8).map(s => `
    <button type="button" class="search-suggest-chip" data-suggest="${escapeHtml(s)}">
      <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
      <span>${escapeHtml(s)}</span>
    </button>
  `).join('');
  playlistSuggestionsContainer.hidden = false;
}

function updatePlaylistActiveState() {
  const currentTrack = playlist[state.currentSongIndex];
  if (drawerCurrentTitle && currentTrack) {
    drawerCurrentTitle.textContent = currentTrack.title;
  }
  if (drawerCurrentArtist && currentTrack) {
    drawerCurrentArtist.textContent = currentTrack.artist;
  }

  if (!playlistItemsScroll) return;
  const items = playlistItemsScroll.querySelectorAll('.playlist-item[data-index]');
  items.forEach(item => {
    const idx = parseInt(item.dataset.index, 10);
    const isCurrent = idx === state.currentSongIndex;
    item.classList.toggle('is-current', isCurrent);
    item.classList.toggle('is-playing', isCurrent && state.isPlaying);
  });
}

function renderPlaylistSearchResults(filter, localMatches, ytResults, searchingYt) {
  if (!playlistItemsScroll) return;
  let html = '';

  const directItem = ytResults.find(r => r.isDirect);
  if (directItem) {
    const isAdded = playlist.some(s => s.id === directItem.id && s.isCommunityAdded);
    html += `
      <div class="yt-direct-card" data-yt-id="${escapeHtml(directItem.id)}" data-yt-title="${escapeHtml(directItem.title)}" data-yt-artist="${escapeHtml(directItem.artist)}" data-yt-thumb="${escapeHtml(directItem.albumArt)}">
        <div class="yt-direct-thumb-wrap">
          <img src="${directItem.albumArt}" alt="" />
        </div>
        <div class="yt-direct-info">
          <span class="yt-direct-tag">YouTube Link / Video</span>
          <div class="yt-direct-title">${escapeHtml(directItem.title)}</div>
          <div class="yt-direct-artist">${escapeHtml(directItem.artist)}</div>
        </div>
        <div class="yt-actions">
          <button type="button" class="yt-direct-play-btn" title="Play Now">▶ Play</button>
          <button type="button" class="yt-next-pill" title="Play Next in Queue">⏭ Next</button>
          <button type="button" class="yt-add-global-pill ${isAdded ? 'is-added' : ''}" title="Add to station playlist for everyone">${isAdded ? '✓ Added' : '+ Global List'}</button>
        </div>
      </div>
    `;
  }

  if (localMatches.length > 0) {
    html += `
      <div class="playlist-section-header">
        <span>In KSRTC Playlist</span>
        <span class="section-count">${localMatches.length}</span>
      </div>
    `;
    html += localMatches.map(({ song, index }) => {
      const isCurrent = index === state.currentSongIndex;
      const isPlaying = isCurrent && state.isPlaying;
      return `
        <div class="playlist-item ${isCurrent ? 'is-current' : ''} ${isPlaying ? 'is-playing' : ''}" role="button" tabindex="0" data-index="${index}" aria-label="Play ${escapeHtml(song.title)}">
          <span class="item-index">${index + 1}</span>
          <div class="item-thumb-wrap">
            <img class="item-thumb" src="${song.albumArt}" alt="" loading="lazy" />
            <div class="item-eq-bars" aria-hidden="true">
              <i></i><i></i><i></i>
            </div>
          </div>
          <div class="item-meta">
            <div class="item-title">
              ${escapeHtml(song.title)}
              ${song.isCommunityAdded ? '<span class="community-badge" title="Added by Passenger">Global</span>' : ''}
            </div>
            <div class="item-artist">${escapeHtml(song.artist)}</div>
          </div>
          <div class="item-actions">
            ${(isAdminVerified && song.isCommunityAdded) ? `
              <button type="button" class="item-delete-global-btn" data-id="${escapeHtml(song.id)}" data-title="${escapeHtml(song.title)}" title="Delete from Global List" aria-label="Delete song from Global List">
                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.3"><path d="M3 6h18m-2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m-6 5v6m4-6v6"/></svg>
              </button>
            ` : ''}
            <button type="button" class="item-play-next-btn" data-index="${index}" title="Play next in queue">Play Next</button>
          </div>
        </div>
      `;
    }).join('');
  }

  // YouTube section
  html += `
    <div class="playlist-section-header yt-section-header">
      <div class="yt-header-title">
        <svg class="yt-icon" viewBox="0 0 24 24" width="15" height="15" fill="#ef4444"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>
        <span>YouTube Songs</span>
      </div>
      <span class="yt-badge-pill">Search Any Song</span>
    </div>
  `;

  if (searchingYt) {
    html += `
      <div class="yt-searching-state">
        <div class="spinner-dot"></div>
        <span>Searching YouTube for "${escapeHtml(filter)}"...</span>
      </div>
    `;
  } else {
    const listItems = ytResults.filter(r => !r.isDirect);
    if (listItems.length > 0) {
      html += listItems.map(item => {
        const isAdded = playlist.some(s => s.id === item.id && s.isCommunityAdded);
        return `
          <div class="playlist-item yt-playlist-item"
            data-yt-id="${escapeHtml(item.id)}"
            data-yt-title="${escapeHtml(item.title)}"
            data-yt-artist="${escapeHtml(item.artist)}"
            data-yt-thumb="${escapeHtml(item.albumArt)}"
            aria-label="${escapeHtml(item.title)} from YouTube">
            <div class="item-thumb-wrap">
              <img class="item-thumb" src="${item.albumArt}" alt="" loading="lazy" />
              ${item.durationStr ? `<span class="yt-item-duration">${escapeHtml(item.durationStr)}</span>` : ''}
            </div>
            <div class="item-meta">
              <div class="item-title">${escapeHtml(item.title)}</div>
              <div class="item-artist">${escapeHtml(item.artist)}</div>
            </div>
            <div class="yt-actions">
              <button type="button" class="yt-play-pill" title="Play Now">▶ Play</button>
              <button type="button" class="yt-next-pill" title="Play Next in Queue">⏭ Next</button>
              <button type="button" class="yt-add-global-pill ${isAdded ? 'is-added' : ''}" title="Add to station playlist for everyone">${isAdded ? '✓ Added' : '+ Global List'}</button>
            </div>
          </div>
        `;
      }).join('');
    } else if (localMatches.length === 0 && !directItem) {
      html += `
        <div class="yt-empty-state">
          No songs found. Try another query or paste a YouTube video link.
        </div>
      `;
    }
  }

  playlistItemsScroll.innerHTML = html;
  updatePlaylistActiveState();
}

function renderPlaylist(filter = '', isImmediate = false) {
  if (!playlistItemsScroll) return;
  const raw = (filter || '').trim();
  currentSearchFilter = raw.toLowerCase();

  if (!raw) {
    clearTimeout(ytSuggestTimer);
    clearTimeout(ytSearchTimer);
    renderSuggestions([]);
    activeYtResults = [];
    lastYtQuery = '';
    isSearchingYt = false;

    playlistItemsScroll.innerHTML = playlist.map((song, index) => {
      const isCurrent = index === state.currentSongIndex;
      const isPlaying = isCurrent && state.isPlaying;
      return `
        <div class="playlist-item ${isCurrent ? 'is-current' : ''} ${isPlaying ? 'is-playing' : ''}" role="button" tabindex="0" data-index="${index}" aria-label="Play ${escapeHtml(song.title)}">
          <span class="item-index">${index + 1}</span>
          <div class="item-thumb-wrap">
            <img class="item-thumb" src="${song.albumArt}" alt="" loading="lazy" />
            <div class="item-eq-bars" aria-hidden="true">
              <i></i><i></i><i></i>
            </div>
          </div>
          <div class="item-meta">
            <div class="item-title">
              ${escapeHtml(song.title)}
              ${song.isCommunityAdded ? '<span class="community-badge" title="Added by Passenger">Global</span>' : ''}
            </div>
            <div class="item-artist">${escapeHtml(song.artist)}</div>
          </div>
          <div class="item-actions">
            ${(isAdminVerified && song.isCommunityAdded) ? `
              <button type="button" class="item-delete-global-btn" data-id="${escapeHtml(song.id)}" data-title="${escapeHtml(song.title)}" title="Delete from Global List" aria-label="Delete song from Global List">
                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.3"><path d="M3 6h18m-2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m-6 5v6m4-6v6"/></svg>
              </button>
            ` : ''}
            <button type="button" class="item-play-next-btn" data-index="${index}" title="Play next in queue">Play Next</button>
          </div>
        </div>
      `;
    }).join('');

    updatePlaylistActiveState();
    return;
  }

  // Filter local tracks
  const localMatches = playlist
    .map((song, index) => ({ song, index }))
    .filter(({ song }) => {
      const t = (song.title || '').toLowerCase();
      const a = (song.artist || '').toLowerCase();
      return t.includes(currentSearchFilter) || a.includes(currentSearchFilter);
    });

  // Fetch search suggestions (debounced 160ms)
  clearTimeout(ytSuggestTimer);
  ytSuggestTimer = setTimeout(async () => {
    if (raw.length >= 2) {
      const suggestions = await fetchYouTubeSuggestions(raw);
      if (currentSearchFilter) {
        renderSuggestions(suggestions);
      }
    } else {
      renderSuggestions([]);
    }
  }, 160);

  // If search query changed, schedule YouTube search
  if (raw !== lastYtQuery) {
    clearTimeout(ytSearchTimer);
    isSearchingYt = true;
    renderPlaylistSearchResults(raw, localMatches, activeYtResults, isSearchingYt);

    const runYtSearch = async () => {
      ytSearchRequestId += 1;
      const reqId = ytSearchRequestId;
      const results = await searchYouTubeSongs(raw, reqId);
      if (reqId === ytSearchRequestId) {
        isSearchingYt = false;
        lastYtQuery = raw;
        activeYtResults = results;
        renderPlaylistSearchResults(raw, localMatches, activeYtResults, isSearchingYt);
      }
    };

    if (isImmediate) {
      runYtSearch();
    } else {
      ytSearchTimer = setTimeout(runYtSearch, 380);
    }
  } else {
    renderPlaylistSearchResults(raw, localMatches, activeYtResults, isSearchingYt);
  }
}

function scrollToCurrentSong() {
  if (!playlistItemsScroll) return;
  const currentEl = playlistItemsScroll.querySelector('.playlist-item.is-current');
  if (currentEl) {
    currentEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}

function openPlaylistDrawer() {
  if (!playlistDrawerWrap) return;
  if (typeof closeChatDrawer === 'function') {
    closeChatDrawer();
  }
  clearTimeout(drawerCloseTimer);
  playlistDrawerWrap.hidden = false;
  void playlistDrawerWrap.offsetWidth; // force browser layout recalculation
  playlistDrawerWrap.classList.add('is-open');
  if (playlistToggle) playlistToggle.setAttribute('aria-expanded', 'true');
  updatePlaylistActiveState();

  setTimeout(() => {
    scrollToCurrentSong();
  }, 120);
}

function closePlaylistDrawer() {
  if (!playlistDrawerWrap) return;
  playlistDrawerWrap.classList.remove('is-open');
  if (playlistToggle) playlistToggle.setAttribute('aria-expanded', 'false');
  clearTimeout(drawerCloseTimer);
  drawerCloseTimer = setTimeout(() => {
    if (!playlistDrawerWrap.classList.contains('is-open')) {
      playlistDrawerWrap.hidden = true;
    }
  }, 380);
}

function togglePlaylistDrawer() {
  if (playlistDrawerWrap && playlistDrawerWrap.classList.contains('is-open')) {
    closePlaylistDrawer();
  } else {
    openPlaylistDrawer();
  }
}

// Wire up events
if (playlistToggle) {
  playlistToggle.addEventListener('click', togglePlaylistDrawer);
}
if (playlistCloseBtn) {
  playlistCloseBtn.addEventListener('click', closePlaylistDrawer);
}
if (playlistBackdrop) {
  playlistBackdrop.addEventListener('click', closePlaylistDrawer);
}

if (playlistItemsScroll) {
  playlistItemsScroll.addEventListener('click', (e) => {
    // 1. Explicit Add to Global List (+ Global List)
    const addGlobalBtn = e.target.closest('.yt-add-global-pill');
    if (addGlobalBtn) {
      e.stopPropagation();
      const parent = addGlobalBtn.closest('.yt-playlist-item, .yt-direct-card');
      if (parent) {
        const id = parent.dataset.ytId;
        const title = parent.dataset.ytTitle || 'YouTube Song';
        const artist = parent.dataset.ytArtist || 'YouTube';
        const albumArt = parent.dataset.ytThumb || `https://img.youtube.com/vi/${id}/hqdefault.jpg`;
        if (id) {
          showGlobalAddModal({ id, title, artist, albumArt }, addGlobalBtn);
        }
      }
      return;
    }

    // 2. Play Next on YouTube item (⏭ Next)
    const ytNextBtn = e.target.closest('.yt-next-pill');
    if (ytNextBtn) {
      e.stopPropagation();
      const parent = ytNextBtn.closest('.yt-playlist-item, .yt-direct-card');
      if (parent) {
        const id = parent.dataset.ytId;
        const title = parent.dataset.ytTitle || 'YouTube Song';
        const artist = parent.dataset.ytArtist || 'YouTube';
        const albumArt = parent.dataset.ytThumb || `https://img.youtube.com/vi/${id}/hqdefault.jpg`;
        if (id) {
          queueTrackNext({ id, title, artist, albumArt });
        }
      }
      return;
    }

    // Admin Delete from Global List (🗑️)
    const delGlobalBtn = e.target.closest('.item-delete-global-btn');
    if (delGlobalBtn) {
      e.stopPropagation();
      if (!isAdminVerified) {
        notify('Admin authorization required.');
        return;
      }
      const songId = delGlobalBtn.dataset.id;
      const songTitle = delGlobalBtn.dataset.title || 'this song';
      if (confirm(`Remove "${songTitle}" from the Global Station Playlist for everyone?`)) {
        deleteSongFromGlobalPlaylist(songId);
      }
      return;
    }

    // 3. Play Next on Curated / Local playlist item
    const itemNextBtn = e.target.closest('.item-play-next-btn');
    if (itemNextBtn) {
      e.stopPropagation();
      const index = parseInt(itemNextBtn.dataset.index, 10);
      if (!Number.isNaN(index) && playlist[index]) {
        queueTrackNext(playlist[index]);
      }
      return;
    }

    // 4. YouTube result or direct video play (card click or ▶ Play button)
    const ytItem = e.target.closest('.yt-playlist-item, .yt-direct-card');
    if (ytItem) {
      const id = ytItem.dataset.ytId;
      const title = ytItem.dataset.ytTitle || 'YouTube Song';
      const artist = ytItem.dataset.ytArtist || 'YouTube';
      const albumArt = ytItem.dataset.ytThumb || `https://img.youtube.com/vi/${id}/hqdefault.jpg`;
      if (id) {
        playCustomSong({ id, title, artist, albumArt });
      }
      return;
    }

    // 5. Curated local playlist item click
    const itemBtn = e.target.closest('.playlist-item');
    if (!itemBtn) return;
    const index = parseInt(itemBtn.dataset.index, 10);
    if (!Number.isNaN(index) && playlist[index]) {
      if (!state.isJourneyStarted) {
        startJourney();
      }
      setTrack(index, true);
      updatePlaylistActiveState();
      notify(`Playing: ${playlist[index].title}`);
    }
  });

  // Support keyboard Enter or Space on focused playlist-item
  playlistItemsScroll.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      if (e.target.classList.contains('playlist-item') && !e.target.closest('.item-actions, .yt-actions')) {
        e.preventDefault();
        e.target.click();
      }
    }
  });
}

if (playlistSuggestionsChips) {
  playlistSuggestionsChips.addEventListener('click', (e) => {
    const chip = e.target.closest('.search-suggest-chip');
    if (!chip) return;
    const q = chip.dataset.suggest;
    if (q && playlistSearch) {
      playlistSearch.value = q;
      if (playlistSearchClear) playlistSearchClear.hidden = false;
      renderSuggestions([]);
      renderPlaylist(q, true);
    }
  });
}

if (playlistSearch) {
  playlistSearch.addEventListener('input', (e) => {
    const val = e.target.value;
    if (playlistSearchClear) {
      playlistSearchClear.hidden = !val;
    }
    renderPlaylist(val, false);
  });
}

if (playlistSearchClear) {
  playlistSearchClear.addEventListener('click', () => {
    if (playlistSearch) {
      playlistSearch.value = '';
      playlistSearch.focus();
    }
    playlistSearchClear.hidden = true;
    renderSuggestions([]);
    renderPlaylist('');
  });
}

if (drawerJumpBtn) {
  drawerJumpBtn.addEventListener('click', () => {
    if (!state.isJourneyStarted) {
      startJourney();
    }
    const nextIdx = (state.currentSongIndex + 1) % playlist.length;
    setTrack(nextIdx, true);
    notify(`Playing next: ${playlist[nextIdx].title} ⏭`);
    setTimeout(scrollToCurrentSong, 80);
  });
}

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (playlistDrawerWrap && !playlistDrawerWrap.hidden) {
      closePlaylistDrawer();
    }
    if (typeof closeChatDrawer === 'function' && chatDrawerWrap && !chatDrawerWrap.hidden) {
      closeChatDrawer();
    }
  }
});

// Set playlist count badges
if (playlistCountBadge) playlistCountBadge.textContent = String(playlist.length);
if (playlistSubtitle) playlistSubtitle.textContent = `${playlist.length} songs`;

// Initialize list rendering
renderPlaylist('');
updatePlaylistActiveState();

/* ==========================================================================
   Apple-Style Fullscreen Controller (Enter / Exit)
   ========================================================================== */
function isFullscreenActive() {
  return Boolean(
    document.fullscreenElement ||
    document.webkitFullscreenElement ||
    document.mozFullScreenElement ||
    document.msFullscreenElement
  );
}

function updateFullscreenUI() {
  if (!els.fullscreenBtn) return;
  const active = isFullscreenActive();
  els.fullscreenBtn.classList.toggle('is-active', active);
  els.fullscreenBtn.setAttribute('aria-label', active ? 'Exit fullscreen' : 'Enter fullscreen');
  els.fullscreenBtn.title = active ? 'Exit Fullscreen' : 'Enter Fullscreen';
}

function toggleFullscreen() {
  const doc = document;
  const docEl = document.documentElement;

  if (!isFullscreenActive()) {
    const requestFs =
      docEl.requestFullscreen ||
      docEl.webkitRequestFullscreen ||
      docEl.mozRequestFullScreen ||
      docEl.msRequestFullscreen;
    if (requestFs) {
      try {
        const res = requestFs.call(docEl);
        if (res && typeof res.catch === 'function') {
          res.catch(() => {});
        }
      } catch (e) {}
    }
  } else {
    const exitFs =
      doc.exitFullscreen ||
      doc.webkitExitFullscreen ||
      doc.mozCancelFullScreen ||
      doc.msExitFullscreen;
    if (exitFs) {
      try {
        const res = exitFs.call(doc);
        if (res && typeof res.catch === 'function') {
          res.catch(() => {});
        }
      } catch (e) {}
    }
  }
  setTimeout(updateFullscreenUI, 80);
}

if (els.fullscreenBtn) {
  els.fullscreenBtn.addEventListener('click', toggleFullscreen);
}

['fullscreenchange', 'webkitfullscreenchange', 'mozfullscreenchange', 'MSFullscreenChange'].forEach((evt) => {
  document.addEventListener(evt, updateFullscreenUI);
});
updateFullscreenUI();

/* ==========================================================================
   Apple-Style Live Passenger Chat Controller & Real-Time Presence
   Frictionless live chat and listener presence aboard KSRTC Radio
   ========================================================================== */
const chatToggle = $('chat-toggle');
const chatDrawerWrap = $('chat-drawer-wrap');
const chatDrawer = $('chat-drawer');
const chatBackdrop = $('chat-backdrop');
const chatCloseBtn = $('chat-close-btn');
const chatUsernameInput = $('chat-username-input');
const chatMessagesContainer = $('chat-messages-container');
const chatEmptyState = $('chat-empty-state');
const chatForm = $('chat-form');
const chatMessageInput = $('chat-message-input');
const chatSendBtn = $('chat-send-btn');
const chatUnreadDot = $('chat-unread-dot');
const CHAT_SOUND_MUTED_KEY = 'ksrtc_chat_sound_muted';
let isChatNotificationMuted = false;
try {
  isChatNotificationMuted = localStorage.getItem(CHAT_SOUND_MUTED_KEY) === 'true';
} catch (e) {
  isChatNotificationMuted = false;
}
const chatMuteBtn = $('chat-mute-btn');
const chatOptionsMenu = $('chat-options-menu');
const chatOptionsToggleSound = $('chat-options-toggle-sound');
const chatOptionsSoundIcon = $('chat-options-sound-icon');
const chatOptionsSoundLabel = $('chat-options-sound-label');
const chatOptionsViewRules = $('chat-options-view-rules');
const chatSystemNote = $('chat-system-note');
const chatSystemNoteClose = $('chat-system-note-close');
const chatPopBubble = $('chat-pop-bubble');
const chatPopSender = $('chat-pop-sender');
const chatPopText = $('chat-pop-text');
const desktopRecentChatsContainer = $('desktop-recent-chats');
const desktopRecentChatsList = [];
const chatReplyBar = $('chat-reply-bar');
const chatReplyBarAccent = $('chat-reply-bar-accent');
const chatReplyBarTitle = $('chat-reply-bar-title');
const chatReplyBarSnippet = $('chat-reply-bar-snippet');
const chatReplyCancelBtn = $('chat-reply-cancel-btn');

// Media & Drawer DOM Elements
const chatEmojiDrawer = $('chat-emoji-drawer');
const chatEmojiCloseBtn = $('chat-emoji-close-btn');
const chatEmojiGrid = $('chat-emoji-grid');
const chatEmojiCats = $('chat-emoji-cats');
const chatGifDrawer = $('chat-gif-drawer');
const chatGifCloseBtn = $('chat-gif-close-btn');
const chatGifSearchInput = $('chat-gif-search-input');
const chatGifSearchClear = $('chat-gif-search-clear');
const chatGifCatPills = $('chat-gif-cat-pills');
const chatGifCountBadge = $('chat-gif-count-badge');
const chatGifGrid = $('chat-gif-grid');
const chatAttachmentBar = $('chat-attachment-bar');
const chatAttachmentThumb = $('chat-attachment-thumb');
const chatAttachmentBadge = $('chat-attachment-badge');
const chatAttachmentName = $('chat-attachment-name');
const chatAttachmentRemoveBtn = $('chat-attachment-remove-btn');
const chatFileInput = $('chat-file-input');
const chatLightbox = $('chat-lightbox');
const chatLightboxImg = $('chat-lightbox-img');
const chatLightboxClose = $('chat-lightbox-close');
const chatLightboxBackdrop = $('chat-lightbox-backdrop');

let currentAttachment = null;
let currentReplyTo = null;
let toggleLikeChatMessageFn = null;
const localLikedMsgIds = new Set();
const likeListenerUnsubs = new Map();

let chatDrawerCloseTimer = null;
let lastChatMessageTime = 0;
let isChatConnected = false;
let sendChatMessageFn = null;
let deleteChatMessageFn = null;
let pinChatMessageFn = null;
let unpinChatMessageFn = null;
let currentPinnedMessage = null;
let popBubbleTimer = null;
let popBubbleFadeTimer = null;
const CHAT_USERNAME_KEY = 'ksrtc_chat_passenger_name';
const CHAT_GENDER_KEY = 'ksrtc_chat_passenger_gender';
const CHAT_NOTE_DISMISSED_KEY = 'ksrtc_chat_note_dismissed';

function getStoredOrRandomGender() {
  try {
    const saved = localStorage.getItem(CHAT_GENDER_KEY);
    if (saved === 'M' || saved === 'F') return saved;
  } catch (e) {}
  const defaultGender = Math.random() > 0.5 ? 'M' : 'F';
  try { localStorage.setItem(CHAT_GENDER_KEY, defaultGender); } catch (e) {}
  return defaultGender;
}

let currentChatGender = getStoredOrRandomGender();

function getPassengerGenderFallback(name) {
  if (!name) return 'M';
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  return (Math.abs(hash) % 2 === 0) ? 'M' : 'F';
}

function updateGenderUI() {
  const mBtn = $('chat-gender-m');
  const fBtn = $('chat-gender-f');
  if (mBtn && fBtn) {
    mBtn.classList.toggle('is-active', currentChatGender === 'M');
    mBtn.setAttribute('aria-checked', String(currentChatGender === 'M'));
    fBtn.classList.toggle('is-active', currentChatGender === 'F');
    fBtn.setAttribute('aria-checked', String(currentChatGender === 'F'));
  }
}



function updateAdminUI() {
  const verifiedBadge = $('chat-verified-badge');
  if (verifiedBadge) {
    verifiedBadge.hidden = !isAdminVerified;
  }
  if (chatDrawerWrap) {
    chatDrawerWrap.classList.toggle('is-admin-mode', Boolean(isAdminVerified));
  }
  const unpinBtn = $('chat-unpin-btn');
  if (unpinBtn) {
    unpinBtn.hidden = !isAdminVerified;
  }
  if (chatUsernameInput && isAdminVerified) {
    chatUsernameInput.value = 'Admin';
    chatUsernameInput.style.color = '#38bdf8';
  }
  if (typeof renderPlaylist === 'function') {
    renderPlaylist(currentSearchFilter || '');
  }
}

// Curated vibrant, high-contrast palette for passenger name tags
const PASSENGER_COLORS = [
  '#38bdf8', // Sky Blue
  '#f472b6', // Coral Rose
  '#fbbf24', // Warm Amber Gold
  '#a78bfa', // Lavender Violet
  '#34d399', // Emerald Mint
  '#fb923c', // Tangerine Orange
  '#22d3ee', // Cyan
  '#f87171', // Coral Red
  '#e879f9', // Orchid Pink
  '#4ade80', // Lime
  '#facc15', // Sunflower Yellow
  '#60a5fa', // Cornflower Blue
  '#c084fc', // Bright Purple
  '#2dd4bf', // Teal
  '#fda4af', // Blossom Peach
  '#818cf8', // Indigo
];

function getPassengerColor(name) {
  if (!name || typeof name !== 'string') return PASSENGER_COLORS[0];
  let hash = 0;
  const clean = name.trim().toLowerCase();
  for (let i = 0; i < clean.length; i++) {
    hash = ((hash << 5) - hash) + clean.charCodeAt(i);
    hash |= 0;
  }
  return PASSENGER_COLORS[Math.abs(hash) % PASSENGER_COLORS.length];
}


/* ==========================================================================
   Apple-Style Pop-up Message Balloon (Floats on top of the song slider)
   ========================================================================== */
function triggerSongPoppingMessage(senderName, text, color, isVerified = false, gender = '', replyTo = null) {
  if (!chatPopBubble || !chatPopSender || !chatPopText) return;
  if (!senderName || senderName.toLowerCase() === 'system') return;
  if (typeof isChatOpen === 'function' && isChatOpen()) return;

  clearTimeout(popBubbleTimer);
  clearTimeout(popBubbleFadeTimer);

  const genderHtml = (gender === 'M' || gender === 'F')
    ? ` <span class="chat-gender-tag gender-${gender.toLowerCase()}">${gender}</span>`
    : '';

  const replyHtml = (replyTo && replyTo.name)
    ? ` <span class="chat-pop-reply-tag">↳ ${escapeHtml(replyTo.name)}</span>`
    : '';

  if (isVerified) {
    chatPopSender.innerHTML = `<span class="chat-sender-name chat-admin-sender-name">👑 ${escapeHtml(senderName)}</span>${genderHtml}${replyHtml} ${VERIFIED_TICK_SVG} <span class="chat-admin-pill-tag">OFFICIAL</span>`;
    chatPopBubble.classList.add('is-admin-pop');
  } else {
    chatPopSender.innerHTML = `<span class="chat-sender-name">${escapeHtml(senderName)}</span>${genderHtml}${replyHtml}`;
    chatPopBubble.classList.remove('is-admin-pop');
  }
  chatPopSender.style.color = isVerified ? '#f5c871' : color;
  chatPopText.textContent = text;

  chatPopBubble.classList.remove('is-leaving');
  chatPopBubble.hidden = false;
  void chatPopBubble.offsetWidth; // Force layout recalculation for fresh CSS animation
  chatPopBubble.classList.add('is-popping');

  // Pop message balloon disappears after exactly 2 seconds
  popBubbleTimer = setTimeout(() => {
    chatPopBubble.classList.add('is-leaving');
    chatPopBubble.classList.remove('is-popping');

    popBubbleFadeTimer = setTimeout(() => {
      chatPopBubble.hidden = true;
      chatPopBubble.classList.remove('is-leaving');
      chatPopBubble.classList.remove('is-admin-pop');
    }, 240);
  }, 2000);
}

if (chatPopBubble) {
  chatPopBubble.addEventListener('click', () => {
    openChatDrawer();
  });
}

/* ==========================================================================
   Desktop Live Chat Overlay Stream (Bottom-Left Corner on Computer)
   Shows exact recent 5 messages directly from Passenger Chat & Firebase for 5 seconds
   ========================================================================== */
let desktopRecentChatsTimer = null;
let desktopRecentChatsFadeTimer = null;

const RECENT_CHATS_STORAGE_KEY = 'ksrtc_desktop_recent_chats_v2';
try {
  localStorage.removeItem('ksrtc_desktop_recent_chats_v1');
} catch (e) {}

function loadCachedRecentChats() {
  try {
    const raw = localStorage.getItem(RECENT_CHATS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.filter(item => item && item.id && !String(item.id).startsWith('def_') && item.name && item.text);
      }
    }
  } catch (e) {}
  return [];
}

function saveCachedRecentChats() {
  try {
    const validItems = desktopRecentChatsList.filter(item => item && item.id && !String(item.id).startsWith('def_')).slice(-5);
    localStorage.setItem(RECENT_CHATS_STORAGE_KEY, JSON.stringify(validItems));
  } catch (e) {}
}

function getRecentChatItemFromData(msgId, data) {
  if (!msgId || !data || msgId === '_pinned' || String(msgId).startsWith('def_')) return null;
  const senderName = (data.name || 'Passenger').slice(0, 24);
  if (senderName.toLowerCase() === 'system' || data.session === 'system_bot') return null;

  const text = (data.text || '').trim();
  const snippet = text || (data.imageUrl ? '📷 Shared a photo' : (data.gifUrl ? '🎞️ Shared a GIF' : ''));
  if (!snippet) return null;

  const isMe = data.session === mySessionId;
  const isVerified = Boolean(
    (data.isAdmin === true && (data.adminToken === ADMIN_PASSKEY_HASH || data.adminKey === ADMIN_PASSKEY_HASH)) ||
    (senderName.toLowerCase() === 'admin' && (data.adminToken === ADMIN_PASSKEY_HASH || data.adminKey === ADMIN_PASSKEY_HASH || data.isAdmin === true)) ||
    (isMe && isAdminVerified)
  );

  let displayName = senderName;
  if (isMe) {
    displayName = isVerified ? '👑 You' : 'You';
  } else if (isVerified) {
    displayName = '👑 Admin';
  }
  const tagColor = isVerified ? '#f5c871' : (isMe ? '#38bdf8' : getPassengerColor(senderName));

  return { id: msgId, name: displayName, text: snippet, color: tagColor, isMe: Boolean(isMe) };
}

function renderDesktopRecentChats() {
  if (!desktopRecentChatsContainer) return;
  const realItems = desktopRecentChatsList.filter(item => item && item.id && !String(item.id).startsWith('def_')).slice(-5);
  if (realItems.length === 0) {
    desktopRecentChatsContainer.innerHTML = '';
    return;
  }
  desktopRecentChatsContainer.innerHTML = realItems.map(item => `
    <div class="desktop-chat-item ${item.isMe ? 'is-me' : ''}" data-id="${escapeHtml(item.id)}" title="Click to open Passenger Chat">
      <span class="desktop-chat-sender ${item.isMe ? 'is-me' : ''}" style="color: ${item.color || '#38bdf8'};">${escapeHtml(item.name)}:</span>
      <span class="desktop-chat-text">${escapeHtml(item.text)}</span>
    </div>
  `).join('');
}

function syncDesktopRecentChatsFromDOM() {
  if (!chatMessagesContainer) return;
  const msgRows = chatMessagesContainer.querySelectorAll('.chat-msg-row[data-id], .chat-msg[data-id]');
  if (msgRows.length === 0) return;
  const recentRows = Array.from(msgRows).filter(row => {
    const id = row.dataset.id;
    return id && id !== '_pinned' && !id.startsWith('def_');
  }).slice(-5);
  if (recentRows.length === 0) return;

  const syncedList = [];
  recentRows.forEach(row => {
    const id = row.dataset.id;
    const senderEl = row.querySelector('.chat-sender-name') || row.querySelector('.chat-msg-sender');
    const textEl = row.querySelector('.chat-msg-text');
    const mediaBadge = row.querySelector('.chat-msg-gif-badge');
    const hasPhoto = row.querySelector('.chat-msg-media-img:not(.chat-msg-gif-img)');
    let snippet = textEl ? textEl.textContent.trim() : '';
    if (!snippet) {
      if (mediaBadge) snippet = '🎞️ Shared a GIF';
      else if (hasPhoto) snippet = '📷 Shared a photo';
    }
    const isMe = row.classList.contains('is-me');
    const isVerified = Boolean(row.querySelector('.chat-admin-sender-name, .verified-tick-icon') || row.classList.contains('is-admin-msg'));
    const rawName = senderEl ? senderEl.textContent.trim().replace(/^👑\s*/, '') : 'Passenger';
    let displayName = rawName;
    if (isMe) {
      displayName = isVerified ? '👑 You' : 'You';
    } else if (isVerified) {
      displayName = '👑 Admin';
    }
    const color = isVerified ? '#f5c871' : (isMe ? '#38bdf8' : (row.querySelector('.chat-msg-sender')?.style?.color || getPassengerColor(rawName)));
    if (snippet) {
      syncedList.push({ id, name: displayName, text: snippet, color, isMe: Boolean(isMe) });
    }
  });

  if (syncedList.length > 0) {
    desktopRecentChatsList.length = 0;
    desktopRecentChatsList.push(...syncedList);
    saveCachedRecentChats();
    renderDesktopRecentChats();
  }
}

function triggerDesktopRecentChatsReveal(durationMs = 5000) {
  if (!desktopRecentChatsContainer) return;
  // If passenger chat is already open or notifications are muted, never pop or reveal desktop overlay
  if ((typeof isChatOpen === 'function' && isChatOpen()) || isChatNotificationMuted) {
    desktopRecentChatsContainer.classList.remove('is-visible', 'is-fading');
    return;
  }
  if (desktopRecentChatsList.length === 0) {
    syncDesktopRecentChatsFromDOM();
  }
  const realItems = desktopRecentChatsList.filter(item => item && item.id && !String(item.id).startsWith('def_'));
  if (realItems.length === 0) {
    desktopRecentChatsContainer.classList.remove('is-visible', 'is-fading');
    return;
  }
  renderDesktopRecentChats();

  clearTimeout(desktopRecentChatsTimer);
  clearTimeout(desktopRecentChatsFadeTimer);

  desktopRecentChatsContainer.classList.remove('is-fading');
  desktopRecentChatsContainer.classList.add('is-visible');

  desktopRecentChatsTimer = setTimeout(() => {
    desktopRecentChatsContainer.classList.add('is-fading');
    desktopRecentChatsFadeTimer = setTimeout(() => {
      desktopRecentChatsContainer.classList.remove('is-visible');
      desktopRecentChatsContainer.classList.remove('is-fading');
    }, 400);
  }, durationMs);
}

function updateDesktopRecentChats(msgId, data, isLive = false) {
  if (!desktopRecentChatsContainer || !data) return;
  const item = getRecentChatItemFromData(msgId, data);
  if (!item) return;

  const existingIdx = desktopRecentChatsList.findIndex(i => i.id === msgId);
  if (existingIdx !== -1) {
    desktopRecentChatsList[existingIdx] = item;
  } else {
    desktopRecentChatsList.push(item);
    if (desktopRecentChatsList.length > 5) {
      desktopRecentChatsList.shift();
    }
  }

  saveCachedRecentChats();
  renderDesktopRecentChats();

  // When a new live message comes in, reveal for 5 seconds (ONLY if chat is NOT open AND notifications are NOT muted!)
  if (isLive) {
    if (typeof isChatOpen === 'function' && isChatOpen()) return;
    if (isChatNotificationMuted) return;
    triggerDesktopRecentChatsReveal(5000);
  }
}

// Load cached actual messages on initialization
desktopRecentChatsList.push(...loadCachedRecentChats());
if (desktopRecentChatsList.length === 0) {
  syncDesktopRecentChatsFromDOM();
} else {
  renderDesktopRecentChats();
}

// Fast-boot: Fetch exact latest messages directly from Firebase
try {
  fetch('https://ksrtc-radio-default-rtdb.firebaseio.com/messages.json')
    .then(r => r.json())
    .then(data => {
      if (!data || typeof data !== 'object') return;
      const keys = Object.keys(data).filter(k => k !== '_pinned' && !k.startsWith('def_'));
      if (keys.length === 0) return;
      keys.sort((a, b) => ((data[a] && data[a].timestamp) || 0) - ((data[b] && data[b].timestamp) || 0));
      const latest5 = keys.slice(-5);
      const fetchedItems = latest5.map(k => getRecentChatItemFromData(k, data[k])).filter(Boolean);
      if (fetchedItems.length > 0) {
        desktopRecentChatsList.length = 0;
        desktopRecentChatsList.push(...fetchedItems);
        saveCachedRecentChats();
        renderDesktopRecentChats();
      }
    })
    .catch(() => {});
} catch (e) {}

if (desktopRecentChatsContainer) {
  desktopRecentChatsContainer.addEventListener('click', (e) => {
    const item = e.target.closest('.desktop-chat-item');
    openChatDrawer();
    if (item && item.dataset.id && chatMessagesContainer) {
      setTimeout(() => {
        const target = chatMessagesContainer.querySelector(`.chat-msg-row[data-id="${item.dataset.id}"], .chat-msg[data-id="${item.dataset.id}"]`);
        if (target) {
          target.scrollIntoView({ behavior: 'smooth', block: 'center' });
          target.classList.add('is-highlighted');
          setTimeout(() => target.classList.remove('is-highlighted'), 1400);
        }
      }, 200);
    }
  });

  desktopRecentChatsContainer.addEventListener('mouseenter', () => {
    if (isChatNotificationMuted) return;
    clearTimeout(desktopRecentChatsTimer);
    clearTimeout(desktopRecentChatsFadeTimer);
    desktopRecentChatsContainer.classList.remove('is-fading');
    desktopRecentChatsContainer.classList.add('is-visible');
  });

  desktopRecentChatsContainer.addEventListener('mouseleave', () => {
    clearTimeout(desktopRecentChatsTimer);
    desktopRecentChatsTimer = setTimeout(() => {
      desktopRecentChatsContainer.classList.add('is-fading');
      desktopRecentChatsFadeTimer = setTimeout(() => {
        desktopRecentChatsContainer.classList.remove('is-visible');
        desktopRecentChatsContainer.classList.remove('is-fading');
      }, 400);
    }, 3000);
  });

  renderDesktopRecentChats();
}

// Station Welcome & Guidelines Note dismissal handling
if (chatSystemNote) {
  try {
    if (localStorage.getItem(CHAT_NOTE_DISMISSED_KEY) === 'true') {
      chatSystemNote.hidden = true;
    }
  } catch (e) {}

  if (chatSystemNoteClose) {
    chatSystemNoteClose.addEventListener('click', (e) => {
      e.stopPropagation();
      chatSystemNote.style.opacity = '0';
      chatSystemNote.style.transform = 'translateY(-4px) scale(0.98)';
      setTimeout(() => {
        chatSystemNote.hidden = true;
      }, 200);
      try {
        localStorage.setItem(CHAT_NOTE_DISMISSED_KEY, 'true');
      } catch (err) {}
    });
  }
}

function isChatOpen() {
  return Boolean(chatDrawerWrap && chatDrawerWrap.classList.contains('is-open'));
}

function openChatDrawer() {
  if (!chatDrawerWrap) return;
  if (typeof closePlaylistDrawer === 'function') {
    closePlaylistDrawer();
  }
  clearTimeout(chatDrawerCloseTimer);
  chatDrawerWrap.hidden = false;
  void chatDrawerWrap.offsetWidth;
  chatDrawerWrap.classList.add('is-open');
  if (chatToggle) {
    chatToggle.setAttribute('aria-expanded', 'true');
    chatToggle.classList.remove('is-breathing');
  }
  if (chatUnreadDot) {
    chatUnreadDot.hidden = true;
  }

  // Dismiss any floating popups or desktop overlays when chat drawer is opened
  if (desktopRecentChatsContainer) {
    clearTimeout(desktopRecentChatsTimer);
    clearTimeout(desktopRecentChatsFadeTimer);
    desktopRecentChatsContainer.classList.remove('is-visible', 'is-fading');
  }
  if (chatPopBubble) {
    clearTimeout(popBubbleTimer);
    clearTimeout(popBubbleFadeTimer);
    chatPopBubble.hidden = true;
    chatPopBubble.classList.remove('is-popping', 'is-leaving', 'is-admin-pop');
  }

  const mainLive = $('live-count');
  const chatLive = $('chat-live-count');
  if (chatLive && mainLive && mainLive.textContent) {
    chatLive.textContent = mainLive.textContent;
  }

  if (chatMessagesContainer) {
    chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;
  }

  setTimeout(() => {
    if (chatMessageInput && !('ontouchstart' in window)) {
      chatMessageInput.focus();
    }
  }, 140);
}

function closeChatDrawer() {
  if (!chatDrawerWrap) return;
  chatDrawerWrap.classList.remove('is-open');
  if (chatToggle) chatToggle.setAttribute('aria-expanded', 'false');
  if (chatOptionsMenu) chatOptionsMenu.hidden = true;
  if (chatOptionsBtn) chatOptionsBtn.setAttribute('aria-expanded', 'false');
  clearTimeout(chatDrawerCloseTimer);
  chatDrawerCloseTimer = setTimeout(() => {
    if (!chatDrawerWrap.classList.contains('is-open')) {
      chatDrawerWrap.hidden = true;
    }
  }, 380);
}

function toggleChatDrawer() {
  if (isChatOpen()) {
    closeChatDrawer();
  } else {
    openChatDrawer();
  }
}

if (chatToggle) {
  chatToggle.addEventListener('click', toggleChatDrawer);
}
if (chatCloseBtn) {
  chatCloseBtn.addEventListener('click', closeChatDrawer);
}
if (chatBackdrop) {
  chatBackdrop.addEventListener('click', closeChatDrawer);
}

function getStoredOrRandomUsername() {
  try {
    if (localStorage.getItem('ksrtc_admin_auth_hash') === ADMIN_PASSKEY_HASH) {
      isAdminVerified = true;
      return 'Admin';
    }
    const saved = localStorage.getItem(CHAT_USERNAME_KEY);
    if (saved && saved.trim()) {
      if (saved.trim().toLowerCase() === 'admin') {
        // Not verified admin, discard
      } else {
        return saved.trim().slice(0, 24);
      }
    }
  } catch (e) {}

  const randomNum = Math.floor(100 + Math.random() * 900);
  const defaultName = `Passenger #${randomNum}`;
  try {
    localStorage.setItem(CHAT_USERNAME_KEY, defaultName);
  } catch (e) {}
  return defaultName;
}

let currentChatUsername = getStoredOrRandomUsername();

async function processUsernameInput(rawVal) {
  const trimmed = rawVal.trim();
  const lower = trimmed.toLowerCase();

  // Test hash of entered value against secret passkey hash
  const hashedInput = await sha256Hex(trimmed);
  if (hashedInput === ADMIN_PASSKEY_HASH) {
    isAdminVerified = true;
    currentChatUsername = 'Admin';
    try {
      localStorage.setItem('ksrtc_admin_auth_hash', ADMIN_PASSKEY_HASH);
      localStorage.setItem(CHAT_USERNAME_KEY, 'Admin');
      localStorage.removeItem('ksrtc_admin_auth_key');
    } catch (e) {}
    if (chatUsernameInput) {
      chatUsernameInput.value = 'Admin';
      chatUsernameInput.style.color = '#38bdf8';
    }
    updateAdminUI();
    notify('Station Admin verified!');
    return;
  }

  // If someone tries to use the name "Admin" without the secret key
  if (lower === 'admin') {
    if (isAdminVerified) {
      return; // Already verified admin
    }
    notify('The name "Admin" is reserved.');
    currentChatUsername = `Passenger #${Math.floor(100 + Math.random() * 900)}`;
    try {
      localStorage.setItem(CHAT_USERNAME_KEY, currentChatUsername);
      localStorage.removeItem('ksrtc_admin_auth_hash');
      localStorage.removeItem('ksrtc_admin_auth_key');
    } catch (e) {}
    if (chatUsernameInput) {
      chatUsernameInput.value = currentChatUsername;
      chatUsernameInput.style.color = getPassengerColor(currentChatUsername);
    }
    isAdminVerified = false;
    updateAdminUI();
    return;
  }

  // If previous admin changed name away from Admin
  if (isAdminVerified && lower !== 'admin') {
    isAdminVerified = false;
    try {
      localStorage.removeItem('ksrtc_admin_auth_hash');
      localStorage.removeItem('ksrtc_admin_auth_key');
    } catch (e) {}
    updateAdminUI();
  }

  currentChatUsername = trimmed.slice(0, 24) || 'Passenger';
  if (chatUsernameInput) {
    chatUsernameInput.style.color = getPassengerColor(currentChatUsername);
  }
  try {
    localStorage.setItem(CHAT_USERNAME_KEY, currentChatUsername);
  } catch (e) {}
}

if (chatUsernameInput) {
  chatUsernameInput.value = currentChatUsername;
  chatUsernameInput.style.color = isAdminVerified ? '#38bdf8' : getPassengerColor(currentChatUsername);
  updateAdminUI();

  chatUsernameInput.addEventListener('input', (e) => {
    processUsernameInput(e.target.value);
  });

  chatUsernameInput.addEventListener('blur', () => {
    if (!chatUsernameInput.value.trim()) {
      chatUsernameInput.value = currentChatUsername;
      chatUsernameInput.style.color = isAdminVerified ? '#38bdf8' : getPassengerColor(currentChatUsername);
    } else {
      processUsernameInput(chatUsernameInput.value);
    }
  });
}

const genderSelector = $('chat-gender-selector');
if (genderSelector) {
  genderSelector.addEventListener('click', (e) => {
    const btn = e.target.closest('.chat-gender-pill');
    if (!btn) return;
    const g = btn.getAttribute('data-gender');
    if (g === 'M' || g === 'F') {
      currentChatGender = g;
      try { localStorage.setItem(CHAT_GENDER_KEY, g); } catch (err) {}
      updateGenderUI();
    }
  });
}
updateGenderUI();

function setReplyingTo(replyData) {
  if (!replyData) return;
  currentReplyTo = replyData;
  if (chatReplyBar && chatReplyBarTitle && chatReplyBarSnippet) {
    chatReplyBarTitle.textContent = `Replying to ${replyData.name || 'Passenger'}`;
    chatReplyBarSnippet.textContent = (replyData.text || '').slice(0, 75);
    if (chatReplyBarAccent) {
      chatReplyBarAccent.style.background = replyData.color || '#38bdf8';
    }
    chatReplyBar.hidden = false;
  }
  if (chatMessageInput) {
    chatMessageInput.placeholder = `Reply to ${replyData.name || 'Passenger'}…`;
    chatMessageInput.focus();
  }
}

function clearReplyingTo() {
  currentReplyTo = null;
  if (chatReplyBar) {
    chatReplyBar.hidden = true;
  }
  if (chatMessageInput) {
    chatMessageInput.placeholder = 'Say something aboard KSRTC…';
  }
}

if (chatReplyCancelBtn) {
  chatReplyCancelBtn.addEventListener('click', clearReplyingTo);
}

function updateChatSendButtonState() {
  if (!chatSendBtn) return;
  const hasText = Boolean(chatMessageInput && chatMessageInput.value.trim());
  const hasMedia = Boolean(currentAttachment && currentAttachment.url);
  chatSendBtn.disabled = !hasText && !hasMedia;
}

if (chatMessageInput) {
  chatMessageInput.addEventListener('input', updateChatSendButtonState);
}

if (chatForm && chatMessageInput) {
  chatForm.addEventListener('submit', (e) => {
    e.preventDefault();

    const text = chatMessageInput.value.trim();
    if (!text && !currentAttachment) return;

    if (text.length > 140) {
      notify('Message must be 140 characters or fewer.');
      return;
    }

    const now = Date.now();
    if (now - lastChatMessageTime < 1200) {
      notify('Please wait a moment before sending again.');
      return;
    }

    if (!isChatConnected || typeof sendChatMessageFn !== 'function') {
      notify('Connecting to live passenger chat...');
      return;
    }

    let activeName = (chatUsernameInput ? chatUsernameInput.value.trim() : '') || currentChatUsername || 'Passenger';
    if (activeName.toLowerCase() === 'admin' && !isAdminVerified) {
      activeName = 'Passenger';
    }

    if (chatSendBtn) {
      chatSendBtn.disabled = true;
    }

    lastChatMessageTime = now;

    const replyPayload = currentReplyTo ? {
      id: currentReplyTo.id || '',
      name: currentReplyTo.name || 'Passenger',
      text: (currentReplyTo.text || '').slice(0, 80)
    } : null;

    const mediaPayload = currentAttachment ? { ...currentAttachment } : null;

    sendChatMessageFn(activeName.slice(0, 24), text, isAdminVerified, currentChatGender, replyPayload, mediaPayload)
      .then(() => {
        chatMessageInput.value = '';
        currentAttachment = null;
        if (chatAttachmentBar) chatAttachmentBar.hidden = true;
        if (chatFileInput) chatFileInput.value = '';
        if (chatEmojiDrawer) chatEmojiDrawer.hidden = true;
        if (chatGifDrawer) chatGifDrawer.hidden = true;
        updateChatSendButtonState();
        clearReplyingTo();
        chatMessageInput.focus();
      })
      .catch((err) => {
        console.warn('Chat send error:', err);
        updateChatSendButtonState();
        notify('Unable to send message right now.');
      });
  });
}

/* ==========================================================================
   Live Sessions Tracker & Global Firebase Realtime Database Layer
   ========================================================================== */
function initLiveSessionsAndChat() {
  const liveCountEl = $('live-count');
  const chatLiveCountEl = $('chat-live-count');
  const STORAGE_KEY = 'ksrtc_live_sessions_v1';
  const HEARTBEAT_INTERVAL = 2500;
  const SESSION_TTL = 7000;

  const firebaseConfig = {
    apiKey: "AIzaSyDQFHMh1WXH7er-Q-L-hrQ2hEilqOuL5LA",
    authDomain: "ksrtc-radio.firebaseapp.com",
    databaseURL: "https://ksrtc-radio-default-rtdb.firebaseio.com",
    projectId: "ksrtc-radio",
    storageBucket: "ksrtc-radio.firebasestorage.app",
    messagingSenderId: "995559480361",
    appId: "1:995559480361:web:dbc1fd761f1f9637691038"
  };

  let isFirebaseActive = false;

  const channel = typeof BroadcastChannel !== 'undefined'
    ? new BroadcastChannel('ksrtc_live_presence')
    : null;

  function updateBadge(count) {
    const finalCount = Math.max(1, count);
    if (liveCountEl && liveCountEl.textContent !== String(finalCount)) {
      liveCountEl.textContent = String(finalCount);
    }
    if (chatLiveCountEl && chatLiveCountEl.textContent !== String(finalCount)) {
      chatLiveCountEl.textContent = String(finalCount);
    }
  }

  // --- Local Fallback Layer (Instant cross-tab updates on same browser) ---
  function getLocalSessions() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return {};
      const data = JSON.parse(raw);
      return typeof data === 'object' && data !== null ? data : {};
    } catch (e) {
      return {};
    }
  }

  function saveLocalSessions(sessions) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
    } catch (e) {}
  }

  function pruneAndHeartbeat() {
    if (isFirebaseActive) return;
    const now = Date.now();
    const sessions = getLocalSessions();
    let changed = false;

    for (const [id, ts] of Object.entries(sessions)) {
      if (typeof ts !== 'number' || now - ts > SESSION_TTL) {
        delete sessions[id];
        changed = true;
      }
    }

    if (sessions[mySessionId] !== now) {
      sessions[mySessionId] = now;
      changed = true;
    }

    if (changed) {
      saveLocalSessions(sessions);
    }

    const activeIds = Object.keys(sessions).filter(id => {
      const ts = sessions[id];
      return typeof ts === 'number' && now - ts <= SESSION_TTL;
    });

    updateBadge(activeIds.length);
  }

  function removeLocalSession() {
    try {
      const sessions = getLocalSessions();
      if (sessions[mySessionId]) {
        delete sessions[mySessionId];
        saveLocalSessions(sessions);
      }
      if (channel) {
        channel.postMessage({ type: 'leave', id: mySessionId });
      }
    } catch (e) {}
  }

  pruneAndHeartbeat();
  setInterval(pruneAndHeartbeat, HEARTBEAT_INTERVAL);

  if (channel) {
    channel.onmessage = (event) => {
      if (isFirebaseActive) return;
      const data = event.data;
      if (data && (data.type === 'join' || data.type === 'leave' || data.type === 'ping')) {
        pruneAndHeartbeat();
      }
    };
    channel.postMessage({ type: 'join', id: mySessionId });
  }

  window.addEventListener('storage', (e) => {
    if (!isFirebaseActive && e.key === STORAGE_KEY) {
      pruneAndHeartbeat();
    }
  });

  window.addEventListener('beforeunload', removeLocalSession);
  window.addEventListener('pagehide', removeLocalSession);

  // --- Real-time Passenger Chat Renderer ---
  const seenMessageIds = new Set();

  function formatChatTime(timestamp) {
    if (!timestamp) return 'Just now';
    try {
      const d = new Date(timestamp);
      if (Number.isNaN(d.getTime())) return 'Just now';
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch (e) {
      return 'Just now';
    }
  }

  function renderPinnedCard(data) {
    currentPinnedMessage = data;
    const card = $('chat-pinned-card');
    const senderEl = $('chat-pinned-sender');
    const textEl = $('chat-pinned-text');
    const unpinBtn = $('chat-unpin-btn');

    // Update real-time state of all chat pin buttons in message stream
    if (chatMessagesContainer) {
      const allPinBtns = chatMessagesContainer.querySelectorAll('.chat-pin-btn');
      allPinBtns.forEach(btn => {
        const isThisPinned = Boolean(data && data.id && btn.dataset.id === data.id);
        btn.classList.toggle('is-pinned', isThisPinned);
        btn.title = isThisPinned ? 'Unpin message' : 'Pin message';
        const label = btn.querySelector('.chat-pin-label');
        if (label) {
          label.textContent = isThisPinned ? 'Pinned' : 'Pin';
        }
      });
    }

    if (!card) return;

    if (!data || !data.text) {
      card.hidden = true;
      return;
    }

    const isVerifiedSender = Boolean(
      data.isVerified ||
      data.adminToken === ADMIN_PASSKEY_HASH ||
      (data.name && data.name.toLowerCase() === 'admin')
    );
    const color = isVerifiedSender ? '#38bdf8' : getPassengerColor(data.name);
    const pinnedGender = (data.gender === 'M' || data.gender === 'F')
      ? data.gender
      : getPassengerGenderFallback(data.name);
    const genderTag = `<span class="chat-gender-tag gender-${pinnedGender.toLowerCase()}" title="${pinnedGender === 'M' ? 'Male' : 'Female'}">${pinnedGender}</span>`;

    if (senderEl) {
      senderEl.innerHTML = isVerifiedSender
        ? `<span class="chat-sender-name">${escapeHtml(data.name || 'Admin')}</span> ${genderTag} ${VERIFIED_TICK_SVG}`
        : `<span class="chat-sender-name">${escapeHtml(data.name || 'Passenger')}</span> ${genderTag}`;
      senderEl.style.color = color;
    }
    if (textEl) {
      textEl.textContent = data.text;
    }
    if (unpinBtn) {
      unpinBtn.hidden = !isAdminVerified;
    }
    card.hidden = false;
  }

  function updateMessageLikeUI(msgId, count, hasLiked) {
    if (!chatMessagesContainer) return;
    const msgEl = chatMessagesContainer.querySelector(`.chat-msg-row[data-id="${msgId}"], .chat-msg[data-id="${msgId}"]`);
    if (!msgEl) return;

    const likeBtn = msgEl.querySelector('.chat-like-btn');
    if (likeBtn) {
      likeBtn.classList.toggle('has-liked', Boolean(hasLiked));
      const iconEl = likeBtn.querySelector('.chat-pill-icon');
      if (iconEl) {
        iconEl.textContent = (hasLiked || count > 0) ? '❤️' : '🤍';
      }
      const countEl = likeBtn.querySelector('.chat-pill-count, .chat-like-count');
      if (countEl) {
        countEl.textContent = count > 0 ? String(count) : 'Like';
      }
    }

    // Never display double time: remove any tapback badge from bubble
    const bubble = msgEl.querySelector('.chat-msg-bubble');
    if (bubble) {
      const tapback = bubble.querySelector('.chat-tapback-badge');
      if (tapback) tapback.remove();
    }
  }

  // Initial local fallback for likes and pins
  toggleLikeChatMessageFn = (msgId) => {
    const has = localLikedMsgIds.has(msgId);
    if (has) localLikedMsgIds.delete(msgId);
    else localLikedMsgIds.add(msgId);
    const count = localLikedMsgIds.has(msgId) ? 1 : 0;
    updateMessageLikeUI(msgId, count, localLikedMsgIds.has(msgId));
    return Promise.resolve();
  };

  pinChatMessageFn = (msgId, name, text, isVerified, gender = 'M') => {
    if (!isAdminVerified) return Promise.reject(new Error('Unauthorized'));
    const data = {
      id: msgId,
      name,
      text,
      gender: gender || 'M',
      isVerified: Boolean(isVerified),
      timestamp: Date.now()
    };
    renderPinnedCard(data);
    try {
      localStorage.setItem('ksrtc_pinned_chat_v1', JSON.stringify(data));
      if (channel) channel.postMessage({ type: 'pin', data });
    } catch (e) {}
    return Promise.resolve();
  };

  unpinChatMessageFn = () => {
    if (!isAdminVerified) return Promise.reject(new Error('Unauthorized'));
    renderPinnedCard(null);
    try {
      localStorage.removeItem('ksrtc_pinned_chat_v1');
      if (channel) channel.postMessage({ type: 'unpin' });
    } catch (e) {}
    return Promise.resolve();
  };

  try {
    const savedPinned = localStorage.getItem('ksrtc_pinned_chat_v1');
    if (savedPinned) {
      renderPinnedCard(JSON.parse(savedPinned));
    }
  } catch (e) {}

  function appendChatMessage(msgId, data, isLive = false) {
    if (!chatMessagesContainer || seenMessageIds.has(msgId)) return;
    if (msgId === '_pinned') return;
    seenMessageIds.add(msgId);

    let senderName = (data.name || 'Passenger').slice(0, 24);
    // System message is presented permanently as a note at the top
    if (senderName.toLowerCase() === 'system' || data.session === 'system_bot') {
      return;
    }

    if (chatEmptyState) {
      chatEmptyState.style.display = 'none';
    }

    const isMe = data.session === mySessionId;
    const isVerified = Boolean(
      (data.isAdmin === true && (data.adminToken === ADMIN_PASSKEY_HASH || data.adminKey === ADMIN_PASSKEY_HASH)) ||
      (senderName.toLowerCase() === 'admin' && (data.adminToken === ADMIN_PASSKEY_HASH || data.adminKey === ADMIN_PASSKEY_HASH || data.isAdmin === true)) ||
      (isMe && isAdminVerified)
    );

    let displayName = senderName;
    if (isMe) {
      displayName = isVerified ? '👑 You' : 'You';
    } else if (isVerified) {
      displayName = '👑 Admin';
    } else if (displayName.toLowerCase() === 'admin') {
      displayName = 'Passenger';
    }

    const text = (data.text || '').trim();
    const hasImage = Boolean(data.imageUrl);
    const hasGif = Boolean(data.gifUrl);
    if (!text && !hasImage && !hasGif) return;

    const tagColor = isVerified ? '#f5c871' : (isMe ? '#38bdf8' : getPassengerColor(senderName));
    const timeStr = formatChatTime(data.timestamp);

    const gender = (data.gender === 'M' || data.gender === 'F')
      ? data.gender
      : (isMe ? currentChatGender : getPassengerGenderFallback(senderName));

    const genderHtml = `<span class="chat-gender-tag gender-${gender.toLowerCase()}" title="${gender === 'M' ? 'Male' : 'Female'}">${escapeHtml(gender)}</span>`;

    const senderHtml = isVerified
      ? `<span class="chat-sender-name chat-admin-sender-name">${escapeHtml(displayName)}</span> ${genderHtml} ${VERIFIED_TICK_SVG} <span class="chat-admin-pill-tag">OFFICIAL</span>`
      : (isMe
          ? `<span class="chat-sender-name chat-me-sender-name" style="color: #38bdf8;">You</span> ${genderHtml}`
          : `<span class="chat-sender-name">${escapeHtml(displayName)}</span> ${genderHtml}`);

    const adminBannerHtml = isVerified
      ? `<div class="chat-admin-bubble-banner">
          <span class="chat-admin-banner-shield">🛡️</span>
          <span class="chat-admin-banner-label">OFFICIAL ANNOUNCEMENT</span>
          <span class="chat-admin-banner-sparkle">✦</span>
        </div>`
      : '';

    let replyQuoteHtml = '';
    if (data.replyTo && data.replyTo.name) {
      replyQuoteHtml = `
        <div class="chat-reply-quote" data-target-id="${escapeHtml(data.replyTo.id || '')}" title="Jump to original message">
          <div class="chat-reply-quote-bar"></div>
          <div class="chat-reply-quote-content">
            <div class="chat-reply-quote-name">${escapeHtml(data.replyTo.name)}</div>
            <div class="chat-reply-quote-text">${escapeHtml(data.replyTo.text || '')}</div>
          </div>
        </div>
      `;
    }

    // Determine the song thumbnail for avatar from the song playing in player
    let thumbUrl = (data.trackThumb && typeof data.trackThumb === 'string' && data.trackThumb.startsWith('http'))
      ? data.trackThumb
      : null;
    if (!thumbUrl && Array.isArray(playlist) && playlist.length > 0) {
      let hash = 0;
      const seed = (msgId || '') + (senderName || '');
      for (let i = 0; i < seed.length; i++) hash = ((hash << 5) - hash) + seed.charCodeAt(i);
      const idx = Math.abs(hash) % playlist.length;
      thumbUrl = playlist[idx]?.albumArt || playlist[0]?.albumArt || '';
    }
    if (!thumbUrl) {
      thumbUrl = 'assets/images/ksrtc-journey-fallback.png';
    }
    const trackTitle = data.trackTitle || 'Now Playing';

    const likesObj = (data.likes && typeof data.likes === 'object') ? data.likes : {};
    const likeCount = Object.keys(likesObj).length;
    const hasLiked = Boolean(likesObj[mySessionId]) || localLikedMsgIds.has(msgId);

    let mediaHtml = '';
    if (data.imageUrl) {
      mediaHtml += `
        <div class="chat-msg-media-wrap" data-img-src="${escapeHtml(data.imageUrl)}" title="Tap to expand photo">
          <img class="chat-msg-media-img" src="${escapeHtml(data.imageUrl)}" alt="Shared photo" loading="lazy" referrerpolicy="no-referrer" />
        </div>
      `;
    }
    if (data.gifUrl) {
      mediaHtml += `
        <div class="chat-msg-media-wrap chat-msg-gif-wrap" data-img-src="${escapeHtml(data.gifUrl)}" title="Tap to expand GIF">
          <img class="chat-msg-media-img chat-msg-gif-img" src="${escapeHtml(data.gifUrl)}" alt="Shared GIF" loading="lazy" referrerpolicy="no-referrer" />
          <span class="chat-msg-gif-badge">GIF</span>
        </div>
      `;
    }

    const hasMedia = Boolean(data.imageUrl || data.gifUrl);
    const isMediaOnly = hasMedia && !text && !replyQuoteHtml && !adminBannerHtml;

    const isPinned = Boolean(currentPinnedMessage && currentPinnedMessage.id === msgId);

    const msgEl = document.createElement('div');
    msgEl.className = `chat-msg-row ${isMe ? 'is-me' : ''} ${isVerified ? 'is-admin-msg' : ''} is-gender-${gender.toLowerCase()}`;
    msgEl.dataset.id = msgId;

    msgEl.innerHTML = `
      <div class="chat-avatar-wrap" title="${escapeHtml(trackTitle)}">
        <img class="chat-avatar-img" src="${escapeHtml(thumbUrl)}" alt="${escapeHtml(trackTitle)}" loading="lazy" onerror="this.src='assets/images/ksrtc-journey-fallback.png'" />
      </div>
      <div class="chat-msg-col">
        <div class="chat-msg-header">
          <span class="chat-msg-sender" style="color: ${tagColor};">${senderHtml}</span>
          <span class="chat-msg-time">${escapeHtml(timeStr)}</span>
        </div>
        <div class="chat-msg-bubble ${isMediaOnly ? 'is-media-only' : ''}">
          ${adminBannerHtml}
          ${replyQuoteHtml}
          ${mediaHtml}
          ${text ? `<div class="chat-msg-text">${escapeHtml(text)}</div>` : ''}
        </div>
        <div class="chat-msg-actions">
          <button type="button" class="chat-pill-btn chat-like-btn ${hasLiked ? 'has-liked' : ''}" data-id="${escapeHtml(msgId)}" title="Like message" aria-label="Like message">
            <span class="chat-pill-icon">${(hasLiked || likeCount > 0) ? '❤️' : '🤍'}</span>
            <span class="chat-pill-count">${likeCount > 0 ? likeCount : 'Like'}</span>
          </button>
          <button type="button" class="chat-pill-btn chat-reply-btn" data-id="${escapeHtml(msgId)}" title="Reply to message" aria-label="Reply to message">
            <span class="chat-pill-icon">↰</span>
            <span>Reply</span>
          </button>
          <div class="chat-admin-actions">
            <button type="button" class="chat-admin-action-btn chat-pin-btn ${isPinned ? 'is-pinned' : ''}" data-id="${escapeHtml(msgId)}" title="${isPinned ? 'Unpin message' : 'Pin message'}" aria-label="Pin message">
              <svg viewBox="0 0 24 24" width="11" height="11" fill="currentColor"><path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6l.8.8.8-.8v-6H18v-2l-2-2z"/></svg>
            </button>
            <button type="button" class="chat-admin-action-btn chat-delete-btn" data-id="${escapeHtml(msgId)}" title="Delete message" aria-label="Delete message">
              <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.3"><path d="M3 6h18m-2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m-6 5v6m4-6v6"/></svg>
            </button>
          </div>
        </div>
      </div>
    `;

    const isScrolledToBottom =
      chatMessagesContainer.scrollHeight - chatMessagesContainer.clientHeight <=
      chatMessagesContainer.scrollTop + 60;

    chatMessagesContainer.appendChild(msgEl);

    // Enforce keeping only the last 30 unpinned messages in the chatbox
    const allMsgs = Array.from(chatMessagesContainer.querySelectorAll('.chat-msg-row, .chat-msg'));
    const prunableMsgs = allMsgs.filter(msg => !(currentPinnedMessage && msg.dataset.id === currentPinnedMessage.id));
    if (prunableMsgs.length > 30) {
      const toRemove = prunableMsgs.slice(0, prunableMsgs.length - 30);
      toRemove.forEach(oldMsg => {
        if (oldMsg && oldMsg.dataset.id) {
          seenMessageIds.delete(oldMsg.dataset.id);
          if (likeListenerUnsubs.has(oldMsg.dataset.id)) {
            try { likeListenerUnsubs.get(oldMsg.dataset.id)(); } catch (e) {}
            likeListenerUnsubs.delete(oldMsg.dataset.id);
          }
        }
        oldMsg.remove();
      });
    }

    if (isMe || isScrolledToBottom || isChatOpen()) {
      chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;
    }

    // Live message incoming: play message sound for incoming messages (even when chat is not opened), if not muted
    if (isLive && !isMe && !isChatNotificationMuted) {
      playSoundEffect(messageAudio);
    }

    // Live message incoming: trigger popping message (on mobile) & breathing glow on chat button
    if (isLive) {
      const popSnippet = text || (hasImage ? '📷 Shared a photo' : (hasGif ? '🎞️ Shared a GIF' : ''));
      triggerSongPoppingMessage(displayName, popSnippet, tagColor, isVerified, gender, data.replyTo);

      // Make whole chat option glow with breathing animation when new chat arrives while drawer is closed
      if (chatToggle && (!chatDrawerWrap || chatDrawerWrap.hidden || !chatDrawerWrap.classList.contains('is-open'))) {
        chatToggle.classList.add('is-breathing');
      }

      // Show pulsating green dot at bottom right of chat button when new messages arrive while drawer is closed
      if (chatUnreadDot && (!chatDrawerWrap || chatDrawerWrap.hidden || !chatDrawerWrap.classList.contains('is-open'))) {
        chatUnreadDot.hidden = false;
      }
    }

    // Always update the desktop recent 5 chats overlay (shows for 5s on live messages)
    updateDesktopRecentChats(msgId, data, isLive);
  }

  if (chatMessagesContainer) {
    chatMessagesContainer.addEventListener('click', (e) => {
      // 0. Media click -> Open Lightbox
      const mediaWrap = e.target.closest('.chat-msg-media-wrap');
      if (mediaWrap) {
        const src = mediaWrap.getAttribute('data-img-src');
        if (src && typeof openChatLightbox === 'function') {
          openChatLightbox(src);
        }
        return;
      }

      // 1. Like button click
      const likeTrigger = e.target.closest('.chat-like-btn');
      if (likeTrigger) {
        const msgId = likeTrigger.getAttribute('data-id');
        if (msgId) {
          likeTrigger.style.transform = 'scale(1.22)';
          setTimeout(() => { likeTrigger.style.transform = ''; }, 160);
          if (typeof toggleLikeChatMessageFn === 'function') {
            toggleLikeChatMessageFn(msgId);
          }
        }
        return;
      }

      // 2. Reply button click
      const replyBtn = e.target.closest('.chat-reply-btn');
      if (replyBtn) {
        const msgId = replyBtn.getAttribute('data-id');
        const msgEl = replyBtn.closest('.chat-msg-row, .chat-msg');
        if (msgEl) {
          const senderName = msgEl.querySelector('.chat-sender-name')?.textContent || 'Passenger';
          const text = msgEl.querySelector('.chat-msg-text')?.textContent || '';
          const senderColor = msgEl.querySelector('.chat-msg-sender')?.style.color || '#38bdf8';
          setReplyingTo({ id: msgId, name: senderName, text, color: senderColor });
        }
        return;
      }

      // 4. Quoted reply click -> scroll to original message
      const replyQuote = e.target.closest('.chat-reply-quote');
      if (replyQuote) {
        const targetId = replyQuote.getAttribute('data-target-id');
        if (targetId && chatMessagesContainer) {
          const targetMsg = chatMessagesContainer.querySelector(`.chat-msg-row[data-id="${targetId}"], .chat-msg[data-id="${targetId}"]`);
          if (targetMsg) {
            targetMsg.scrollIntoView({ behavior: 'smooth', block: 'center' });
            targetMsg.classList.add('is-highlighted');
            setTimeout(() => targetMsg.classList.remove('is-highlighted'), 1300);
          } else {
            notify('Original message is no longer in chat.');
          }
        }
        return;
      }

      // 5. Admin delete
      const deleteBtn = e.target.closest('.chat-delete-btn');
      if (deleteBtn) {
        const msgId = deleteBtn.getAttribute('data-id');
        if (!isAdminVerified) {
          notify('Admin authorization required.');
          return;
        }
        if (confirm('Delete this message for everyone?')) {
          if (typeof deleteChatMessageFn === 'function') {
            deleteChatMessageFn(msgId)
              .then(() => {
                if (currentPinnedMessage && currentPinnedMessage.id === msgId && typeof unpinChatMessageFn === 'function') {
                  unpinChatMessageFn();
                }
                notify('Message deleted.');
              })
              .catch(() => notify('Failed to delete message.'));
          }
        }
        return;
      }

      // 5. Pin / Unpin button click (Admin only)
      const pinBtn = e.target.closest('.chat-pin-btn');
      if (pinBtn) {
        if (!isAdminVerified) {
          notify('Admin authorization required.');
          return;
        }
        const msgId = pinBtn.getAttribute('data-id');
        const msgEl = pinBtn.closest('.chat-msg-row, .chat-msg');
        if (!msgEl) return;
        const senderName = msgEl.querySelector('.chat-sender-name')?.textContent || 'Passenger';
        const text = msgEl.querySelector('.chat-msg-text')?.textContent || '';
        const isVerifiedSender = Boolean(msgEl.querySelector('.chat-admin-sender-name, .verified-tick-icon'));
        const genderEl = msgEl.querySelector('.chat-gender-tag');
        const msgGender = genderEl ? (genderEl.textContent.trim() || 'M') : 'M';

        if (currentPinnedMessage && currentPinnedMessage.id === msgId) {
          if (typeof unpinChatMessageFn === 'function') {
            unpinChatMessageFn()
              .then(() => notify('Message unpinned.'))
              .catch(() => notify('Failed to unpin message.'));
          }
          return;
        }

        if (typeof pinChatMessageFn === 'function') {
          pinChatMessageFn(msgId, senderName, text, isVerifiedSender, msgGender)
            .then(() => notify('Message pinned to top! 📌'))
            .catch(() => notify('Failed to pin message.'));
        }
        return;
      }
    });
  }

  const chatUnpinBtn = $('chat-unpin-btn');
  if (chatUnpinBtn) {
    chatUnpinBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!isAdminVerified) {
        notify('Admin authorization required.');
        return;
      }
      if (typeof unpinChatMessageFn === 'function') {
        unpinChatMessageFn()
          .then(() => notify('Message unpinned.'))
          .catch(() => notify('Failed to unpin message.'));
      }
    });
  }

  const chatPinnedCard = $('chat-pinned-card');
  if (chatPinnedCard) {
    chatPinnedCard.addEventListener('click', (e) => {
      if (e.target.closest('#chat-unpin-btn')) return;
      if (currentPinnedMessage && currentPinnedMessage.id && chatMessagesContainer) {
        const target = chatMessagesContainer.querySelector(`.chat-msg-row[data-id="${currentPinnedMessage.id}"], .chat-msg[data-id="${currentPinnedMessage.id}"]`);
        if (target) {
          target.scrollIntoView({ behavior: 'smooth', block: 'center' });
          target.classList.add('is-highlighted');
          setTimeout(() => target.classList.remove('is-highlighted'), 1400);
        }
      }
    });
  }

  // --- Global Firebase Realtime Database Presence & Chat Layer ---
  try {
    Promise.all([
      import('https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js'),
      import('https://www.gstatic.com/firebasejs/12.19.0/firebase-database.js')
    ]).then(([{ initializeApp }, { getDatabase, ref, onValue, set, push, remove, get, onDisconnect, serverTimestamp, query, limitToLast, onChildAdded, onChildRemoved }]) => {
      const app = initializeApp(firebaseConfig);
      const db = getDatabase(app);

      // Presence
      const presenceListRef = ref(db, 'presence');
      const connectedRef = ref(db, '.info/connected');

      let myPresenceRef = null;

      onValue(connectedRef, (snap) => {
        if (snap.val() === true) {
          isFirebaseActive = true;
          myPresenceRef = push(presenceListRef);

          // When connection drops / tab closes, automatically remove this tab from Firebase
          onDisconnect(myPresenceRef).remove();

          // Register this active session in Firebase
          set(myPresenceRef, {
            joinedAt: serverTimestamp(),
            session: mySessionId
          });
        }
      });

      // Real-time listener: triggers whenever anyone joins or leaves anywhere in the world
      onValue(presenceListRef, (snap) => {
        isFirebaseActive = true;
        const data = snap.val();
        const count = data ? Object.keys(data).length : 1;
        updateBadge(count);
      });

      // Clean up on explicit page unload
      window.addEventListener('beforeunload', () => {
        if (myPresenceRef) {
          try { set(myPresenceRef, null); } catch (e) {}
        }
      });
      window.addEventListener('pagehide', () => {
        if (myPresenceRef) {
          try { set(myPresenceRef, null); } catch (e) {}
        }
      });

      // Live Passenger Chat (strictly last 30 messages)
      const messagesRef = ref(db, 'messages');
      const recentMessagesQuery = query(messagesRef, limitToLast(30));
      let isInitialChatHistoryLoaded = false;

      function autoPruneOldMessages() {
        get(messagesRef).then((snap) => {
          const val = snap.val();
          if (!val || typeof val !== 'object') return;
          const pinnedId = (val._pinned && val._pinned.id) || (currentPinnedMessage && currentPinnedMessage.id) || null;
          const keys = Object.keys(val).filter(k => k !== '_pinned' && k !== pinnedId);
          if (keys.length > 30) {
            keys.sort((a, b) => {
              const tA = (val[a] && val[a].timestamp) || 0;
              const tB = (val[b] && val[b].timestamp) || 0;
              return tA - tB;
            });
            const toDelete = keys.slice(0, keys.length - 30);
            toDelete.forEach((oldId) => {
              remove(ref(db, `messages/${oldId}`)).catch(() => {});
            });
          }
        }).catch(() => {});
      }

      onChildAdded(recentMessagesQuery, (snapshot) => {
        if (snapshot.key === '_pinned') return;
        const val = snapshot.val();
        if (val && typeof val === 'object') {
          appendChatMessage(snapshot.key, val, isInitialChatHistoryLoaded);

          // Real-time listener for likes on this message
          const msgLikesRef = ref(db, `messages/${snapshot.key}/likes`);
          const unsub = onValue(msgLikesRef, (likeSnap) => {
            const lVal = likeSnap.val() || {};
            const count = (typeof lVal === 'object' && lVal !== null) ? Object.keys(lVal).length : 0;
            const hasLiked = Boolean(lVal && lVal[mySessionId]);
            updateMessageLikeUI(snapshot.key, count, hasLiked);
          });
          likeListenerUnsubs.set(snapshot.key, unsub);
        }
      });

      onChildRemoved(recentMessagesQuery, (snapshot) => {
        if (snapshot.key === '_pinned') {
          renderPinnedCard(null);
          return;
        }
        // Protect pinned message from being removed from chat stream when query window slides forward
        if (currentPinnedMessage && currentPinnedMessage.id === snapshot.key) {
          return;
        }
        if (likeListenerUnsubs.has(snapshot.key)) {
          try { likeListenerUnsubs.get(snapshot.key)(); } catch (e) {}
          likeListenerUnsubs.delete(snapshot.key);
        }
        if (!chatMessagesContainer) return;
        const msgEl = chatMessagesContainer.querySelector(`.chat-msg-row[data-id="${snapshot.key}"], .chat-msg[data-id="${snapshot.key}"]`);
        if (msgEl) {
          msgEl.style.opacity = '0';
          msgEl.style.transform = 'scale(0.92)';
          setTimeout(() => {
            msgEl.remove();
            seenMessageIds.delete(snapshot.key);
            if (chatMessagesContainer.querySelectorAll('.chat-msg-row, .chat-msg').length === 0 && chatEmptyState) {
              chatEmptyState.style.display = 'block';
            }
          }, 200);
        }
        const dIdx = desktopRecentChatsList.findIndex(item => item.id === snapshot.key);
        if (dIdx !== -1) {
          desktopRecentChatsList.splice(dIdx, 1);
          saveCachedRecentChats();
          renderDesktopRecentChats();
        }
      });

      const pinnedRef = ref(db, 'messages/_pinned');
      onValue(pinnedRef, (snapshot) => {
        const pinData = snapshot.val();
        renderPinnedCard(pinData);
        if (pinData && pinData.id && chatMessagesContainer) {
          const existing = chatMessagesContainer.querySelector(`.chat-msg-row[data-id="${pinData.id}"], .chat-msg[data-id="${pinData.id}"]`);
          if (!existing) {
            get(ref(db, `messages/${pinData.id}`)).then((mSnap) => {
              const mVal = mSnap.val();
              if (mVal && typeof mVal === 'object') {
                appendChatMessage(pinData.id, mVal, false);
              }
            }).catch(() => {});
          }
        }
      });

      // Global Community Songs Sync (Firebase Realtime Database)
      const sharedSongsRef = ref(db, 'shared_songs');
      onChildAdded(sharedSongsRef, (snapshot) => {
        const val = snapshot.val();
        if (val && val.id) {
          integrateGlobalSong(val);
        }
      });

      onChildRemoved(sharedSongsRef, (snapshot) => {
        const val = snapshot.val();
        const removedId = (val && val.id) || snapshot.key;
        if (removedId) {
          removeCommunitySongFromPlaylist(removedId);
        }
      });

      addSongToGlobalPlaylistFn = (song) => {
        if (!song || !song.id) return Promise.reject();
        const safeId = String(song.id).replace(/[.#$[\]]/g, '_');
        return set(ref(db, `shared_songs/${safeId}`), {
          id: song.id,
          title: song.title,
          artist: song.artist || 'Community Added',
          albumArt: song.albumArt || `https://img.youtube.com/vi/${song.id}/hqdefault.jpg`,
          addedAt: serverTimestamp()
        });
      };

      deleteSongFromGlobalPlaylistFn = (songId) => {
        if (!isAdminVerified || !songId) return Promise.reject(new Error('Unauthorized'));
        const safeId = String(songId).replace(/[.#$[\]]/g, '_');
        return remove(ref(db, `shared_songs/${safeId}`));
      };

      // Enable live popping on top of song after initial chat backlog finishes loading
      setTimeout(() => {
        isInitialChatHistoryLoaded = true;
        autoPruneOldMessages();
      }, 1200);

      toggleLikeChatMessageFn = (msgId) => {
        const myLikeRef = ref(db, `messages/${msgId}/likes/${mySessionId}`);
        return get(myLikeRef).then((snap) => {
          if (snap.exists() && snap.val() === true) {
            return remove(myLikeRef);
          } else {
            return set(myLikeRef, true);
          }
        }).catch((err) => {
          console.warn('Like toggle error:', err);
        });
      };

      deleteChatMessageFn = (msgId) => {
        const p = remove(ref(db, `messages/${msgId}`));
        if (currentPinnedMessage && currentPinnedMessage.id === msgId) {
          remove(ref(db, 'messages/_pinned')).catch(() => {});
        }
        return p;
      };

      pinChatMessageFn = (msgId, name, text, isVerified, gender = 'M') => {
        if (!isAdminVerified) return Promise.reject(new Error('Unauthorized'));
        return set(ref(db, 'messages/_pinned'), {
          id: msgId,
          name: name,
          text: text,
          gender: gender || 'M',
          isVerified: Boolean(isVerified),
          timestamp: serverTimestamp(),
          adminToken: ADMIN_PASSKEY_HASH
        });
      };

      unpinChatMessageFn = () => {
        if (!isAdminVerified) return Promise.reject(new Error('Unauthorized'));
        return remove(ref(db, 'messages/_pinned')).then(() => {
          autoPruneOldMessages();
        });
      };

      sendChatMessageFn = (name, text, isSenderAdmin = false, gender = 'M', replyTo = null, mediaAttachment = null) => {
        const curTrack = (typeof playlist !== 'undefined' && Array.isArray(playlist) && playlist[state?.currentSongIndex])
          ? playlist[state.currentSongIndex]
          : (Array.isArray(playlist) ? playlist[0] : null);
        const trackThumb = curTrack?.albumArt || '';
        const trackTitle = curTrack?.title || '';

        const payload = {
          name,
          text: text || '',
          gender: gender || 'M',
          session: mySessionId,
          timestamp: serverTimestamp(),
          trackThumb: trackThumb,
          trackTitle: trackTitle
        };
        if (mediaAttachment && mediaAttachment.url) {
          if (mediaAttachment.type === 'image') {
            payload.imageUrl = mediaAttachment.url;
          } else if (mediaAttachment.type === 'gif') {
            payload.gifUrl = mediaAttachment.url;
          }
        }
        if (replyTo && replyTo.name) {
          payload.replyTo = {
            id: replyTo.id || '',
            name: replyTo.name.slice(0, 24),
            text: (replyTo.text || '').slice(0, 80)
          };
        }
        if (isSenderAdmin && isAdminVerified) {
          payload.name = 'Admin';
          payload.isAdmin = true;
          payload.adminToken = ADMIN_PASSKEY_HASH;
        }
        return push(messagesRef, payload).then((res) => {
          autoPruneOldMessages();
          return res;
        });
      };

      isChatConnected = true;
    }).catch((err) => {
      console.warn('Firebase connection fallback to local:', err);
    });
  } catch (err) {}
}

initLiveSessionsAndChat();

// ==========================================================================
// Media Attachments & Compression Handling
// ==========================================================================
function compressImageFile(file, maxWidth = 720, maxHeight = 720, quality = 0.72) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let w = img.width;
        let h = img.height;
        if (w > maxWidth || h > maxHeight) {
          if (w / h > maxWidth / maxHeight) {
            h = Math.round((h * maxWidth) / w);
            w = maxWidth;
          } else {
            w = Math.round((w * maxHeight) / h);
            h = maxHeight;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        resolve(dataUrl);
      };
      img.onerror = () => reject(new Error('Failed to load image.'));
      img.src = e.target.result;
    };
    reader.onerror = () => reject(new Error('Failed to read file.'));
    reader.readAsDataURL(file);
  });
}

function setMediaAttachment(type, url, name) {
  currentAttachment = { type, url, name };
  if (chatAttachmentBar && chatAttachmentThumb && chatAttachmentBadge && chatAttachmentName) {
    chatAttachmentThumb.src = url;
    chatAttachmentBadge.textContent = type === 'image' ? 'PHOTO' : 'GIF';
    chatAttachmentName.textContent = name || (type === 'image' ? 'Photo Attached' : 'GIF Attached');
    chatAttachmentBar.hidden = false;
  }
  if (chatEmojiDrawer) chatEmojiDrawer.hidden = true;
  if (chatGifDrawer) chatGifDrawer.hidden = true;
  updateChatSendButtonState();
  if (chatMessageInput) chatMessageInput.focus();
}

function clearMediaAttachment() {
  currentAttachment = null;
  if (chatAttachmentBar) chatAttachmentBar.hidden = true;
  if (chatFileInput) chatFileInput.value = '';
  updateChatSendButtonState();
}

if (chatAttachmentRemoveBtn) {
  chatAttachmentRemoveBtn.addEventListener('click', clearMediaAttachment);
}

const chatAttachmentPreviewBox = document.querySelector('.chat-attachment-preview-box');
if (chatAttachmentPreviewBox) {
  chatAttachmentPreviewBox.addEventListener('click', () => {
    if (currentAttachment && currentAttachment.url) {
      openChatLightbox(currentAttachment.url);
    }
  });
}

// Photo Upload Button & File Input
const chatImgBtn = $('chat-img-btn');
if (chatImgBtn && chatFileInput) {
  chatImgBtn.addEventListener('click', () => {
    chatFileInput.click();
  });

  chatFileInput.addEventListener('change', async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      notify('Please select a valid photo/image.');
      return;
    }

    if (file.size > 15 * 1024 * 1024) {
      notify('Please select an image under 15MB.');
      return;
    }

    try {
      notify('Optimizing photo for KSRTC passengers… 📷');
      const compressedUrl = await compressImageFile(file);
      setMediaAttachment('image', compressedUrl, file.name || 'Passenger Photo');
    } catch (err) {
      console.warn('Image processing error:', err);
      notify('Failed to process image.');
    }
  });
}

// ==========================================================================
// GIPHY API Integration (Trending, Live Search & Direct Send)
// ==========================================================================
const GIPHY_API_KEY = 'j6rD6rZA3y5enfNXfaDjLtfV6FT6OA78';
const GIPHY_CACHE = new Map();
let activeGifCategory = 'trending';
let gifSearchDebounceTimer = null;
let activeGifSearchController = null;

const GIPHY_CATEGORY_QUERIES = {
  trending: '',
  malayalam: 'malayalam comedy mohanlal',
  keralabus: 'kerala bus aanavandi',
  comedy: 'comedy funny laugh',
  music: 'music dance beat',
  rain: 'rain monsoon aesthetic',
  love: 'love heart cute',
  reactions: 'reaction thumbs up wow'
};

function formatGiphyItem(item) {
  const cleanTitle = (item.title || 'GIF')
    .replace(/\s*GIF(\s*by\s*.*)?$/i, '')
    .trim() || 'GIF';
  return {
    id: item.id,
    title: cleanTitle,
    url: `https://i.giphy.com/${item.id}.gif`,
    thumb: item.images?.fixed_height_downsampled?.url || item.images?.fixed_height_small?.url || item.images?.fixed_height?.url || `https://i.giphy.com/${item.id}.gif`
  };
}

async function fetchGiphyData(endpoint, params = {}) {
  const queryStr = new URLSearchParams({
    api_key: GIPHY_API_KEY,
    rating: 'pg',
    ...params
  }).toString();
  const url = `https://api.giphy.com/v1/gifs/${endpoint}?${queryStr}`;
  const cacheKey = `${endpoint}:${queryStr}`;

  if (GIPHY_CACHE.has(cacheKey)) {
    return GIPHY_CACHE.get(cacheKey);
  }

  if (activeGifSearchController) {
    activeGifSearchController.abort();
  }
  activeGifSearchController = new AbortController();

  const res = await fetch(url, { signal: activeGifSearchController.signal });
  if (!res.ok) throw new Error(`GIPHY API HTTP ${res.status}`);
  const json = await res.json();
  const list = (json.data || []).map(formatGiphyItem);

  if (GIPHY_CACHE.size > 80) {
    const first = GIPHY_CACHE.keys().next().value;
    GIPHY_CACHE.delete(first);
  }
  GIPHY_CACHE.set(cacheKey, list);
  return list;
}

async function loadGiphyGifs(query = '') {
  if (!chatGifGrid) return;
  const clean = query.trim();

  // Show loading indicator
  chatGifGrid.innerHTML = `
    <div class="chat-gif-loading">
      <div class="chat-gif-spinner"></div>
      <span>${clean ? `Searching GIPHY for <strong>"${escapeHtml(clean)}"</strong>…` : 'Loading Trending GIFs from GIPHY…'}</span>
    </div>
  `;
  if (chatGifCountBadge) {
    chatGifCountBadge.textContent = clean ? 'Searching…' : 'Trending';
  }

  try {
    let items = [];
    if (clean) {
      items = await fetchGiphyData('search', { q: clean, limit: 30 });
    } else if (activeGifCategory === 'trending' || !GIPHY_CATEGORY_QUERIES[activeGifCategory]) {
      items = await fetchGiphyData('trending', { limit: 30 });
    } else {
      const catQuery = GIPHY_CATEGORY_QUERIES[activeGifCategory];
      items = await fetchGiphyData('search', { q: catQuery, limit: 30 });
    }

    if (!items || items.length === 0) {
      chatGifGrid.innerHTML = `
        <div style="grid-column: span 2; text-align: center; padding: 32px 12px; color: #64748b; font-size: 12.5px;">
          No GIFs found for "${escapeHtml(clean || activeGifCategory)}". Try searching something else!
        </div>
      `;
      if (chatGifCountBadge) chatGifCountBadge.textContent = '0 GIFs';
      return;
    }

    if (chatGifCountBadge) {
      chatGifCountBadge.textContent = clean ? `${items.length} Results` : 'Trending';
    }

    chatGifGrid.innerHTML = items.map((g) => `
      <div class="chat-gif-item" data-gif-url="${escapeHtml(g.url)}" data-gif-title="${escapeHtml(g.title)}" title="${escapeHtml(g.title)}">
        <img src="${escapeHtml(g.thumb)}" alt="${escapeHtml(g.title)}" loading="lazy" referrerpolicy="no-referrer" />
        <span class="chat-gif-item-title">${escapeHtml(g.title)}</span>
      </div>
    `).join('');
  } catch (err) {
    if (err.name === 'AbortError') return;
    console.warn('GIPHY fetch error:', err);
    chatGifGrid.innerHTML = `
      <div style="grid-column: span 2; text-align: center; padding: 32px 12px; color: #f87171; font-size: 12px;">
        ⚠️ Failed to load GIFs from GIPHY. Please check your network connection.
      </div>
    `;
    if (chatGifCountBadge) chatGifCountBadge.textContent = 'Error';
  }
}

const chatGifBtn = $('chat-gif-btn');
if (chatGifBtn && chatGifDrawer) {
  chatGifBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (chatEmojiDrawer) chatEmojiDrawer.hidden = true;
    const isOpening = chatGifDrawer.hidden;
    chatGifDrawer.hidden = !isOpening;
    if (isOpening) {
      // Show trending GIFs when the picker opens, or search if input has value
      const query = chatGifSearchInput ? chatGifSearchInput.value.trim() : '';
      loadGiphyGifs(query);
      setTimeout(() => {
        if (chatGifSearchInput && !('ontouchstart' in window)) {
          chatGifSearchInput.focus();
        }
      }, 120);
      if (chatMessagesContainer) {
        chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;
      }
    }
  });
}

if (chatGifCloseBtn && chatGifDrawer) {
  chatGifCloseBtn.addEventListener('click', () => {
    chatGifDrawer.hidden = true;
  });
}

if (chatGifCatPills) {
  chatGifCatPills.addEventListener('click', (e) => {
    const pill = e.target.closest('.chat-gif-cat-pill');
    if (!pill) return;
    chatGifCatPills.querySelectorAll('.chat-gif-cat-pill').forEach(p => p.classList.remove('is-active'));
    pill.classList.add('is-active');
    activeGifCategory = pill.getAttribute('data-cat') || 'trending';
    if (chatGifSearchInput) {
      chatGifSearchInput.value = '';
    }
    if (chatGifSearchClear) {
      chatGifSearchClear.hidden = true;
    }
    loadGiphyGifs('');
  });
}

if (chatGifSearchInput) {
  chatGifSearchInput.addEventListener('input', () => {
    const val = chatGifSearchInput.value.trim();
    if (chatGifSearchClear) chatGifSearchClear.hidden = !val;
    clearTimeout(gifSearchDebounceTimer);
    gifSearchDebounceTimer = setTimeout(() => {
      loadGiphyGifs(val);
    }, 280);
  });
}

if (chatGifSearchClear && chatGifSearchInput) {
  chatGifSearchClear.addEventListener('click', () => {
    chatGifSearchInput.value = '';
    chatGifSearchClear.hidden = true;
    clearTimeout(gifSearchDebounceTimer);
    loadGiphyGifs('');
    chatGifSearchInput.focus();
  });
}

if (chatGifGrid) {
  chatGifGrid.addEventListener('click', (e) => {
    const item = e.target.closest('.chat-gif-item');
    if (!item) return;
    const url = item.getAttribute('data-gif-url');
    const title = item.getAttribute('data-gif-title') || 'GIF';
    if (url) {
      setMediaAttachment('gif', url, title);
    }
  });
}

// ==========================================================================
// Phone Emoji Keyboard Drawer & Native Phone Keyboard Focus
// ==========================================================================
const EMOJI_SETS = {
  all: ['🚌', '🌧️', '🎵', '❤️', '👋', '😂', '😍', '🚍', '✨', '👍', '☕', '🔥', '🥰', '🙏', '🎧', '📻', '💃', '🌴', '🥳', '😎', '💖', '🙌', '💯', '😴', '🤩', '🚗', '🛵', '🛤️', '🎫', '🤝'],
  travel: ['🚌', '🚍', '🌧️', '☔', '☕', '🌴', '🛤️', '🎫', '🚏', '⛰️', '🚗', '🛵', '🧳', '🛣️', '🍃', '🌊', '🌅', '🛺', '🚦', '⛽'],
  smileys: ['😀', '😂', '🤣', '😍', '🥰', '😎', '🥳', '🤩', '😴', '🤗', '🤔', '😋', '🥺', '😌', '😜', '😇', '🤫', '🤭', '🤤', '🤠'],
  music: ['🎵', '🎶', '📻', '🎧', '✨', '🔥', '💃', '🕺', '🎸', '🎤', '🥁', '🎷', '🎹', '🔊', '🌟', '🎛️', '🎺', '🎻', '🎙️', '🎉'],
  hearts: ['❤️', '💖', '💕', '💘', '💓', '💗', '💞', '💝', '💙', '💜', '💚', '💛', '🧡', '🤍', '🤎', '❣️', '💌', '🌹', '💐', '✨'],
  gestures: ['👍', '👋', '🙏', '👏', '🙌', '🤝', '✌️', '👌', '🤞', '💪', '🤙', '✊', '👊', '🫡', '💯', '☝️', '👉', '👈', '🤌', '🫶']
};

let activeEmojiCategory = 'all';

function renderEmojiGrid() {
  if (!chatEmojiGrid) return;
  const emojis = EMOJI_SETS[activeEmojiCategory] || EMOJI_SETS.all;
  chatEmojiGrid.innerHTML = emojis.map((em) => `
    <button type="button" class="chat-emoji-item" data-emoji="${em}" aria-label="Insert ${em}">${em}</button>
  `).join('');
}

const chatEmojiBtn = $('chat-emoji-btn');
if (chatEmojiBtn && chatEmojiDrawer) {
  chatEmojiBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (chatGifDrawer) chatGifDrawer.hidden = true;
    const isOpen = !chatEmojiDrawer.hidden;
    chatEmojiDrawer.hidden = isOpen;
    if (!isOpen) {
      renderEmojiGrid();
    }
  });
}

const chatEmojiKbBtn = $('chat-emoji-kb-btn');
if (chatEmojiKbBtn) {
  chatEmojiKbBtn.addEventListener('click', () => {
    if (chatEmojiDrawer) chatEmojiDrawer.hidden = true;
    if (chatMessageInput) chatMessageInput.focus();
  });
}

if (chatEmojiCloseBtn && chatEmojiDrawer) {
  chatEmojiCloseBtn.addEventListener('click', () => {
    chatEmojiDrawer.hidden = true;
  });
}

if (chatEmojiCats) {
  chatEmojiCats.addEventListener('click', (e) => {
    const btn = e.target.closest('.chat-emoji-cat-btn');
    if (!btn) return;
    chatEmojiCats.querySelectorAll('.chat-emoji-cat-btn').forEach(b => b.classList.remove('is-active'));
    btn.classList.add('is-active');
    activeEmojiCategory = btn.getAttribute('data-cat') || 'all';
    renderEmojiGrid();
  });
}

if (chatEmojiGrid && chatMessageInput) {
  chatEmojiGrid.addEventListener('click', (e) => {
    const item = e.target.closest('.chat-emoji-item');
    if (!item) return;
    const emoji = item.getAttribute('data-emoji');
    if (!emoji) return;

    // Insert at cursor position or append
    const start = chatMessageInput.selectionStart ?? chatMessageInput.value.length;
    const end = chatMessageInput.selectionEnd ?? chatMessageInput.value.length;
    const text = chatMessageInput.value;
    chatMessageInput.value = text.slice(0, start) + emoji + text.slice(end);
    const nextPos = start + emoji.length;
    chatMessageInput.setSelectionRange(nextPos, nextPos);
    if (!('ontouchstart' in window)) {
      chatMessageInput.focus();
    }
    updateChatSendButtonState();
  });
}

// ==========================================================================
// Apple-Style Fullscreen Media Lightbox
// ==========================================================================
function openChatLightbox(src) {
  if (!chatLightbox || !chatLightboxImg || !src) return;
  chatLightboxImg.src = src;
  chatLightbox.hidden = false;
  try { document.body.style.overflow = 'hidden'; } catch (e) {}
}

function closeChatLightbox() {
  if (!chatLightbox) return;
  chatLightbox.hidden = true;
  if (chatLightboxImg) chatLightboxImg.src = '';
  try { document.body.style.overflow = ''; } catch (e) {}
}

if (chatLightboxClose) {
  chatLightboxClose.addEventListener('click', closeChatLightbox);
}
if (chatLightboxBackdrop) {
  chatLightboxBackdrop.addEventListener('click', closeChatLightbox);
}
if (chatLightbox) {
  chatLightbox.addEventListener('click', (e) => {
    if (e.target === chatLightbox || e.target === chatLightboxBackdrop) {
      closeChatLightbox();
    }
  });
}
const chatLightboxDialog = document.querySelector('.chat-lightbox-dialog');
if (chatLightboxDialog) {
  chatLightboxDialog.addEventListener('click', (e) => {
    // If the close button was clicked, let it bubble, otherwise don't close
    if (!e.target.closest('#chat-lightbox-close')) {
      e.stopPropagation();
    }
  });
}
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (chatLightbox && !chatLightbox.hidden) closeChatLightbox();
    if (chatEmojiDrawer && !chatEmojiDrawer.hidden) chatEmojiDrawer.hidden = true;
    if (chatGifDrawer && !chatGifDrawer.hidden) chatGifDrawer.hidden = true;
  }
});

// Quick Reaction Chips Wiring
const quickChipsContainer = $('chat-quick-chips');
if (quickChipsContainer) {
  quickChipsContainer.addEventListener('click', (e) => {
    const chip = e.target.closest('.chat-chip');
    if (!chip) return;
    const chipText = chip.getAttribute('data-text') || chip.textContent.trim();
    if (!chipText || !chatMessageInput) return;

    chatMessageInput.value = chipText;
    updateChatSendButtonState();
    if (chatForm) {
      chatForm.dispatchEvent(new Event('submit', { cancelable: true }));
    }
  });
}

const chatOptionsBtn = $('chat-options-btn');

function updateChatMuteUI() {
  if (chatMuteBtn) {
    if (isChatNotificationMuted) {
      chatMuteBtn.classList.add('is-muted');
      chatMuteBtn.setAttribute('title', 'Unmute notification sound');
      chatMuteBtn.setAttribute('aria-label', 'Unmute notification sound');
      chatMuteBtn.setAttribute('aria-pressed', 'true');
    } else {
      chatMuteBtn.classList.remove('is-muted');
      chatMuteBtn.setAttribute('title', 'Mute notification sound');
      chatMuteBtn.setAttribute('aria-label', 'Mute notification sound');
      chatMuteBtn.setAttribute('aria-pressed', 'false');
    }
  }

  if (chatOptionsSoundLabel) {
    chatOptionsSoundLabel.textContent = isChatNotificationMuted ? 'Unmute notification sound' : 'Mute notification sound';
  }
  if (chatOptionsSoundIcon) {
    chatOptionsSoundIcon.textContent = isChatNotificationMuted ? '🔕' : '🔔';
  }
}

function toggleChatNotificationSound(showToast = true) {
  isChatNotificationMuted = !isChatNotificationMuted;
  try {
    localStorage.setItem(CHAT_SOUND_MUTED_KEY, isChatNotificationMuted ? 'true' : 'false');
  } catch (e) {}
  updateChatMuteUI();

  // If notification off is pressed, immediately hide the left side pop up in laptop
  if (isChatNotificationMuted && desktopRecentChatsContainer) {
    clearTimeout(desktopRecentChatsTimer);
    clearTimeout(desktopRecentChatsFadeTimer);
    desktopRecentChatsContainer.classList.remove('is-visible', 'is-fading');
  }

  if (showToast) {
    notify(isChatNotificationMuted ? 'Chat notifications muted 🔕' : 'Chat notifications unmuted 🔔');
  }
}

// Initial UI sync
updateChatMuteUI();

if (chatMuteBtn) {
  chatMuteBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleChatNotificationSound(true);
  });
}

if (chatOptionsToggleSound) {
  chatOptionsToggleSound.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleChatNotificationSound(true);
    if (chatOptionsMenu) chatOptionsMenu.hidden = true;
    if (chatOptionsBtn) chatOptionsBtn.setAttribute('aria-expanded', 'false');
  });
}

if (chatOptionsViewRules) {
  chatOptionsViewRules.addEventListener('click', (e) => {
    e.stopPropagation();
    if (chatOptionsMenu) chatOptionsMenu.hidden = true;
    if (chatOptionsBtn) chatOptionsBtn.setAttribute('aria-expanded', 'false');
    if (chatSystemNote) {
      chatSystemNote.hidden = false;
      chatSystemNote.style.opacity = '1';
      chatSystemNote.style.transform = 'none';
      try { localStorage.removeItem(CHAT_NOTE_DISMISSED_KEY); } catch (e) {}
      notify('KSRTC Radio guidelines opened.');
    }
  });
}

if (chatOptionsBtn) {
  chatOptionsBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!chatOptionsMenu) {
      if (chatSystemNote) {
        chatSystemNote.hidden = false;
        chatSystemNote.style.opacity = '1';
        chatSystemNote.style.transform = 'none';
        try { localStorage.removeItem(CHAT_NOTE_DISMISSED_KEY); } catch (e) {}
        notify('KSRTC Radio guidelines opened.');
      }
      return;
    }
    const isHidden = chatOptionsMenu.hidden;
    chatOptionsMenu.hidden = !isHidden;
    chatOptionsBtn.setAttribute('aria-expanded', isHidden ? 'true' : 'false');
  });
}

// Close options menu when clicking anywhere outside or pressing Esc
document.addEventListener('click', (e) => {
  if (chatOptionsMenu && !chatOptionsMenu.hidden) {
    if (!chatOptionsMenu.contains(e.target) && (!chatOptionsBtn || !chatOptionsBtn.contains(e.target))) {
      chatOptionsMenu.hidden = true;
      if (chatOptionsBtn) chatOptionsBtn.setAttribute('aria-expanded', 'false');
    }
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && chatOptionsMenu && !chatOptionsMenu.hidden) {
    chatOptionsMenu.hidden = true;
    if (chatOptionsBtn) chatOptionsBtn.setAttribute('aria-expanded', 'false');
  }
});
