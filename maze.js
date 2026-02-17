// Visualizador de laberinto — cuadrícula de 25×25 cm
const Maze = {
    canvas: null,
    ctx: null,

    CELL_SIZE: 25,          // cm por celda (reglamento)

    visited: new Set(),     // Set<"col,row">
    visitedOrder: [],       // [{ col, row }] en orden de visita, sin repetir

    startCell: null,
    endCell:   null,

    minCol: 0, maxCol: 0,
    minRow: 0, maxRow: 0,

    points: [],             // datos brutos (para exportar)

    solutionCells: [],      // [{ col, row }] camino óptimo
    showSolution: false,

    cellPx: 60,             // píxeles por celda
    PADDING: 1,             // celdas de margen alrededor

    // ─────────────────────────────────────────────────
    init() {
        this.canvas = document.getElementById('mazeCanvas');
        if (!this.canvas) return;
        this.ctx = this.canvas.getContext('2d');
        this.clear();
    },

    _toCell(x, y) {
        return { col: Math.floor(x / this.CELL_SIZE),
                 row: Math.floor(y / this.CELL_SIZE) };
    },
    _key(col, row) { return `${col},${row}`; },

    // Canvas top-left de la celda
    _cx(col) { return (col - this.minCol + this.PADDING) * this.cellPx; },
    _cy(row) { return (row - this.minRow + this.PADDING) * this.cellPx; },

    // Centro canvas de la celda
    _mx(col) { return this._cx(col) + this.cellPx / 2; },
    _my(row) { return this._cy(row) + this.cellPx / 2; },

    // ─────────────────────────────────────────────────
    setWallWidth() { /* obsoleto */ },
    setScale(val) {
        this.cellPx = Math.max(10, parseFloat(val) * 25) || 60;
        this.draw();
    },

    // ─────────────────────────────────────────────────
    addPoint(x, y) {
        this.points.push({ x, y });

        const { col, row } = this._toCell(x, y);
        const key = this._key(col, row);

        if (!this.visited.has(key)) {
            this.visited.add(key);
            this.visitedOrder.push({ col, row });

            if (this.visitedOrder.length === 1) {
                this.minCol = this.maxCol = col;
                this.minRow = this.maxRow = row;
                this.startCell = { col, row };
            } else {
                if (col < this.minCol) this.minCol = col;
                if (col > this.maxCol) this.maxCol = col;
                if (row < this.minRow) this.minRow = row;
                if (row > this.maxRow) this.maxRow = row;
            }
            this.endCell = { col, row };
            this.draw();
        }
        return this.points.length;
    },

    loadFromFile(file) {
        const reader = new FileReader();
        reader.onload = e => {
            try { this.clear(); this.parseAndLoad(e.target.result); }
            catch (err) { Console.logError('Error al cargar: ' + err.message); }
        };
        reader.readAsText(file);
    },

    parseAndLoad(text) {
        text.trim().split('\n').forEach(l => this.processLine(l));
        if (this.visited.size > 0) {
            Console.logSystem(`Cargado: ${this.points.length} puntos → ${this.visited.size} celdas`);
            this.draw();
        }
    },

    processLine(line) {
        line = line.trim();
        if (!line || line.startsWith('#')) return;
        const [a, b] = line.split(',');
        const x = parseFloat(a), y = parseFloat(b);
        if (!isNaN(x) && !isNaN(y)) {
            const n = this.addPoint(x, y);
            const { col, row } = this._toCell(x, y);
            Console.logSystem(`Punto ${n}: (${x},${y}) → celda (${col},${row})`);
        }
    },

    setSolution(solution) {
        const seen = new Set();
        this.solutionCells = [];
        for (const pt of (solution || [])) {
            const { col, row } = this._toCell(pt.x, pt.y);
            const k = this._key(col, row);
            if (!seen.has(k)) { seen.add(k); this.solutionCells.push({ col, row }); }
        }
        this.showSolution = this.solutionCells.length > 0;
        this.draw();
    },

    toggleSolution() {
        this.showSolution = !this.showSolution;
        this.draw();
    },

    // ─────────────────────────────────────────────────
    draw() {
        if (!this.ctx) return;
        if (this.visited.size === 0) { this._drawEmpty(); return; }

        const cols = this.maxCol - this.minCol + 1 + 2 * this.PADDING;
        const rows = this.maxRow - this.minRow + 1 + 2 * this.PADDING;
        const p = this.cellPx;

        this.canvas.width  = cols * p;
        this.canvas.height = rows * p;

        // 1. Fondo
        this.ctx.fillStyle = '#0f172a';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // 2. Todas las celdas (fondo oscuro)
        this.ctx.fillStyle = '#1e293b';
        for (let c = 0; c < cols; c++)
            for (let r = 0; r < rows; r++)
                this.ctx.fillRect(c * p + 1, r * p + 1, p - 2, p - 2);

        // 3. Celdas visitadas — azul
        this.ctx.fillStyle = 'rgba(96, 165, 250, 0.28)';
        for (const { col, row } of this.visitedOrder)
            this.ctx.fillRect(this._cx(col) + 1, this._cy(row) + 1, p - 2, p - 2);

        // 4. Celdas de solución — amarillo (encima del azul)
        if (this.showSolution && this.solutionCells.length > 0) {
            this.ctx.fillStyle = 'rgba(245, 158, 11, 0.38)';
            for (const { col, row } of this.solutionCells)
                this.ctx.fillRect(this._cx(col) + 1, this._cy(row) + 1, p - 2, p - 2);
        }

        // 5. Línea de recorrido (centro a centro de celda visitada)
        if (this.visitedOrder.length > 1) {
            this.ctx.strokeStyle = '#60a5fa';
            this.ctx.lineWidth = Math.max(2, p * 0.07);
            this.ctx.lineCap = 'round';
            this.ctx.lineJoin = 'round';
            this.ctx.setLineDash([]);
            this.ctx.beginPath();
            this.ctx.moveTo(this._mx(this.visitedOrder[0].col), this._my(this.visitedOrder[0].row));
            for (let i = 1; i < this.visitedOrder.length; i++)
                this.ctx.lineTo(this._mx(this.visitedOrder[i].col), this._my(this.visitedOrder[i].row));
            this.ctx.stroke();
        }

        // 6. Línea de solución (centro a centro, línea recta)
        if (this.showSolution && this.solutionCells.length > 1) {
            this.ctx.strokeStyle = '#f59e0b';
            this.ctx.lineWidth = Math.max(3, p * 0.11);
            this.ctx.lineCap = 'round';
            this.ctx.lineJoin = 'round';
            this.ctx.setLineDash([Math.max(5, p * 0.2), Math.max(4, p * 0.12)]);
            this.ctx.beginPath();
            this.ctx.moveTo(this._mx(this.solutionCells[0].col), this._my(this.solutionCells[0].row));
            for (let i = 1; i < this.solutionCells.length; i++)
                this.ctx.lineTo(this._mx(this.solutionCells[i].col), this._my(this.solutionCells[i].row));
            this.ctx.stroke();
            this.ctx.setLineDash([]);
        }

        // 7. Grilla
        this.ctx.strokeStyle = 'rgba(148, 163, 184, 0.45)';
        this.ctx.lineWidth = 1;
        for (let c = 0; c <= cols; c++) {
            this.ctx.beginPath();
            this.ctx.moveTo(c * p, 0); this.ctx.lineTo(c * p, this.canvas.height);
            this.ctx.stroke();
        }
        for (let r = 0; r <= rows; r++) {
            this.ctx.beginPath();
            this.ctx.moveTo(0, r * p); this.ctx.lineTo(this.canvas.width, r * p);
            this.ctx.stroke();
        }

        // 8. Etiquetas de coordenada en cada celda
        if (p >= 30) {
            const fs = Math.max(7, Math.min(10, p * 0.17));
            this.ctx.font = `${fs}px monospace`;
            this.ctx.textAlign = 'left';
            for (let c = 0; c < cols; c++) {
                for (let r = 0; r < rows; r++) {
                    const rc = c + this.minCol - this.PADDING;
                    const rr = r + this.minRow - this.PADDING;
                    this.ctx.fillStyle = this.visited.has(this._key(rc, rr))
                        ? 'rgba(148,163,184,0.4)'
                        : 'rgba(100,116,139,0.35)';
                    this.ctx.fillText(`${rc},${rr}`, c * p + 3, r * p + fs + 2);
                }
            }
        }

        // 9. S y E
        if (this.startCell)
            this._stamp(this.startCell, 'rgba(34,197,94,0.65)', '#bbf7d0', 'S');
        if (this.endCell &&
            (this.endCell.col !== this.startCell.col || this.endCell.row !== this.startCell.row))
            this._stamp(this.endCell, 'rgba(239,68,68,0.65)', '#fecaca', 'E');

        // 10. Info
        this._drawInfo();
    },

    _stamp(cell, fill, text, label) {
        const p = this.cellPx;
        const cx = this._cx(cell.col), cy = this._cy(cell.row);
        const fs = Math.max(10, Math.min(20, p * 0.30));
        this.ctx.fillStyle = fill;
        this.ctx.fillRect(cx + 2, cy + 2, p - 4, p - 4);
        this.ctx.fillStyle = text;
        this.ctx.font = `bold ${fs}px sans-serif`;
        this.ctx.textAlign = 'center';
        this.ctx.fillText(label, this._mx(cell.col), this._my(cell.row) + fs * 0.36);
        this.ctx.textAlign = 'left';
    },

    _drawInfo() {
        const lines = [
            `Celdas: ${this.visited.size}`,
            `Celda: ${this.CELL_SIZE}×${this.CELL_SIZE} cm`,
        ];
        if (this.showSolution && this.solutionCells.length > 0)
            lines.push(`Solución: ${this.solutionCells.length} celdas`);

        const bw = 155, lh = 16, bh = lines.length * lh + 12;
        this.ctx.fillStyle = 'rgba(15,23,42,0.88)';
        this.ctx.fillRect(6, 6, bw, bh);
        this.ctx.strokeStyle = 'rgba(148,163,184,0.25)';
        this.ctx.lineWidth = 1;
        this.ctx.strokeRect(6, 6, bw, bh);
        this.ctx.font = '10px sans-serif';
        lines.forEach((l, i) => {
            this.ctx.fillStyle = l.startsWith('Solución') ? '#f59e0b' : '#94a3b8';
            this.ctx.fillText(l, 14, 20 + i * lh);
        });
    },

    _drawEmpty() {
        if (!this.canvas) return;
        this.canvas.width  = this.canvas.width  || 600;
        this.canvas.height = this.canvas.height || 400;
        this.ctx.fillStyle = '#0f172a';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.fillStyle = '#475569';
        this.ctx.font = '14px sans-serif';
        this.ctx.textAlign = 'center';
        this.ctx.fillText('Esperando datos del robot...', this.canvas.width / 2, this.canvas.height / 2);
        this.ctx.textAlign = 'left';
    },

    clear() {
        this.points        = [];
        this.visited       = new Set();
        this.visitedOrder  = [];
        this.solutionCells = [];
        this.showSolution  = false;
        this.startCell     = null;
        this.endCell       = null;
        this.minCol = this.maxCol = this.minRow = this.maxRow = 0;
        if (this.ctx) this._drawEmpty();
    },

    exportData() {
        return this.points.map(p => `${p.x},${p.y}`).join('\n');
    }
};

document.addEventListener('DOMContentLoaded', () => { Maze.init(); });
