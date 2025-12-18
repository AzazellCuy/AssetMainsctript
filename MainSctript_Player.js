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
        return d.toLocaleDateString(MK_CONFIG.dateFormat, { day: 'numeric', month: 'short', year: 'numeric' });
    };
    const isFuture = (dateStr) => new Date(dateStr) > new Date();

    // --- INIT ---
    ENGINE.init = function(pageConfig) {
        activeConfig = { ...MK_CONFIG, ...pageConfig };
        
        // 1. Render Basic Info (Poster, Title, etc) jika elemen ada
        renderMetaBoard();

        // 2. Routing Logic
        if (activeConfig.type === 'series-detail' || activeConfig.type === 'series-player') {
            initSeriesLogic();
        } else if (activeConfig.type === 'movie-detail') {
            // Logic khusus movie detail (simple)
            if(getEl('btnWatchMovie')) {
                getEl('btnWatchMovie').onclick = () => window.location.href = activeConfig.playerLink;
            }
        }
    };

    // --- RENDER META BOARD ---
    function renderMetaBoard() {
        if (!activeConfig.info) return;
        const info = activeConfig.info;

        // Set Images & Text
        const posterEl = getEl('mkPosterImg');
        if(posterEl) posterEl.src = info.poster;

        const titleEl = getEl('mkTitle');
        if(titleEl) titleEl.innerText = info.title;

        const origTitleEl = getEl('mkOrigTitle');
        if(origTitleEl) origTitleEl.innerText = info.originalTitle;

        const synopEl = getEl('mkSynopsis');
        if(synopEl) synopEl.innerHTML = info.synopsis;

        // Render Grid Info
        const gridEl = getEl('mkMetaGrid');
        if(gridEl && info.details) {
            let html = '';
            for (const [key, val] of Object.entries(info.details)) {
                html += `<div class="mk-meta-item"><span>${key}</span><b>${val}</b></div>`;
            }
            gridEl.innerHTML = html;
        }

        // Render Trailer
        const trailerEl = getEl('mkTrailerBox');
        if(trailerEl && info.trailer) {
            trailerEl.innerHTML = `<iframe src="${info.trailer}" allowfullscreen></iframe>`;
        }

        // Setup Buttons
        const donateBtn = getEl('mkBtnDonate');
        if(donateBtn) {
            donateBtn.onclick = () => window.open(MK_CONFIG.donationURL, '_blank');
        }
    }

    // --- SERIES LOGIC ---
    async function initSeriesLogic() {
        // Render Schedule
        renderScheduleBanner();

        // Setup Filters
        setupFilters();

        // Fetch Data
        getEl('mkEpsList').innerHTML = '<div style="padding:20px;text-align:center;color:#666;">Memuat Data...</div>';
        episodeData = await fetchBloggerPosts(activeConfig.labels);
        
        // Render List
        renderEpisodeList();

        // Setup Player Nav (Only for player page)
        if(activeConfig.type === 'series-player') {
            setupPlayerNav();
        }
    }

    function renderScheduleBanner() {
        const bannerEl = getEl('mkScheduleBanner');
        if(!bannerEl || !activeConfig.scheduleText) return;
        bannerEl.innerHTML = `📅 JADWAL: ${activeConfig.scheduleText}`;
        bannerEl.style.display = 'block';
    }

    function setupFilters() {
        // Search
        const searchInput = getEl('mkSearchInput');
        if(searchInput) {
            searchInput.addEventListener('input', (e) => {
                currentSearch = e.target.value.toLowerCase();
                renderEpisodeList();
            });
        }

        // Season Selector
        const seasonSel = getEl('mkSeasonSelect');
        if(seasonSel) {
            // Hide selector if no seasons or only 1 season
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

        // Filter Logic
        let filtered = episodeData.filter(ep => {
            const matchesSearch = ep.title.toLowerCase().includes(currentSearch);
            const matchesSeason = currentSeasonFilter === 'All' ? true : ep.labels.includes(currentSeasonFilter);
            return matchesSearch && matchesSeason;
        });

        // Sort by Number (Simple extraction)
        filtered.sort((a,b) => extractEpNumber(a.title) - extractEpNumber(b.title));

        if(filtered.length === 0) {
            listEl.innerHTML = '<div style="padding:20px;text-align:center;">Tidak ada episode.</div>';
            return;
        }

        // Generate HTML
        let html = '';
        filtered.forEach(ep => {
            const epNum = extractEpNumber(ep.title);
            
            // Schedule Check
            let isLocked = false;
            let dateText = formatDate(ep.published);
            let badge = '';

            // Check if specific schedule exists for this episode number
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

            // Current Active Class
            const isActive = window.location.href.includes(ep.url);
            const activeStyle = isActive ? 'border-left: 3px solid var(--accent); background: #222;' : '';

            // Click Action
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

        // Cari index saat ini
        const currentUrl = window.location.href.split('?')[0]; // Remove query params
        // Sort data first to match list
        const sortedData = [...episodeData].sort((a,b) => extractEpNumber(a.title) - extractEpNumber(b.title));
        
        const idx = sortedData.findIndex(ep => ep.url.includes(window.location.pathname)); // Safer check

        if(idx !== -1) {
            if(idx > 0) {
                prevBtn.disabled = false;
                prevBtn.onclick = () => window.location.href = sortedData[idx-1].url;
            }
            if(idx < sortedData.length - 1) {
                nextBtn.disabled = false;
                nextBtn.onclick = () => window.location.href = sortedData[idx+1].url;
            }
        }
    }

    // --- DATA FETCHING ---
    async function fetchBloggerPosts(labels) {
        if(!labels || labels.length === 0) return [];
        // Menggunakan label pertama sebagai filter utama
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
        } catch(e) {
            console.error("Fetch Error:", e);
            return [];
        }
    }

    function extractEpNumber(title) {
        const match = title.match(/Episode\s*(\d+)/i) || title.match(/\s(\d+)\s/);
        return match ? parseInt(match[1]) : 999;
    }

})();
