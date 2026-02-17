// Solucionador de laberinto — opera sobre la grilla de celdas de 25×25 cm
const MazeSolver = {
    solution: [],   // [{x, y}] centros de celda en cm

    solve(algorithm = 'astar') {
        if (Maze.visited.size < 2) {
            Console.logError('Se necesitan al menos 2 celdas para resolver');
            return null;
        }
        if (!Maze.startCell || !Maze.endCell) {
            Console.logError('No hay celda de inicio o fin');
            return null;
        }
        if (this._key(Maze.startCell) === this._key(Maze.endCell)) {
            Console.logError('Inicio y fin son la misma celda');
            return null;
        }

        Console.logSystem(
            `Resolviendo con ${algorithm.toUpperCase()} | ` +
            `inicio (${Maze.startCell.col},${Maze.startCell.row}) → ` +
            `fin (${Maze.endCell.col},${Maze.endCell.row}) | ` +
            `${Maze.visited.size} celdas transitables`
        );

        const t0 = performance.now();
        let path = null;

        switch (algorithm) {
            case 'astar':    path = this._aStar();    break;
            case 'dijkstra': path = this._dijkstra(); break;
            case 'bfs':      path = this._bfs();      break;
            default:
                Console.logError('Algoritmo desconocido: ' + algorithm);
                return null;
        }

        if (!path) {
            Console.logError(`Sin solución con ${algorithm.toUpperCase()}`);
            return null;
        }

        const ms = (performance.now() - t0).toFixed(2);
        Console.logSystem(
            `✅ Solución en ${ms} ms — ${path.length} celdas — ` +
            `${((path.length - 1) * Maze.CELL_SIZE).toFixed(0)} cm`
        );

        // Convertir a [{x, y}] en cm (centros de celda)
        this.solution = path.map(c => ({
            x: c.col * Maze.CELL_SIZE + Maze.CELL_SIZE / 2,
            y: c.row * Maze.CELL_SIZE + Maze.CELL_SIZE / 2
        }));
        return this.solution;
    },

    // ─── Utilidades ──────────────────────────────────
    _key(cell) { return `${cell.col},${cell.row}`; },

    _neighbors(col, row) {
        return [
            { col, row: row - 1 },
            { col: col + 1, row },
            { col, row: row + 1 },
            { col: col - 1, row }
        ].filter(n => Maze.visited.has(`${n.col},${n.row}`));
    },

    _h(a, b) {
        return Math.abs(a.col - b.col) + Math.abs(a.row - b.row);
    },

    _buildPath(cameFrom, end) {
        const path = [];
        let cur = end;
        while (cur) {
            path.unshift(cur);
            cur = cameFrom.get(this._key(cur));
        }
        return path;
    },

    // ─── A* ──────────────────────────────────────────
    _aStar() {
        const start = Maze.startCell, end = Maze.endCell;
        const gScore = new Map([[this._key(start), 0]]);
        const fScore = new Map([[this._key(start), this._h(start, end)]]);
        const cameFrom = new Map();
        const open = [start];
        const inOpen = new Set([this._key(start)]);

        while (open.length > 0) {
            let bi = 0;
            for (let i = 1; i < open.length; i++)
                if ((fScore.get(this._key(open[i])) ?? Infinity) < (fScore.get(this._key(open[bi])) ?? Infinity))
                    bi = i;

            const cur = open.splice(bi, 1)[0];
            const ck = this._key(cur);
            inOpen.delete(ck);

            if (cur.col === end.col && cur.row === end.row)
                return this._buildPath(cameFrom, cur);

            const g = gScore.get(ck) ?? Infinity;
            for (const nb of this._neighbors(cur.col, cur.row)) {
                const nk = this._key(nb);
                const tg = g + 1;
                if (tg < (gScore.get(nk) ?? Infinity)) {
                    cameFrom.set(nk, cur);
                    gScore.set(nk, tg);
                    fScore.set(nk, tg + this._h(nb, end));
                    if (!inOpen.has(nk)) { open.push(nb); inOpen.add(nk); }
                }
            }
        }
        return null;
    },

    // ─── BFS ─────────────────────────────────────────
    _bfs() {
        const start = Maze.startCell, end = Maze.endCell;
        const visited = new Set([this._key(start)]);
        const cameFrom = new Map();
        const queue = [start];

        while (queue.length > 0) {
            const cur = queue.shift();
            if (cur.col === end.col && cur.row === end.row)
                return this._buildPath(cameFrom, cur);

            for (const nb of this._neighbors(cur.col, cur.row)) {
                const nk = this._key(nb);
                if (!visited.has(nk)) {
                    visited.add(nk);
                    cameFrom.set(nk, cur);
                    queue.push(nb);
                }
            }
        }
        return null;
    },

    // ─── Dijkstra ────────────────────────────────────
    _dijkstra() {
        const start = Maze.startCell, end = Maze.endCell;
        const dist = new Map([[this._key(start), 0]]);
        const cameFrom = new Map();
        const queue = [start];

        while (queue.length > 0) {
            let bi = 0;
            for (let i = 1; i < queue.length; i++)
                if ((dist.get(this._key(queue[i])) ?? Infinity) < (dist.get(this._key(queue[bi])) ?? Infinity))
                    bi = i;

            const cur = queue.splice(bi, 1)[0];
            const ck = this._key(cur);

            if (cur.col === end.col && cur.row === end.row)
                return this._buildPath(cameFrom, cur);

            const d = dist.get(ck) ?? Infinity;
            for (const nb of this._neighbors(cur.col, cur.row)) {
                const nk = this._key(nb);
                if (d + 1 < (dist.get(nk) ?? Infinity)) {
                    dist.set(nk, d + 1);
                    cameFrom.set(nk, cur);
                    if (!queue.some(n => n.col === nb.col && n.row === nb.row))
                        queue.push(nb);
                }
            }
        }
        return null;
    }
};
