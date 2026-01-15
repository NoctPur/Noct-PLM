/* =====================================================
   NOCT PLM - Player Controller
   Smart Expiration Logic
   ===================================================== */

document.addEventListener('DOMContentLoaded', function () {

  const PROXY_BASE = 'https://api.allorigins.win/get?url=';

  const audio = document.getElementById('audio');
  const player = document.getElementById('player');
  const playerImg = document.getElementById('playerImg');
  const playerName = document.getElementById('playerName');
  const volumeSlider = document.getElementById('volume');
  const volumeFill = document.getElementById('volumeFill');
  const volumeIcon = document.getElementById('volumeIcon');

  let currentCard = null;
  let isPlaying = false;
  let metadataInterval = null;

  const radioAPIs = {
    'skyrock': {
      url: 'https://skyrock.fm/api/v3/player/onair/plm',
      jsonPath: (data) => {
        const now = Math.floor(Date.now() / 1000); // Current UNIX timestamp
        let result = null;

        // 1. Analyze Schedule
        if (data.schedule && Array.isArray(data.schedule)) {
          // Sort by start_ts descending (Newest first)
          const sorted = data.schedule
            .filter(item => item.type === 'record' && item.info)
            .sort((a, b) => b.info.start_ts - a.info.start_ts);

          // Get the absolutely last known track
          const lastTrack = sorted[0];

          if (lastTrack) {
            // Check validity:
            // If the track ended more than 4 minutes ago, assume API is lagging or it's talk time
            const endedAgo = now - lastTrack.info.end_ts;

            if (endedAgo < 240) { // Keep displaying for 4 minutes after theoretical end
              result = {
                title: lastTrack.info.title,
                artist: lastTrack.artists && lastTrack.artists[0] ? lastTrack.artists[0].name : '',
                cover: lastTrack.info.cover_big_uri || lastTrack.info.cover_uri
              };
            }
          }
        }

        // 2. Fallback to Show Info if track is too old or missing
        if (!result && data.on_air_program) {
          result = {
            title: data.on_air_program.title, // e.g., "Difool"
            artist: 'En direct sur Skyrock',
            cover: data.on_air_program.cover_uri
          };
        }
        return result;
      }
    },
    'mouv': { url: null },
    'funradio': { url: null }
  };

  // --- CONTROLS ---

  window.playRadio = function (card) {
    const radioId = card.dataset.radio;
    const name = card.dataset.name;
    const url = card.dataset.url;
    const img = card.dataset.img;
    const gradient = card.dataset.gradient;

    if (currentCard === card && isPlaying) {
      window.togglePlay();
      return;
    }

    if (metadataInterval) clearInterval(metadataInterval);
    resetCardsVisuals();

    currentCard = card;
    isPlaying = true;

    // Visuals
    card.classList.add('ring-2', 'ring-white/50');
    const eq = card.querySelector('.equalizer');
    if (eq) { eq.classList.remove('hidden'); eq.classList.add('flex'); }

    // Audio
    audio.src = url;
    audio.play().catch(e => console.error("Audio error:", e));

    player.style.opacity = '1';
    player.style.pointerEvents = 'auto';
    player.style.transform = 'translateY(0)';

    updatePlayerVisuals(gradient);
    updatePlayPauseButton(true);

    // Default Info
    updatePlayerInfo(name, 'En direct', img);

    // Metadata Fetch
    if (radioAPIs[radioId] && radioAPIs[radioId].url) {
      updatePlayerInfo(name, 'Chargement...', img);
      // Initial fetch with slight delay to ensure visuals are set
      setTimeout(() => fetchMetadataWrapper(radioId, img, name), 100);
      metadataInterval = setInterval(() => fetchMetadataWrapper(radioId, img, name), 15000);
    }
  };

  window.togglePlay = function () {
    if (audio.paused) { audio.play(); isPlaying = true; }
    else { audio.pause(); isPlaying = false; }
    updatePlayPauseButton(isPlaying);
    updateCardStatus(isPlaying);
  };

  window.stopRadio = function () {
    audio.pause();
    audio.src = '';
    isPlaying = false;
    if (metadataInterval) clearInterval(metadataInterval);
    resetCardsVisuals();
    player.style.opacity = '0';
    player.style.pointerEvents = 'none';
    player.style.transform = 'translateY(20px)';
    document.title = 'Noct PLM';
  };

  async function fetchMetadataWrapper(radioId, defaultImg, defaultName) {
    const config = radioAPIs[radioId];
    if (!config || !config.url) return;

    try {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(PROXY_BASE + encodeURIComponent(config.url) + `&_cb=${Date.now()}`, { signal: controller.signal });
      clearTimeout(id);

      const wrapper = await response.json();
      if (!wrapper.contents) return;

      const realData = JSON.parse(wrapper.contents);
      const info = config.jsonPath(realData);

      if (info && info.title) {
        updatePlayerInfo(info.title, info.artist, info.cover || defaultImg);
        document.title = `🎵 ${info.title} • ${defaultName}`;
        if (!info.cover && info.title) fetchItunesCover(info.title, info.artist);
      }
    } catch (e) { console.warn('Meta fetch error', e); }
  }

  async function fetchItunesCover(title, artist) {
    try {
      const resp = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(title + ' ' + artist)}&media=music&limit=1`);
      const data = await resp.json();
      if (data.results?.[0]) {
        playerImg.src = data.results[0].artworkUrl100.replace('100x100', '600x600');
      }
    } catch (e) { }
  }

  function updatePlayerInfo(title, artist, cover) {
    playerName.innerHTML = `
      <span class="block text-white font-bold truncate text-base sm:text-lg">${title}</span>
      <span class="block text-gray-300 truncate text-xs sm:text-sm font-medium">${artist}</span>
    `;
    if (cover) playerImg.src = cover;
    if (currentCard) {
      const status = currentCard.querySelector('.status');
      if (status && title !== currentCard.dataset.name && !title.includes('Chargement')) {
        status.innerHTML = `<span class="text-green-400 font-medium truncate block w-full">🎵 ${title}</span>`;
      }
    }
  }

  function resetCardsVisuals() {
    document.querySelectorAll('.radio-card').forEach(c => {
      c.classList.remove('ring-2', 'ring-white/50');
      c.querySelector('.equalizer').classList.add('hidden');
      c.querySelector('.equalizer').classList.remove('flex');
      const st = c.querySelector('.status');
      if (st) st.innerHTML = 'Cliquer pour écouter';
    });
  }

  function updateCardStatus(active) {
    if (!currentCard) return;
    const eq = currentCard.querySelector('.equalizer');
    const st = currentCard.querySelector('.status');
    if (active) {
      if (eq) { eq.classList.remove('hidden'); eq.classList.add('flex'); }
    } else {
      if (eq) { eq.classList.add('hidden'); eq.classList.remove('flex'); }
      if (st) st.innerHTML = '<span class="text-yellow-400">⏸ En pause</span>';
    }
  }

  function updatePlayerVisuals(gradient) {
    const pGrad = document.getElementById('playerGradient');
    const pGlow = document.getElementById('playerGlow');
    const pBtn = document.getElementById('playPauseBtn');
    if (pGrad) pGrad.className = 'h-1 bg-gradient-to-r ' + gradient;
    if (pGlow) pGlow.className = 'absolute -inset-1 opacity-40 blur-xl transition-all duration-500 bg-gradient-to-r ' + gradient;
    if (pBtn) pBtn.className = 'relative w-11 h-11 sm:w-14 sm:h-14 rounded-full flex items-center justify-center shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-105 bg-gradient-to-r ' + gradient;
  }

  function updatePlayPauseButton(playing) {
    const playIcon = document.getElementById('playerPlayIcon');
    const pauseIcon = document.getElementById('playerPauseIcon');
    const status = document.getElementById('playerStatus');
    if (playing) {
      playIcon.classList.add('hidden'); pauseIcon.classList.remove('hidden');
      status.innerHTML = '<span class="text-green-400 font-bold animate-pulse">● EN DIRECT</span>';
    } else {
      playIcon.classList.remove('hidden'); pauseIcon.classList.add('hidden');
      status.innerHTML = '<span class="text-gray-400">PAUSE</span>';
    }
  }

  // Volume
  if (volumeSlider) {
    volumeSlider.addEventListener('input', function () {
      audio.volume = this.value;
      if (volumeFill) volumeFill.style.width = (this.value * 100) + '%';
      updateVolumeIcon();
    });
  }
  window.toggleMute = function () { audio.muted = !audio.muted; updateVolumeIcon(); }

  function updateVolumeIcon() {
    if (volumeIcon) volumeIcon.innerHTML = audio.muted || audio.volume == 0 ?
      '<path d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" stroke="currentColor" stroke-width="2"/><line x1="23" y1="9" x2="17" y2="15" stroke="currentColor" stroke-width="2"/><line x1="17" y1="9" x2="23" y2="15" stroke="currentColor" stroke-width="2"/>' :
      '<path d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" stroke="currentColor" stroke-width="2"/>';
  }

  console.log('Noct PLM: Smart Expiration Logic Loaded');
});
