/* =====================================================
   NOCT PLM - Player Controller
   Synchronized with Audio Buffer Delay
   ===================================================== */

document.addEventListener('DOMContentLoaded', function () {

  const PROXY_BASE = 'https://corsproxy.io/?';

  // Audio streams are typically 30-60 seconds behind the FM broadcast
  // We compensate by looking for songs that started 45 seconds ago
  const AUDIO_BUFFER_DELAY = 20; // seconds

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
      url: 'https://onlineradiobox.com/fr/skyrock/playlist/',
      isHtmlScrape: true,
      jsonPath: parseOnlineRadioBox
    },
    'mouv': {
      url: 'https://api.radiofrance.fr/livemeta/pull/6',
      isHtmlScrape: false,
      jsonPath: (data) => {
        let result = null;
        const now = Math.floor(Date.now() / 1000);

        if (data.steps) {
          // Get all songs, sorted by start time descending
          const songs = Object.values(data.steps)
            .filter(step => step.embedType === 'song')
            .sort((a, b) => b.start - a.start);

          if (songs.length > 0) {
            const song = songs[0];
            result = {
              title: song.title,
              artist: song.highlightedArtists?.[0] || song.authors || '',
              cover: song.visual
            };
          } else {
            // Fallback: show current program name
            const programs = Object.values(data.steps)
              .filter(step => step.start <= now && step.end >= now)
              .sort((a, b) => b.start - a.start);

            if (programs.length > 0) {
              result = {
                title: programs[0].titleConcept || programs[0].title || 'Mouv\'',
                artist: 'En direct',
                cover: null
              };
            }
          }
        }
        return result;
      }
    },
    'skyrockplm': {
      url: 'https://onlineradiobox.com/fr/skyrockplm/playlist/',
      isHtmlScrape: true,
      jsonPath: parseOnlineRadioBox
    },
    'funradio': {
      // Fun Radio Belgium RadioPlayer API
      url: 'https://core-search.radioplayer.cloud/056/qp/v4/onair?rpIds=3',
      isHtmlScrape: false,
      jsonPath: (data) => {
        let result = null;
        if (data.results && data.results['3']) {
          // Find the song entry (type PE_E means currently playing)
          const song = data.results['3'].find(item => item.song === true && item.name);
          if (song) {
            result = {
              title: song.name,
              artist: song.artistName,
              cover: song.imageUrl
            };
          } else {
            // Fallback when no song is playing
            const info = data.results['3'].find(item => item.description);
            result = {
              title: info?.description || 'Fun Radio',
              artist: 'En direct',
              cover: info?.imageUrl || null
            };
          }
        }
        return result;
      }
    }
  };

  // Shared parser function for OnlineRadioBox
  function parseOnlineRadioBox(html) {
    let result = null;
    try {
      // Parse HTML to find track links
      // Format: <a href="/track/...">Artist - Title</a>
      const trackRegex = /<a[^>]*href="\/track\/[^"]*"[^>]*>([^<]+)<\/a>/gi;
      const matches = [...html.matchAll(trackRegex)];

      if (matches.length > 0) {
        // First match is the most recent track
        const trackText = matches[0][1].trim();
        const parts = trackText.split(' - ');

        if (parts.length >= 2) {
          result = {
            title: parts.slice(1).join(' - '), // Title (everything after first dash)
            artist: parts[0], // Artist (before first dash)
            cover: null // Will use iTunes fallback
          };
        } else {
          result = {
            title: trackText,
            artist: '',
            cover: null
          };
        }
      }
    } catch (e) {
      console.warn('Scraping error:', e);
    }
    return result;
  }

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

    card.classList.add('ring-2', 'ring-white/50');
    const eq = card.querySelector('.equalizer');
    if (eq) { eq.classList.remove('hidden'); eq.classList.add('flex'); }

    audio.src = url;
    audio.play().catch(e => console.error("Audio error:", e));

    player.style.opacity = '1';
    player.style.pointerEvents = 'auto';
    player.style.transform = 'translateY(0)';

    updatePlayerVisuals(gradient);
    updatePlayPauseButton(true);
    updatePlayerInfo(name, 'En direct', img);

    if (radioAPIs[radioId] && radioAPIs[radioId].url) {
      updatePlayerInfo(name, 'Chargement...', img);
      fetchMetadataWrapper(radioId, img, name);
      metadataInterval = setInterval(() => fetchMetadataWrapper(radioId, img, name), 10000);
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
      const id = setTimeout(() => controller.abort(), 8000);

      // Add cache buster to prevent proxy from returning cached data
      const cacheBuster = Date.now();
      const proxyUrl = PROXY_BASE + encodeURIComponent(config.url + '?_cb=' + cacheBuster);

      const response = await fetch(proxyUrl, {
        signal: controller.signal,
        headers: { 'Cache-Control': 'no-cache' }
      });
      clearTimeout(id);

      if (!response.ok) throw new Error('Proxy error');

      let info;
      if (config.isHtmlScrape) {
        // For HTML scraping, get text and parse
        const html = await response.text();
        info = config.jsonPath(html);
      } else {
        // For JSON APIs
        const data = await response.json();
        info = config.jsonPath(data);
      }

      if (info && info.title) {
        updatePlayerInfo(info.title, info.artist, info.cover || defaultImg);
        document.title = `🎵 ${info.title} • ${defaultName}`;
        if (!info.cover && info.title) fetchItunesCover(info.title, info.artist);
      } else {
        updatePlayerInfo(defaultName, 'En direct', defaultImg);
      }
    } catch (e) {
      console.warn('Meta fetch error', e);
      if (playerName.innerText.includes('Chargement')) {
        updatePlayerInfo(defaultName, 'En direct', defaultImg);
      }
    }
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

  console.log('Noct PLM: Audio Buffer Sync Version Loaded');
});
