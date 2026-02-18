// Cliente MQTT — con soporte para mensajes CELL: del algoritmo Tremouse
const MQTTClient = {
    connect() {
        const robotName = UI.getRobotName();

        if (!robotName) {
            Console.logError('Debes ingresar un nombre de robot');
            UI.switchTab('console');
            return;
        }

        AppState.currentTopic = robotName;
        UI.updateStatus('Conectando al broker...', 'connecting');
        Console.logSystem(`Intentando conectar con el robot: ${robotName}`);

        AppState.client = mqtt.connect(MQTT_CONFIG.brokerUrl, {
            clientId: 'web_client_' + Math.random().toString(16).substr(2, 8),
            username: MQTT_CONFIG.username,
            password: MQTT_CONFIG.password,
            clean: MQTT_CONFIG.cleanSession,
            reconnectPeriod: MQTT_CONFIG.reconnectPeriod,
        });

        this.attachMQTTHandlers();
    },

    attachMQTTHandlers() {
        AppState.client.on('connect', () => this.onConnect());
        AppState.client.on('message', (topic, message) => this.onMessage(topic, message));
        AppState.client.on('error', (err) => this.onError(err));
        AppState.client.on('close', () => this.onClose());
    },

    onConnect() {
        Console.logSystem('Conectado al broker HiveMQ Cloud');

        const topics = [
            `${AppState.currentTopic}/data`,
            `${AppState.currentTopic}/cmd`,
            `${AppState.currentTopic}/status`,
            `${AppState.currentTopic}/#`
        ];

        AppState.client.subscribe(topics, (err) => {
            if (!err) {
                Console.logSystem(`📡 Suscrito a topics:`);
                topics.forEach(topic => Console.logSystem(`  • ${topic}`));

                AppState.client.publish(`${AppState.currentTopic}/cmd`, 'CONNECT', (err) => {
                    if (!err) {
                        Console.logSent('CONNECT');
                        Console.logSystem('Esperando confirmación del robot...');
                    }
                });
            }
        });
    },

    onMessage(topic, message) {
        const msg = message.toString();

        // Mostrar en consola SIEMPRE (excepto coordenadas X,Y que son muy frecuentes en Tremouse)
        const isCoord = !msg.startsWith('CELL:') && msg.includes(',') && !isNaN(parseFloat(msg.split(',')[0]));
        if (!isCoord) {
            Console.logReceived(`[${topic}] ${msg}`);
        }

        // ── CONEXIÓN ──────────────────────────────────────────────────────
        if (msg === 'CONNECTED') {
            AppState.isConnected = true;
            UI.updateStatus(`Conectado al robot: ${AppState.currentTopic}`, 'connected');
            UI.setConnectedState(true);
            if (typeof RobotControl !== 'undefined') RobotControl.enable();
            Console.logSystem('✅ Conexión exitosa con el robot');
            return;
        }

        // ── TREMOUSE CELL: col,row,wN,wE,wS,wW ───────────────────────────
        // Ejemplo: CELL:2,3,1,0,0,1
        if (msg.startsWith('CELL:')) {
            const parts = msg.substring(5).split(',');
            if (parts.length === 6) {
                const col = parseInt(parts[0]);
                const row = parseInt(parts[1]);
                const wN  = parts[2] === '1';
                const wE  = parts[3] === '1';
                const wS  = parts[4] === '1';
                const wW  = parts[5] === '1';
                if (!isNaN(col) && !isNaN(row)) {
                    Maze.addWallData(col, row, wN, wE, wS, wW);
                    // Cambiar automáticamente al tab del mapa si no está visible
                    UI.notifyMapUpdate();
                }
            }
            return;
        }

        // ── TREMOUSE CFG: sync calibration inputs ────────────────────
        // Formato: TM_CFG:vel=200,gvel=190,tavance=800,tgiro=550,pared=18.0,pausa=300
        if (msg.startsWith('TM_CFG:')) {
            const cfg = msg.substring(7);
            const pairs = { vel:'tmVelAvance', gvel:'tmVelGiro', tavance:'tmTiempoAvance',
                            tgiro:'tmTiempoGiro', pared:'tmDistPared', pausa:'tmPausaMs',
                            muestras:'tmMuestras' };
            cfg.split(',').forEach(pair => {
                const [k, v] = pair.split('=');
                const inputId = pairs[k.trim()];
                if (inputId) {
                    const el = document.getElementById(inputId);
                    if (el) el.value = parseFloat(v);
                }
            });
            Console.logSystem('Calibracion Tremouse sincronizada desde el robot');
            return;
        }

        // ── TREMOUSE START ────────────────────────────────────────────────
        if (msg === 'TREMOUSE_START') {
            Console.logSystem('🐭 Modo Tremouse iniciado en el robot');
            UI.notifyTremouseActive(true);
            return;
        }

        // ── STEPS (encoder) ───────────────────────────────────────────────
        if (msg.startsWith('STEPS:')) {
            const parts = msg.substring(6).split(',');
            const izq = parseFloat(parts[0]);
            const der = parseFloat(parts[1]);
            if (!isNaN(izq) && !isNaN(der) && typeof RobotControl !== 'undefined') {
                RobotControl.onStepsReceived(izq, der);
                if (RobotControl.autoPathRunning) {
                    Console.logReceived(`📡 STEPS Izq:${izq} Der:${der} Avg:${((izq+der)/2).toFixed(1)}`);
                }
            }
            return;
        }

        // ── STATUS extendido (X:|Y:|ANG:|MODO:...) ───────────────────────
        if (msg.startsWith('X:') && msg.includes('TM_COL:')) {
            // Extraer heading del status para actualizar robot en mapa
            const hdgMatch = msg.match(/TM_HDG:(\d)/);
            const colMatch = msg.match(/TM_COL:(-?\d+)/);
            const rowMatch = msg.match(/TM_ROW:(-?\d+)/);
            if (hdgMatch && colMatch && rowMatch) {
                Maze.robotHeading = parseInt(hdgMatch[1]);
                // No redibujar aquí; se redibuja con el próximo CELL:
            }
            return;
        }

        // ── STOP ─────────────────────────────────────────────────────────
        if (msg === 'STOP') {
            UI.notifyTremouseActive(false);
            return;
        }

        // ── COORDENADAS X,Y (odometría clásica) ──────────────────────────
        if (isCoord) {
            Maze.processLine(msg);
            return;
        }
    },

    onError(err) {
        Console.logError(err.message);
        UI.updateStatus('Error de conexión', 'disconnected');
    },

    onClose() {
        if (AppState.isConnected) {
            Console.logSystem('Conexión cerrada');
            this.reset();
        }
    },

    disconnect() {
        if (AppState.client) {
            AppState.client.end();
            Console.logSystem('Desconectado del broker');
        }
        this.reset();
    },

    reset() {
        AppState.isConnected = false;
        UI.updateStatus('Desconectado del broker', 'disconnected');
        UI.setConnectedState(false);
        UI.notifyTremouseActive(false);
        if (typeof RobotControl !== 'undefined') RobotControl.disable();
    },

    toggleConnection() {
        if (AppState.isConnected) this.disconnect();
        else this.connect();
    },

    sendMessage(message) {
        if (AppState.client && AppState.isConnected) {
            const topic = `${AppState.currentTopic}/cmd`;
            AppState.client.publish(topic, message);
            Console.logSent(`[${topic}] ${message}`);
        }
    }
};
