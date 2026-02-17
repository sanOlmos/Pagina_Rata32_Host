// Control manual del robot
const RobotControl = {
    speed: 150,
    isEnabled: false,
    pressedKeys: new Set(),

    // ===== VARIABLES PARA EJECUCIÓN DE RUTA =====
    autoPathRunning: false,
    autoPathAborted: false,

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

        if (btnMV)      btnMV.addEventListener('click',    () => this.enviarModoAutonomo());
        if (btnRuta)    btnRuta.addEventListener('click',  () => this.ejecutarRutaAlgoritmo());
        if (btnAbortar) btnAbortar.addEventListener('click', () => this.abortarRuta());
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

        document.getElementById('btnEjecutarRuta').disabled = true;
        document.getElementById('btnAbortarRuta').disabled  = false;
        document.getElementById('btnAbortarRuta').style.display = 'inline-flex';
        this.updatePathStatus('running', `Ejecutando: 0 / ${path.length - 1} pasos`);

        Console.logSystem(`🗺️ Iniciando ruta automática: ${path.length} puntos`);
        await this.sleep(500);

        for (let i = 0; i < path.length - 1 && !this.autoPathAborted; i++) {
            const current = path[i];
            const next    = path[i + 1];

            const dx = next.x - current.x;
            const dy = next.y - current.y;
            const distancia = Math.sqrt(dx * dx + dy * dy);

            // Factor calibrable: a PWM 150 ≈ 20 cm/s
            const velocidadCmSeg = this.speed * 0.13;
            const tiempoMs = Math.max(100, (distancia / velocidadCmSeg) * 1000);

            const angulo  = Math.atan2(dy, dx) * (180 / Math.PI);
            const comando = this.anguloAComando(angulo);

            this.updatePathStatus('running',
                `Paso ${i + 1}/${path.length - 1} | ${comando} | ${distancia.toFixed(1)} cm`
            );
            Console.logSystem(
                `   Paso ${i + 1}: (${current.x.toFixed(1)},${current.y.toFixed(1)}) → ` +
                `(${next.x.toFixed(1)},${next.y.toFixed(1)}) | ${comando} | ${tiempoMs.toFixed(0)} ms`
            );

            this.sendCommand(comando);
            await this.sleep(tiempoMs);
            this.sendCommand('S');
            await this.sleep(200);
        }

        this.sendCommand('S');
        this.autoPathRunning = false;

        if (this.autoPathAborted) {
            this.updatePathStatus('aborted', '⛔ Ruta abortada');
            Console.logSystem('⛔ Ruta abortada por el usuario');
        } else {
            this.updatePathStatus('done', '✅ Ruta completada');
            Console.logSystem('✅ Ruta automática completada con éxito');
        }

        document.getElementById('btnEjecutarRuta').disabled = false;
        document.getElementById('btnAbortarRuta').disabled  = true;
        setTimeout(() => {
            document.getElementById('btnAbortarRuta').style.display = 'none';
            this.updatePathStatus('idle', 'Listo para ejecutar');
        }, 4000);
    },

    // ===== ABORTAR RUTA =====
    abortarRuta() {
        if (!this.autoPathRunning) return;
        this.autoPathAborted = true;
        this.sendCommand('S');
        Console.logSystem('⛔ Abortando ruta...');
    },

    // ===== ÁNGULO → COMANDO WASD =====
    anguloAComando(angulo) {
        while (angulo >  180) angulo -= 360;
        while (angulo < -180) angulo += 360;
        if (angulo > -45  && angulo <= 45)   return 'F';
        if (angulo > 45   && angulo <= 135)  return 'R';
        if (angulo > 135  || angulo <= -135) return 'B';
        return 'L';
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
        document.getElementById('btnForward').addEventListener('mousedown', () => this.sendCommand('F'));
        document.getElementById('btnForward').addEventListener('mouseup', () => this.sendCommand('S'));
        document.getElementById('btnForward').addEventListener('mouseleave', () => this.sendCommand('S'));
        
        document.getElementById('btnBackward').addEventListener('mousedown', () => this.sendCommand('B'));
        document.getElementById('btnBackward').addEventListener('mouseup', () => this.sendCommand('S'));
        document.getElementById('btnBackward').addEventListener('mouseleave', () => this.sendCommand('S'));
        
        document.getElementById('btnLeft').addEventListener('mousedown', () => this.sendCommand('L'));
        document.getElementById('btnLeft').addEventListener('mouseup', () => this.sendCommand('S'));
        document.getElementById('btnLeft').addEventListener('mouseleave', () => this.sendCommand('S'));
        
        document.getElementById('btnRight').addEventListener('mousedown', () => this.sendCommand('R'));
        document.getElementById('btnRight').addEventListener('mouseup', () => this.sendCommand('S'));
        document.getElementById('btnRight').addEventListener('mouseleave', () => this.sendCommand('S'));
        
        document.getElementById('btnStop').addEventListener('click', () => this.sendCommand('S'));
    },
    
    attachKeyboardListeners() {
        document.addEventListener('keydown', (e) => {
            if (!this.isEnabled) return;
            
            // Evitar repetición si la tecla ya está presionada
            if (this.pressedKeys.has(e.key.toLowerCase())) return;
            this.pressedKeys.add(e.key.toLowerCase());
            
            const key = e.key.toLowerCase();
            
            switch(key) {
                case 'w':
                    this.sendCommand('F');
                    this.highlightButton('btnForward');
                    e.preventDefault();
                    break;
                case 'x':
                    this.sendCommand('B');
                    this.highlightButton('btnBackward');
                    e.preventDefault();
                    break;
                case 'a':
                    this.sendCommand('L');
                    this.highlightButton('btnLeft');
                    e.preventDefault();
                    break;
                case 'd':
                    this.sendCommand('R');
                    this.highlightButton('btnRight');
                    e.preventDefault();
                    break;
                case 's':
                    this.sendCommand('S');
                    this.highlightButton('btnStop');
                    e.preventDefault();
                    break;
            }
        });
        
        document.addEventListener('keyup', (e) => {
            if (!this.isEnabled) return;
            
            this.pressedKeys.delete(e.key.toLowerCase());
            
            const key = e.key.toLowerCase();
            
            // Detener cuando se suelta la tecla de movimiento
            if (['w', 'x', 'a', 'd'].includes(key)) {
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
        
        // Enviar comando por MQTT
        MQTTClient.sendMessage(command);
        
        // Log visual
        const commandNames = {
            'F': '⬆️ Adelante',
            'B': '⬇️ Atrás',
            'L': '⬅️ Izquierda',
            'R': '➡️ Derecha',
            'S': '⏹️ Detener'
        };
        
        if (command.startsWith('V')) {
            Console.logSent(`🎚️ Velocidad: ${command.substring(1)}`);
        } else {
            Console.logSent(commandNames[command] || command);
        }
    },
    
    highlightButton(buttonId) {
        this.removeHighlight();
        document.getElementById(buttonId).classList.add('active-control');
    },
    
    removeHighlight() {
        document.querySelectorAll('.control-btn').forEach(btn => {
            btn.classList.remove('active-control');
        });
    },
    
    enable() {
        this.isEnabled = true;

        // Habilitar botones de control manual
        document.querySelectorAll('.control-btn').forEach(btn => btn.disabled = false);
        document.getElementById('speedSlider').disabled = false;

        // Habilitar botones automáticos
        document.getElementById('btnModoAutonomo').disabled = false;
        document.getElementById('btnStopAutonomo').disabled = false;
        document.getElementById('btnEjecutarRuta').disabled = false;

        // Actualizar info de ruta si ya hay solución
        this.actualizarInfoRuta();

        const statusEl = document.getElementById('controlStatus');
        statusEl.textContent = '✅ Controles activos';
        statusEl.className = 'control-enabled';

        Console.logSystem('🎮 Control manual habilitado');
    },

    disable() {
        this.isEnabled = false;
        this.pressedKeys.clear();

        // Abortar ruta si está corriendo
        if (this.autoPathRunning) {
            this.autoPathAborted = true;
        }

        // Deshabilitar botones de control manual
        document.querySelectorAll('.control-btn').forEach(btn => btn.disabled = true);
        document.getElementById('speedSlider').disabled = true;

        // Deshabilitar botones automáticos
        document.getElementById('btnModoAutonomo').disabled = true;
        document.getElementById('btnStopAutonomo').disabled = true;
        document.getElementById('btnEjecutarRuta').disabled = true;
        document.getElementById('btnAbortarRuta').disabled  = true;
        document.getElementById('btnAbortarRuta').style.display = 'none';

        const statusEl = document.getElementById('controlStatus');
        statusEl.textContent = '⚠️ Conecta el robot primero';
        statusEl.className = 'control-disabled';

        this.removeHighlight();
        Console.logSystem('🎮 Control manual deshabilitado');
    },

    // Actualiza la info de ruta cuando hay solución disponible
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

// Inicializar cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
    RobotControl.init();
});
