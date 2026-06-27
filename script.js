let rawData = [];
    let mahasiswaData = [];
    let sourceData = [];
    let thresholdPO = 75; // Default fallback threshold
    let kppRulesList = [];
    let konsekRulesList = [];

    // Google Spreadsheet configurations
    const SPREADSHEET_ID = '1_5aj9zDefMnXXBYcv-6yjJHyE1zAisxbEGPo_PYmtMg';
    const GID_BOARD = '1812264327';
    const GID_SOURCE = '0';
    
    const URL_BOARD = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/export?format=csv&gid=${GID_BOARD}`;
    const URL_SOURCE = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/export?format=csv&gid=${GID_SOURCE}`;

    // Simple RFC 4180 compliant CSV Parser
    function parseCSV(text) {
        const lines = [];
        let row = [""];
        let inQuotes = false;

        for (let i = 0; i < text.length; i++) {
            const c = text[i];
            const next = text[i+1];

            if (c === '"') {
                if (inQuotes && next === '"') {
                    row[row.length - 1] += '"';
                    i++;
                } else {
                    inQuotes = !inQuotes;
                }
            } else if (c === ',' && !inQuotes) {
                row.push('');
            } else if ((c === '\r' || c === '\n') && !inQuotes) {
                if (c === '\r' && next === '\n') {
                    i++;
                }
                lines.push(row);
                row = [''];
            } else {
                row[row.length - 1] += c;
            }
        }
        if (row.length > 1 || row[0] !== '') {
            lines.push(row);
        }
        return lines;
    }

    // Convert Board CSV to match format of data.json
    function csvToObjects(csvText) {
        const lines = parseCSV(csvText);
        const objects = [];
        
        let startIdx = -1;
        for (let i = 0; i < lines.length; i++) {
            if (lines[i][0] === 'No') {
                startIdx = i;
                break;
            }
        }
        
        if (startIdx === -1) {
            console.error("Gagal menemukan baris header 'No' di CSV");
            return [];
        }
        
        const keys = [
            "", "__1", "__2", "__3", "__4", "KPP", "__5", "__6", "__7", "__8",
            "__9", "__10", "__11", "KONSEKUENSI", "__12", "__13", "__14", "__15", "__16",
            "Penilaian", "__17", "__18", "__19"
        ];
        
        // 1. Header row
        const headerObj = {};
        keys.forEach((key, colIdx) => {
            headerObj[key] = lines[startIdx][colIdx] || "";
        });
        objects.push(headerObj);
        
        // 2. TnC row
        const tncObj = {};
        keys.forEach((key, colIdx) => {
            tncObj[key] = lines[startIdx + 1][colIdx] || "";
        });
        objects.push(tncObj);
        
        // 3. Bobot row
        const bobotObj = {};
        keys.forEach((key, colIdx) => {
            const rawVal = lines[startIdx + 2][colIdx] || "";
            if (colIdx >= 5 && colIdx <= 18) {
                bobotObj[key] = parseFloat(rawVal) || 0;
            } else if (key === "__19") {
                bobotObj[key] = parseFloat(rawVal) || 75;
            } else {
                bobotObj[key] = rawVal;
            }
        });
        objects.push(bobotObj);
        
        // 4. Student rows and KETERCAPAIAN
        for (let i = startIdx + 3; i < lines.length; i++) {
            const row = lines[i];
            if (row.length === 0 || !row[0]) continue;
            
            const obj = {};
            keys.forEach((key, colIdx) => {
                const rawVal = row[colIdx] || "";
                if (row[0] === 'KETERCAPAIAN') {
                    obj[key] = rawVal;
                } else if (colIdx >= 5 && colIdx <= 18) {
                    obj[key] = parseFloat(rawVal) || 0;
                } else if (colIdx >= 19 && colIdx <= 21) {
                    obj[key] = parseFloat(rawVal) || 0;
                } else {
                    obj[key] = rawVal;
                }
            });
            objects.push(obj);
        }
        
        return objects;
    }

    // Convert Source CSV to match format of source.json
    function csvToSourceObjects(csvText) {
        const lines = parseCSV(csvText);
        const objects = [];
        
        lines.forEach(row => {
            const skVal = row[0] || "";
            const bobotVal = row[1] || "";
            const sourceVal = row[2] || "";
            
            let parsedBobot = bobotVal;
            if (bobotVal && !isNaN(bobotVal) && bobotVal.trim() !== "") {
                parsedBobot = parseFloat(bobotVal);
            }
            
            objects.push({
                "SK": skVal,
                "SK MANAGE 2025": parsedBobot,
                "": sourceVal
            });
        });
        
        return objects;
    }

    // Shared processing function
    function processLoadedData(data, source) {
        rawData = data;
        sourceData = source;
        
        // Filter baris data mahasiswa valid (memiliki NRP numerik)
        mahasiswaData = data.filter(item => {
            const nrp = String(item["__3"]).trim();
            return nrp && !isNaN(nrp) && nrp !== "";
        });

        console.log("Database dimuat:", mahasiswaData.length, "mahasiswa.");
        
        // Ekstrak parameter dari file JSON dan source.json
        parseRulesAndParameters();
        
        // Inisialisasi statistik dashboard
        initDashboard();
    }

    // Load data from live Google Sheets (No local fallback as requested)
    console.log("Mencoba memuat data live dari Google Spreadsheet...");
    Promise.all([
        fetch(URL_BOARD).then(res => {
            if (!res.ok) throw new Error('Gagal memuat data live board dari Google Spreadsheet');
            return res.text();
        }),
        fetch(URL_SOURCE).then(res => {
            if (!res.ok) throw new Error('Gagal memuat data live source dari Google Spreadsheet');
            return res.text();
        })
    ])
    .then(([csvBoard, csvSource]) => {
        console.log("Data live berhasil dimuat!");
        const data = csvToObjects(csvBoard);
        const source = csvToSourceObjects(csvSource);
        processLoadedData(data, source);
    })
    .catch(err => {
        console.error('Pemuatan data dari Google Sheets gagal:', err);
        showSpreadsheetError(err.message);
    });

    function showSpreadsheetError(errMsg) {
        const errorAlert = document.getElementById('errorAlert');
        errorAlert.innerHTML = `
            <strong>Gagal Memuat Data Live dari Google Spreadsheet!</strong><br>
            <span style="font-size: 0.82rem; margin-top: 6px; display: block; opacity: 0.9; line-height: 1.5;">
                Detail Error: <code>${errMsg}</code><br><br>
                Langkah Solusi:<br>
                1. Pastikan Anda memiliki koneksi internet aktif.<br>
                2. Pastikan Google Spreadsheet sudah diatur dengan akses <strong>"Siapa saja yang memiliki link dapat melihat" (Anyone with the link can view)</strong>.<br>
                3. Pastikan Spreadsheet ID dan GID yang terkonfigurasi di file HTML sudah benar.
            </span>
        `;
        errorAlert.style.display = 'block';
    }

    // Fungsi pemindahan Tab Menu
    function switchTab(tabId, element) {
        // Hapus active class dari semua tab button dan tab content
        document.querySelectorAll('.nav-tab').forEach(btn => btn.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));

        // Tambah active class pada tab dan kontainer yang dipilih
        if (element) element.classList.add('active');
        const activeTab = document.getElementById(tabId);
        if (activeTab) activeTab.classList.add('active');

        // Sinkronisasi status aktif ke sidebar links
        document.querySelectorAll('.sidebar-link').forEach(link => link.classList.remove('active'));
        let sidebarBtn;
        if (tabId === 'tab-rules') {
            sidebarBtn = document.querySelector('.sidebar-links .sidebar-link:nth-child(1)');
        } else if (tabId === 'tab-dashboard') {
            sidebarBtn = document.querySelector('.sidebar-links .sidebar-link:nth-child(2)');
        } else if (tabId === 'tab-search') {
            sidebarBtn = document.querySelector('.sidebar-links .sidebar-link:nth-child(3)');
        }
        if (sidebarBtn) sidebarBtn.classList.add('active');

        // Khusus tab dashboard, jalankan animasi ulang progress circle
        if (tabId === 'tab-dashboard') {
            initDashboard();
        }
    }

    // Memetakan source.json dengan data.json untuk menampilkan aturan secara terperinci
    function parseRulesAndParameters() {
        if (rawData.length < 3) return;

        const headerRow = rawData[0];
        const bobotRow = rawData[2];

        // Membaca threshold PO Jahim secara dinamis dari baris Bobot kolom "__19"
        if (bobotRow && bobotRow["__19"] !== undefined) {
            thresholdPO = parseFloat(bobotRow["__19"]) || 75;
            document.getElementById('textThreshold').innerText = thresholdPO;
        }

        // Parse list aturan dari source.json
        let sourceKppItems = [];
        let sourceKonsekItems = [];
        let currentSection = '';

        sourceData.forEach(item => {
            const sk = String(item["SK"]).trim();
            if (sk === "KPP") {
                currentSection = 'KPP';
                return;
            }
            if (sk === "Konsekuensi") {
                currentSection = 'Konsekuensi';
                return;
            }
            if (sk === "TnC" || sk === "Total") {
                return;
            }
            
            // Masukkan item yang memiliki bobot atau keterangan
            if (item["SK MANAGE 2025"] === "" && sk === "") {
                return;
            }
            
            const rule = {
                name: sk,
                bobot: item["SK MANAGE 2025"],
                source: item[""]
            };
            
            if (currentSection === 'KPP') {
                sourceKppItems.push(rule);
            } else if (currentSection === 'Konsekuensi') {
                sourceKonsekItems.push(rule);
            }
        });

        // RENDER KETENTUAN KPP
        const kppKeys = ['KPP', '__5', '__6', '__7', '__8', '__9', '__10', '__11'];
        const kppBody = document.getElementById('rulesKppBody');
        kppBody.innerHTML = '';
        
        kppRulesList = [];
        kppKeys.forEach((key, idx) => {
            const titleName = headerRow[key];
            const sourceRuleObj = sourceKppItems[idx];
            
            if (titleName && sourceRuleObj) {
                // Gunakan teks detail dari source.json jika tersedia, jika kosong gunakan header
                const detailText = sourceRuleObj.name || titleName;
                const weight = sourceRuleObj.bobot;
                const linkSource = sourceRuleObj.source;
                
                const tncRow = rawData[1];
                const tncText = tncRow ? tncRow[key] : "";
                
                kppRulesList.push({
                    key: key,
                    titleName: titleName,
                    detailText: detailText,
                    weight: weight,
                    tncText: tncText
                });

                // Render tombol link jika ada URL Google Docs/Spreadsheet yang valid
                let actionLink = `<span class="link-disabled">-</span>`;
                if (linkSource && typeof linkSource === 'string' && linkSource.startsWith('http')) {
                    actionLink = `<a href="${linkSource}" target="_blank" class="link-btn">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
                        Spreadsheet
                    </a>`;
                }

                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td data-label="Nama Program" style="font-weight: 600; color: var(--text-primary);">${titleName}</td>
                    <td data-label="Detail Syarat" style="color: var(--text-secondary);">${detailText}</td>
                    <td data-label="Bobot" style="text-align: center; font-weight: 600; color: var(--primary-dark);">${weight !== undefined ? (weight * 100) + '%' : '-'}</td>
                    <td data-label="Link Spreadsheet" style="text-align: center;">${actionLink}</td>
                `;
                kppBody.appendChild(tr);
            }
        });

        // RENDER KETENTUAN KONSEKUENSI
        const konsekKeys = ['KONSEKUENSI', '__12', '__13', '__14', '__15', '__16'];
        const konsekBody = document.getElementById('rulesKonsekBody');
        konsekBody.innerHTML = '';

        konsekRulesList = [];
        konsekKeys.forEach((key, idx) => {
            const titleName = headerRow[key];
            const sourceRuleObj = sourceKonsekItems[idx];

            if (titleName && sourceRuleObj) {
                const detailText = sourceRuleObj.name || titleName;
                const weight = sourceRuleObj.bobot;
                const linkSource = sourceRuleObj.source;
                
                const tncRow = rawData[1];
                const tncText = tncRow ? tncRow[key] : "";
                
                konsekRulesList.push({
                    key: key,
                    titleName: titleName,
                    detailText: detailText,
                    weight: weight,
                    tncText: tncText
                });

                let actionLink = `<span class="link-disabled">-</span>`;
                if (linkSource && typeof linkSource === 'string' && linkSource.startsWith('http')) {
                    actionLink = `<a href="${linkSource}" target="_blank" class="link-btn">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
                        Spreadsheet
                    </a>`;
                }

                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td data-label="Nama Program" style="font-weight: 600; color: var(--text-primary);">${titleName}</td>
                    <td data-label="Detail Syarat" style="color: var(--text-secondary);">${detailText}</td>
                    <td data-label="Bobot" style="text-align: center; font-weight: 600; color: var(--warning-dark);">${weight !== undefined ? (weight * 100) + '%' : '-'}</td>
                    <td data-label="Link Spreadsheet" style="text-align: center;">${actionLink}</td>
                `;
                konsekBody.appendChild(tr);
            }
        });
    }

    let activeToolFilter = 'all';
    let toolSearchQuery = '';

    function filterTools(filterType) {
        activeToolFilter = filterType;
        document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
        if (event && event.currentTarget) {
            event.currentTarget.classList.add('active');
        }
        renderDashboardTools();
    }

    function searchTools() {
        toolSearchQuery = document.getElementById('toolSearchInput').value.toLowerCase().trim();
        renderDashboardTools();
    }

    function renderDashboardTools() {
        const kppToolsContainer = document.getElementById('kppToolsContainer');
        const konsekToolsContainer = document.getElementById('konsekToolsContainer');
        
        if (!kppToolsContainer || !konsekToolsContainer) return;
        
        kppToolsContainer.innerHTML = '';
        konsekToolsContainer.innerHTML = '';
        
        const ketercapaianRow = rawData.find(item => String(item[""]).trim() === "KETERCAPAIAN");
        if (!ketercapaianRow) return;
        
        const renderToolCard = (rule, container) => {
            let avgText = "0.0%";
            let avgPercentage = 0;
            
            if (ketercapaianRow[rule.key] !== undefined) {
                avgText = String(ketercapaianRow[rule.key]).trim();
                avgPercentage = parseFloat(avgText) || 0;
            }
            
            // Parse threshold target from TnC text
            let target = 85;
            if (rule.tncText) {
                const match = rule.tncText.match(/(\d+)%/);
                if (match) {
                    target = parseInt(match[1]);
                }
            }
            
            const isAchieved = avgPercentage >= target;
            
            // Filter logic
            if (activeToolFilter === 'achieved' && !isAchieved) return;
            if (activeToolFilter === 'failed' && isAchieved) return;
            
            // Search logic
            if (toolSearchQuery && !rule.titleName.toLowerCase().includes(toolSearchQuery)) return;
            
            // Determine progress bar color and glowing borders
            let barColorClass = 'red';
            let borderStyle = 'border-left: 4px solid var(--danger);';
            let bgGlow = 'rgba(239, 68, 68, 0.03)';
            
            if (isAchieved) {
                barColorClass = 'green';
                borderStyle = 'border-left: 4px solid var(--success);';
                bgGlow = 'rgba(16, 185, 129, 0.03)';
            } else if (avgPercentage >= 50) {
                barColorClass = 'orange';
                borderStyle = 'border-left: 4px solid var(--warning);';
                bgGlow = 'rgba(245, 158, 11, 0.03)';
            }
            
            const cardDiv = document.createElement('div');
            cardDiv.className = 'tool-status-card';
            cardDiv.style = `${borderStyle} background: ${bgGlow};`;
            cardDiv.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 10px;">
                    <span style="font-size: 0.92rem; font-weight: 600; color: var(--text-primary); line-height: 1.3;">${rule.titleName}</span>
                    <span class="badge ${isAchieved ? 'success' : 'danger'}" style="font-size: 0.72rem; padding: 4px 10px; margin: 0; white-space: nowrap;">
                        ${isAchieved ? 'Tercapai' : 'Tidak Tercapai'}
                    </span>
                </div>
                <div style="display: flex; align-items: center; gap: 10px; margin-top: 2px;">
                    <div class="bar-track" style="flex: 1; height: 6px; background: rgba(15, 23, 42, 0.05); margin: 0;">
                        <div class="bar-fill ${barColorClass}" style="width: ${avgPercentage}%; height: 100%;"></div>
                    </div>
                    <span style="font-size: 0.85rem; font-weight: 700; color: var(--text-secondary); width: 85px; text-align: right; white-space: nowrap;">
                        ${avgText} <span style="font-size: 0.72rem; font-weight: 500; color: var(--text-muted);">/ ${target}%</span>
                    </span>
                </div>
            `;
            container.appendChild(cardDiv);
        };
        
        kppRulesList.forEach(rule => renderToolCard(rule, kppToolsContainer));
        konsekRulesList.forEach(rule => renderToolCard(rule, konsekToolsContainer));
    }

    // Menginisialisasi & menghitung data dashboard statistik
    function initDashboard() {
        if (mahasiswaData.length === 0) return;

        const total = mahasiswaData.length;
        
        // Hitung Kelulusan Warga (LULUS)
        const lulusCount = mahasiswaData.filter(m => String(m["__4"]).trim() === "LULUS").length;
        const lulusPercent = total > 0 ? ((lulusCount / total) * 100).toFixed(1) : 0;
        
        // Find the KETERCAPAIAN row in rawData
        const ketercapaianRow = rawData.find(item => String(item[""]).trim() === "KETERCAPAIAN");
        
        // Kelayakan PO Jahim
        let poPercentText = "";
        let poPercentNum = 0;
        const poCount = mahasiswaData.filter(m => String(m["__19"]).trim() === "PO JAHIM").length;
        
        if (ketercapaianRow && ketercapaianRow["__19"] !== undefined) {
            poPercentText = String(ketercapaianRow["__19"]).trim();
            poPercentNum = parseFloat(poPercentText) || 0;
        } else {
            poPercentNum = total > 0 ? (poCount / total) * 100 : 0;
            poPercentText = poPercentNum.toFixed(1) + "%";
        }

        // Tulis nilai ke UI (KPI Utama)
        document.getElementById('dashTotal').innerText = total;
        
        document.getElementById('dashWargaVal').innerText = lulusPercent + "%";
        document.getElementById('dashWargaCount').innerText = lulusCount;
        document.getElementById('dashWargaPercent').innerText = Math.round(lulusPercent) + "%";
        
        document.getElementById('dashJahimVal').innerText = poPercentText;
        document.getElementById('dashJahimCount').innerText = poCount;
        document.getElementById('dashJahimPercent').innerText = Math.round(poPercentNum) + "%";

        // Hitung Rata-rata Nilai Angkatan 2024
        let avgKpp = 0;
        let avgKonsek = 0;
        let avgTotal = 0;
        
        if (ketercapaianRow) {
            avgKpp = parseFloat(ketercapaianRow["Penilaian"]) || 0;
            avgKonsek = parseFloat(ketercapaianRow["__17"]) || 0;
            avgTotal = parseFloat(ketercapaianRow["__18"]) || 0;
        } else {
            avgKpp = total > 0 ? (mahasiswaData.reduce((sum, m) => sum + (parseFloat(m["Penilaian"]) || 0), 0) / total) : 0;
            avgKonsek = total > 0 ? (mahasiswaData.reduce((sum, m) => sum + (parseFloat(m["__17"]) || 0), 0) / total) : 0;
            avgTotal = total > 0 ? (mahasiswaData.reduce((sum, m) => sum + (parseFloat(m["__18"]) || 0), 0) / total) : 0;
        }

        // Update Nilai Rata-rata & Bar Progres di UI
        document.getElementById('avgKppVal').innerText = avgKpp.toFixed(1) + " / 100";
        document.getElementById('avgKonsekVal').innerText = avgKonsek.toFixed(1) + " / 100";
        document.getElementById('avgTotalVal').innerText = avgTotal.toFixed(1) + " / 100";

        document.getElementById('avgKppFill').style.width = avgKpp + "%";
        document.getElementById('avgKonsekFill').style.width = avgKonsek + "%";
        document.getElementById('avgTotalFill').style.width = avgTotal + "%";

        // Animate circular progress rings
        animateProgressCircle('circleWarga', parseFloat(lulusPercent));
        animateProgressCircle('circleJahim', poPercentNum);

        // Render individual tools achievement in dashboard
        renderDashboardTools();
    }

    function animateProgressCircle(elementId, percentage) {
        const circle = document.getElementById(elementId);
        if (!circle) return;
        const r = circle.r.baseVal.value;
        const circumference = 2 * Math.PI * r;
        
        circle.style.strokeDasharray = `${circumference} ${circumference}`;
        circle.style.strokeDashoffset = circumference;
        
        setTimeout(() => {
            const offset = circumference - (percentage / 100) * circumference;
            circle.style.strokeDashoffset = offset;
        }, 150);
    }

    // Fungsi Cek Kelayakan PO Jahim berdasarkan NRP
    function cekStatus() {
        const nrpInput = document.getElementById('nrpInput').value.trim();
        const errorAlert = document.getElementById('errorAlert');
        const placeholder = document.getElementById('resultPlaceholder');
        const card = document.getElementById('resultCard');

        // Reset tampilan awal
        errorAlert.style.display = 'none';
        card.style.display = 'none';
        placeholder.style.display = 'flex';

        if (mahasiswaData.length === 0) {
            errorAlert.innerText = "Data mahasiswa belum selesai dimuat. Silakan tunggu sebentar.";
            errorAlert.style.display = 'block';
            return;
        }

        if (!nrpInput) {
            errorAlert.innerText = "Tolong masukkan NRP kamu terlebih dahulu.";
            errorAlert.style.display = 'block';
            return;
        }

        // Cari mahasiswa berdasarkan NRP
        const mhs = mahasiswaData.find(item => String(item["__3"]) === nrpInput);

        if (mhs) {
            placeholder.style.display = 'none';
            card.style.display = 'block';

            // Menampilkan Nama Lengkap secara utuh
            const rawName = mhs["__2"] || "Mahasiswa Terdaftar";
            document.getElementById('resNama').innerText = rawName;
            document.getElementById('resNrp').innerText = "NRP: " + (mhs["__3"] || "-");

            // Status Warga Badge
            const statusWarga = String(mhs["__4"]).trim();
            const resWargaBadge = document.getElementById('resWargaBadge');
            const resSkContainer = document.getElementById('resSkContainer');
            if (statusWarga === "LULUS") {
                resWargaBadge.innerText = "Warga Aktif";
                resWargaBadge.className = "badge success";
                if (resSkContainer) resSkContainer.style.display = "block";
            } else {
                resWargaBadge.innerText = "Warga Pasif";
                resWargaBadge.className = "badge danger";
                if (resSkContainer) resSkContainer.style.display = "none";
            }

            // Status PO Jahim Badge
            const statusJahim = String(mhs["__19"]).trim();
            const resJahimBadge = document.getElementById('resJahimBadge');
            if (statusJahim === "PO JAHIM") {
                resJahimBadge.innerText = "Passed PO Jahim";
                resJahimBadge.className = "badge primary";
            } else {
                resJahimBadge.innerText = "Not Passed";
                resJahimBadge.className = "badge danger";
            }

            // KPP bar
            const kpp = parseFloat(mhs["Penilaian"]) || 0;
            document.getElementById('resKppText').innerText = kpp + " / 100";
            const kppFill = document.getElementById('resKppFill');
            kppFill.style.width = '0%';
            setTimeout(() => { kppFill.style.width = kpp + '%'; }, 100);
            updateBarColorClass(kppFill, kpp);

            // Konsekuensi bar
            const konsek = parseFloat(mhs["__17"]) || 0;
            document.getElementById('resKonsekText').innerText = konsek + " / 100";
            const konsekFill = document.getElementById('resKonsekFill');
            konsekFill.style.width = '0%';
            setTimeout(() => { konsekFill.style.width = konsek + '%'; }, 100);
            updateBarColorClass(konsekFill, konsek);

            // Nilai Total Akhir bar
            const total = parseFloat(mhs["__18"]) || 0;
            document.getElementById('resTotalText').innerText = total + " / 100";
            const totalFill = document.getElementById('resTotalFill');
            totalFill.style.width = '0%';
            setTimeout(() => { totalFill.style.width = total + '%'; }, 100);
            updateBarColorClass(totalFill, total);

            // Render rincian nilai per kriteria di hasil pencarian
            const searchKppDetailContainer = document.getElementById('searchKppDetailContainer');
            const searchKonsekDetailContainer = document.getElementById('searchKonsekDetailContainer');
            
            if (searchKppDetailContainer && searchKonsekDetailContainer) {
                searchKppDetailContainer.innerHTML = '';
                searchKonsekDetailContainer.innerHTML = '';
                
                const createDetailItem = (rule) => {
                    const score = parseFloat(mhs[rule.key]) || 0;
                    
                    // Parse target dari TnC kriteria (default fallback 85)
                    let target = 85;
                    if (rule.tncText) {
                        const match = rule.tncText.match(/(\d+)%/);
                        if (match) {
                            target = parseInt(match[1]);
                        }
                    }
                    
                    const isTargetMet = score >= target;
                    
                    let statusColor = 'var(--danger-dark)';
                    let statusBg = 'var(--danger-light)';
                    let statusLabel = 'Tidak Tercapai';
                    let borderLeftStyle = 'border-left: 3px solid var(--danger);';
                    
                    if (isTargetMet) {
                        statusColor = 'var(--success-dark)';
                        statusBg = 'var(--success-light)';
                        statusLabel = 'Tercapai';
                        borderLeftStyle = 'border-left: 3px solid var(--success);';
                    } else if (score >= 50) {
                        statusColor = 'var(--warning-dark)';
                        statusBg = 'var(--warning-light)';
                        borderLeftStyle = 'border-left: 3px solid var(--warning);';
                    }
                    
                    const itemDiv = document.createElement('div');
                    itemDiv.style = `
                        background: rgba(255, 255, 255, 0.7);
                        border: 1px solid var(--border-inner);
                        ${borderLeftStyle}
                        border-radius: 12px;
                        padding: 12px;
                        display: flex;
                        flex-direction: column;
                        gap: 8px;
                        box-shadow: var(--shadow-sm);
                    `;
                    
                    itemDiv.innerHTML = `
                        <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 10px;">
                            <span style="font-size: 0.85rem; font-weight: 600; color: var(--text-primary); line-height: 1.3;">${rule.titleName}</span>
                            <span style="font-size: 0.7rem; padding: 2px 8px; border-radius: 20px; font-weight: 700; color: ${statusColor}; background: ${statusBg}; white-space: nowrap;">
                                ${statusLabel}
                            </span>
                        </div>
                        <div style="display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-top: 2px;">
                            <span style="font-size: 0.75rem; color: var(--text-muted); font-weight: 500;">Bobot: ${(rule.weight * 100)}%</span>
                            <span style="font-size: 0.85rem; font-weight: 700; color: var(--text-secondary);">
                                ${score.toFixed(2)}% <span style="font-size: 0.72rem; font-weight: 500; color: var(--text-muted);">/ Target ${target}%</span>
                            </span>
                        </div>
                    `;
                    return itemDiv;
                };
                
                kppRulesList.forEach(rule => {
                    searchKppDetailContainer.appendChild(createDetailItem(rule));
                });
                
                konsekRulesList.forEach(rule => {
                    searchKonsekDetailContainer.appendChild(createDetailItem(rule));
                });
            }

        } else {
            errorAlert.innerText = "NRP kamu tidak ditemukan. Coba periksa kembali ketikannya ya!";
            errorAlert.style.display = 'block';
        }
    }

    // Fungsi untuk membuka/tutup sidebar mobile
    function toggleSidebar(isOpen) {
        const sidebar = document.getElementById('sidebarMenu');
        const overlay = document.getElementById('sidebarOverlay');
        
        if (isOpen) {
            sidebar.classList.add('active');
            overlay.classList.add('active');
            document.body.style.overflow = 'hidden'; // Kunci scroll layar utama
        } else {
            sidebar.classList.remove('active');
            overlay.classList.remove('active');
            document.body.style.overflow = ''; // Aktifkan kembali scroll
        }
    }

    // Fungsi perpindahan tab dari sidebar
    function handleSidebarTabClick(tabId, btn) {
        let navBtn;
        if (tabId === 'tab-rules') {
            navBtn = document.querySelector('.nav-tabs .nav-tab:nth-child(1)');
        } else if (tabId === 'tab-dashboard') {
            navBtn = document.querySelector('.nav-tabs .nav-tab:nth-child(2)');
        } else if (tabId === 'tab-search') {
            navBtn = document.querySelector('.nav-tabs .nav-tab:nth-child(3)');
        }
        
        switchTab(tabId, navBtn);
        
        document.querySelectorAll('.sidebar-link').forEach(link => link.classList.remove('active'));
        btn.classList.add('active');
        
        toggleSidebar(false);
    }

    function updateBarColorClass(element, score) {
        element.className = "bar-fill";
        if (score >= 75) {
            element.classList.add('green');
        } else if (score >= 50) {
            element.classList.add('orange');
        } else {
            element.classList.add('red');
        }
    }
