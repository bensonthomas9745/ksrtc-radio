import { journeyConfig, playlist } from './config.js';

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
const els = { intro:$('intro'), player:$('player'), start:$('start-journey'), replay:$('replay'), album:$('album-art'), title:$('track-title'), artist:$('track-artist'), progress:$('progress'), current:$('current-time'), duration:$('duration'), play:$('play'), previous:$('previous'), next:$('next'), stop:$('make-stop'), rain:$('rain'), horn:$('horn'), bell:$('bell'), toast:$('toast'), brand:document.querySelector('.brand') };

// Initialize first track metadata in DOM
els.title.textContent = playlist[0].title;
els.artist.textContent = playlist[0].artist;
els.album.src = playlist[0].albumArt;

const rainAudio = new Audio(journeyConfig.sounds.rain);
rainAudio.loop = true;
rainAudio.volume = journeyConfig.volumes.rain ?? 0.7;

const runAudio = new Audio(journeyConfig.sounds.run);
runAudio.loop = true;
runAudio.volume = journeyConfig.volumes.run ?? 0.3;

const preloadStatus = {
  journey: false,
  rain: false,
  stop: false,
  ytSong: false,
  minTimerPassed: false
};
let isPreloadingYT = false;
let ytSongBuffered = false;
let hasFinished = false;

function updateLoadingProgress() {
  let percent = 0;
  if (preloadStatus.journey) percent += 25;
  if (preloadStatus.rain) percent += 20;
  if (preloadStatus.stop) percent += 20;
  if (preloadStatus.ytSong) percent += 20;
  if (preloadStatus.minTimerPassed) percent += 15;

  const currentW = Math.min(percent, 100);
  if (loadingBar) {
    loadingBar.style.setProperty('--loading-progress', `${currentW}%`);
    loadingBar.style.width = `${currentW}%`;
  }

  if (loadingStatus && els.intro.classList.contains('is-starting')) {
    if (currentW >= 100) {
      loadingStatus.textContent = 'All aboard! Welcome aboard KSRTC Radio…';
    } else if (!preloadStatus.journey || !preloadStatus.rain || !preloadStatus.stop) {
      loadingStatus.textContent = 'Buffering scenic road videos & windshield view…';
    } else if (!preloadStatus.ytSong) {
      loadingStatus.textContent = 'Tuning into KSRTC Malayalam Radio…';
    } else {
      loadingStatus.textContent = 'Starting the engine • Next stop: Nostalgia…';
    }
  }
}

function checkAllLoadedAndFinish() {
  if (!state.isJourneyStarted || hasFinished) return;
  updateLoadingProgress();
  const allMediaReady = preloadStatus.journey && preloadStatus.rain && preloadStatus.stop && preloadStatus.ytSong;
  if (allMediaReady && preloadStatus.minTimerPassed) {
    finishLoading();
  }
}

function setupVideoPreload(videoEl, src, key) {
  if (!videoEl || !src) {
    preloadStatus[key] = true;
    updateLoadingProgress();
    return;
  }
  videoEl.src = src;
  videoEl.preload = 'auto';

  const markReady = () => {
    if (!preloadStatus[key]) {
      preloadStatus[key] = true;
      updateLoadingProgress();
      checkAllLoadedAndFinish();
    }
  };

  if (videoEl.readyState >= 3) {
    markReady();
  } else {
    videoEl.addEventListener('canplay', markReady, { once: true });
    videoEl.addEventListener('canplaythrough', markReady, { once: true });
    videoEl.addEventListener('loadeddata', markReady, { once: true });
    videoEl.addEventListener('error', () => {
      console.warn(`Video ${key} preload warning: using available fallback`);
      markReady();
    }, { once: true });
  }
  videoEl.load();
}

// Preload all 3 videos immediately
setupVideoPreload(journey, journeyConfig.videos.journey, 'journey');
setupVideoPreload(rainVideo, journeyConfig.videos.rain, 'rain');
setupVideoPreload(stopVideo, journeyConfig.videos.stop, 'stop');

let ytPlayer = null;
let ytReady = false;
let pendingTrack = null;

function initYTPlayer() {
  if (ytPlayer || !window.YT || !window.YT.Player) return;
  try {
    ytPlayer = new YT.Player('yt-player', {
      height: '200',
      width: '200',
      videoId: playlist[0].id,
      playerVars: {
        autoplay: 0,
        controls: 0,
        disablekb: 1,
        fs: 0,
        rel: 0,
        playsinline: 1,
        enablejsapi: 1,
        origin: window.location.origin
      },
      events: {
        onReady: () => {
          ytReady = true;
          try {
            if (ytPlayer.unMute) ytPlayer.unMute();
            if (ytPlayer.setVolume) ytPlayer.setVolume(Math.round(journeyConfig.volumes.music * 100));
            ytPlayer.cueVideoById(playlist[0].id);
          } catch (e) {}
          if (isPreloadingYT && !preloadStatus.ytSong) {
            startYTPreload();
          }
          if (pendingTrack !== null) {
            setTrack(pendingTrack.index, pendingTrack.shouldPlay);
            pendingTrack = null;
          }
        },
        onStateChange: (event) => {
          if (isPreloadingYT && (event.data === YT.PlayerState.PLAYING || event.data === YT.PlayerState.BUFFERING)) {
            if (event.data === YT.PlayerState.PLAYING) {
              isPreloadingYT = false;
              ytSongBuffered = true;
              preloadStatus.ytSong = true;
              try {
                ytPlayer.pauseVideo();
                ytPlayer.seekTo(0, true);
                ytPlayer.unMute();
                if (ytPlayer.setVolume) ytPlayer.setVolume(Math.round(journeyConfig.volumes.music * 100));
              } catch (e) {}
              updateLoadingProgress();
              checkAllLoadedAndFinish();
            }
            return;
          }

          if (event.data === YT.PlayerState.PLAYING) {
            state.isPlaying = true;
            els.play.classList.add('is-playing');
            els.play.setAttribute('aria-label', 'Pause');
            syncRunAudio();
            syncRainAudio();
          } else if (event.data === YT.PlayerState.PAUSED) {
            state.isPlaying = false;
            els.play.classList.remove('is-playing');
            els.play.setAttribute('aria-label', 'Play');
            syncRunAudio();
            syncRainAudio();
          } else if (event.data === YT.PlayerState.ENDED) {
            setTrack(state.currentSongIndex + 1, true);
          }
        },
        onError: (err) => {
          console.warn('YouTube playback error, fallback to ready:', err);
          isPreloadingYT = false;
          preloadStatus.ytSong = true;
          updateLoadingProgress();
          checkAllLoadedAndFinish();
        }
      }
    });
  } catch (err) {
    console.error('Error creating YouTube player:', err);
    preloadStatus.ytSong = true;
    updateLoadingProgress();
  }
}

function startYTPreload() {
  if (preloadStatus.ytSong) return;
  isPreloadingYT = true;
  if (ytPlayer && ytReady && ytPlayer.loadVideoById) {
    try {
      ytPlayer.mute();
      ytPlayer.loadVideoById(playlist[0].id);
      ytPlayer.playVideo();
    } catch (e) {
      preloadStatus.ytSong = true;
      updateLoadingProgress();
      checkAllLoadedAndFinish();
    }
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
function notify(message) { els.toast.textContent=message; els.toast.classList.add('show'); clearTimeout(notify.timer); notify.timer=setTimeout(()=>els.toast.classList.remove('show'),2200); }
function playSafe(media, label) { return media.play().catch(()=> label && notify(`${label} is ready when its file is added.`)); }
function effect(path) { const sound=new Audio(path); sound.volume=journeyConfig.volumes.effects; sound.play().catch(()=>notify('Sound effect is ready when its file is added.')); return sound; }

function syncRunAudio() {
  const shouldPlay = state.isJourneyStarted && !els.player.hidden && !state.isStopping && state.isPlaying;
  if (shouldPlay) {
    if (runAudio.paused) {
      playSafe(runAudio, 'Bus running sound');
    }
  } else {
    if (!runAudio.paused) {
      runAudio.pause();
    }
  }
}

function syncRainAudio() {
  const shouldPlay = state.isJourneyStarted && !els.player.hidden && state.isRainMode && state.isPlaying;
  if (shouldPlay) {
    if (rainAudio.paused) {
      playSafe(rainAudio, 'Rain sound');
    }
  } else {
    if (!rainAudio.paused) {
      rainAudio.pause();
    }
  }
}

function setTrack(index, shouldPlay=state.isPlaying) {
  state.currentSongIndex=(index+playlist.length)%playlist.length;
  const track=playlist[state.currentSongIndex];
  els.title.textContent=track.title;
  els.artist.textContent=track.artist;
  els.album.src=track.albumArt;
  els.album.onerror=()=>{els.album.src=journeyConfig.videos.fallbackImage;};
  els.progress.value=0;
  els.progress.style.setProperty('--progress','0%');
  els.current.textContent='0:00';
  els.duration.textContent='0:00';

  if (!ytReady || !ytPlayer || !ytPlayer.loadVideoById) {
    pendingTrack = { index: state.currentSongIndex, shouldPlay };
    return;
  }
  try {
    if (ytPlayer.unMute) ytPlayer.unMute();
    if (ytPlayer.setVolume) ytPlayer.setVolume(Math.round(journeyConfig.volumes.music * 100));
    if (shouldPlay) {
      ytPlayer.loadVideoById(track.id);
      state.isPlaying = true;
      els.play.classList.add('is-playing');
      els.play.setAttribute('aria-label', 'Pause');
    } else {
      ytPlayer.cueVideoById(track.id);
    }
  } catch (err) {
    console.error('Error updating track:', err);
  }
}

function playMusic() {
  state.isPlaying=true;
  els.play.classList.add('is-playing');
  els.play.setAttribute('aria-label','Pause');
  syncRunAudio();
  syncRainAudio();
  if (ytPlayer && ytReady && ytPlayer.playVideo) {
    try {
      if (ytPlayer.unMute) ytPlayer.unMute();
      if (ytPlayer.setVolume) ytPlayer.setVolume(Math.round(journeyConfig.volumes.music * 100));
      ytPlayer.playVideo();
    } catch (e) {
      setTrack(state.currentSongIndex, true);
    }
  } else {
    setTrack(state.currentSongIndex, true);
  }
}

function pauseMusic() {
  state.isPlaying=false;
  els.play.classList.remove('is-playing');
  els.play.setAttribute('aria-label','Play');
  syncRunAudio();
  syncRainAudio();
  if (ytPlayer && ytReady && ytPlayer.pauseVideo) {
    ytPlayer.pauseVideo();
  }
}
function toggleRain() {
  if (state.isStopping) return;
  state.isRainMode = !state.isRainMode;
  els.rain.classList.toggle('active', state.isRainMode);
  els.rain.querySelector('small').textContent = state.isRainMode ? 'Rain On' : 'Rain Off';
  els.rain.setAttribute('aria-label', state.isRainMode ? 'Turn rain off' : 'Turn rain on');
  if (state.isRainMode) {
    journey.pause();
    journey.classList.remove('is-visible');
    rainVideo.currentTime = 0;
    rainVideo.classList.add('is-visible');
    playSafe(rainVideo);
    state.currentVideo = 'rain';
    rainAudio.volume = journeyConfig.volumes.rain ?? 0.7;
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

function makeStop() {
  if (state.isStopping) return;
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
  journey.pause();
  journey.classList.remove('is-visible');
  stopVideo.currentTime = 0;
  stopVideo.classList.add('is-visible');
  playSafe(stopVideo);
  state.currentVideo = 'stop';
  notify('Stopping at the next stop…');
}

let currentStartupSound = null;

function startJourney() {
  if (state.isJourneyStarted) return;
  state.isJourneyStarted = true;
  hasFinished = false;
  els.start.disabled = true;
  els.intro.classList.add('is-starting');

  // Trigger YouTube first track pre-buffering
  startYTPreload();

  // Safety fallback for YouTube: if slow or throttled, don't stall forever
  setTimeout(() => {
    if (!preloadStatus.ytSong) {
      preloadStatus.ytSong = true;
      updateLoadingProgress();
      checkAllLoadedAndFinish();
    }
  }, 7000);

  const startupSound = effect(journeyConfig.sounds.journeyStart);
  startupSound.volume = 1;
  currentStartupSound = startupSound;

  const STARTUP_DURATION_MS = 8450;
  const startTime = Date.now();

  const progressInterval = setInterval(() => {
    if (hasFinished) {
      clearInterval(progressInterval);
      return;
    }
    updateLoadingProgress();
  }, 200);

  state.startTimer = setTimeout(() => {
    clearInterval(progressInterval);
    preloadStatus.minTimerPassed = true;
    checkAllLoadedAndFinish();
  }, STARTUP_DURATION_MS);

  // Absolute safety timeout: never hang forever (max 20 seconds)
  setTimeout(() => {
    if (!hasFinished) {
      preloadStatus.journey = true;
      preloadStatus.rain = true;
      preloadStatus.stop = true;
      preloadStatus.ytSong = true;
      preloadStatus.minTimerPassed = true;
      finishLoading();
    }
  }, 20000);
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

  setTrack(0, true);
  syncRunAudio();
  syncRainAudio();

  els.player.classList.remove('ui-blur-in');
  els.replay.classList.remove('ui-blur-in');
  els.brand.classList.remove('ui-blur-in');
  void els.player.offsetWidth;
  els.player.classList.add('ui-blur-in');
  els.replay.classList.add('ui-blur-in');
  els.brand.classList.add('ui-blur-in');

  state.unblurTimer = setTimeout(() => {
    els.intro.classList.remove('is-unblurring');
    els.intro.classList.add('is-hidden');
  }, 1000);
};

function resetJourney() {
  clearTimeout(state.startTimer);
  clearTimeout(state.unblurTimer);
  clearTimeout(hornTimer);
  clearTimeout(bellTimer);
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
  if (ytPlayer && ytReady && ytPlayer.seekTo) {
    ytPlayer.seekTo(0, true);
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
els.replay.addEventListener('click', resetJourney);
els.play.addEventListener('click', () => state.isPlaying ? pauseMusic() : playMusic());
els.previous.addEventListener('click', () => setTrack(state.currentSongIndex - 1, true));
els.next.addEventListener('click', () => setTrack(state.currentSongIndex + 1, true));
els.horn.addEventListener('click', triggerHorn);
els.bell.addEventListener('click', triggerBell);
els.rain.addEventListener('click', toggleRain);
els.stop.addEventListener('click', makeStop);

function onStopEnded() {
  if (state.isStopping) {
    state.isStopping = false;
    els.stop.disabled = false;
    els.stop.classList.remove('is-stopping');
    const stopLabel = els.stop.querySelector('small');
    if (stopLabel) stopLabel.textContent = 'Make a Stop';
    stopVideo.pause();
    stopVideo.classList.remove('is-visible');
    journey.classList.add('is-visible');
    playSafe(journey);
    state.currentVideo = 'journey';
    syncRunAudio();
    notify('Journey resumed.');
  }
}
stopVideo.addEventListener('ended', onStopEnded);
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
