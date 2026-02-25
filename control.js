// Control manual del robot
const RobotControl = {
    speed: 150,
    isEnabled: false,
    pressedKeys: new Set(),

    // ===== VARIABLES PARA EJECUCIÓN DE RUTA =====
    autoPathRunning: false,
    autoPathAborted: false,

    // ===== CALIBRACIÓN — PULSOS (leídos dinámicamente desde los inputs del UI) =====
    // CM_POR_PULSO = π*5/30 ≈ 0.5236 cm  → 25 cm / 0.5236 ≈ 47.7 → default 46
    // Para giro 90°: arco = π*15/4 ≈ 11.78 cm → ~23 teórico, pero ajustar según robot real
    get PULSOS_POR_CELDA() {
        const el = document.getElementById('inputPulsosCelda');
        return el ? Math.max(10, parseInt(el.value) || 46) : 46;
    },
    get PULSOS_POR_GIRO_90() {
        const el = document.getElementById('inputPulsosGiro');
        return el ? Math.max(5, parseInt(el.value) || 30) : 30;
    },

    _stepResolvers: [],
    _stepPulsosActuales: 0,

    // ===== ORIENTACIÓN ACTUAL DEL ROBOT =====
    // Convenio: 0=Este(+X), 90=Sur(+Y), 180=Oeste(-X), 270=Norte(-Y)
    // (en el canvas/odometría Y crece hacia abajo = Sur)
    headingDeg: 0,

    // Llamado por mqtt.js cada vez que llega STEPS:izq,der
    onStepsReceived(izq, der) {
        const avg = (izq + der) / 2;
        this._stepPulsosActuales = avg;
        this._stepResolvers = this._stepResolvers.filter(({ resolve, target }) => {
            if (avg >= target) { resolve(avg); return false; }
            return true;
        });
    },

    // Promesa que se resuelve cuando encoder promedio >= target
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

        // Botones de calibración
        if (btnTestG) btnTestG.addEventListener('click', () => this.testGiro90());
        if (btnTestA) btnTestA.addEventListener('click', () => this.testAvance25cm());
    },

    // ===== ENVIAR COMANDO MV (MODO AUTÓNOMO) =====
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

    // ===== EJECUTAR RUTA DEL ALGORITMO PASO A PASO =====
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

        // ── Usar la orientación inicial con la que el robot exploró el laberinto ──
        // Tremouse: 0=N, 1=E, 2=S, 3=W  →  Control degrees: 270, 0, 90, 180
        const TM_TO_DEG = [270, 0, 90, 180];
        const tmH = (typeof Maze !== 'undefined') ? Maze.initialRobotHeading : 0;
        this.headingDeg = TM_TO_DEG[tmH] ?? 270;

        document.getElementById('btnEjecutarRuta').disabled = true;
        document.getElementById('btnAbortarRuta').disabled  = false;
        document.getElementById('btnAbortarRuta').style.display = 'inline-flex';
        this.updatePathStatus('running', `Iniciando — orientación: ${this._headingLabel(this.headingDeg)}`);

        Console.logSystem(`🗺️ ══════════ RUTA AUTOMÁTICA INICIADA ══════════`);
        Console.logSystem(`   Orientación inicial (del mapeo): ${this._headingLabel(this.headingDeg)} (TM heading ${tmH})`);
        Console.logSystem(`   Total de pasos: ${path.length - 1}`);

        // Resetear SOLO la odometría del robot (no el mapa visual)
        MQTTClient.sendMessage('Z');
        await this.sleep(350);

        for (let i = 0; i < path.length - 1 && !this.autoPathAborted; i++) {
            const current = path[i];
            const next    = path[i + 1];

            const dx = next.x - current.x;
            const dy = next.y - current.y;
            const distancia = Math.sqrt(dx * dx + dy * dy);  // siempre 25 cm en grilla

            // Heading absoluto del segmento (convenio canvas: Y hacia abajo)
            const targetHeading = this._xyToHeading(dx, dy);

            // Giro necesario respecto a orientación actual
            const giro = this._calcularGiro(this.headingDeg, targetHeading);

            const pulsosAvance = Math.round(this.PULSOS_POR_CELDA * distancia / 25);

            this.updatePathStatus('running',
                `Paso ${i + 1}/${path.length - 1} | ${this._headingLabel(targetHeading)} | ${distancia.toFixed(0)} cm`
            );
            Console.logSystem(
                `── Paso ${i + 1}/${path.length - 1}: ` +
                `(${current.x.toFixed(0)},${current.y.toFixed(0)}) → ` +
                `(${next.x.toFixed(0)},${next.y.toFixed(0)}) | ` +
                `Rumbo: ${this._headingLabel(targetHeading)} | Giro: ${giro > 0 ? '+' : ''}${giro}°`
            );

            // ── 1. GIRAR si es necesario ──────────────────────────────────
            if (giro !== 0) {
                // Para 180° giramos dos veces a la izquierda (o derecha, igual)
                const cmdGiro    = giro > 0 ? 'R' : 'L';   // +90=derecha, -90=izquierda
                const repeticiones = Math.abs(giro) / 90;

                for (let g = 0; g < repeticiones && !this.autoPathAborted; g++) {
                    Console.logSystem(`   Girando ${cmdGiro === 'R' ? '→ derecha' : '← izquierda'} 90° (${g + 1}/${repeticiones})`);
                    this.resetStepCounter();
                    MQTTClient.sendMessage('Z_STEPS');
                    await this.sleep(100);
                    MQTTClient.sendMessage(cmdGiro);
                    await this.waitForSteps(this.PULSOS_POR_GIRO_90, 5000);
                    MQTTClient.sendMessage('S');
                    await this.sleep(350);
                }

                this.headingDeg = targetHeading;
                Console.logSystem(`   ✓ Orientado: ${this._headingLabel(this.headingDeg)}`);
            }

            if (this.autoPathAborted) break;

            // ── 2. AVANZAR una celda ──────────────────────────────────────
            Console.logSystem(`   Avanzando ${distancia.toFixed(0)} cm (obj: ${pulsosAvance} pulsos)`);
            this.resetStepCounter();
            MQTTClient.sendMessage('Z_STEPS');
            await this.sleep(100);
            MQTTClient.sendMessage('F');
            const pulsosReales = await this.waitForSteps(pulsosAvance);
            MQTTClient.sendMessage('S');
            Console.logSystem(`   ✓ Avance: ${pulsosReales.toFixed(0)} pulsos`);
            await this.sleep(300);
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

    // ===== CONVIERTE HEADING TREMOUSE (0-3) → GRADOS control.js =====
    // Tremouse: 0=N, 1=E, 2=S, 3=W  →  Control degrees: 270, 0, 90, 180
    _tmHeadingToControlDeg(tmH) {
        return [270, 0, 90, 180][tmH] ?? 270;
    },

    // ===== dx,dy del canvas → HEADING absoluto (0=E, 90=S, 180=O, 270=N) =====
    _xyToHeading(dx, dy) {
        // atan2 con Y hacia abajo (convenio canvas)
        const ang = Math.atan2(dy, dx) * (180 / Math.PI);  // -180..180
        // Redondear al múltiplo de 90° más cercano y normalizar a 0..359
        return ((Math.round(ang / 90) * 90) % 360 + 360) % 360;
    },

    // ===== GIRO MÍNIMO EN MÚLTIPLOS DE 90° =====
    // Positivo = derecha, negativo = izquierda
    _calcularGiro(desde, hacia) {
        let delta = ((hacia - desde) % 360 + 360) % 360;
        // Elegir el sentido más corto (evita dar la vuelta completa)
        if (delta === 270) delta = -90;  // girar izquierda 90° en vez de derecha 270°
        // delta queda en {0, 90, 180, -90}
        return delta;
    },

    // ===== ETIQUETA DE HEADING =====
    _headingLabel(deg) {
        const m = { 0: '→ Este', 90: '↓ Sur', 180: '← Oeste', 270: '↑ Norte' };
        return m[((deg % 360) + 360) % 360] || `${deg}°`;
    },

    // ===== TEST DE CALIBRACIÓN: GIRO 90° =====
    async testGiro90() {
        if (!AppState.isConnected) { Console.logError('⚠️ Conecta el robot primero'); return; }
        if (this.autoPathRunning)  { Console.logError('⚠️ Hay una ruta en ejecución'); return; }

        const pulsos = this.PULSOS_POR_GIRO_90;
        Console.logSystem(`🔄 TEST GIRO 90° — objetivo: ${pulsos} pulsos`);
        document.getElementById('btnTestGiro').disabled  = true;
        document.getElementById('btnTestAvance').disabled = true;

        this.resetStepCounter();
        MQTTClient.sendMessage('Z_STEPS');
        await this.sleep(150);
        MQTTClient.sendMessage('R');  // giro derecha
        const pReal = await this.waitForSteps(pulsos, 6000);
        MQTTClient.sendMessage('S');
        await this.sleep(200);

        Console.logSystem(`   ✓ Giro completado — pulsos reales: ${pReal.toFixed(1)} / objetivo: ${pulsos}`);
        Console.logSystem(`   Si giró menos de 90° → aumentá el valor. Si giró más → reducilo.`);

        document.getElementById('btnTestGiro').disabled  = false;
        document.getElementById('btnTestAvance').disabled = false;
    },

    // ===== TEST DE CALIBRACIÓN: AVANCE 25 CM (1 celda) =====
    async testAvance25cm() {
        if (!AppState.isConnected) { Console.logError('⚠️ Conecta el robot primero'); return; }
        if (this.autoPathRunning)  { Console.logError('⚠️ Hay una ruta en ejecución'); return; }

        const pulsos = this.PULSOS_POR_CELDA;
        Console.logSystem(`▶️ TEST AVANCE 25cm — objetivo: ${pulsos} pulsos`);
        document.getElementById('btnTestGiro').disabled  = true;
        document.getElementById('btnTestAvance').disabled = true;

        this.resetStepCounter();
        MQTTClient.sendMessage('Z_STEPS');
        await this.sleep(150);
        MQTTClient.sendMessage('F');
        const pReal = await this.waitForSteps(pulsos, 8000);
        MQTTClient.sendMessage('S');
        await this.sleep(200);

        Console.logSystem(`   ✓ Avance completado — pulsos reales: ${pReal.toFixed(1)} / objetivo: ${pulsos}`);
        Console.logSystem(`   Si avanzó menos de 25cm → aumentá el valor. Si avanzó más → reducilo.`);

        document.getElementById('btnTestGiro').disabled  = false;
        document.getElementById('btnTestAvance').disabled = false;
    },

    // ===== ABORTAR RUTA =====
    abortarRuta() {
        if (!this.autoPathRunning) return;
        this.autoPathAborted = true;
        MQTTClient.sendMessage('S');
        Console.logSystem('⛔ Abortando ruta...');
    },

    // ===== ESTADO VISUAL DE RUTA =====
    updatePathStatus(state, text) {
        const el = document.getElementById('pathStatus');
        if (!el) return;
        el.textContent = text;
        el.className = 'path-status path-status-' + state;
    },

    // ===== SLEEP ASYNC =====
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    },

    attachButtonListeners() {
        const bind = (id, cmd) => {
            const btn = document.getElementById(id);
            btn.addEventListener('mousedown',  () => this.sendCommand(cmd));
            btn.addEventListener('mouseup',    () => this.sendCommand('S'));
            btn.addEventListener('mouseleave', () => this.sendCommand('S'));
            // Soporte táctil
            btn.addEventListener('touchstart', (e) => { e.preventDefault(); this.sendCommand(cmd); });
            btn.addEventListener('touchend',   (e) => { e.preventDefault(); this.sendCommand('S'); });
        };
        bind('btnForward',  'F');
        bind('btnBackward', 'B');
        bind('btnLeft',     'L');
        bind('btnRight',    'R');
        document.getElementById('btnStop').addEventListener('click', () => this.sendCommand('S'));
    },

    attachKeyboardListeners() {
        document.addEventListener('keydown', (e) => {
            if (!this.isEnabled) return;
            if (this.pressedKeys.has(e.key.toLowerCase())) return;
            this.pressedKeys.add(e.key.toLowerCase());
            switch (e.key.toLowerCase()) {
                case 'w': this.sendCommand('F'); this.highlightButton('btnForward');  e.preventDefault(); break;
                case 'x': this.sendCommand('B'); this.highlightButton('btnBackward'); e.preventDefault(); break;
                case 'a': this.sendCommand('L'); this.highlightButton('btnLeft');     e.preventDefault(); break;
                case 'd': this.sendCommand('R'); this.highlightButton('btnRight');    e.preventDefault(); break;
                case 's': this.sendCommand('S'); this.highlightButton('btnStop');     e.preventDefault(); break;
            }
        });
        document.addEventListener('keyup', (e) => {
            if (!this.isEnabled) return;
            this.pressedKeys.delete(e.key.toLowerCase());
            if (['w', 'x', 'a', 'd'].includes(e.key.toLowerCase())) {
                this.sendCommand('S');
                this.removeHighlight();
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
        // Habilitar botones de calibración
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
        if (this.autoPathRunning) this.autoPathAborted = true;
        document.querySelectorAll('.control-btn').forEach(btn => btn.disabled = true);
        document.getElementById('speedSlider').disabled = true;
        document.getElementById('btnModoAutonomo').disabled = true;
        document.getElementById('btnStopAutonomo').disabled = true;
        document.getElementById('btnEjecutarRuta').disabled = true;
        document.getElementById('btnAbortarRuta').disabled  = true;
        document.getElementById('btnAbortarRuta').style.display = 'none';
        // Deshabilitar botones de calibración
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
