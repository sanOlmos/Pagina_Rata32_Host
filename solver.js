// Solucionador de laberintos — opera sobre la cuadrícula de celdas de 25×25 cm
const MazeSolver = {
    solution: [],   // [{x, y}] en cm (centros de celda)

    // ─────────────────────────────────────────────────────────────
    // Punto de entrada principal
    // ─────────────────────────────────────────────────────────────
    solve(algorithm = 'astar') {
        if (Maze.visitedCells.size < 2) {
            Console.logError('Carga primero un laberinto (se necesitan al menos 2 celdas)');
            return null;
        }
        if (!Maze.firstCell || !Maze.lastCell) {
            Console.logError('No se encontró celda de inicio o fin');
            return null;
        }
        if (Maze.firstCell.col === Maze.lastCell.col &&
            Maze.firstCell.row === Maze.lastCell.row) {
            Console.logError('Inicio y fin son la misma celda');
            return null;
        }

        const walkable = Maze.visitedCells;   // Set<"col,row">
        const start    = Maze.firstCell;       // {col, row}
        const end      = Maze.lastCell;        // {col, row}

        Console.logSystem(
            `Resolviendo con ${algorithm.toUpperCase()} | ` +
            `inicio (${start.col},${start.row}) → fin (${end.col},${end.row}) | ` +
            `${walkable.size} celdas transitables`
        );

        const t0 = performance.now();
        let solution = null;

        switch (algorithm) {
            case 'astar':    solution = this._aStar(walkable, start, end);    break;
            case 'dijkstra': solution = this._dijkstra(walkable, start, end); break;
            case 'bfs':      solution = this._bfs(walkable, start, end);      break;
            default:
                Console.logError('Algoritmo desconocido: ' + algorithm);
                return null;
        }

        const elapsed = (performance.now() - t0).toFixed(2);

        if (solution) {
            this.solution = solution;
            Console.logSystem(
                `✅ Solución en ${elapsed} ms — ${solution.length} celdas — ` +
                `distancia: ${((solution.length - 1) * Maze.CELL_SIZE).toFixed(0)} cm`
            );
            return solution;
        }

        Console.logError(`No se encontró solución con ${algorithm.toUpperCase()}`);
        return null;
    },

    // ─────────────────────────────────────────────────────────────
    // Utilidades de celda
    // ─────────────────────────────────────────────────────────────
    _key(col, row)   { return `${col},${row}`; },

    // Centro de la celda en cm
    _center(col, row) {
        return {
            x: col * Maze.CELL_SIZE + Maze.CELL_SIZE / 2,
            y: row * Maze.CELL_SIZE + Maze.CELL_SIZE / 2
        };
    },

    // Vecinos en las 4 direcciones cardinales que son transitables
    _neighbors(col, row, walkable) {
        return [
            { col: col,     row: row - 1 },   // arriba
            { col: col + 1, row: row     },   // derecha
            { col: col,     row: row + 1 },   // abajo
            { col: col - 1, row: row     }    // izquierda
        ].filter(n => walkable.has(this._key(n.col, n.row)));
    },

    // Heurística Manhattan (admisible para cuadrícula)
    _h(a, b) {
        return Math.abs(a.col - b.col) + Math.abs(a.row - b.row);
    },

    // Reconstruir camino hacia atrás y convertir a coordenadas cm
    _reconstruct(cameFrom, end) {
        const path = [];
        let cur = end;
        while (cur) {
            path.unshift(this._center(cur.col, cur.row));
            cur = cameFrom.get(this._key(cur.col, cur.row));
        }
        return path;
    },

    // ─────────────────────────────────────────────────────────────
    // A*
    // ─────────────────────────────────────────────────────────────
    _aStar(walkable, start, end) {
        const startKey = this._key(start.col, start.row);
        const gScore   = new Map([[startKey, 0]]);
        const fScore   = new Map([[startKey, this._h(start, end)]]);
        const cameFrom = new Map();
        const openSet  = [start];
        const inOpen   = new Set([startKey]);

        while (openSet.length > 0) {
            // Nodo con menor fScore
            let bi = 0;
            for (let i = 1; i < openSet.length; i++) {
                if ((fScore.get(this._key(openSet[i].col, openSet[i].row)) ?? Infinity) <
                    (fScore.get(this._key(openSet[bi].col, openSet[bi].row)) ?? Infinity)) {
                    bi = i;
                }
            }
            const cur = openSet.splice(bi, 1)[0];
            const curKey = this._key(cur.col, cur.row);
            inOpen.delete(curKey);

            if (cur.col === end.col && cur.row === end.row) {
                return this._reconstruct(cameFrom, cur);
            }

            const g = gScore.get(curKey) ?? Infinity;

            for (const nb of this._neighbors(cur.col, cur.row, walkable)) {
                const nbKey = this._key(nb.col, nb.row);
                const tentG = g + 1;

                if (tentG < (gScore.get(nbKey) ?? Infinity)) {
                    cameFrom.set(nbKey, cur);
                    gScore.set(nbKey, tentG);
                    fScore.set(nbKey, tentG + this._h(nb, end));

                    if (!inOpen.has(nbKey)) {
                        openSet.push(nb);
                        inOpen.add(nbKey);
                    }
                }
            }
        }
        return null;
    },

    // ─────────────────────────────────────────────────────────────
    // BFS (camino más corto en grafo sin pesos = Dijkstra uniforme)
    // ─────────────────────────────────────────────────────────────
    _bfs(walkable, start, end) {
        const visited  = new Set([this._key(start.col, start.row)]);
        const cameFrom = new Map();
        const queue    = [start];

        while (queue.length > 0) {
            const cur = queue.shift();

            if (cur.col === end.col && cur.row === end.row) {
                return this._reconstruct(cameFrom, cur);
            }

            for (const nb of this._neighbors(cur.col, cur.row, walkable)) {
                const nbKey = this._key(nb.col, nb.row);
                if (!visited.has(nbKey)) {
                    visited.add(nbKey);
                    cameFrom.set(nbKey, cur);
                    queue.push(nb);
                }
            }
        }
        return null;
    },

    // ─────────────────────────────────────────────────────────────
    // Dijkstra (costo uniforme = idéntico a BFS en este grafo,
    //           pero mantenemos la selección propia para consistencia)
    // ─────────────────────────────────────────────────────────────
    _dijkstra(walkable, start, end) {
        const startKey = this._key(start.col, start.row);
        const dist     = new Map([[startKey, 0]]);
        const cameFrom = new Map();
        const unvisited = [start];

        while (unvisited.length > 0) {
            // Nodo con menor distancia
            let bi = 0;
            for (let i = 1; i < unvisited.length; i++) {
                if ((dist.get(this._key(unvisited[i].col, unvisited[i].row)) ?? Infinity) <
                    (dist.get(this._key(unvisited[bi].col, unvisited[bi].row)) ?? Infinity)) {
                    bi = i;
                }
            }
            const cur = unvisited.splice(bi, 1)[0];
            const curKey = this._key(cur.col, cur.row);

            if (cur.col === end.col && cur.row === end.row) {
                return this._reconstruct(cameFrom, cur);
            }

            const d = dist.get(curKey) ?? Infinity;

            for (const nb of this._neighbors(cur.col, cur.row, walkable)) {
                const nbKey = this._key(nb.col, nb.row);
                const alt   = d + 1;

                if (alt < (dist.get(nbKey) ?? Infinity)) {
                    dist.set(nbKey, alt);
                    cameFrom.set(nbKey, cur);
                    if (!unvisited.some(n => n.col === nb.col && n.row === nb.row)) {
                        unvisited.push(nb);
                    }
                }
            }
        }
        return null;
    }
};

document.addEventListener('DOMContentLoaded', () => {
    // inicializado automáticamente
});
