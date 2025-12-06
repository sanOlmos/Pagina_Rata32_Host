// Visualizador de trayectoria del robot
const Maze = {
    canvas: null,
    ctx: null,
    points: [],
    solutionPath: [],
    wallWidth: 2,
    scale: 20,
    padding: 40,
    minX: 0,
    minY: 0,
    maxX: 0,
    maxY: 0,
    showSolution: false,

    init() {
        this.canvas = document.getElementById('mazeCanvas');
        if (!this.canvas) return;
        this.ctx = this.canvas.getContext('2d');
        this.clear();
    },

    setWallWidth(width) {
        this.wallWidth = width;
        if (this.points.length > 0) {
            this.draw();
        }
    },

    setScale(scale) {
        this.scale = scale;
        if (this.points.length > 0) {
            this.draw();
        }
    },

    setSolution(solution) {
        this.solutionPath = solution || [];
        this.showSolution = solution && solution.length > 0;
        this.draw();
    },

    toggleSolution() {
        this.showSolution = !this.showSolution;
        this.draw();
    },

    addPoint(x, y) {
        this.points.push({ x, y });
        
        // Actualizar límites incluso si es el primer punto
        if (this.points.length === 1) {
            this.minX = this.maxX = x;
            this.minY = this.maxY = y;
        } else {
            this.minX = Math.min(this.minX, x);
            this.maxX = Math.max(this.maxX, x);
            this.minY = Math.min(this.minY, y);
            this.maxY = Math.max(this.maxY, y);
        }
        
        // Redibujar solo si hay más de un punto
        if (this.points.length > 1) {
            this.draw();
        }
        
        return this.points.length;
    },

    loadFromFile(file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                this.clear();
                this.parseAndLoad(e.target.result);
                Console.logSystem(`Trayectoria cargada: ${this.points.length} puntos`);
            } catch (error) {
                Console.logError('Error al cargar archivo: ' + error.message);
            }
        };
        reader.readAsText(file);
    },

    parseAndLoad(text) {
        const lines = text.trim().split('\n');
        
        lines.forEach(line => {
            line = line.trim();
            if (!line || line.startsWith('#')) return;
            
            const parts = line.split(',');
            if (parts.length >= 2) {
                const x = parseFloat(parts[0]);
                const y = parseFloat(parts[1]);
                if (!isNaN(x) && !isNaN(y)) {
                    this.addPoint(x, y);
                }
            }
        });
        
        // Dibujar después de cargar todos los puntos
        if (this.points.length > 0) {
            Console.logSystem(`Rango detectado: X[${this.minX.toFixed(1)}, ${this.maxX.toFixed(1)}] Y[${this.minY.toFixed(1)}, ${this.maxY.toFixed(1)}]`);
            this.draw();
        }
    },

    processLine(line) {
        line = line.trim();
        if (!line || line.startsWith('#')) return;
        
        const parts = line.split(',');
        if (parts.length >= 2) {
            const x = parseFloat(parts[0]);
            const y = parseFloat(parts[1]);
            if (!isNaN(x) && !isNaN(y)) {
                const count = this.addPoint(x, y);
                Console.logSystem(`Punto ${count}: (${x}, ${y}) cm`);
            }
        }
    },

    draw() {
        if (!this.ctx || this.points.length === 0) return;

        // Calcular dimensiones reales del laberinto
        const mazeWidth = (this.maxX - this.minX) * this.scale + this.padding * 2;
        const mazeHeight = (this.maxY - this.minY) * this.scale + this.padding * 2;
        
        // Ajustar canvas al tamaño del laberinto (mínimo 200px)
        this.canvas.width = Math.max(mazeWidth, 200);
        this.canvas.height = Math.max(mazeHeight, 200);

        this.ctx.fillStyle = '#0f172a';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        this.drawGrid();
        this.drawPath();
        
        if (this.showSolution && this.solutionPath.length > 0) {
            this.drawSolution();
        }
        
        this.drawPoints();
        this.drawInfo();
    },

    drawGrid() {
        this.ctx.strokeStyle = 'rgba(148, 163, 184, 0.15)';
        this.ctx.lineWidth = 1;
        this.ctx.setLineDash([2, 2]);

        const gridSize = 5 * this.scale; // Grid cada 5 cm

        // Solo dibujar grid si el canvas es lo suficientemente grande
        if (this.canvas.width > 100 && this.canvas.height > 100) {
            for (let x = 0; x <= this.canvas.width; x += gridSize) {
                this.ctx.beginPath();
                this.ctx.moveTo(x, 0);
                this.ctx.lineTo(x, this.canvas.height);
                this.ctx.stroke();
            }

            for (let y = 0; y <= this.canvas.height; y += gridSize) {
                this.ctx.beginPath();
                this.ctx.moveTo(0, y);
                this.ctx.lineTo(this.canvas.width, y);
                this.ctx.stroke();
            }
        }

        this.ctx.setLineDash([]);
    },

    toCanvasX(x) {
        return this.padding + (x - this.minX) * this.scale;
    },

    toCanvasY(y) {
        return this.padding + (y - this.minY) * this.scale;
    },

    drawPath() {
        if (this.points.length < 2) return;

        this.ctx.strokeStyle = '#60a5fa';
        this.ctx.lineWidth = this.wallWidth * this.scale;
        this.ctx.lineCap = 'round';
        this.ctx.lineJoin = 'round';

        this.ctx.beginPath();
        const first = this.points[0];
        this.ctx.moveTo(this.toCanvasX(first.x), this.toCanvasY(first.y));

        for (let i = 1; i < this.points.length; i++) {
            const point = this.points[i];
            this.ctx.lineTo(this.toCanvasX(point.x), this.toCanvasY(point.y));
        }
        this.ctx.stroke();

        this.ctx.strokeStyle = 'rgba(96, 165, 250, 0.3)';
        this.ctx.lineWidth = (this.wallWidth + 0.5) * this.scale;
        this.ctx.beginPath();
        this.ctx.moveTo(this.toCanvasX(first.x), this.toCanvasY(first.y));
        for (let i = 1; i < this.points.length; i++) {
            const point = this.points[i];
            this.ctx.lineTo(this.toCanvasX(point.x), this.toCanvasY(point.y));
        }
        this.ctx.stroke();
    },

    drawSolution() {
        if (this.solutionPath.length < 2) return;

        // Dibujar camino de solución
        this.ctx.strokeStyle = '#f59e0b';
        this.ctx.lineWidth = (this.wallWidth * 0.5) * this.scale;
        this.ctx.lineCap = 'round';
        this.ctx.lineJoin = 'round';
        this.ctx.setLineDash([5, 5]);

        this.ctx.beginPath();
        const first = this.solutionPath[0];
        this.ctx.moveTo(this.toCanvasX(first.x), this.toCanvasY(first.y));

        for (let i = 1; i < this.solutionPath.length; i++) {
            const point = this.solutionPath[i];
            this.ctx.lineTo(this.toCanvasX(point.x), this.toCanvasY(point.y));
        }
        this.ctx.stroke();
        this.ctx.setLineDash([]);

        // Puntos de la solución
        this.ctx.fillStyle = '#f59e0b';
        for (let i = 0; i < this.solutionPath.length; i += 2) {
            const point = this.solutionPath[i];
            this.ctx.beginPath();
            this.ctx.arc(
                this.toCanvasX(point.x),
                this.toCanvasY(point.y),
                3,
                0,
                Math.PI * 2
            );
            this.ctx.fill();
        }
    },

    drawPoints() {
        if (this.points.length > 0) {
            const start = this.points[0];
            this.ctx.fillStyle = '#22c55e';
            this.ctx.beginPath();
            this.ctx.arc(
                this.toCanvasX(start.x),
                this.toCanvasY(start.y),
                6,
                0,
                Math.PI * 2
            );
            this.ctx.fill();

            this.ctx.fillStyle = '#22c55e';
            this.ctx.font = 'bold 12px sans-serif';
            this.ctx.fillText(
                'START',
                this.toCanvasX(start.x) + 10,
                this.toCanvasY(start.y) - 10
            );
        }

        if (this.points.length > 1) {
            const end = this.points[this.points.length - 1];
            this.ctx.fillStyle = '#ef4444';
            this.ctx.beginPath();
            this.ctx.arc(
                this.toCanvasX(end.x),
                this.toCanvasY(end.y),
                6,
                0,
                Math.PI * 2
            );
            this.ctx.fill();

            this.ctx.fillStyle = '#ef4444';
            this.ctx.font = 'bold 12px sans-serif';
            this.ctx.fillText(
                'END',
                this.toCanvasX(end.x) + 10,
                this.toCanvasY(end.y) - 10
            );
        }

        this.ctx.fillStyle = 'rgba(251, 191, 36, 0.6)';
        for (let i = 1; i < this.points.length - 1; i += 3) {
            const point = this.points[i];
            this.ctx.beginPath();
            this.ctx.arc(
                this.toCanvasX(point.x),
                this.toCanvasY(point.y),
                2,
                0,
                Math.PI * 2
            );
            this.ctx.fill();
        }
    },

    drawInfo() {
        if (this.points.length === 0) return;

        let totalDistance = 0;
        for (let i = 1; i < this.points.length; i++) {
            const dx = this.points[i].x - this.points[i - 1].x;
            const dy = this.points[i].y - this.points[i - 1].y;
            totalDistance += Math.sqrt(dx * dx + dy * dy);
        }

        const infoX = 10;
        const infoY = 10;
        const infoWidth = 220;
        const infoHeight = this.showSolution ? 130 : 90;

        this.ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
        this.ctx.fillRect(infoX, infoY, infoWidth, infoHeight);
        this.ctx.strokeStyle = 'rgba(148, 163, 184, 0.3)';
        this.ctx.strokeRect(infoX, infoY, infoWidth, infoHeight);

        this.ctx.fillStyle = '#cbd5e1';
        this.ctx.font = '12px sans-serif';
        let lineY = infoY + 20;
        this.ctx.fillText(`Puntos: ${this.points.length}`, infoX + 10, lineY);
        lineY += 20;
        this.ctx.fillText(`Distancia: ${totalDistance.toFixed(1)} cm`, infoX + 10, lineY);
        lineY += 20;
        this.ctx.fillText(`Rango X: ${this.minX.toFixed(1)} → ${this.maxX.toFixed(1)} cm`, infoX + 10, lineY);
        lineY += 20;
        this.ctx.fillText(`Rango Y: ${this.minY.toFixed(1)} → ${this.maxY.toFixed(1)} cm`, infoX + 10, lineY);
        
        if (this.showSolution && this.solutionPath.length > 0) {
            lineY += 25;
            this.ctx.fillStyle = '#f59e0b';
            this.ctx.font = 'bold 12px sans-serif';
            this.ctx.fillText(`🟡 Solución: ${this.solutionPath.length} pasos`, infoX + 10, lineY);
        }
    },

    clear() {
        this.points = [];
        this.solutionPath = [];
        this.showSolution = false;
        this.minX = this.minY = this.maxX = this.maxY = 0;
        if (this.ctx) {
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
            this.ctx.fillStyle = '#0f172a';
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
            
            this.ctx.fillStyle = '#64748b';
            this.ctx.font = '14px sans-serif';
            this.ctx.textAlign = 'center';
            this.ctx.fillText(
                'Esperando datos del robot...',
                this.canvas.width / 2,
                this.canvas.height / 2
            );
            this.ctx.textAlign = 'left';
        }
    },

    exportData() {
        if (this.points.length === 0) return '';
        return this.points.map(p => `${p.x},${p.y}`).join('\n');
    }
};

document.addEventListener('DOMContentLoaded', () => {
    Maze.init();
});
