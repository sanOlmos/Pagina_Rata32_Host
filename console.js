// Manejo de la consola serial virtual
const Console = {
    element: null,

    init() {
        this.element = document.getElementById('console');
        this.addLine('Sistema iniciado - Listo para conectar', 'system');
    },

    addLine(message, type = 'system') {
        if (!this.element) return;
        
        const timestamp = new Date().toLocaleTimeString();
        const line = document.createElement('div');
        line.className = `console-line ${type}`;
        line.innerHTML = `<span class="timestamp">[${timestamp}]</span>${message}`;
        
        this.element.appendChild(line);
        this.element.scrollTop = this.element.scrollHeight;
    },

    clear() {
        if (!this.element) return;
        this.element.innerHTML = '';
        this.addLine('Consola limpiada', 'system');
    },

    logSent(message) {
        this.addLine(`Enviado: ${message}`, 'sent');
    },

    logReceived(message) {
        this.addLine(`Recibido: ${message}`, 'received');
    },

    logError(message) {
        this.addLine(`Error: ${message}`, 'error');
    },

    logSystem(message) {
        this.addLine(message, 'system');
    }
};

// Inicializar cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
    Console.init();
});
