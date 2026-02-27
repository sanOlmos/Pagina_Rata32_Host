// Control manual del robot
const RobotControl = {
    speed: 150,
    isEnabled: false,
    pressedKeys: new Set(),

    // FIX: Heartbeat para control manual
    // Reenvía el comando activo cada 200ms para evitar que el timeout del firmware detenga el robot
    _activeCommand: null,
    _heartbeatInterval: null,
    HEARTBEAT_MS: 200,  // debe ser < TIMEOUT_MANUAL_MS del firmware (500ms)

    // ===== VARIABLES PARA EJECUCIÓN DE RUTA =====
    autoPathRunning: false,
    autoPathAborted: false,

    // ===== TIMEOUT DE ESPERA TM_MOVE_DONE (leído desde el UI) =====
    get TM_MOVE_TIMEOUT_MS() {
        const el = document.getElementById('inputTmMoveTimeout');
        return el ? Math.max(1000, parseInt(el.value) || 8000) : 8000;
    },

    // ===== SINCRONIZACIÓN TM_MOVE_DONE =====
    // La web espera TM_MOVE_DONE del robot antes de enviar el siguiente comando.
    // mqtt.js llama a onTmMoveDone() cuando llega el mensaje.
    _tmMoveResolve: null,

    onTmMoveDone() {
        if (this._tmMoveResolve) {
            const r = this._tmMoveResolve;
            this._tmMoveResolve = null;
            r(true);
        }
    },

    waitForTmMoveDone() {
        const timeout = this.TM_MOVE_TIMEOUT_MS;
        return new Promise(resolve => {
            this._tmMoveResolve = resolve;
            setTimeout(() => {
                if (this._tmMoveResolve === resolve) {
                    this._tmMoveResolve = null;
                    Console.logSystem(`⏱️ Timeout TM_MOVE_DONE (${timeout}ms) — continuando de todas formas`);
                    resolve(false);
                }
            }, timeout);
        });
    },

    // ===== PULSOS (solo para tests manuales independientes del Tremouse) =====
    _stepResolvers: [],
    _stepPulsosActuales: 0,

    // ===== ORIENTACIÓN ACTUAL DEL ROBOT =====
    headingDeg: 0,

    onStepsReceived(izq, der) {
        const avg = (izq + der) / 2;
        this._stepPulsosActuales = avg;
        this._stepResolvers = this._stepResolvers.filter(({ resolve, target }) => {
            if (avg >= target) { resolve(avg); return false; }
            return true;
        });
    },

    waitForSteps(target, timeoutMs = 8000) {
        return new Promise(resolve => {
            if (this._stepPulsosActuales >= target) { resolve(this._stepPulsosActuales); return; }
            const entry = { resolve, target };
            this._stepResolvers.push(entry);
            setTimeout(() => {
                const idx = this._stepResolvers.indexOf(entry);
                if (idx !== -1) {
                    this._stepResolvers.splice(idx, 1);
                    Console.logSystem(`⏱️ Timeout paso (${this._stepPulsosActuales.toFixed(0)}/${target} pulsos)`);
                    resolve(this._stepPulsosActuales);
                }
            }, timeoutMs);
        });
    },

    resetStepCounter() {
        this._stepPulsosActuales = 0;
        this._stepResolvers = [];
    },

    init() {
        this.attachButtonListeners();
        this.attachKeyboardListeners();
        this.attachSpeedSlider();
        this.attachAutoButtons();
    },

    // ===== HEARTBEAT — mantiene el comando activo enviándolo periódicamente =====
    _startHeartbeat(command) {
        this._stopHeartbeat();
        this._activeCommand = command;
        this._heartbeatInterval = setInterval(() => {
            if (this._activeCommand && this.isEnabled && AppState.isConnected) {
                MQTTClient.sendMessage(this._activeCommand);
            }
        }, this.HEARTBEAT_MS);
    },

    _stopHeartbeat() {
        if (this._heartbeatInterval) {
            clearInterval(this._heartbeatInterval);
            this._heartbeatInterval = null;
        }
        this._activeCommand = null;
    },

    // ===== BOTONES MODO AUTÓNOMO Y RUTA AUTOMÁTICA =====
    attachAutoButtons() {
        const btnMV      = document.getElementById('btnModoAutonomo');
        const btnRuta    = document.getElementById('btnEjecutarRuta');
        const btnAbortar = document.getElementById('btnAbortarRuta');
        const btnTestG   = document.getElementById('btnTestGiro');
        const btnTestA   = document.getElementById('btnTestAvance');

        if (btnMV)      btnMV.addEventListener('click',    () => this.enviarModoAutonomo());
        if (btnRuta)    btnRuta.addEventListener('click',  () => this.ejecutarRutaAlgoritmo());
        if (btnAbortar) btnAbortar.addEventListener('click', () => this.abortarRuta());

        if (btnTestG) btnTestG.addEventListener('click', () => this.testGiro90());
        if (btnTestA) btnTestA.addEventListener('click', () => this.testAvance25cm());
    },

    enviarModoAutonomo() {
        if (!AppState.isConnected) {
            Console.logError('⚠️ Conecta el robot primero');
            return;
        }
        MQTTClient.sendMessage('MV');
        Console.logSystem('🤖 Modo autónomo iniciado (MV enviado)');
        const btn = document.getElementById('btnModoAutonomo');
        btn.classList.add('btn-active-pulse');
        setTimeout(() => btn.classList.remove('btn-active-pulse'), 1500);
    },

    async ejecutarRutaAlgoritmo() {
        if (!AppState.isConnected) {
            Console.logError('⚠️ Conecta el robot primero');
            return;
        }
        if (!MazeSolver.solution || MazeSolver.solution.length < 2) {
            Console.logError('⚠️ Primero resuelve el laberinto con un algoritmo (tab Trayectoria)');
            UI.switchTab('maze');
            return;
        }
        if (this.autoPathRunning) {
            Console.logError('⚠️ Ya hay una ruta en ejecución');
            return;
        }

        const path = MazeSolver.solution;
        this.autoPathRunning = true;
        this.autoPathAborted = false;
        this._tmMoveResolve  = null;

        const headingInicial = this._pedirOrientacionInicial(path);
        if (headingInicial === null) {
            this.autoPathRunning = false;
            return;
        }
        this.headingDeg = headingInicial;

        document.getElementById('btnEjecutarRuta').disabled = true;
        document.getElementById('btnAbortarRuta').disabled  = false;
        document.getElementById('btnAbortarRuta').style.display = 'inline-flex';
        this.updatePathStatus('running', `Iniciando — orientación: ${this._headingLabel(this.headingDeg)}`);

        Console.logSystem(`🗺️ ══════════ RUTA AUTOMÁTICA INICIADA ══════════`);
        Console.logSystem(`   📡 Protocolo: TM_AVANZAR / TM_GIRO_IZQ / TM_GIRO_DER`);
        Console.logSystem(`   🔄 Sincronización: espera TM_MOVE_DONE del robot tras cada mov.`);
        Console.logSystem(`   ⚙️ Calibración: usa la misma configuración del Tremouse en el robot`);
        Console.logSystem(`   Orientación inicial: ${this._headingLabel(this.headingDeg)}`);
        Console.logSystem(`   Total de pasos: ${path.length - 1}`);
        Console.logSystem(`   Timeout por movimiento: ${this.TM_MOVE_TIMEOUT_MS} ms`);

        MQTTClient.sendMessage('Z');
        await this.sleep(350);

        for (let i = 0; i < path.length - 1 && !this.autoPathAborted; i++) {
            const current = path[i];
            const next    = path[i + 1];

            const dx = next.x - current.x;
            const dy = next.y - current.y;
            const distancia = Math.sqrt(dx * dx + dy * dy);

            const targetHeading = this._xyToHeading(dx, dy);
            const giro = this._calcularGiro(this.headingDeg, targetHeading);

            this.updatePathStatus('running',
                `Paso ${i + 1}/${path.length - 1} | ${this._headingLabel(targetHeading)} | ${distancia.toFixed(0)} cm`
            );
            Console.logSystem(
                `── Paso ${i + 1}/${path.length - 1}: ` +
                `(${current.x.toFixed(0)},${current.y.toFixed(0)}) → ` +
                `(${next.x.toFixed(0)},${next.y.toFixed(0)}) | ` +
                `Rumbo: ${this._headingLabel(targetHeading)} | Giro: ${giro > 0 ? '+' : ''}${giro}°`
            );

            // ── GIROS por encoder — misma función tmGiroIzq/tmGiroDer del firmware ──
            if (giro !== 0) {
                const cmdGiro      = giro > 0 ? 'TM_GIRO_DER' : 'TM_GIRO_IZQ';
                const repeticiones = Math.abs(giro) / 90;

                for (let g = 0; g < repeticiones && !this.autoPathAborted; g++) {
                    Console.logSystem(`   Girando ${cmdGiro === 'TM_GIRO_DER' ? '→ derecha' : '← izquierda'} 90° (${g + 1}/${repeticiones}) [firmware encoder]`);
                    MQTTClient.sendMessage(cmdGiro);
                    const ok = await this.waitForTmMoveDone();
                    Console.logSystem(`   ${ok ? '✓ TM_MOVE_DONE' : '⚠️ timeout — continuando'} giro ${g + 1}`);
                    if (this.autoPathAborted) break;
                }

                this.headingDeg = targetHeading;
                Console.logSystem(`   ✓ Orientado: ${this._headingLabel(this.headingDeg)}`);
            }

            if (this.autoPathAborted) break;

            // ── AVANCE por encoder — misma función tmAvanzar del firmware ──
            const celdas = Math.max(1, Math.round(distancia / 25));
            for (let c = 0; c < celdas && !this.autoPathAborted; c++) {
                Console.logSystem(`   Avanzando celda ${c + 1}/${celdas} — 25cm [firmware encoder]`);
                MQTTClient.sendMessage('TM_AVANZAR');
                const ok = await this.waitForTmMoveDone();
                Console.logSystem(`   ${ok ? '✓ TM_MOVE_DONE' : '⚠️ timeout — continuando'} avance ${c + 1}`);
            }
        }

        MQTTClient.sendMessage('S');
        this.autoPathRunning = false;

        if (this.autoPathAborted) {
            this.updatePathStatus('aborted', '⛔ Ruta abortada');
            Console.logSystem('⛔ Ruta abortada por el usuario');
        } else {
            this.updatePathStatus('done', '✅ Ruta completada — robot en destino');
            Console.logSystem('✅ ══════════ RUTA COMPLETADA ══════════');
        }

        document.getElementById('btnEjecutarRuta').disabled = false;
        document.getElementById('btnAbortarRuta').disabled  = true;
        setTimeout(() => {
            document.getElementById('btnAbortarRuta').style.display = 'none';
            this.updatePathStatus('idle', 'Listo para ejecutar');
        }, 5000);
    },

    _pedirOrientacionInicial(path) {
        let sugerenciaIdx = 0;
        if (path && path.length >= 2) {
            const dx = path[1].x - path[0].x;
            const dy = path[1].y - path[0].y;
            const h  = this._xyToHeading(dx, dy);
            sugerenciaIdx = h / 90;
        }

        const msg =
            `╔══════════════════════════════════╗\n` +
            `  ORIENTACIÓN INICIAL DEL ROBOT\n` +
            `╚══════════════════════════════════╝\n\n` +
            `El robot fue colocado manualmente en el INICIO.\n` +
            `¿Hacia dónde apunta la NARIZ del robot?\n\n` +
            `  0 → Este   (+X, derecha en el mapa) →\n` +
            `  1 → Sur    (+Y, abajo en el mapa)   ↓\n` +
            `  2 → Oeste  (-X, izquierda en mapa)  ←\n` +
            `  3 → Norte  (-Y, arriba en el mapa)  ↑\n\n` +
            `Sugerencia (según primer paso): ${sugerenciaIdx}\n\n` +
            `Ingresa 0, 1, 2 o 3:`;

        const resp = prompt(msg, String(sugerenciaIdx));
        if (resp === null) {
            Console.logSystem('❌ Ejecución cancelada por el usuario');
            return null;
        }
        const idx = parseInt(resp);
        if (isNaN(idx) || idx < 0 || idx > 3) {
            Console.logError('Orientación inválida — se usará la sugerencia automática');
            return sugerenciaIdx * 90;
        }
        return idx * 90;
    },

    _xyToHeading(dx, dy) {
        const ang = Math.atan2(dy, dx) * (180 / Math.PI);
        return ((Math.round(ang / 90) * 90) % 360 + 360) % 360;
    },

    _calcularGiro(desde, hacia) {
        let delta = ((hacia - desde) % 360 + 360) % 360;
        if (delta === 270) delta = -90;
        return delta;
    },

    _headingLabel(deg) {
        const m = { 0: '→ Este', 90: '↓ Sur', 180: '← Oeste', 270: '↑ Norte' };
        return m[((deg % 360) + 360) % 360] || `${deg}°`;
    },

    async testGiro90() {
        if (!AppState.isConnected) { Console.logError('⚠️ Conecta el robot primero'); return; }
        if (this.autoPathRunning)  { Console.logError('⚠️ Hay una ruta en ejecución'); return; }

        const pulsos = this.PULSOS_POR_GIRO_90;
        Console.logSystem(`🔄 TEST GIRO 90° — objetivo: ${pulsos} pulsos`);
        { const _el = document.getElementById('btnTestGiro'); if (_el) _el.disabled = true; }
        { const _el = document.getElementById('btnTestAvance'); if (_el) _el.disabled = true; }

        this.resetStepCounter();
        MQTTClient.sendMessage('Z_STEPS');
        await this.sleep(150);
        MQTTClient.sendMessage('R');
        const pReal = await this.waitForSteps(pulsos, 6000);
        MQTTClient.sendMessage('S');
        await this.sleep(200);

        Console.logSystem(`   ✓ Giro completado — pulsos reales: ${pReal.toFixed(1)} / objetivo: ${pulsos}`);
        Console.logSystem(`   Si giró menos de 90° → aumentá el valor. Si giró más → reducilo.`);

        { const _el = document.getElementById('btnTestGiro'); if (_el) _el.disabled = false; }
        { const _el = document.getElementById('btnTestAvance'); if (_el) _el.disabled = false; }
    },

    async testAvance25cm() {
        if (!AppState.isConnected) { Console.logError('⚠️ Conecta el robot primero'); return; }
        if (this.autoPathRunning)  { Console.logError('⚠️ Hay una ruta en ejecución'); return; }

        const pulsos = this.PULSOS_POR_CELDA;
        Console.logSystem(`▶️ TEST AVANCE 25cm — objetivo: ${pulsos} pulsos`);
        { const _el = document.getElementById('btnTestGiro'); if (_el) _el.disabled = true; }
        { const _el = document.getElementById('btnTestAvance'); if (_el) _el.disabled = true; }

        this.resetStepCounter();
        MQTTClient.sendMessage('Z_STEPS');
        await this.sleep(150);
        MQTTClient.sendMessage('F');
        const pReal = await this.waitForSteps(pulsos, 8000);
        MQTTClient.sendMessage('S');
        await this.sleep(200);

        Console.logSystem(`   ✓ Avance completado — pulsos reales: ${pReal.toFixed(1)} / objetivo: ${pulsos}`);
        Console.logSystem(`   Si avanzó menos de 25cm → aumentá el valor. Si avanzó más → reducilo.`);

        { const _el = document.getElementById('btnTestGiro'); if (_el) _el.disabled = false; }
        { const _el = document.getElementById('btnTestAvance'); if (_el) _el.disabled = false; }
    },

    abortarRuta() {
        if (!this.autoPathRunning) return;
        this.autoPathAborted = true;
        MQTTClient.sendMessage('S');
        Console.logSystem('⛔ Abortando ruta...');
    },

    updatePathStatus(state, text) {
        const el = document.getElementById('pathStatus');
        if (!el) return;
        el.textContent = text;
        el.className = 'path-status path-status-' + state;
    },

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    },

    attachButtonListeners() {
        const bind = (id, cmd) => {
            const btn = document.getElementById(id);

            // FIX: mousedown inicia heartbeat, mouseup/mouseleave detiene y envía S
            btn.addEventListener('mousedown', () => {
                this.sendCommandStart(cmd);
            });
            btn.addEventListener('mouseup', () => {
                this.sendCommandStop();
            });
            btn.addEventListener('mouseleave', () => {
                if (this._activeCommand === cmd) this.sendCommandStop();
            });

            // Soporte táctil con heartbeat
            btn.addEventListener('touchstart', (e) => {
                e.preventDefault();
                this.sendCommandStart(cmd);
            });
            btn.addEventListener('touchend', (e) => {
                e.preventDefault();
                this.sendCommandStop();
            });
            btn.addEventListener('touchcancel', (e) => {
                e.preventDefault();
                this.sendCommandStop();
            });
        };
        bind('btnForward',  'F');
        bind('btnBackward', 'B');
        bind('btnLeft',     'L');
        bind('btnRight',    'R');
        document.getElementById('btnStop').addEventListener('click', () => {
            this._stopHeartbeat();
            this.sendCommand('S');
        });
    },

    // FIX: Inicia el movimiento y el heartbeat
    sendCommandStart(command) {
        if (!this.isEnabled || !AppState.isConnected) return;
        MQTTClient.sendMessage(command);
        this._startHeartbeat(command);
        const names = { 'F': '⬆️ Adelante', 'B': '⬇️ Atrás', 'L': '⬅️ Izquierda', 'R': '➡️ Derecha' };
        Console.logSent(names[command] || command);
        this.highlightButton(
            command === 'F' ? 'btnForward' :
            command === 'B' ? 'btnBackward' :
            command === 'L' ? 'btnLeft' : 'btnRight'
        );
    },

    // FIX: Detiene el heartbeat y envía S
    sendCommandStop() {
        if (!this.isEnabled || !AppState.isConnected) return;
        this._stopHeartbeat();
        MQTTClient.sendMessage('S');
        Console.logSent('⏹️ Detener');
        this.removeHighlight();
    },

    attachKeyboardListeners() {
        document.addEventListener('keydown', (e) => {
            if (!this.isEnabled) return;
            if (this.pressedKeys.has(e.key.toLowerCase())) return;
            this.pressedKeys.add(e.key.toLowerCase());
            switch (e.key.toLowerCase()) {
                case 'w': this.sendCommandStart('F'); this.highlightButton('btnForward');  e.preventDefault(); break;
                case 'x': this.sendCommandStart('B'); this.highlightButton('btnBackward'); e.preventDefault(); break;
                case 'a': this.sendCommandStart('L'); this.highlightButton('btnLeft');     e.preventDefault(); break;
                case 'd': this.sendCommandStart('R'); this.highlightButton('btnRight');    e.preventDefault(); break;
                case 's': this.sendCommandStop();     this.highlightButton('btnStop');     e.preventDefault(); break;
            }
        });
        document.addEventListener('keyup', (e) => {
            if (!this.isEnabled) return;
            this.pressedKeys.delete(e.key.toLowerCase());
            if (['w', 'x', 'a', 'd'].includes(e.key.toLowerCase())) {
                this.sendCommandStop();
                e.preventDefault();
            }
        });
    },

    attachSpeedSlider() {
        const slider = document.getElementById('speedSlider');
        const valueDisplay = document.getElementById('speedValue');
        slider.addEventListener('input', (e) => {
            this.speed = parseInt(e.target.value);
            valueDisplay.textContent = this.speed;
            this.sendCommand('V' + this.speed);
        });
    },

    sendCommand(command) {
        if (!this.isEnabled || !AppState.isConnected) return;
        MQTTClient.sendMessage(command);
        const names = { 'F': '⬆️ Adelante', 'B': '⬇️ Atrás', 'L': '⬅️ Izquierda', 'R': '➡️ Derecha', 'S': '⏹️ Detener' };
        if (command.startsWith('V')) {
            Console.logSent(`🎚️ Velocidad: ${command.substring(1)}`);
        } else {
            Console.logSent(names[command] || command);
        }
    },

    highlightButton(buttonId) {
        this.removeHighlight();
        document.getElementById(buttonId).classList.add('active-control');
    },
    removeHighlight() {
        document.querySelectorAll('.control-btn').forEach(btn => btn.classList.remove('active-control'));
    },

    enable() {
        this.isEnabled = true;
        document.querySelectorAll('.control-btn').forEach(btn => btn.disabled = false);
        document.getElementById('speedSlider').disabled = false;
        document.getElementById('btnModoAutonomo').disabled = false;
        document.getElementById('btnStopAutonomo').disabled = false;
        document.getElementById('btnEjecutarRuta').disabled = false;
        const bg = document.getElementById('btnTestGiro');
        const ba = document.getElementById('btnTestAvance');
        if (bg) bg.disabled = false;
        if (ba) ba.disabled = false;
        this.actualizarInfoRuta();
        const statusEl = document.getElementById('controlStatus');
        statusEl.textContent = '✅ Controles activos';
        statusEl.className = 'control-enabled';
        Console.logSystem('🎮 Control manual habilitado');
    },

    disable() {
        this.isEnabled = false;
        this.pressedKeys.clear();
        this._stopHeartbeat();  // FIX: detener heartbeat al desconectar
        if (this.autoPathRunning) this.autoPathAborted = true;
        document.querySelectorAll('.control-btn').forEach(btn => btn.disabled = true);
        document.getElementById('speedSlider').disabled = true;
        document.getElementById('btnModoAutonomo').disabled = true;
        document.getElementById('btnStopAutonomo').disabled = true;
        document.getElementById('btnEjecutarRuta').disabled = true;
        document.getElementById('btnAbortarRuta').disabled  = true;
        document.getElementById('btnAbortarRuta').style.display = 'none';
        const bg = document.getElementById('btnTestGiro');
        const ba = document.getElementById('btnTestAvance');
        if (bg) bg.disabled = true;
        if (ba) ba.disabled = true;
        const statusEl = document.getElementById('controlStatus');
        statusEl.textContent = '⚠️ Conecta el robot primero';
        statusEl.className = 'control-disabled';
        this.removeHighlight();
        Console.logSystem('🎮 Control manual deshabilitado');
    },

    actualizarInfoRuta() {
        const el = document.getElementById('routeStepsInfo');
        if (!el) return;
        if (MazeSolver.solution && MazeSolver.solution.length >= 2) {
            el.textContent = `✅ Ruta lista: ${MazeSolver.solution.length} puntos — ${MazeSolver.solution.length - 1} pasos`;
            el.style.color = '#22c55e';
        } else {
            el.textContent = 'Sin ruta cargada — ve a Trayectoria y resuelve el laberinto';
            el.style.color = '';
        }
    }
};

document.addEventListener('DOMContentLoaded', () => {
    RobotControl.init();
});
