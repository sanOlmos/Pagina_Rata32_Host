// Manejo de la interfaz de usuario
const UI = {
    elements: {},

    init() {
        // Cachear elementos del DOM
        this.elements = {
            status: document.getElementById('status'),
            robotName: document.getElementById('robotName'),
            connectBtn: document.getElementById('connectBtn'),
            messageInput: document.getElementById('messageInput'),
            sendBtn: document.getElementById('sendBtn'),
            clearBtn: document.querySelector('.clear-btn'),
            tabs: document.querySelectorAll('.tab')
        };

        this.attachEventListeners();
    },

    attachEventListeners() {
        // Tabs
        this.elements.tabs.forEach(tab => {
            tab.addEventListener('click', (e) => this.switchTab(e.target.dataset.tab));
        });

        // Botones
        this.elements.connectBtn.addEventListener('click', () => MQTTClient.toggleConnection());
        this.elements.sendBtn.addEventListener('click', () => this.sendMessage());
        this.elements.clearBtn.addEventListener('click', () => Console.clear());

        // Enter en input de mensaje
        this.elements.messageInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.sendMessage();
        });
    },

    switchTab(tabName) {
        // Remover active de todas las tabs
        document.querySelectorAll('.tab').forEach(tab => tab.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));

        // Activar la tab seleccionada
        document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
        document.getElementById(`${tabName}-tab`).classList.add('active');
    },

    updateStatus(text, cssClass) {
        this.elements.status.textContent = text;
        this.elements.status.className = `status ${cssClass}`;
    },

    setConnectedState(connected) {
        this.elements.connectBtn.textContent = connected ? 'Desconectar' : 'Conectar';
        this.elements.messageInput.disabled = !connected;
        this.elements.sendBtn.disabled = !connected;
        this.elements.robotName.disabled = connected;
    },

    sendMessage() {
        const message = this.elements.messageInput.value.trim();
        if (!message) return;

        MQTTClient.sendMessage(message);
        this.elements.messageInput.value = '';
    },

    getRobotName() {
        return this.elements.robotName.value.trim();
    }
};

// Inicializar cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
    UI.init();
});
