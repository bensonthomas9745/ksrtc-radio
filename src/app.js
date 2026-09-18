import { journeyConfig, playlist } from './config.js?v=3';

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

const rainAudio = new Audio(journeyConfig.sounds.rain);
rainAudio.loop = true;
rainAudio.preload = 'none';
rainAudio.volume = currentRainVolume / 100;

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

// Bus running sound state & user volume preference
const savedRunVolume = (() => {
  try { return localStorage.getItem('ksrtc_bus_sound_volume'); } catch (e) { return null; }
})();
let currentRunVolume = savedRunVolume !== null ? Math.max(0, Math.min(100, parseInt(savedRunVolume, 10))) : Math.round((journeyConfig.volumes.run ?? 0.3) * 100);
let lastNonZeroRunVolume = currentRunVolume > 0 ? currentRunVolume : 30;

const runAudio = new Audio(journeyConfig.sounds.run);
runAudio.loop = true;
runAudio.preload = 'none';
runAudio.volume = currentRunVolume / 100;

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

  journey.addEventListener('ended', () => {
    journey.currentTime = 0;
    playSafe(journey);
  });

  const onReady = () => {
    preloadStatus.journey = true;
    checkAllLoadedAndFinish();
  };

  // 1. Immediately attach progressive source so first frame and chunks buffer right away
  journey.src = journeyConfig.videos.journey;
  if (journey.readyState >= 3) {
    preloadStatus.journey = true;
  } else {
    journey.addEventListener('canplay', onReady, { once: true });
    journey.addEventListener('loadeddata', onReady, { once: true });
    journey.addEventListener('error', onReady, { once: true });
  }
  journey.load();

  // 2. Concurrently fetch the entire video into RAM as a Blob for zero-buffer looping
  fetch(journeyConfig.videos.journey)
    .then(res => (res.ok ? res.blob() : null))
    .then(blob => {
      if (!blob) return;
      journeyBlobUrl = URL.createObjectURL(blob);
      if (!state.isJourneyStarted) {
        journey.src = journeyBlobUrl;
        journey.load();
        preloadStatus.journey = true;
      } else {
        journey.addEventListener('ended', () => {
          if (journey.src !== journeyBlobUrl) {
            journey.src = journeyBlobUrl;
            journey.load();
            journey.currentTime = 0;
            playSafe(journey);
          }
        }, { once: true });
      }
    })
    .catch(() => {});
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

// Load primary journey video once into RAM for buffer-free looping
initJourneyVideo();
// Immediately initialize secondary videos so make-stop and rain are instantly responsive
initSecondaryVideos();

function preloadSecondaryVideos() {
  // Maintained for backward compatibility; videos are already initialized upfront
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
        autoplay: 1,
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
            if (ytPlayer.unMute) ytPlayer.unMute();
            if (ytPlayer.setVolume) ytPlayer.setVolume(Math.round(journeyConfig.volumes.music * 100));
            // Automatically play video immediately when ready
            if (ytPlayer.playVideo) {
              ytPlayer.playVideo();
            } else if (ytPlayer.loadVideoById) {
              ytPlayer.loadVideoById(playlist[state.currentSongIndex].id);
            }
            state.isPlaying = true;
            els.play.classList.add('is-playing');
            els.play.setAttribute('aria-label', 'Pause');
          } catch (e) {
            console.warn('Initial play attempt error:', e);
          }
          if (pendingTrack !== null) {
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
    const target = lastNonZeroRunVolume > 0 ? lastNonZeroRunVolume : 30;
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
  effect(journeyConfig.sounds.busBell);

  if (!stopVideo.src || stopVideo.src === window.location.href) {
    stopVideo.src = journeyConfig.videos.stop;
  }

  try {
    stopVideo.currentTime = 0;
  } catch (e) {}

  journey.pause();
  journey.classList.remove('is-visible');
  stopVideo.classList.add('is-visible');

  const playPromise = playSafe(stopVideo);
  if (playPromise && typeof playPromise.catch === 'function') {
    playPromise.catch(() => {
      clearTimeout(stopFallbackTimer);
      stopFallbackTimer = setTimeout(onStopEnded, 1800);
    });
  }

  state.currentVideo = 'stop';
  notify('Stopping at the next stop…');

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
}

let currentStartupSound = null;

function startJourney() {
  if (state.isJourneyStarted) return;
  state.isJourneyStarted = true;
  hasFinished = false;
  els.start.disabled = true;
  els.intro.classList.add('is-starting');

  // Trigger song playback synchronously on user gesture so mobile browsers authorize audio
  state.isPlaying = true;
  els.play.classList.add('is-playing');
  els.play.setAttribute('aria-label', 'Pause');
  if (ytPlayer && ytReady) {
    try {
      if (ytPlayer.unMute) ytPlayer.unMute();
      if (ytPlayer.setVolume) ytPlayer.setVolume(Math.round(journeyConfig.volumes.music * 100));
      if (ytPlayer.playVideo) {
        ytPlayer.playVideo();
      } else if (ytPlayer.loadVideoById) {
        ytPlayer.loadVideoById(playlist[state.currentSongIndex].id);
      }
    } catch (e) {
      playMusic();
    }
  } else {
    pendingTrack = { index: state.currentSongIndex, shouldPlay: true };
  }

  const startupSound = effect(journeyConfig.sounds.journeyStart);
  startupSound.volume = 1;
  currentStartupSound = startupSound;

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

  startupSound.addEventListener('ended', onEngineComplete, { once: true });
  startupSound.addEventListener('error', onEngineComplete, { once: true });

  state.startTimer = setTimeout(onEngineComplete, STARTUP_DURATION_MS);

  // Absolute safety timeout: never hang forever
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

  // Automatically ensure music playback is active when the ride reveals
  state.isPlaying = true;
  els.play.classList.add('is-playing');
  els.play.setAttribute('aria-label', 'Pause');
  if (ytPlayer && ytReady) {
    try {
      const pState = ytPlayer.getPlayerState ? ytPlayer.getPlayerState() : -1;
      if (pState !== YT.PlayerState.PLAYING && pState !== YT.PlayerState.BUFFERING) {
        if (ytPlayer.playVideo) {
          ytPlayer.playVideo();
        }
      }
    } catch (e) {
      playMusic();
    }
  } else {
    pendingTrack = { index: state.currentSongIndex, shouldPlay: true };
  }
  syncRunAudio();
  syncRainAudio();

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
  stopVideo.classList.remove('is-visible');
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
  preloadStatus.minTimerPassed = false;
  if (loadingBar) {
    loadingBar.style.width = '0%';
    loadingBar.style.setProperty('--loading-progress', '0%');
  }
  if (loadingStatus) {
    loadingStatus.textContent = 'Starting your ride in 8 seconds…';
  }
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
  effect(journeyConfig.sounds.horn);
  els.horn.classList.add('is-pressed');
  clearTimeout(hornTimer);
  hornTimer = setTimeout(() => els.horn.classList.remove('is-pressed'), 1400);
}

function triggerBell() {
  effect(journeyConfig.sounds.busBell);
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
els.play.addEventListener('click', () => {
  if (state.isPlaying) {
    pauseMusic();
  } else {
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
    state.isPlaying ? pauseMusic() : playMusic();
  }
  if (e.key === 'ArrowRight') setTrack(state.currentSongIndex + 1, true);
  if (e.key === 'ArrowLeft') setTrack(state.currentSongIndex - 1, true);
});

// Auto-unlock music on the very first user interaction if browser blocked autoplay on initial load
const unlockAudioOnFirstTouch = () => {
  window.removeEventListener('pointerdown', unlockAudioOnFirstTouch);
  window.removeEventListener('touchstart', unlockAudioOnFirstTouch);
  window.removeEventListener('click', unlockAudioOnFirstTouch);
  if (!state.isPlaying && ytPlayer && ytReady) {
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
  if (e.key === 'Escape' && playlistDrawerWrap && !playlistDrawerWrap.hidden) {
    closePlaylistDrawer();
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


