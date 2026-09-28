import { journeyConfig, playlist } from './config.js?v=5';

function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

// Always shuffle playlist whenever refreshed or loaded
shuffle(playlist);

const $ = (id) => document.getElementById(id);
const state = { isJourneyStarted:false, isRainMode:false, isStopping:false, currentVideo:'journey', currentSongIndex:0, isPlaying:false, currentTime:0, duration:0, startTimer:null, unblurTimer:null };
const app = $('app');
const journey = $('journey-video'), rainVideo = $('rain-video'), stopVideo = $('stop-video'), scene = $('scene-video');
const loadingBar = $('loading-bar'), loadingStatus = $('loading-status');
const els = { intro:$('intro'), player:$('player'), start:$('start-journey'), replay:$('replay'), fullscreenBtn:$('fullscreen-btn'), playlistToggle:$('playlist-toggle'), album:$('album-art'), title:$('track-title'), artist:$('track-artist'), progress:$('progress'), current:$('current-time'), duration:$('duration'), play:$('play'), previous:$('previous'), next:$('next'), stop:$('make-stop'), rain:$('rain'), horn:$('horn'), bell:$('bell'), toast:$('toast'), brand:document.querySelector('.brand'), boardNow:$('board-now-btn'), busSoundToggle:$('bus-sound-toggle'), busSoundSlider:$('bus-sound-slider'), busSoundValue:$('bus-sound-value'), busSoundLabel:$('bus-sound-label'), rainSoundBar:$('rain-sound-bar'), rainSoundToggle:$('rain-sound-toggle'), rainSoundSlider:$('rain-sound-slider'), rainSoundValue:$('rain-sound-value'), rainSoundLabel:$('rain-sound-label') };

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

// Initialize first track metadata in DOM
els.title.textContent = playlist[0].title;
els.artist.textContent = playlist[0].artist;
els.album.src = playlist[0].albumArt;

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

function preloadAudioAssets() {
  try {
    runAudio.load();
    rainAudio.load();
    hornAudio.load();
    bellAudio.load();
    startAudio.load();
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
            if (ytPlayer.setVolume) ytPlayer.setVolume(Math.round(journeyConfig.volumes.music * 100));
            // Only play if the journey has actually started and finished the loading screen!
            if (hasFinished && state.isPlaying) {
              if (ytPlayer.unMute) ytPlayer.unMute();
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
  state.currentSongIndex = (index + playlist.length) % playlist.length;
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
    if (ytPlayer.unMute) ytPlayer.unMute();
    if (ytPlayer.setVolume) ytPlayer.setVolume(Math.round(journeyConfig.volumes.music * 100));
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
      if (ytPlayer.unMute) ytPlayer.unMute();
      if (ytPlayer.setVolume) ytPlayer.setVolume(Math.round(journeyConfig.volumes.music * 100));
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

let wasMusicPlayingBeforeStop = false;

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

    // Pause music during the stop sequence so the bus stop audio is clearly heard
    wasMusicPlayingBeforeStop = state.isPlaying;
    if (wasMusicPlayingBeforeStop) {
      pauseMusic();
    }

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
    if (wasMusicPlayingBeforeStop) {
      playMusic();
      wasMusicPlayingBeforeStop = false;
    }
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
      if (ytPlayer.isMuted && ytPlayer.isMuted()) {
        ytPlayer.unMute();
      }
      if (ytPlayer.getVolume && ytPlayer.getVolume() === 0) {
        ytPlayer.setVolume(Math.round(journeyConfig.volumes.music * 100));
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
   Apple-Style Playlist Drawer Logic
   ========================================================================== */
const playlistToggle = $('playlist-toggle');
const playlistDrawerWrap = $('playlist-drawer-wrap');
const playlistDrawer = $('playlist-drawer');
const playlistBackdrop = $('playlist-backdrop');
const playlistCloseBtn = $('playlist-close-btn');
const playlistItemsScroll = $('playlist-items-scroll');
const playlistSearch = $('playlist-search');
const playlistSearchClear = $('playlist-search-clear');
const playlistCountBadge = $('playlist-count-badge');
const playlistSubtitle = $('playlist-subtitle');
const drawerCurrentTitle = $('drawer-current-title');
const drawerCurrentArtist = $('drawer-current-artist');
const drawerJumpBtn = $('drawer-jump-btn');

let drawerCloseTimer = null;
let currentSearchFilter = '';

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
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
  const items = playlistItemsScroll.querySelectorAll('.playlist-item');
  items.forEach(item => {
    const idx = parseInt(item.dataset.index, 10);
    const isCurrent = idx === state.currentSongIndex;
    item.classList.toggle('is-current', isCurrent);
    item.classList.toggle('is-playing', isCurrent && state.isPlaying);
  });
}

function renderPlaylist(filter = '') {
  if (!playlistItemsScroll) return;
  currentSearchFilter = filter.trim().toLowerCase();

  const filtered = playlist
    .map((song, index) => ({ song, index }))
    .filter(({ song }) => {
      if (!currentSearchFilter) return true;
      return song.title.toLowerCase().includes(currentSearchFilter) ||
             song.artist.toLowerCase().includes(currentSearchFilter);
    });

  if (filtered.length === 0) {
    playlistItemsScroll.innerHTML = `<div class="playlist-empty-state">No songs found matching "${escapeHtml(filter)}"</div>`;
    return;
  }

  playlistItemsScroll.innerHTML = filtered.map(({ song, index }) => {
    const isCurrent = index === state.currentSongIndex;
    const isPlaying = isCurrent && state.isPlaying;
    return `
      <button type="button" class="playlist-item ${isCurrent ? 'is-current' : ''} ${isPlaying ? 'is-playing' : ''}" data-index="${index}" aria-label="Play ${escapeHtml(song.title)}">
        <span class="item-index">${index + 1}</span>
        <div class="item-thumb-wrap">
          <img class="item-thumb" src="${song.albumArt}" alt="" loading="lazy" />
          <div class="item-eq-bars" aria-hidden="true">
            <i></i><i></i><i></i>
          </div>
        </div>
        <div class="item-meta">
          <div class="item-title">${escapeHtml(song.title)}</div>
          <div class="item-artist">${escapeHtml(song.artist)}</div>
        </div>
      </button>
    `;
  }).join('');

  updatePlaylistActiveState();
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
}

if (playlistSearch) {
  playlistSearch.addEventListener('input', (e) => {
    const val = e.target.value;
    if (playlistSearchClear) {
      playlistSearchClear.hidden = !val;
    }
    renderPlaylist(val);
  });
}

if (playlistSearchClear) {
  playlistSearchClear.addEventListener('click', () => {
    if (playlistSearch) {
      playlistSearch.value = '';
      playlistSearch.focus();
    }
    playlistSearchClear.hidden = true;
    renderPlaylist('');
  });
}

if (drawerJumpBtn) {
  drawerJumpBtn.addEventListener('click', scrollToCurrentSong);
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
const chatPopBubble = $('chat-pop-bubble');
const chatPopSender = $('chat-pop-sender');
const chatPopText = $('chat-pop-text');

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
function triggerSongPoppingMessage(senderName, text, color, isVerified = false, gender = '') {
  if (!chatPopBubble || !chatPopSender || !chatPopText) return;
  if (!senderName || senderName.toLowerCase() === 'system') return;

  clearTimeout(popBubbleTimer);
  clearTimeout(popBubbleFadeTimer);

  const genderHtml = (gender === 'M' || gender === 'F')
    ? ` <span class="chat-gender-tag gender-${gender.toLowerCase()}">${gender}</span>`
    : '';

  if (isVerified) {
    chatPopSender.innerHTML = `<span class="chat-sender-name">${escapeHtml(senderName)}</span>${genderHtml} ${VERIFIED_TICK_SVG}`;
  } else {
    chatPopSender.innerHTML = `<span class="chat-sender-name">${escapeHtml(senderName)}</span>${genderHtml}`;
  }
  chatPopSender.style.color = color;
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
    }, 240);
  }, 2000);
}

if (chatPopBubble) {
  chatPopBubble.addEventListener('click', () => {
    openChatDrawer();
  });
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
  if (chatToggle) chatToggle.setAttribute('aria-expanded', 'true');

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

if (chatForm && chatMessageInput) {
  chatForm.addEventListener('submit', (e) => {
    e.preventDefault();

    const text = chatMessageInput.value.trim();
    if (!text) return;

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

    sendChatMessageFn(activeName.slice(0, 24), text, isAdminVerified, currentChatGender)
      .then(() => {
        chatMessageInput.value = '';
        if (chatSendBtn) chatSendBtn.disabled = false;
        chatMessageInput.focus();
      })
      .catch((err) => {
        console.warn('Chat send error:', err);
        if (chatSendBtn) chatSendBtn.disabled = false;
        notify('Unable to send message right now.');
      });
  });
}

/* ==========================================================================
   Live Sessions Tracker & Global Firebase Realtime Database Layer
   ========================================================================== */
function initLiveSessionsAndChat() {
  const liveCountEl = $('live-count');
  const STORAGE_KEY = 'ksrtc_live_sessions_v1';
  const HEARTBEAT_INTERVAL = 2500;
  const SESSION_TTL = 7000;
  const mySessionId = 's_' + Math.random().toString(36).substring(2, 9) + '_' + Date.now();

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
    if (!liveCountEl) return;
    const finalCount = Math.max(1, count);
    if (liveCountEl.textContent !== String(finalCount)) {
      liveCountEl.textContent = String(finalCount);
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

    if (isVerified) {
      senderName = 'Admin';
    } else if (senderName.toLowerCase() === 'admin') {
      senderName = 'Passenger';
    }

    const text = (data.text || '').trim();
    if (!text) return;

    const tagColor = isVerified ? '#38bdf8' : (isMe ? '#34d399' : getPassengerColor(senderName));
    const timeStr = formatChatTime(data.timestamp);

    const gender = (data.gender === 'M' || data.gender === 'F')
      ? data.gender
      : (isMe ? currentChatGender : getPassengerGenderFallback(senderName));

    const genderHtml = `<span class="chat-gender-tag gender-${gender.toLowerCase()}" title="${gender === 'M' ? 'Male' : 'Female'}">${escapeHtml(gender)}</span>`;

    const senderHtml = isVerified
      ? `<span class="chat-sender-name">${escapeHtml(senderName)}</span> ${genderHtml} ${VERIFIED_TICK_SVG}`
      : `<span class="chat-sender-name">${escapeHtml(senderName)}</span> ${genderHtml}`;

    const msgEl = document.createElement('div');
    msgEl.className = `chat-msg ${isMe ? 'is-me' : ''} ${isVerified ? 'is-admin-msg' : ''}`;
    msgEl.dataset.id = msgId;

    msgEl.innerHTML = `
      <div class="chat-msg-header">
        <span class="chat-msg-sender" style="color: ${tagColor};">${senderHtml}</span>
        <div class="chat-msg-header-right">
          <span class="chat-msg-time">${escapeHtml(timeStr)}</span>
          <div class="chat-admin-actions">
            <button type="button" class="chat-admin-action-btn chat-pin-btn" data-id="${escapeHtml(msgId)}" title="Pin message" aria-label="Pin message">
              <svg viewBox="0 0 24 24" width="11" height="11" fill="currentColor"><path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6l.8.8.8-.8v-6H18v-2l-2-2z"/></svg>
            </button>
            <button type="button" class="chat-admin-action-btn chat-delete-btn" data-id="${escapeHtml(msgId)}" title="Delete message" aria-label="Delete message">
              <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.3"><path d="M3 6h18m-2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m-6 5v6m4-6v6"/></svg>
            </button>
          </div>
        </div>
      </div>
      <div class="chat-msg-text">${escapeHtml(text)}</div>
    `;

    const isScrolledToBottom =
      chatMessagesContainer.scrollHeight - chatMessagesContainer.clientHeight <=
      chatMessagesContainer.scrollTop + 60;

    chatMessagesContainer.appendChild(msgEl);

    // Enforce keeping only the last 10 messages in the chatbox
    const allMsgs = chatMessagesContainer.querySelectorAll('.chat-msg');
    if (allMsgs.length > 10) {
      for (let i = 0; i < allMsgs.length - 10; i++) {
        const oldMsg = allMsgs[i];
        if (oldMsg && oldMsg.dataset.id) {
          seenMessageIds.delete(oldMsg.dataset.id);
        }
        oldMsg.remove();
      }
    }

    if (isMe || isScrolledToBottom || isChatOpen()) {
      chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;
    }

    // Trigger 2-second popping message on top of the song slider for live messages!
    if (isLive) {
      triggerSongPoppingMessage(senderName, text, tagColor, isVerified, gender);
    }
  }

  if (chatMessagesContainer) {
    chatMessagesContainer.addEventListener('click', (e) => {
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

      const pinBtn = e.target.closest('.chat-pin-btn');
      if (pinBtn) {
        const msgId = pinBtn.getAttribute('data-id');
        if (!isAdminVerified) {
          notify('Admin authorization required.');
          return;
        }
        const msgEl = pinBtn.closest('.chat-msg');
        if (!msgEl) return;
        const senderName = msgEl.querySelector('.chat-sender-name')?.textContent || 'Passenger';
        const text = msgEl.querySelector('.chat-msg-text')?.textContent || '';
        const isVerifiedSender = Boolean(msgEl.querySelector('.verified-tick-icon'));
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
            .then(() => notify('Message pinned to top!'))
            .catch(() => notify('Failed to pin message.'));
        }
      }
    });
  }

  const chatUnpinBtn = $('chat-unpin-btn');
  if (chatUnpinBtn) {
    chatUnpinBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!isAdminVerified) return;
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
        const target = chatMessagesContainer.querySelector(`.chat-msg[data-id="${currentPinnedMessage.id}"]`);
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

      // Live Passenger Chat (strictly last 10 messages)
      const messagesRef = ref(db, 'messages');
      const recentMessagesQuery = query(messagesRef, limitToLast(10));
      let isInitialChatHistoryLoaded = false;

      function autoPruneOldMessages() {
        get(messagesRef).then((snap) => {
          const val = snap.val();
          if (!val || typeof val !== 'object') return;
          const keys = Object.keys(val).filter(k => k !== '_pinned');
          if (keys.length > 10) {
            keys.sort((a, b) => {
              const tA = (val[a] && val[a].timestamp) || 0;
              const tB = (val[b] && val[b].timestamp) || 0;
              return tA - tB;
            });
            const toDelete = keys.slice(0, keys.length - 10);
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
        }
      });

      onChildRemoved(recentMessagesQuery, (snapshot) => {
        if (snapshot.key === '_pinned') {
          renderPinnedCard(null);
          return;
        }
        if (!chatMessagesContainer) return;
        const msgEl = chatMessagesContainer.querySelector(`.chat-msg[data-id="${snapshot.key}"]`);
        if (msgEl) {
          msgEl.style.opacity = '0';
          msgEl.style.transform = 'scale(0.92)';
          setTimeout(() => {
            msgEl.remove();
            seenMessageIds.delete(snapshot.key);
            if (chatMessagesContainer.querySelectorAll('.chat-msg').length === 0 && chatEmptyState) {
              chatEmptyState.style.display = 'block';
            }
          }, 200);
        }
        if (currentPinnedMessage && currentPinnedMessage.id === snapshot.key) {
          renderPinnedCard(null);
        }
      });

      const pinnedRef = ref(db, 'messages/_pinned');
      onValue(pinnedRef, (snapshot) => {
        renderPinnedCard(snapshot.val());
      });

      // Enable live popping on top of song after initial chat backlog finishes loading
      setTimeout(() => {
        isInitialChatHistoryLoaded = true;
        autoPruneOldMessages();
      }, 1200);

      deleteChatMessageFn = (msgId) => {
        const p = remove(ref(db, `messages/${msgId}`));
        if (currentPinnedMessage && currentPinnedMessage.id === msgId) {
          remove(ref(db, 'messages/_pinned')).catch(() => {});
        }
        return p;
      };

      pinChatMessageFn = (msgId, name, text, isVerified, gender = 'M') => {
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
        return remove(ref(db, 'messages/_pinned'));
      };

      sendChatMessageFn = (name, text, isSenderAdmin = false, gender = 'M') => {
        const payload = {
          name,
          text,
          gender: gender || 'M',
          session: mySessionId,
          timestamp: serverTimestamp()
        };
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



