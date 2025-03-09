document.addEventListener('DOMContentLoaded', () => {
    const reiniciarBtn = document.getElementById('reiniciar-links');
    const canalesSection = document.getElementById('canales');

    // Parsear el archivo M3U
    function parseM3U(text) {
        const lines = text.split('\n');
        const canales = [];
        let currentChannel = null;
        let epgUrl = '';

        lines.forEach(line => {
            if (line.startsWith('#EXTM3U')) {
                const urlMatch = line.match(/url-tvg="([^"]+)"/);
                if (urlMatch) epgUrl = urlMatch[1];
            } else if (line.startsWith('#EXTINF:')) {
                const parts = line.split(',');
                let name = parts[1].trim();
                name = name.replace(/-->\s*NEW ERA\s*[IVX]*/i, '').trim();
                name = name.replace(/-->\s*NEW LOOP\s*[IVX]*/i, '').trim();
                const attrs = parts[0].split(' ').slice(1).join(' ');
                const logoMatch = attrs.match(/tvg-logo="([^"]+)"/);
                const idMatch = attrs.match(/tvg-id="([^"]+)"/);
                const groupMatch = attrs.match(/group-title="([^"]+)"/);

                currentChannel = {
                    nombre: name,
                    logo: logoMatch ? logoMatch[1] : 'https://via.placeholder.com/100',
                    id: idMatch ? idMatch[1] : '',
                    grupo: groupMatch ? groupMatch[1] : 'OTROS',
                    enlace: ''
                };
            } else if (line.trim() && !line.startsWith('#') && currentChannel) {
                currentChannel.enlace = line.trim();
                canales.push(currentChannel);
                currentChannel = null;
            }
        });

        return { canales, epgUrl };
    }

    // Cargar el EPG
    async function loadEPG(url) {
        try {
            const response = await fetch(url);
            if (!response.ok) throw new Error('No se pudo cargar el EPG');
            const xmlText = await response.text();
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(xmlText, 'text/xml');
            const programmes = xmlDoc.getElementsByTagName('programme');
            const epg = {};

            for (let prog of programmes) {
                const channel = prog.getAttribute('channel');
                const start = prog.getAttribute('start');
                const stop = prog.getAttribute('stop');
                const title = prog.getElementsByTagName('title')[0].textContent;

                if (!epg[channel]) epg[channel] = [];
                epg[channel].push({ start, stop, title });
            }

            return epg;
        } catch (error) {
            console.error('Error al cargar EPG:', error);
            return {};
        }
    }

    // Obtener programa actual
    function getCurrentProgramme(epg, channelId) {
        const now = new Date().toISOString().replace(/[-:]/g, '').slice(0, 14);
        const programmes = epg[channelId] || [];
        return programmes.find(prog => prog.start <= now && prog.stop > now) || null;
    }

    // Obtener nombre base
    function getBaseName(name) {
        return name.replace(/\s*\(.*?\)|\s*\d+p|\s*FHD|\s*HD|\s*SD/i, '').trim();
    }

    // Mostrar canales
    function mostrarCanales(canales, epg = {}) {
        canalesSection.innerHTML = '';
        const grupos = {};

        canales.forEach(canal => {
            let grupo = canal.grupo;
            if (canal.nombre.toLowerCase().includes('f1') || canal.nombre.toLowerCase().includes('formula 1')) {
                grupo = 'F1';
            }
            if (!grupos[grupo]) grupos[grupo] = {};
            const baseName = getBaseName(canal.nombre);
            const currentProg = getCurrentProgramme(epg, canal.id);
            const progKey = currentProg ? currentProg.title : 'Sin programación';

            const key = `${baseName}-${progKey}`;
            if (!grupos[grupo][key]) {
                grupos[grupo][key] = {
                    logo: canal.logo,
                    id: canal.id,
                    nombreBase: baseName,
                    programa: progKey,
                    opciones: []
                };
            }
            grupos[grupo][key].opciones.push({ nombre: canal.nombre, enlace: canal.enlace });
        });

        const ordenGrupos = ['LA LIGA', 'LIGA DE CAMPEONES', 'F1'];
        const gruposOrdenados = Object.keys(grupos).sort((a, b) => {
            const indexA = ordenGrupos.indexOf(a);
            const indexB = ordenGrupos.indexOf(b);
            if (indexA === -1 && indexB === -1) return a.localeCompare(b);
            if (indexA === -1) return 1;
            if (indexB === -1) return -1;
            return indexA - indexB;
        });

        gruposOrdenados.forEach(grupo => {
            const grupoDiv = document.createElement('div');
            grupoDiv.className = 'grupo';
            grupoDiv.innerHTML = `<h2>${grupo}</h2>`;
            const gridDiv = document.createElement('div');
            gridDiv.className = 'canales-grid';

            for (const key in grupos[grupo]) {
                const canalData = grupos[grupo][key];
                const canalDiv = document.createElement('div');
                canalDiv.className = 'canal';
                canalDiv.innerHTML = `
                    <img src="${canalData.logo}" alt="${canalData.nombreBase}" loading="lazy">
                    <p><strong>${canalData.nombreBase}</strong></p>
                    <p>${canalData.programa}</p>
                `;

                canalDiv.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (canalData.opciones.length === 1) {
                        window.open(canalData.opciones[0].enlace, '_blank');
                    } else {
                        const existingSelect = canalDiv.querySelector('.enlace-select');
                        if (existingSelect) return;

                        const select = document.createElement('select');
                        select.className = 'enlace-select';
                        const defaultOption = document.createElement('option');
                        defaultOption.textContent = 'Selecciona un enlace para abrir';
                        defaultOption.disabled = true;
                        defaultOption.selected = true;
                        select.appendChild(defaultOption);

                        canalData.opciones.forEach(opcion => {
                            const option = document.createElement('option');
                            option.value = opcion.enlace;
                            option.textContent = opcion.nombre;
                            select.appendChild(option);
                        });

                        select.addEventListener('change', () => {
                            window.open(select.value, '_blank');
                        });

                        canalDiv.appendChild(select);
                        select.focus();
                    }
                });

                gridDiv.appendChild(canalDiv);
            }

            grupoDiv.appendChild(gridDiv);
            canalesSection.appendChild(grupoDiv);
        });

        document.addEventListener('click', (e) => {
            const selectores = document.querySelectorAll('.enlace-select');
            selectores.forEach(select => {
                if (!select.contains(e.target) && !e.target.closest('.canal')) {
                    select.remove();
                }
            });
        }, { once: true });
    }

    // Procesar texto M3U
    async function processM3UText(text) {
        const { canales, epgUrl } = parseM3U(text);
        let epg = {};
        if (epgUrl) {
            epg = await loadEPG(epgUrl);
        }
        mostrarCanales(canales, epg);
    }

    // Cargar M3U automáticamente desde el directorio raíz
    async function loadM3U() {
        try {
            const response = await fetch('./lista-ace.m3u');
            if (!response.ok) {
                throw new Error('No se pudo cargar el archivo M3U');
            }
            const text = await response.text();
            await processM3UText(text);
        } catch (error) {
            console.error('Error al cargar M3U:', error);
            alert('No se pudo cargar el archivo M3U. Asegúrate de que "lista-ace.m3u" esté en el directorio raíz.');
        }
    }

    // Procesar archivo M3U (para arrastrar y soltar)
    async function processFile(file) {
        if (!file.name.endsWith('.m3u')) {
            alert('Por favor, arrastra un archivo M3U válido.');
            return;
        }
        const reader = new FileReader();
        reader.onload = async (e) => {
            const text = e.target.result;
            await processM3UText(text);
        };
        reader.readAsText(file);
    }

    // Manejar arrastrar y soltar en toda la página
    document.addEventListener('dragover', (e) => {
        e.preventDefault();
    });

    document.addEventListener('dragenter', (e) => {
        e.preventDefault();
        document.body.classList.add('dragover');
    });

    document.addEventListener('dragleave', (e) => {
        e.preventDefault();
        if (e.relatedTarget === null) {
            document.body.classList.remove('dragover');
        }
    });

    document.addEventListener('drop', (e) => {
        e.preventDefault();
        document.body.classList.remove('dragover');
        const file = e.dataTransfer.files[0];
        if (file) {
            processFile(file);
        }
    });

    // Evento del botón "Recargar M3U"
    reiniciarBtn.addEventListener('click', () => {
        loadM3U();
    });

    // Cargar M3U al inicio
    loadM3U();
});
