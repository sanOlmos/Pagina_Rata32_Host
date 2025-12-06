// Control manual del robot
const RobotControl = {
    speed: 150,
    isEnabled: false,
    pressedKeys: new Set(),
    
    init() {
        this.attachButtonListeners();
        this.attachKeyboardListeners();
        this.attachSpeedSlider();
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
        
        // Habilitar botones
        document.querySelectorAll('.control-btn').forEach(btn => btn.disabled = false);
        document.getElementById('speedSlider').disabled = false;
        
        // Actualizar status
        const statusEl = document.getElementById('controlStatus');
        statusEl.textContent = '✅ Controles activos';
        statusEl.className = 'control-enabled';
        
        Console.logSystem('🎮 Control manual habilitado');
    },
    
    disable() {
        this.isEnabled = false;
        this.pressedKeys.clear();
        
        // Deshabilitar botones
        document.querySelectorAll('.control-btn').forEach(btn => btn.disabled = true);
        document.getElementById('speedSlider').disabled = true;
        
        // Actualizar status
        const statusEl = document.getElementById('controlStatus');
        statusEl.textContent = '⚠️ Conecta el robot primero';
        statusEl.className = 'control-disabled';
        
        this.removeHighlight();
        
        Console.logSystem('🎮 Control manual deshabilitado');
    }
};

// Inicializar cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
    RobotControl.init();
});
