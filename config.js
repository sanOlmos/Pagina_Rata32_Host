// Configuración del Broker MQTT
const MQTT_CONFIG = {
    brokerUrl: 'wss://f9d90e4c488c4716ac1e5862b9c8a708.s1.eu.hivemq.cloud:8884/mqtt',
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
