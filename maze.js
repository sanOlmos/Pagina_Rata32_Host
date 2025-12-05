// Visualizador de laberintos
const Maze = {
    canvas: null,
    ctx: null,
    data: null,
    cellSize: 30,
    padding: 20,

    init() {
        this.canvas = document.getElementById('mazeCanvas');
        if (!this.canvas) return;
        this.ctx = this.canvas.getContext('2d');
    },

    loadFromFile(file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                this.parseAndDraw(e.target.result);
                Console.logSystem('Laberinto cargado exitosamente');
            } catch (error) {
                Console.logError('Error al cargar laberinto: ' + error.message);
            }
        };
        reader.readAsText(file);
    },

    loadFromText(text) {
        try {
            this.parseAndDraw(text);
            Console.logSystem('Laberinto cargado desde MQTT');
        } catch (error) {
            Console.logError('Error al parsear laberinto: ' + error.message);
        }
    },

    parseAndDraw(text) {
        const lines = text.trim().split('\n');
        this.data = {
            width: 0,
            height: 0,
            start: null,
            end: null,
            walls: [],
            path: []
        };

        lines.forEach(line => {
            line = line.trim();
            if (line.startsWith('W:') && line.includes(',H:')) {
                // Dimensiones: W:10,H:10
                const parts = line.substring(2).split(',H:');
                this.data.width = parseInt(parts[0]);
                this.data.height = parseInt(parts[1]);
            } else if (line.startsWith('S:')) {
                // Start: S:0,0
                const coords = line.substring(2).split(',');
                this.data.start = { x: parseInt(coords[0]), y: parseInt(coords[1]) };
            } else if (line.startsWith('E:')) {
                // End: E:9,9
                const coords = line.substring(2).split(',');
                this.data.end = { x: parseInt(coords[0]), y: parseInt(coords[1]) };
            } else if (line.startsWith('W:')) {
                // Walls: W:0,1-0,5;2,3-2,7
                const segments = line.substring(2).split(';');
                segments.forEach(seg => {
                    const [p1, p2] = seg.split('-');
                    const [x1, y1] = p1.split(',').map(Number);
                    const [x2, y2] = p2.split(',').map(Number);
                    this.data.walls.push({ x1, y1, x2, y2 });
                });
            } else if (line.startsWith('P:')) {
                // Path (recorrido del robot): P:0,0;0,1;1,1;1,2
                const points = line.substring(2).split(';');
                points.forEach(p => {
                    const [x, y] = p.split(',').map(Number);
                    this.data.path.push({ x, y });
                });
            }
        });

        this.draw();
    },

    draw() {
        if (!this.data || !this.ctx) return;

        // Calcular tamaño del canvas
        const canvasWidth = this.data.width * this.cellSize + this.padding * 2;
        const canvasHeight = this.data.height * this.cellSize + this.padding * 2;
        this.canvas.width = canvasWidth;
        this.canvas.height = canvasHeight;

        // Fondo
        this.ctx.fillStyle = '#0f172a';
        this.ctx.fillRect(0, 0, canvasWidth, canvasHeight);

        // Grid
        this.drawGrid();

        // Paredes
        this.drawWalls();

        // Start y End
        this.drawStartEnd();

        // Path (si existe)
        if (this.data.path.length > 0) {
            this.drawPath();
        }
    },

    drawGrid() {
        this.ctx.strokeStyle = 'rgba(148, 163, 184, 0.2)';
        this.ctx.lineWidth = 1;

        for (let x = 0; x <= this.data.width; x++) {
            const posX = this.padding + x * this.cellSize;
            this.ctx.beginPath();
            this.ctx.moveTo(posX, this.padding);
            this.ctx.lineTo(posX, this.padding + this.data.height * this.cellSize);
            this.ctx.stroke();
        }

        for (let y = 0; y <= this.data.height; y++) {
            const posY = this.padding + y * this.cellSize;
            this.ctx.beginPath();
            this.ctx.moveTo(this.padding, posY);
            this.ctx.lineTo(this.padding + this.data.width * this.cellSize, posY);
            this.ctx.stroke();
        }
    },

    drawWalls() {
        this.ctx.strokeStyle = '#60a5fa';
        this.ctx.lineWidth = 3;

        this.data.walls.forEach(wall => {
            const x1 = this.padding + wall.x1 * this.cellSize;
            const y1 = this.padding + wall.y1 * this.cellSize;
            const x2 = this.padding + wall.x2 * this.cellSize;
            const y2 = this.padding + wall.y2 * this.cellSize;

            this.ctx.beginPath();
            this.ctx.moveTo(x1, y1);
            this.ctx.lineTo(x2, y2);
            this.ctx.stroke();
        });
    },

    drawStartEnd() {
        // Start (verde)
        if (this.data.start) {
            const x = this.padding + this.data.start.x * this.cellSize + this.cellSize / 2;
            const y = this.padding + this.data.start.y * this.cellSize + this.cellSize / 2;
            
            this.ctx.fillStyle = 'rgba(34, 197, 94, 0.3)';
            this.ctx.fillRect(
                this.padding + this.data.start.x * this.cellSize,
                this.padding + this.data.start.y * this.cellSize,
                this.cellSize,
                this.cellSize
            );
            
            this.ctx.fillStyle = '#22c55e';
            this.ctx.beginPath();
            this.ctx.arc(x, y, 8, 0, Math.PI * 2);
            this.ctx.fill();
        }

        // End (rojo)
        if (this.data.end) {
            const x = this.padding + this.data.end.x * this.cellSize + this.cellSize / 2;
            const y = this.padding + this.data.end.y * this.cellSize + this.cellSize / 2;
            
            this.ctx.fillStyle = 'rgba(239, 68, 68, 0.3)';
            this.ctx.fillRect(
                this.padding + this.data.end.x * this.cellSize,
                this.padding + this.data.end.y * this.cellSize,
                this.cellSize,
                this.cellSize
            );
            
            this.ctx.fillStyle = '#ef4444';
            this.ctx.beginPath();
            this.ctx.arc(x, y, 8, 0, Math.PI * 2);
            this.ctx.fill();
        }
    },

    drawPath() {
        if (this.data.path.length < 2) return;

        this.ctx.strokeStyle = '#fbbf24';
        this.ctx.lineWidth = 3;
        this.ctx.lineCap = 'round';
        this.ctx.lineJoin = 'round';

        this.ctx.beginPath();
        const firstPoint = this.data.path[0];
        this.ctx.moveTo(
            this.padding + firstPoint.x * this.cellSize + this.cellSize / 2,
            this.padding + firstPoint.y * this.cellSize + this.cellSize / 2
        );

        for (let i = 1; i < this.data.path.length; i++) {
            const point = this.data.path[i];
            this.ctx.lineTo(
                this.padding + point.x * this.cellSize + this.cellSize / 2,
                this.padding + point.y * this.cellSize + this.cellSize / 2
            );
        }
        this.ctx.stroke();

        // Dibujar puntos
        this.data.path.forEach((point, index) => {
            const x = this.padding + point.x * this.cellSize + this.cellSize / 2;
            const y = this.padding + point.y * this.cellSize + this.cellSize / 2;
            
            this.ctx.fillStyle = index === 0 ? '#22c55e' : 
                                 index === this.data.path.length - 1 ? '#ef4444' : '#fbbf24';
            this.ctx.beginPath();
            this.ctx.arc(x, y, 4, 0, Math.PI * 2);
            this.ctx.fill();
        });
    },

    clear() {
        if (!this.ctx) return;
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.data = null;
    }
};

document.addEventListener('DOMContentLoaded', () => {
    Maze.init();
});
