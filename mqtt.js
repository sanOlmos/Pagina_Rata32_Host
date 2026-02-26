// Cliente MQTT — con soporte para mensajes CELL: del algoritmo Tremouse
const MQTTClient = {
    connect() {
        const robotName = UI.getRobotName();
        if (!robotName) { Console.logError('Debes ingresar un nombre de robot'); UI.switchTab('console'); return; }
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
        // IMPORTANTE: la web NO se suscribe a /cmd para evitar recibir sus propios mensajes
        const topics = [
            `${AppState.currentTopic}/data`,
            `${AppState.currentTopic}/status`,
        ];
        AppState.client.subscribe(topics, (err) => {
            if (!err) {
                Console.logSystem(`📡 Suscrito a: ${topics.join(', ')}`);
                AppState.client.publish(`${AppState.currentTopic}/cmd`, 'CONNECT');
                Console.logSent('CONNECT');
                Console.logSystem('Esperando confirmación del robot...');
            }
        });
    },

    onMessage(topic, message) {
        const msg = message.toString();
        const isCoord = !msg.startsWith('CELL:') && msg.includes(',') && !isNaN(parseFloat(msg.split(',')[0]));
        if (!isCoord) Console.logReceived(`[${topic}] ${msg}`);

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
        if (msg.startsWith('CELL:')) {
            const parts = msg.substring(5).split(',');
            if (parts.length === 6) {
                const col = parseInt(parts[0]), row = parseInt(parts[1]);
                const wN = parts[2]==='1', wE = parts[3]==='1', wS = parts[4]==='1', wW = parts[5]==='1';
                if (!isNaN(col) && !isNaN(row)) { Maze.addWallData(col, row, wN, wE, wS, wW); UI.notifyMapUpdate(); }
            }
            return;
        }

        // ── TREMOUSE CFG ─────────────────────────────────────────────────
        // Formato: TM_CFG:vel=200,gvel=190,pavance=48,pgiro=11,pared=18.0,pausa=300,muestras=5,toutgiro=2000
        if (msg.startsWith('TM_CFG:')) {
            const pairs = {
                vel:      'tmVelAvance',
                gvel:     'tmVelGiro',
                pavance:  'tmPulsosAvance',   // ← nuevo: pulsos en vez de tiempo
                pgiro:    'tmPulsosGiro',      // ← nuevo: pulsos en vez de tiempo
                pared:    'tmDistPared',
                pausa:    'tmPausaMs',
                muestras: 'tmMuestras',
                toutgiro: 'tmTimeoutGiro',
            };
            msg.substring(7).split(',').forEach(pair => {
                const [k, v] = pair.split('=');
                const id = pairs[k ? k.trim() : ''];
                if (id) { const el = document.getElementById(id); if (el) el.value = parseFloat(v); }
            });
            Console.logSystem('⚙️ Calibración Tremouse sincronizada desde el robot');
            return;
        }

        // ── TREMOUSE START ────────────────────────────────────────────────
        if (msg === 'TREMOUSE_START') { Console.logSystem('🐭 Tremouse iniciado'); UI.notifyTremouseActive(true); return; }

        // ── STEPS (encoder) ───────────────────────────────────────────────
        if (msg.startsWith('STEPS:')) {
            const [izqStr, derStr] = msg.substring(6).split(',');
            const izq = parseFloat(izqStr), der = parseFloat(derStr);
            if (!isNaN(izq) && !isNaN(der) && typeof RobotControl !== 'undefined') {
                RobotControl.onStepsReceived(izq, der);
                if (RobotControl.autoPathRunning)
                    Console.logReceived(`📡 STEPS Izq:${izq} Der:${der} Avg:${((izq+der)/2).toFixed(1)}`);
            }
            return;
        }

        // ── STATUS ────────────────────────────────────────────────────────
        if (msg.startsWith('X:') && msg.includes('TM_COL:')) {
            const m = msg.match(/TM_HDG:(\d)/);
            if (m) Maze.robotHeading = parseInt(m[1]);
            return;
        }

        // ── STOP ─────────────────────────────────────────────────────────
        if (msg === 'STOP') { UI.notifyTremouseActive(false); return; }

        // ── COORDENADAS X,Y ───────────────────────────────────────────────
        if (isCoord) { Maze.processLine(msg); return; }
    },

    onError(err) { Console.logError(err.message); UI.updateStatus('Error de conexión', 'disconnected'); },
    onClose() { if (AppState.isConnected) { Console.logSystem('Conexión cerrada'); this.reset(); } },
    disconnect() { if (AppState.client) { AppState.client.end(); Console.logSystem('Desconectado'); } this.reset(); },
    reset() {
        AppState.isConnected = false;
        UI.updateStatus('Desconectado del broker', 'disconnected');
        UI.setConnectedState(false);
        UI.notifyTremouseActive(false);
        if (typeof RobotControl !== 'undefined') RobotControl.disable();
    },
    toggleConnection() { if (AppState.isConnected) this.disconnect(); else this.connect(); },
    sendMessage(message) {
        if (AppState.client && AppState.isConnected) {
            AppState.client.publish(`${AppState.currentTopic}/cmd`, message);
            Console.logSent(`[${AppState.currentTopic}/cmd] ${message}`);
        }
    }
};
