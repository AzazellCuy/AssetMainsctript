/**
 * MORIKNUS STREAM ENGINE
 * Versi: 2.0 (Stable)
 * Author: Moriknus
 * Build: External Script Compatible
 */

(function(global) {
    "use strict";

    // Mencegah duplikasi inisialisasi
    if (global.MK_ENGINE) return;
    global.MK_ENGINE = {};
    
    const ENGINE = global.MK_ENGINE;

    // --- DEFAULT CONFIG (Fallback jika user lupa setting config di HTML) ---
    const DEFAULT_CONFIG = {
        timezone: "Asia/Jakarta",
        dateFormat: "id-ID",
        text: {
            searchPlaceholder: "Cari Episode...",
            upcoming: "Jadwal Tayang",
            locked: "🔒 Terkunci"
        }
    };

    let activeConfig = {};
    let episodeData = [];
    let currentSeasonFilter = "";
    let currentSearch = "";

    // --- HELPER FUNCTIONS ---
    const getEl = (id) => document.getElementById(id);
    
    const formatDate = (dateStr) => {
        if (!dateStr) return "-";
        try {
            const fmt = (global.MK_CONFIG && global.MK_CONFIG.dateFormat) || DEFAULT_CONFIG.dateFormat;
            const d = new Date(dateStr);
            return d.toLocaleDateString(fmt, { day: 'numeric', month: 'short', year: 'numeric' });
        } catch (e) { return dateStr; }
    };
    
    const isFuture = (dateStr) => {
        try {
            return new Date(dateStr) > new Date();
        } catch (e) { return false; }
    };

    // Fungsi Ekstrak Nomor Episode yang Kuat
    function extractEpNumber(title) {
        if (!title) return 999;
        // Mencari pola: "Episode 1", "Eps 1", " 1 ", atau angka di akhir string
        const match = title.match(/Episode\s*(\d+)/i) || 
                      title.match(/Eps\s*(\d+)/i) || 
                      title.match(/\s(\d+)\s/) || 
                      title.match(/^(\d+)\s/) || 
                      title.match(/(\d+)$/);
        return match ? parseInt(match[1]) : 999;
    }

    // --- CORE INITIALIZATION ---
    ENGINE.init = function(pageConfig) {
        // Gabungkan Config Global (dari HTML) + Page Config + Default
        const globalConfig = global.MK_CONFIG || {};
        activeConfig = { ...DEFAULT_CONFIG, ...globalConfig, ...pageConfig };
        
        console.log("Moriknus Engine Started:", activeConfig.type);

        // 1. Set Default Season
        if (activeConfig.seasons && activeConfig.seasons.length > 0) {
            currentSeasonFilter = activeConfig.seasons[0];
        }

        // 2. Render Tampilan Dasar
        renderMetaBoard();

        // 3. Routing Logika Halaman
        if (activeConfig.type === 'series-detail' || activeConfig.type === 'series-player') {
            initSeriesLogic();
        } else if (activeConfig.type === 'movie-detail') {
            const btnWatch = getEl('btnWatchMovie');
            if(btnWatch) {
                btnWatch.onclick = function() {
                    window.location.href = activeConfig.playerLink;
                };
            }
        } else if (activeConfig.type === 'movie-player') {
            // Logika player movie sederhana
        }
    };

    // --- RENDER META DATA (Poster, Judul, Sinopsis) ---
    function renderMetaBoard() {
        if (!activeConfig.info) return;
        const info = activeConfig.info;
        
        const posterEl = getEl('mkPosterImg'); if(posterEl) posterEl.src = info.poster;
        const titleEl = getEl('mkTitle'); if(titleEl) titleEl.innerText = info.title;
        const origTitleEl = getEl('mkOrigTitle'); if(origTitleEl) origTitleEl.innerText = info.originalTitle;
        const synopEl = getEl('mkSynopsis'); if(synopEl) synopEl.innerHTML = info.synopsis;
        
        // Render Grid Info
        const gridEl = getEl('mkMetaGrid');
        if(gridEl && info.details) {
            let html = '';
            for (const [key, val] of Object.entries(info.details)) {
                html += `<div class="mk-meta-item"><span>${key}</span><b>${val}</b></div>`;
            }
            gridEl.innerHTML = html;
        }

        // Trailer
        const trailerEl = getEl('mkTrailerBox'); 
        if(trailerEl && info.trailer) {
            trailerEl.innerHTML = `<iframe src="${info.trailer}" allowfullscreen style="width:100%;height:100%;border:none;"></iframe>`;
        }
        
        // Tombol Donasi
        const donateBtn = getEl('mkBtnDonate'); 
        if(donateBtn && activeConfig.donationURL) {
            donateBtn.onclick = () => window.open(activeConfig.donationURL, '_blank');
        }
    }

    // --- SERIES LOGIC HANDLER ---
    async function initSeriesLogic() {
        renderScheduleBanner();

        const listEl = getEl('mkEpsList');
        if(listEl) listEl.innerHTML = '<div style="padding:20px;text-align:center;color:#888;">Memuat Daftar Episode...</div>';
        
        // Ambil data
        episodeData = await fetchBloggerPosts(activeConfig.labels);
        
        // Urutkan Episode (1, 2, 3...)
        episodeData.sort((a,b) => extractEpNumber(a.title) - extractEpNumber(b.title));

        // Jika halaman Player, cek kunci & navigasi
        if(activeConfig.type === 'series-player') {
            checkLockState();
            setupPlayerNav();
        }
        
        // Jika ada elemen list, render isinya
        if(listEl) {
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
        let epNum = null;
        
        // Prioritas 1: Config manual di script page
        if (activeConfig.episode) {
            epNum = parseInt(activeConfig.episode);
        } else {
            // Prioritas 2: Deteksi dari URL & Judul (Fallback)
            const currentPath = window.location.pathname;
            const currentEp = episodeData.find(ep => ep.url.includes(currentPath));
            if (currentEp) epNum = extractEpNumber(currentEp.title);
        }

        // Cek Jadwal
        if (epNum && activeConfig.schedules && activeConfig.schedules[epNum]) {
            const releaseDate = activeConfig.schedules[epNum];
            if(isFuture(releaseDate)) {
                // BLOCK PLAYER UI
                const playerWrapper = getEl('mkPlayerWrapper');
                const blockScreen = getEl('mkBlockedScreen');
                const releaseTimeText = getEl('mkReleaseTime');
                
                if(playerWrapper) playerWrapper.style.display = 'none';
                if(blockScreen) {
                    blockScreen.style.display = 'flex';
                    if(releaseTimeText) releaseTimeText.innerText = formatDate(releaseDate) + " WIB";
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

        let filtered = episodeData.filter(ep => {
            const matchesSearch = ep.title.toLowerCase().includes(currentSearch);
            // Jika filter season kosong/tidak ada, anggap true (tampilkan semua/season default)
            const matchesSeason = (!currentSeasonFilter) || ep.labels.includes(currentSeasonFilter); 
            return matchesSearch && matchesSeason;
        });

        if(filtered.length === 0) {
            listEl.innerHTML = '<div style="padding:20px;text-align:center;">Tidak ada episode ditemukan.</div>';
            return;
        }

        let html = '';
        filtered.forEach(ep => {
            const epNum = extractEpNumber(ep.title);
            let isLocked = false;
            let dateText = formatDate(ep.published);

            // Cek Jadwal Lock
            if(activeConfig.schedules && activeConfig.schedules[epNum]) {
                const releaseDate = activeConfig.schedules[epNum];
                if(isFuture(releaseDate)) {
                    isLocked = true;
                    dateText = `<span style="color:#ff5252">Tayang: ${formatDate(releaseDate)}</span>`;
                }
            }

            // MEMBERSIHKAN JUDUL
            let displayTitle = ep.title;
            if (activeConfig.info && activeConfig.info.title) {
                try {
                    const regexSeries = new RegExp(activeConfig.info.title, "gi");
                    // Hapus Nama Series & Kata "Episode X" dari judul tampilan
                    displayTitle = displayTitle.replace(regexSeries, "")
                                               .replace(/Episode\s*\d+/gi, "")
                                               .replace(/Eps\s*\d+/gi, "")
                                               .replace(/[-|]/g, "")
                                               .trim();
                } catch(e) {}
            }
            if(displayTitle.length < 2) displayTitle = ep.title; 

            // Active Class
            const isActive = window.location.href.includes(ep.url);
            const activeClass = isActive ? 'active-eps' : '';
            const lockClass = isLocked ? 'eps-locked' : '';
            const clickAction = isLocked ? '' : `onclick="window.location.href='${ep.url}'"`;

            // HTML ITEM
            html += `
            <div class="mk-eps-item ${activeClass} ${lockClass}" ${clickAction}>
                <div class="mk-eps-num">${epNum}</div>
                <div class="mk-eps-info">
                    <div class="mk-eps-title">${displayTitle}</div>
                    <div class="mk-eps-date">${isLocked ? '🔒 ' : ''}${dateText}</div>
                </div>
            </div>`;
        });
        listEl.innerHTML = html;
    }

    function setupPlayerNav() {
        const prevBtn = getEl('btnPrev');
        const nextBtn = getEl('btnNext');
        if(!prevBtn || !nextBtn) return;
        
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
        // Menggunakan homeURL dari config atau detect otomatis
        const baseUrl = activeConfig.homeURL || window.location.origin;
        // Hapus slash di akhir jika ada
        const cleanUrl = baseUrl.replace(/\/$/, "");
        
        const feedUrl = `${cleanUrl}/feeds/posts/default/-/${encodeURIComponent(labels[0])}?alt=json&max-results=500`;
        
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
            console.error("Moriknus Engine: Gagal mengambil data episode.", e); 
            return []; 
        }
    }

})(window);
