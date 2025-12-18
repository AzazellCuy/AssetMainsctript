(function() {
    if (window.MK_ENGINE) return;
    window.MK_ENGINE = {};
    const ENGINE = window.MK_ENGINE;

    // State Internal
    let activeConfig = {};
    let episodeData = [];
    let currentSeasonFilter = "All";
    let currentSearch = "";

    // --- HELPER FUNCTIONS ---
    const getEl = (id) => document.getElementById(id);
    const formatDate = (dateStr) => {
        if (!dateStr) return "-";
        const d = new Date(dateStr);
        return d.toLocaleDateString(MK_CONFIG.dateFormat, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) + ' WIB';
    };
    const isFuture = (dateStr) => new Date(dateStr) > new Date();

    // --- INIT ---
    ENGINE.init = function(pageConfig) {
        activeConfig = { ...MK_CONFIG, ...pageConfig };
        
        // 1. Render Basic Info
        renderMetaBoard();

        // 2. Routing Logic
        if (activeConfig.type === 'series-detail' || activeConfig.type === 'series-player') {
            initSeriesLogic();
        } else if (activeConfig.type === 'movie-detail') {
            if(getEl('btnWatchMovie')) {
                getEl('btnWatchMovie').onclick = () => window.location.href = activeConfig.playerLink;
            }
        }
    };

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
        // 1. Tampilkan Jadwal (Jika ada elemennya)
        renderScheduleBanner();

        // 2. Fetch Data Blogger
        // Jika list episode ada (di Detail Page), beri loading
        if(getEl('mkEpsList')) getEl('mkEpsList').innerHTML = '<div style="padding:20px;text-align:center;color:#666;">Memuat Data...</div>';
        
        episodeData = await fetchBloggerPosts(activeConfig.labels);
        
        // 3. Logic Khusus Player: Cek Kunci & Navigasi
        if(activeConfig.type === 'series-player') {
            // Urutkan data dulu agar index benar untuk prev/next dan pengecekan
            episodeData.sort((a,b) => extractEpNumber(a.title) - extractEpNumber(b.title));
            
            // Cek apakah episode ini terkunci?
            checkLockState();
            
            // Setup Navigasi (Prev/Next)
            setupPlayerNav();
        }
        
        // 4. Render List (Hanya jika elemen mkEpsList ada - di Detail Page)
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

    // --- FITUR BARU: LOCK SCREEN ---
    function checkLockState() {
        // Cari episode saat ini berdasarkan URL
        const currentPath = window.location.pathname;
        const currentEp = episodeData.find(ep => ep.url.includes(currentPath));

        if (currentEp) {
            const epNum = extractEpNumber(currentEp.title);
            
            // Cek Jadwal di Config
            if(activeConfig.schedules && activeConfig.schedules[epNum]) {
                const releaseDate = activeConfig.schedules[epNum];
                
                // Jika waktu rilis masih di masa depan
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
            if(!activeConfig.seasons || activeConfig.seasons.length <= 1) {
                seasonSel.style.display = 'none';
            } else {
                let opts = `<option value="All">${MK_CONFIG.text.seasonDefault}</option>`;
                activeConfig.seasons.forEach(s => {
                    opts += `<option value="${s}">${s}</option>`;
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

        let filtered = episodeData.filter(ep => {
            const matchesSearch = ep.title.toLowerCase().includes(currentSearch);
            const matchesSeason = currentSeasonFilter === 'All' ? true : ep.labels.includes(currentSeasonFilter);
            return matchesSearch && matchesSeason;
        });

        filtered.sort((a,b) => extractEpNumber(a.title) - extractEpNumber(b.title));

        if(filtered.length === 0) {
            listEl.innerHTML = '<div style="padding:20px;text-align:center;">Tidak ada episode.</div>';
            return;
        }

        let html = '';
        filtered.forEach(ep => {
            const epNum = extractEpNumber(ep.title);
            let isLocked = false;
            let dateText = formatDate(ep.published).split(' ')[0]; // Ambil tanggal saja
            let badge = '';

            if(activeConfig.schedules && activeConfig.schedules[epNum]) {
                const releaseDate = activeConfig.schedules[epNum];
                if(isFuture(releaseDate)) {
                    isLocked = true;
                    dateText = `<span style="color:var(--accent)">Tayang: ${formatDate(releaseDate)}</span>`;
                    badge = '<span class="badge-lock">UPCOMING</span>';
                } else {
                    badge = '<span class="badge-new">NEW</span>';
                }
            }

            const isActive = window.location.href.includes(ep.url);
            const activeStyle = isActive ? 'border-left: 3px solid var(--accent); background: #222;' : '';
            const action = isLocked ? '' : `onclick="window.location.href='${ep.url}'"`;
            const cssClass = `mk-eps-item ${isLocked ? 'locked' : ''}`;

            html += `
            <div class="${cssClass}" style="${activeStyle}" ${action}>
                <div class="mk-eps-num">${epNum}</div>
                <div class="mk-eps-info">
                    <span class="mk-eps-title">${ep.title}</span>
                    <div class="mk-eps-date">${badge} ${dateText}</div>
                </div>
                <div style="font-size:12px; opacity:0.7">
                    ${isLocked ? MK_CONFIG.text.locked : MK_CONFIG.text.watch}
                </div>
            </div>`;
        });
        listEl.innerHTML = html;
    }

    function setupPlayerNav() {
        const prevBtn = getEl('btnPrev');
        const nextBtn = getEl('btnNext');
        if(!prevBtn || !nextBtn) return;

        // Cari index episode saat ini
        const currentPath = window.location.pathname;
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

    function extractEpNumber(title) {
        const match = title.match(/Episode\s*(\d+)/i) || title.match(/\s(\d+)\s/);
        return match ? parseInt(match[1]) : 999;
    }

})();
