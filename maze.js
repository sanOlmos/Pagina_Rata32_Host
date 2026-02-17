// Visualizador de trayectoria del robot — basado en celdas de 25×25 cm
const Maze = {
    canvas: null,
    ctx: null,

    // Datos crudos (para exportar / compatibilidad)
    points: [],

    // Sistema de celdas
    CELL_SIZE: 25,          // cm por celda (reglamento)
    visitedCells: new Set(),// claves "col,row" de celdas visitadas
    cellOrder: [],          // lista ordenada de celdas nuevas (sin repetir)
    firstCell: null,        // celda de inicio
    lastCell: null,         // celda actual / final

    // Bounds en coordenadas de celda
    minCol: 0, maxCol: 0,
    minRow: 0, maxRow: 0,

    // Solución
    solutionPath: [],       // [{x,y}] centros de celda en cm
    showSolution: false,

    // Visualización
    scale: 4,               // px / cm  →  celda = 100 px al valor 4
    padding: 1,             // celdas de margen alrededor del laberinto

    // ───────────────────────────────────────────────
    init() {
        this.canvas = document.getElementById('mazeCanvas');
        if (!this.canvas) return;
        this.ctx = this.canvas.getContext('2d');
        this.clear();
    },

    // ── Helpers de coordenadas ──────────────────────
    pointToCell(x, y) {
        return {
            col: Math.floor(x / this.CELL_SIZE),
            row: Math.floor(y / this.CELL_SIZE)
        };
    },

    cellKey(col, row) { return `${col},${row}`; },

    cellCenter(col, row) {
        return {
            x: col * this.CELL_SIZE + this.CELL_SIZE / 2,
            y: row * this.CELL_SIZE + this.CELL_SIZE / 2
        };
    },

    // Canvas X del borde izquierdo de la celda (col)
    toCanvasX(col) {
        return (col - this.minCol + this.padding) * this.CELL_SIZE * this.scale;
    },

    // Canvas Y del borde superior de la celda (row)
    toCanvasY(row) {
        return (row - this.minRow + this.padding) * this.CELL_SIZE * this.scale;
    },

    // Canvas X/Y del centro de la celda
    centerX(col) { return this.toCanvasX(col) + (this.CELL_SIZE * this.scale) / 2; },
    centerY(row) { return this.toCanvasY(row) + (this.CELL_SIZE * this.scale) / 2; },

    // ── Configuración ───────────────────────────────
    setWallWidth(_w) { /* obsoleto en modo celda — no-op */ },

    setScale(scale) {
        this.scale = parseFloat(scale) || 4;
        this.draw();
    },

    setSolution(solution) {
        this.solutionPath = solution || [];
        this.showSolution = Array.isArray(solution) && solution.length > 0;
        this.draw();
    },

    toggleSolution() {
        this.showSolution = !this.showSolution;
        this.draw();
    },

    // ── Agregar punto (desde MQTT o archivo) ────────
    addPoint(x, y) {
        this.points.push({ x, y });

        const { col, row } = this.pointToCell(x, y);
        const key = this.cellKey(col, row);

        if (!this.visitedCells.has(key)) {
            this.visitedCells.add(key);
            this.cellOrder.push({ col, row });

            if (this.cellOrder.length === 1) {
                this.minCol = this.maxCol = col;
                this.minRow = this.maxRow = row;
                this.firstCell = { col, row };
            } else {
                this.minCol = Math.min(this.minCol, col);
                this.maxCol = Math.max(this.maxCol, col);
                this.minRow = Math.min(this.minRow, row);
                this.maxRow = Math.max(this.maxRow, row);
            }
            this.lastCell = { col, row };

            this.draw();
        }

        return this.points.length;
    },

    // ── Carga desde archivo ─────────────────────────
    loadFromFile(file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                this.clear();
                this.parseAndLoad(e.target.result);
            } catch (err) {
                Console.logError('Error al cargar archivo: ' + err.message);
            }
        };
        reader.readAsText(file);
    },

    parseAndLoad(text) {
        const lines = text.trim().split('\n');
        lines.forEach(line => this.processLine(line));

        if (this.cellOrder.length > 0) {
            Console.logSystem(
                `Trayectoria cargada: ${this.points.length} puntos → ` +
                `${this.cellOrder.length} celdas visitadas`
            );
            Console.logSystem(
                `Rango: Col [${this.minCol}→${this.maxCol}]  Fila [${this.minRow}→${this.maxRow}]`
            );
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
                const { col, row } = this.pointToCell(x, y);
                Console.logSystem(`Punto ${count}: (${x}, ${y}) cm → celda (${col}, ${row})`);
            }
        }
    },

    // ── Dibujo principal ────────────────────────────
    draw() {
        if (!this.ctx) return;
        if (this.cellOrder.length === 0) { this._drawEmpty(); return; }

        const ppc = this.CELL_SIZE * this.scale;   // pixels per cell
        const totalCols = this.maxCol - this.minCol + 1 + 2 * this.padding;
        const totalRows = this.maxRow - this.minRow + 1 + 2 * this.padding;

        this.canvas.width  = Math.max(totalCols * ppc, 200);
        this.canvas.height = Math.max(totalRows * ppc, 200);

        // Fondo
        this.ctx.fillStyle = '#0f172a';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // 1. Celdas visitadas (relleno)
        this._drawVisitedCells(ppc);

        // 2. Camino entre centros de celdas (orden de visita)
        this._drawCellPath(ppc);

        // 3. Solución (si está activada)
        if (this.showSolution && this.solutionPath.length > 1) {
            this._drawSolution(ppc);
        }

        // 4. Rejilla
        this._drawGrid(ppc, totalCols, totalRows);

        // 5. Etiquetas de celda
        this._drawCellLabels(ppc, totalCols, totalRows);

        // 6. Inicio y fin
        this._drawStartEnd(ppc);

        // 7. Info
        this._drawInfo(ppc);
    },

    _drawEmpty() {
        this.canvas.width  = this.canvas.width  || 600;
        this.canvas.height = this.canvas.height || 400;
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
    },

    _drawVisitedCells(ppc) {
        const margin = Math.max(1, ppc * 0.04);
        this.ctx.fillStyle = 'rgba(96, 165, 250, 0.25)';

        for (const { col, row } of this.cellOrder) {
            const cx = this.toCanvasX(col);
            const cy = this.toCanvasY(row);
            this.ctx.fillRect(cx + margin, cy + margin, ppc - margin * 2, ppc - margin * 2);
        }
    },

    _drawCellPath(ppc) {
        if (this.cellOrder.length < 2) return;

        this.ctx.strokeStyle = '#60a5fa';
        this.ctx.lineWidth = Math.max(2, ppc * 0.08);
        this.ctx.lineCap = 'round';
        this.ctx.lineJoin = 'round';
        this.ctx.setLineDash([]);

        this.ctx.beginPath();
        const f = this.cellOrder[0];
        this.ctx.moveTo(this.centerX(f.col), this.centerY(f.row));

        for (let i = 1; i < this.cellOrder.length; i++) {
            const c = this.cellOrder[i];
            this.ctx.lineTo(this.centerX(c.col), this.centerY(c.row));
        }
        this.ctx.stroke();

        // Puntos de paso
        this.ctx.fillStyle = 'rgba(96, 165, 250, 0.7)';
        const r = Math.max(3, ppc * 0.08);
        for (const { col, row } of this.cellOrder) {
            this.ctx.beginPath();
            this.ctx.arc(this.centerX(col), this.centerY(row), r, 0, Math.PI * 2);
            this.ctx.fill();
        }
    },

    _drawSolution(ppc) {
        // Highlight de celdas de solución
        const margin = Math.max(1, ppc * 0.04);
        this.ctx.fillStyle = 'rgba(245, 158, 11, 0.35)';

        for (const pt of this.solutionPath) {
            const col = Math.floor(pt.x / this.CELL_SIZE);
            const row = Math.floor(pt.y / this.CELL_SIZE);
            const cx = this.toCanvasX(col);
            const cy = this.toCanvasY(row);
            this.ctx.fillRect(cx + margin, cy + margin, ppc - margin * 2, ppc - margin * 2);
        }

        // Línea por el centro de cada celda
        this.ctx.strokeStyle = '#f59e0b';
        this.ctx.lineWidth = Math.max(3, ppc * 0.1);
        this.ctx.lineCap = 'round';
        this.ctx.lineJoin = 'round';
        this.ctx.setLineDash([Math.max(4, ppc * 0.15), Math.max(4, ppc * 0.1)]);

        this.ctx.beginPath();
        const fp = this.solutionPath[0];
        const fc = Math.floor(fp.x / this.CELL_SIZE);
        const fr = Math.floor(fp.y / this.CELL_SIZE);
        this.ctx.moveTo(this.centerX(fc), this.centerY(fr));

        for (let i = 1; i < this.solutionPath.length; i++) {
            const p = this.solutionPath[i];
            const col = Math.floor(p.x / this.CELL_SIZE);
            const row = Math.floor(p.y / this.CELL_SIZE);
            this.ctx.lineTo(this.centerX(col), this.centerY(row));
        }
        this.ctx.stroke();
        this.ctx.setLineDash([]);

        // Puntos sobre solución
        this.ctx.fillStyle = '#f59e0b';
        const r = Math.max(4, ppc * 0.1);
        for (const pt of this.solutionPath) {
            const col = Math.floor(pt.x / this.CELL_SIZE);
            const row = Math.floor(pt.y / this.CELL_SIZE);
            this.ctx.beginPath();
            this.ctx.arc(this.centerX(col), this.centerY(row), r, 0, Math.PI * 2);
            this.ctx.fill();
        }
    },

    _drawGrid(ppc, totalCols, totalRows) {
        this.ctx.strokeStyle = 'rgba(148, 163, 184, 0.35)';
        this.ctx.lineWidth = 1;
        this.ctx.setLineDash([]);

        for (let c = 0; c <= totalCols; c++) {
            this.ctx.beginPath();
            this.ctx.moveTo(c * ppc, 0);
            this.ctx.lineTo(c * ppc, this.canvas.height);
            this.ctx.stroke();
        }
        for (let r = 0; r <= totalRows; r++) {
            this.ctx.beginPath();
            this.ctx.moveTo(0, r * ppc);
            this.ctx.lineTo(this.canvas.width, r * ppc);
            this.ctx.stroke();
        }
    },

    _drawCellLabels(ppc, totalCols, totalRows) {
        if (ppc < 40) return; // muy pequeño para leer etiquetas

        const fs = Math.max(8, Math.min(11, ppc * 0.18));
        this.ctx.fillStyle = 'rgba(100, 116, 139, 0.6)';
        this.ctx.font = `${fs}px monospace`;
        this.ctx.textAlign = 'left';

        for (let c = 0; c < totalCols; c++) {
            for (let r = 0; r < totalRows; r++) {
                const realCol = c + this.minCol - this.padding;
                const realRow = r + this.minRow - this.padding;
                const key = this.cellKey(realCol, realRow);
                if (this.visitedCells.has(key)) continue; // solo en celdas vacías
                this.ctx.fillText(
                    `${realCol},${realRow}`,
                    c * ppc + 3,
                    r * ppc + fs + 2
                );
            }
        }
    },

    _drawStartEnd(ppc) {
        if (!this.firstCell) return;
        const margin = Math.max(1, ppc * 0.04);
        const fontSize = Math.max(9, Math.min(14, ppc * 0.22));

        const _drawCell = (col, row, fillColor, textColor, label) => {
            const cx = this.toCanvasX(col);
            const cy = this.toCanvasY(row);
            this.ctx.fillStyle = fillColor;
            this.ctx.fillRect(cx + margin, cy + margin, ppc - margin * 2, ppc - margin * 2);
            this.ctx.fillStyle = textColor;
            this.ctx.font = `bold ${fontSize}px sans-serif`;
            this.ctx.textAlign = 'center';
            this.ctx.fillText(label, this.centerX(col), this.centerY(row) + fontSize * 0.35);
            this.ctx.textAlign = 'left';
        };

        _drawCell(
            this.firstCell.col, this.firstCell.row,
            'rgba(34, 197, 94, 0.55)', '#bbf7d0', 'START'
        );

        if (this.lastCell &&
            (this.lastCell.col !== this.firstCell.col || this.lastCell.row !== this.firstCell.row)) {
            _drawCell(
                this.lastCell.col, this.lastCell.row,
                'rgba(239, 68, 68, 0.55)', '#fecaca', 'END'
            );
        }
    },

    _drawInfo(ppc) {
        let totalDist = 0;
        for (let i = 1; i < this.points.length; i++) {
            const dx = this.points[i].x - this.points[i - 1].x;
            const dy = this.points[i].y - this.points[i - 1].y;
            totalDist += Math.sqrt(dx * dx + dy * dy);
        }

        const lines = [
            `Puntos raw: ${this.points.length}`,
            `Celdas visitadas: ${this.cellOrder.length}`,
            `Distancia: ${totalDist.toFixed(1)} cm`,
            `Grid Col: ${this.minCol} → ${this.maxCol}`,
            `Grid Fila: ${this.minRow} → ${this.maxRow}`,
            `Celda: ${this.CELL_SIZE}×${this.CELL_SIZE} cm`
        ];
        if (this.showSolution && this.solutionPath.length > 0) {
            lines.push(`✓ Solución: ${this.solutionPath.length} celdas`);
        }

        const bw = 200, bh = lines.length * 18 + 16;
        this.ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
        this.ctx.fillRect(8, 8, bw, bh);
        this.ctx.strokeStyle = 'rgba(148, 163, 184, 0.3)';
        this.ctx.lineWidth = 1;
        this.ctx.strokeRect(8, 8, bw, bh);

        this.ctx.fillStyle = '#cbd5e1';
        this.ctx.font = '11px sans-serif';
        lines.forEach((l, i) => {
            if (l.startsWith('✓')) this.ctx.fillStyle = '#f59e0b';
            else this.ctx.fillStyle = '#cbd5e1';
            this.ctx.fillText(l, 16, 24 + i * 18);
        });
    },

    // ── Limpiar ─────────────────────────────────────
    clear() {
        this.points       = [];
        this.visitedCells = new Set();
        this.cellOrder    = [];
        this.solutionPath = [];
        this.showSolution = false;
        this.firstCell    = null;
        this.lastCell     = null;
        this.minCol = this.maxCol = this.minRow = this.maxRow = 0;

        if (this.ctx) { this._drawEmpty(); }
    },

    // ── Exportar ─────────────────────────────────────
    exportData() {
        if (this.points.length === 0) return '';
        return this.points.map(p => `${p.x},${p.y}`).join('\n');
    }
};

document.addEventListener('DOMContentLoaded', () => {
    Maze.init();
});
