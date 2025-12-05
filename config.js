// Configuración del Broker MQTT
const MQTT_CONFIG = {
    brokerUrl: 'wss://90246ea5b74141e783178f6a189a8171.s1.eu.hivemq.cloud:8884/mqtt',
    username: 'admin',
    password: 'SuperMan2233',
    reconnectPeriod: 1000,
    cleanSession: true
};

// Estado global de la aplicación
const AppState = {
    client: null,
    currentTopic: '',
    isConnected: false
};
