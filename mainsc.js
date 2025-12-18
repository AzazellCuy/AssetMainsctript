(function() {
    if (window.MK_ENGINE) return;
    window.MK_ENGINE = {};
    const ENGINE = window.MK_ENGINE;

    // State Internal
    let activeConfig = {};
    let episodeData = [];
    let currentSeasonFilter = ""; // Default kosong, nanti diisi Season pertama
    let currentSearch = "";

    // --- HELPER FUNCTIONS ---
    const getEl = (id) => document.getElementById(id);
    const formatDate = (dateStr) => {
        if (!dateStr) return "-";
        const d = new Date(dateStr);
        return d.toLocaleDateString(MK_CONFIG.dateFormat, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) + ' WIB';
    };
    const isFuture = (dateStr) => new Date(dateStr) > new Date();

    // Extract Number dari Judul (Untuk sorting)
    function extractEpNumber(title) {
        const match = title.match(/Episode\s*(\d+)/i) || title.match(/\s(\d+)\s/) || title.match(/(\d+)$/);
        return match ? parseInt(match[1]) : 999;
    }

    // --- INIT ---
    ENGINE.init = function(pageConfig) {
        activeConfig = { ...MK_CONFIG, ...pageConfig };
        
        // 1. Set Default Season ke Index ke-0 (Jangan All Season)
        if (activeConfig.seasons && activeConfig.seasons.length > 0) {
            currentSeasonFilter = activeConfig.seasons[0];
        }

        // 2. Render Info Dasar
        renderMetaBoard();

        // 3. Routing
        if (activeConfig.type === 'series-detail' || activeConfig.type === 'series-player') {
            initSeriesLogic();
        } else if (activeConfig.type === 'movie-detail') {
            if(getEl('btnWatchMovie')) {
                getEl('btnWatchMovie').onclick = () => window.location.href = activeConfig.playerLink;
            }
        }
    };

    // --- RENDER META BOARD ---
    function renderMetaBoard() {
        if (!activeConfig.info) return;
        const info = activeConfig.info;
        
        const posterEl = getEl('mkPosterImg'); if(posterEl) posterEl.src = info.poster;
        const titleEl = getEl('mkTitle'); if(titleEl) titleEl.innerText = info.title;
        const origTitleEl = getEl('mkOrigTitle'); if(origTitleEl) origTitleEl.innerText = info.originalTitle;
        const synopEl = getEl('mkSynopsis'); if(synopEl) synopEl.innerHTML = info.synopsis;
        
        const gridEl = getEl('mkMetaGrid');
        if(gridEl && info.details) {
            let html = '';
            for (const [key, val] of Object.entries(info.details)) {
                html += `<div class="mk-meta-item"><span>${key}</span><b>${val}</b></div>`;
            }
            gridEl.innerHTML = html;
        }

        const trailerEl = getEl('mkTrailerBox');
        if(trailerEl && info.trailer) {
            trailerEl.innerHTML = `<iframe src="${info.trailer}" allowfullscreen></iframe>`;
        }
        
        const donateBtn = getEl('mkBtnDonate');
        if(donateBtn) donateBtn.onclick = () => window.open(MK_CONFIG.donationURL, '_blank');
    }

    // --- SERIES LOGIC ---
    async function initSeriesLogic() {
        renderScheduleBanner();

        if(getEl('mkEpsList')) getEl('mkEpsList').innerHTML = '<div style="padding:20px;text-align:center;color:#666;">Memuat Daftar Episode...</div>';
        
        // Fetch Data dari Blogger
        episodeData = await fetchBloggerPosts(activeConfig.labels);
        
        // Urutkan Data (Ascending Episode 1, 2, 3...)
        episodeData.sort((a,b) => extractEpNumber(a.title) - extractEpNumber(b.title));

        // Logic Player (Cek Lock & Navigasi)
        if(activeConfig.type === 'series-player') {
            checkLockState();
            setupPlayerNav();
        }
        
        // Render List di Detail Page / Player Page
        if(getEl('mkEpsList')) {
            setupFilters();
            renderEpisodeList();
        }
    }

    function renderScheduleBanner() {
        const bannerEl = getEl('mkScheduleBanner');
        if(!bannerEl || !activeConfig.scheduleText) return;
        bannerEl.innerHTML = `📅 JADWAL: ${activeConfig.scheduleText}`;
        bannerEl.style.display = 'block';
    }

    function checkLockState() {
        const currentPath = window.location.pathname;
        const currentEp = episodeData.find(ep => ep.url.includes(currentPath));

        if (currentEp) {
            const epNum = extractEpNumber(currentEp.title);
            // Cek Jadwal
            if(activeConfig.schedules && activeConfig.schedules[epNum]) {
                const releaseDate = activeConfig.schedules[epNum];
                if(isFuture(releaseDate)) {
                    // BLOCK PLAYER
                    const playerWrapper = getEl('mkPlayerWrapper');
                    const blockScreen = getEl('mkBlockedScreen');
                    const releaseTimeText = getEl('mkReleaseTime');
                    
                    if(playerWrapper) playerWrapper.style.display = 'none';
                    if(blockScreen) {
                        blockScreen.style.display = 'flex';
                        if(releaseTimeText) releaseTimeText.innerText = formatDate(releaseDate);
                    }
                }
            }
        }
    }

    function setupFilters() {
        const searchInput = getEl('mkSearchInput');
        if(searchInput) {
            searchInput.addEventListener('input', (e) => {
                currentSearch = e.target.value.toLowerCase();
                renderEpisodeList();
            });
        }
        
        const seasonSel = getEl('mkSeasonSelect');
        if(seasonSel) {
            // Jika seasons tidak ada atau cuma 1, sembunyikan dropdown
            if(!activeConfig.seasons || activeConfig.seasons.length <= 1) {
                seasonSel.style.display = 'none';
                if(activeConfig.seasons && activeConfig.seasons.length === 1) {
                    currentSeasonFilter = activeConfig.seasons[0];
                }
            } else {
                // Render Option Tanpa "All Season"
                let opts = ``;
                activeConfig.seasons.forEach(s => {
                    opts += `<option value="${s}" ${currentSeasonFilter === s ? 'selected' : ''}>${s}</option>`;
                });
                seasonSel.innerHTML = opts;
                
                seasonSel.addEventListener('change', (e) => {
                    currentSeasonFilter = e.target.value;
                    renderEpisodeList();
                });
            }
        }
    }

    function renderEpisodeList() {
        const listEl = getEl('mkEpsList');
        if(!listEl) return;

        // Filter Label Season & Search
        let filtered = episodeData.filter(ep => {
            const matchesSearch = ep.title.toLowerCase().includes(currentSearch);
            // Filter Season Wajib (Strict)
            const matchesSeason = ep.labels.includes(currentSeasonFilter); 
            return matchesSearch && matchesSeason;
        });

        if(filtered.length === 0) {
            listEl.innerHTML = '<div style="padding:20px;text-align:center;">Tidak ada episode di season ini.</div>';
            return;
        }

        let html = '';
        filtered.forEach(ep => {
            const epNum = extractEpNumber(ep.title);
            let isLocked = false;
            let dateText = ""; 

            // Cek Lock
            if(activeConfig.schedules && activeConfig.schedules[epNum]) {
                const releaseDate = activeConfig.schedules[epNum];
                if(isFuture(releaseDate)) {
                    isLocked = true;
                    dateText = `Tayang: ${formatDate(releaseDate)}`;
                }
            }

            // CLEAN TITLE LOGIC
            // Hapus nama Series dari Judul Postingan
            // Contoh: "Taxi Driver - Episode 1" -> Jadi -> "Episode 1"
            let displayTitle = ep.title;
            if (activeConfig.info && activeConfig.info.title) {
                // Hapus nama series (Case insensitive)
                const regexSeries = new RegExp(activeConfig.info.title, "gi");
                displayTitle = displayTitle.replace(regexSeries, "").replace(/[-|]/g, "").trim();
            }
            // Jika kosong (misal judul cuma series name), kembalikan judul asli
            if(displayTitle.length < 2) displayTitle = ep.title;

            // Active State
            const isActive = window.location.href.includes(ep.url);
            const activeClass = isActive ? 'active-eps' : '';
            const lockClass = isLocked ? 'eps-locked' : '';
            const action = isLocked ? '' : `onclick="window.location.href='${ep.url}'"`;

            html += `
            <div class="mk-eps-item ${activeClass} ${lockClass}" ${action}>
                <div class="mk-eps-title">${displayTitle}</div>
                <div class="mk-eps-date">${isLocked ? '🔒 ' + dateText : '▶ Putar'}</div>
            </div>`;
        });
        listEl.innerHTML = html;
    }

    function setupPlayerNav() {
        const prevBtn = getEl('btnPrev');
        const nextBtn = getEl('btnNext');
        if(!prevBtn || !nextBtn) return;

        const currentPath = window.location.pathname;
        // Filter data hanya season aktif saat ini untuk navigasi yang benar
        // Tapi karena halaman player mungkin reload, kita perlu logika global.
        // Simplified: Navigasi berdasarkan SEMUA episode yang diambil (sorted).
        
        const idx = episodeData.findIndex(ep => ep.url.includes(currentPath));

        if(idx !== -1) {
            if(idx > 0) {
                prevBtn.disabled = false;
                prevBtn.onclick = () => window.location.href = episodeData[idx-1].url;
            }
            if(idx < episodeData.length - 1) {
                nextBtn.disabled = false;
                nextBtn.onclick = () => window.location.href = episodeData[idx+1].url;
            }
        }
    }

    async function fetchBloggerPosts(labels) {
        if(!labels || labels.length === 0) return [];
        // Fetch data berdasarkan Label Series
        const feedUrl = `${MK_CONFIG.homeURL}feeds/posts/default/-/${encodeURIComponent(labels[0])}?alt=json&max-results=500`;
        try {
            const res = await fetch(feedUrl);
            const data = await res.json();
            return data.feed.entry.map(e => ({
                title: e.title.$t,
                published: e.published.$t,
                url: e.link.find(l => l.rel === 'alternate').href,
                labels: e.category ? e.category.map(c => c.term) : []
            }));
        } catch(e) { console.error("Fetch Error:", e); return []; }
    }

})();
