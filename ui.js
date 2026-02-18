// Manejo de la interfaz de usuario
const UI = {
    elements: {},
    _mapNotified: false,

    init() {
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
        this.elements.tabs.forEach(tab => {
            tab.addEventListener('click', (e) => {
                const tabName = e.target.closest('.tab').dataset.tab;
                this.switchTab(tabName);
            });
        });

        this.elements.connectBtn.addEventListener('click', () => MQTTClient.toggleConnection());
        this.elements.sendBtn.addEventListener('click', () => this.sendMessage());
        this.elements.clearBtn.addEventListener('click', () => Console.clear());

        this.elements.messageInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.sendMessage();
        });
    },

    switchTab(tabName) {
        document.querySelectorAll('.tab').forEach(tab => tab.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));

        const selectedTab     = document.querySelector(`[data-tab="${tabName}"]`);
        const selectedContent = document.getElementById(`${tabName}-tab`);
        
        if (selectedTab && selectedContent) {
            selectedTab.classList.add('active');
            selectedContent.classList.add('active');
        }
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
    },

    // Llamado cuando llega un mensaje CELL: — notifica al usuario si no está en maze tab
    notifyMapUpdate() {
        if (this._mapNotified) return;
        const mazeTab = document.getElementById('maze-tab');
        if (!mazeTab || !mazeTab.classList.contains('active')) {
            // Resaltar la pestaña del mapa
            const mapTabBtn = document.querySelector('[data-tab="maze"]');
            if (mapTabBtn) {
                mapTabBtn.classList.add('tab-has-data');
                setTimeout(() => mapTabBtn.classList.remove('tab-has-data'), 3000);
            }
        }
        this._mapNotified = true;
        setTimeout(() => { this._mapNotified = false; }, 2000);
    },

    // Actualiza el estado visual del modo Tremouse
    notifyTremouseActive(active) {
        // Al iniciar: desbloquear endCell para que siga al robot
        // Al detener: bloquear endCell en la posición actual del robot
        if (typeof Maze !== 'undefined') {
            if (active) {
                Maze.endCellLocked = false;
            } else {
                Maze.lockEndCell();
            }
        }

        const statusEl = document.getElementById('tremouseStatus');
        const notice   = document.getElementById('mazeMapNotice');
        
        if (statusEl) {
            if (active) {
                statusEl.textContent = '🐭 Tremouse en ejecución — recibiendo paredes...';
                statusEl.className   = 'path-status path-status-running';
            } else {
                const hasData = Maze && Object.keys(Maze.wallMap || {}).length > 0;
                statusEl.textContent = hasData ? '✅ Mapeo completado' : 'En espera';
                statusEl.className   = hasData ? 'path-status path-status-done' : 'path-status path-status-idle';
            }
        }

        if (notice) {
            notice.style.display = active ? 'block' : 'none';
        }

        // Habilitar/deshabilitar botón stop Tremouse
        const stopBtn = document.getElementById('btnStopTremouse');
        if (stopBtn) stopBtn.disabled = !active;
    }
};

document.addEventListener('DOMContentLoaded', () => {
    UI.init();
});
