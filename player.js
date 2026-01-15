/* =====================================================
   NOCT PLM - Radio Player
   CORS Proxy Version
   ===================================================== */

document.addEventListener('DOMContentLoaded', function () {

  // DOM Elements
  const audio = document.getElementById('audio');
  const player = document.getElementById('player');
  const playerImg = document.getElementById('playerImg');
  const playerName = document.getElementById('playerName');
  const playerStatus = document.getElementById('playerStatus');
  const volumeSlider = document.getElementById('volume');
  const volumeFill = document.getElementById('volumeFill');
  const volumeIcon = document.getElementById('volumeIcon');

  // State
  let currentCard = null;
  let isPlaying = false;
  let metadataInterval = null;

  // CORS Proxy to bypass browser restrictions
  // Using allorigins.win because it's free and reliable for this
  const PROXY_URL = 'https://api.allorigins.win/raw?url=';

  const radioAPIs = {
    'skyrock': {
      url: 'https://skyrock.fm/api/v3/player/onair/plm',
      parse: function (data) {
        return data.current ? {
          title: data.current.title,
          artist: data.current.artist,
          cover: data.current.cover
        } : null;
      }
    },
    'funradio': {
      // Fun Radio API often blocks simple requests, we try a direct JSON endpoint
      url: 'https://www.funradio.fr/api/players/now-playing',
      parse: function (data) {
        return data.now ? {
          title: data.now.song,
          artist: data.now.artist,
          cover: data.now.cover
        } : null;
      }
    },
    'mouv': {
      url: 'https://www.radiofrance.fr/api/v2.1/stations/mouv/live',
      parse: function (data) {
        if (data && data.now && data.now.playing_item) {
          return {
            title: data.now.playing_item.title,
            artist: data.now.playing_item.subtitle,
            cover: data.now.playing_item.cover
          };
        }
        return null;
      }
    }
  };

  // 1. Play Radio
  window.playRadio = function (card) {
    const activeClass = 'ring-2';

    // Stop if playing same
    if (currentCard === card && isPlaying) {
      window.togglePlay();
      return;
    }

    // Reset old
    if (currentCard) {
      currentCard.classList.remove(activeClass, 'ring-white/50');
      const eq = currentCard.querySelector('.equalizer');
      if (eq) eq.classList.add('hidden');
      const st = currentCard.querySelector('.status');
      if (st) st.innerHTML = '<span class="text-gray-400">Cliquer pour écouter</span>';
    }

    currentCard = card;
    currentCard.classList.add(activeClass, 'ring-white/50');

    // Visuals active card
    const eq = currentCard.querySelector('.equalizer');
    if (eq) { eq.classList.remove('hidden'); eq.classList.add('flex'); }

    // Audio
    audio.src = card.dataset.url;
    audio.play().catch(e => console.error("Audio error:", e));
    isPlaying = true;

    // Show Player
    player.style.opacity = '1';
    player.style.pointerEvents = 'auto';
    player.style.transform = 'translateY(0)';

    // Default Info
    updatePlayerUI(card.dataset.name, '', card.dataset.img);
    updatePlayerVisuals(card.dataset.gradient);
    updatePlayPauseUI();

    // Fetch Metadata
    startMetadataFetch(card.dataset.radio, card.dataset.img, card.dataset.name);
  };

  // 2. Fetch Metadata Logic
  function startMetadataFetch(radioId, defaultImg, defaultName) {
    if (metadataInterval) clearInterval(metadataInterval);

    const fetchNow = () => {
      const config = radioAPIs[radioId];
      if (!config) return;

      // Use proxy to avoid CORS
      const targetUrl = PROXY_URL + encodeURIComponent(config.url);

      fetch(targetUrl)
        .then(res => {
          if (!res.ok) throw new Error('Proxy error');
          return res.json();
        })
        .then(data => {
          const info = config.parse(data);
          if (info) {
            updatePlayerUI(info.title, info.artist, info.cover || defaultImg);
            // Also update the card text little bonus
            if (currentCard) {
              const st = currentCard.querySelector('.status');
              if (st) st.innerHTML = `<span class="text-green-400 truncate block w-full">🎵 ${info.title}</span>`;
            }
          }
        })
        .catch(err => {
          console.warn('Metadata fetch failed:', err);
          // Fallback handled by keeping existing info
        });
    };

    fetchNow(); // First immediate call
    metadataInterval = setInterval(fetchNow, 15000); // Poll every 15s
  }

  // 3. UI Updates
  function updatePlayerUI(title, artist, cover) {
    playerName.innerHTML = `
      <span class="block text-white font-semibold truncate">${title}</span>
      ${artist ? `<span class="block text-xs text-gray-300 truncate">${artist}</span>` : ''}
    `;
    if (cover) playerImg.src = cover;
  }

  function updatePlayerVisuals(gradient) {
    const pGrad = document.getElementById('playerGradient');
    const pGlow = document.getElementById('playerGlow');
    const pBtn = document.getElementById('playPauseBtn');

    if (pGrad) pGrad.className = 'h-1 bg-gradient-to-r ' + gradient;
    if (pGlow) pGlow.className = 'absolute -inset-1 opacity-40 blur-xl transition-all duration-500 bg-gradient-to-r ' + gradient;
    if (pBtn) pBtn.className = 'relative w-11 h-11 sm:w-14 sm:h-14 rounded-full flex items-center justify-center shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-105 bg-gradient-to-r ' + gradient;
  }

  function updatePlayPauseUI() {
    const playIcon = document.getElementById('playerPlayIcon');
    const pauseIcon = document.getElementById('playerPauseIcon');
    const status = document.getElementById('playerStatus');

    if (isPlaying) {
      playIcon.classList.add('hidden');
      pauseIcon.classList.remove('hidden');
      status.innerHTML = '<span class="text-green-400 font-bold text-xs flex items-center gap-1">🔴 EN DIRECT</span>';
    } else {
      playIcon.classList.remove('hidden');
      pauseIcon.classList.add('hidden');
      status.innerHTML = '<span class="text-gray-400 text-xs">PAUSE</span>';
    }
  }

  // 4. Global Controls
  window.togglePlay = function () {
    if (audio.paused) { audio.play(); isPlaying = true; }
    else { audio.pause(); isPlaying = false; }
    updatePlayPauseUI();
  }

  window.stopRadio = function () {
    audio.pause();
    audio.src = '';
    isPlaying = false;
    currentCard = null;
    if (metadataInterval) clearInterval(metadataInterval);
    player.style.opacity = '0';
    player.style.pointerEvents = 'none';
    player.style.transform = 'translateY(20px)';

    // Reset cards visuals
    document.querySelectorAll('.radio-card').forEach(c => {
      c.classList.remove('ring-2', 'ring-white/50');
      c.querySelector('.equalizer').classList.add('hidden');
      c.querySelector('.status').innerHTML = 'Cliquer pour écouter';
    });
    document.title = 'Noct PLM';
  }

  window.toggleMute = function () {
    audio.muted = !audio.muted;
    updateVolumeIcon();
    if (volumeFill) volumeFill.style.width = audio.muted ? '0%' : (volumeSlider.value * 100) + '%';
  }

  // Volume Init
  if (volumeSlider) {
    audio.volume = volumeSlider.value;
    volumeSlider.addEventListener('input', function () {
      audio.volume = this.value;
      if (volumeFill) volumeFill.style.width = (this.value * 100) + '%';
      updateVolumeIcon();
    });
  }

  function updateVolumeIcon() {
    const icon = document.getElementById('volumeIcon');
    if (icon) {
      icon.innerHTML = audio.muted || audio.volume == 0
        ? '<path d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><line x1="23" y1="9" x2="17" y2="15" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="17" y1="9" x2="23" y2="15" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>'
        : '<path d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>';
    }
  }

  console.log('Noct PLM - CORS Proxy Version Loaded');
});
