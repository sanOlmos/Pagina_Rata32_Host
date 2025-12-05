// Cliente MQTT
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

        AppState.client.subscribe(`${AppState.currentTopic}/data`, (err) => {
            if (!err) {
                Console.logSystem(`Suscrito al topic: ${AppState.currentTopic}/data`);

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
        Console.logReceived(msg);

        if (msg === 'CONNECTED') {
            AppState.isConnected = true;
            UI.updateStatus(`Conectado al robot: ${AppState.currentTopic}`, 'connected');
            UI.setConnectedState(true);
            Console.logSystem('Conexión exitosa con el robot');
        } else if (msg.includes(',') && !isNaN(parseFloat(msg.split(',')[0]))) {
            // Recibir coordenadas (X,Y) del encoder
            Maze.processLine(msg);
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
    },

    toggleConnection() {
        if (AppState.isConnected) {
            this.disconnect();
        } else {
            this.connect();
        }
    },

    sendMessage(message) {
        if (AppState.client && AppState.isConnected) {
            AppState.client.publish(`${AppState.currentTopic}/cmd`, message);
            Console.logSent(message);
        }
    }
};
