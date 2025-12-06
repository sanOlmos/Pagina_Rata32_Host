// Solucionador de laberintos
const MazeSolver = {
    grid: [],
    gridSize: 1, // Tamaño de cada celda en cm
    solution: [],
    
    init(points, cellSize = 1) {
        if (points.length < 2) {
            Console.logError('Se necesitan al menos 2 puntos para resolver');
            return false;
        }
        
        this.gridSize = cellSize;
        this.createGrid(points);
        Console.logSystem(`Grid creado: ${this.grid.length}x${this.grid[0].length} celdas`);
        return true;
    },
    
    createGrid(points) {
        // Encontrar límites
        let minX = Math.min(...points.map(p => p.x));
        let maxX = Math.max(...points.map(p => p.x));
        let minY = Math.min(...points.map(p => p.y));
        let maxY = Math.max(...points.map(p => p.y));
        
        // Crear grid con padding
        const padding = 2;
        const width = Math.ceil((maxX - minX) / this.gridSize) + padding * 2;
        const height = Math.ceil((maxY - minY) / this.gridSize) + padding * 2;
        
        // Inicializar grid (1 = pared, 0 = camino)
        this.grid = Array(height).fill().map(() => Array(width).fill(1));
        
        // Marcar caminos
        for (let i = 0; i < points.length - 1; i++) {
            const p1 = points[i];
            const p2 = points[i + 1];
            
            const x1 = Math.floor((p1.x - minX) / this.gridSize) + padding;
            const y1 = Math.floor((p1.y - minY) / this.gridSize) + padding;
            const x2 = Math.floor((p2.x - minX) / this.gridSize) + padding;
            const y2 = Math.floor((p2.y - minY) / this.gridSize) + padding;
            
            // Dibujar línea entre puntos
            this.drawLine(x1, y1, x2, y2);
        }
        
        this.minX = minX;
        this.minY = minY;
        this.padding = padding;
    },
    
    drawLine(x1, y1, x2, y2) {
        // Algoritmo de Bresenham para marcar línea en el grid
        const dx = Math.abs(x2 - x1);
        const dy = Math.abs(y2 - y1);
        const sx = x1 < x2 ? 1 : -1;
        const sy = y1 < y2 ? 1 : -1;
        let err = dx - dy;
        
        while (true) {
            if (y1 >= 0 && y1 < this.grid.length && x1 >= 0 && x1 < this.grid[0].length) {
                this.grid[y1][x1] = 0;
                // Hacer el camino un poco más ancho
                if (x1 + 1 < this.grid[0].length) this.grid[y1][x1 + 1] = 0;
                if (y1 + 1 < this.grid.length) this.grid[y1 + 1][x1] = 0;
            }
            
            if (x1 === x2 && y1 === y2) break;
            
            const e2 = 2 * err;
            if (e2 > -dy) {
                err -= dy;
                x1 += sx;
            }
            if (e2 < dx) {
                err += dx;
                y1 += sy;
            }
        }
    },
    
    findStartEnd() {
        // Encontrar punto de inicio (primera celda abierta desde arriba-izquierda)
        let start = null;
        for (let y = 0; y < this.grid.length && !start; y++) {
            for (let x = 0; x < this.grid[0].length && !start; x++) {
                if (this.grid[y][x] === 0) {
                    start = {x, y};
                }
            }
        }
        
        // Encontrar punto final (última celda abierta desde abajo-derecha)
        let end = null;
        for (let y = this.grid.length - 1; y >= 0 && !end; y--) {
            for (let x = this.grid[0].length - 1; x >= 0 && !end; x--) {
                if (this.grid[y][x] === 0) {
                    end = {x, y};
                }
            }
        }
        
        return {start, end};
    },
    
    solveAStar() {
        Console.logSystem('Resolviendo con A*...');
        const {start, end} = this.findStartEnd();
        
        if (!start || !end) {
            Console.logError('No se encontró inicio o fin');
            return null;
        }
        
        const openSet = [start];
        const cameFrom = new Map();
        const gScore = new Map();
        const fScore = new Map();
        
        gScore.set(this.keyOf(start), 0);
        fScore.set(this.keyOf(start), this.heuristic(start, end));
        
        while (openSet.length > 0) {
            // Encontrar nodo con menor fScore
            let current = openSet[0];
            let currentIdx = 0;
            for (let i = 1; i < openSet.length; i++) {
                if (fScore.get(this.keyOf(openSet[i])) < fScore.get(this.keyOf(current))) {
                    current = openSet[i];
                    currentIdx = i;
                }
            }
            
            if (current.x === end.x && current.y === end.y) {
                return this.reconstructPath(cameFrom, current);
            }
            
            openSet.splice(currentIdx, 1);
            
            const neighbors = this.getNeighbors(current);
            for (const neighbor of neighbors) {
                const tentativeGScore = gScore.get(this.keyOf(current)) + 1;
                const neighborKey = this.keyOf(neighbor);
                
                if (!gScore.has(neighborKey) || tentativeGScore < gScore.get(neighborKey)) {
                    cameFrom.set(neighborKey, current);
                    gScore.set(neighborKey, tentativeGScore);
                    fScore.set(neighborKey, tentativeGScore + this.heuristic(neighbor, end));
                    
                    if (!openSet.some(n => n.x === neighbor.x && n.y === neighbor.y)) {
                        openSet.push(neighbor);
                    }
                }
            }
        }
        
        Console.logError('No se encontró solución');
        return null;
    },
    
    solveDijkstra() {
        Console.logSystem('Resolviendo con Dijkstra...');
        const {start, end} = this.findStartEnd();
        
        if (!start || !end) {
            Console.logError('No se encontró inicio o fin');
            return null;
        }
        
        const distances = new Map();
        const previous = new Map();
        const unvisited = [];
        
        for (let y = 0; y < this.grid.length; y++) {
            for (let x = 0; x < this.grid[0].length; x++) {
                if (this.grid[y][x] === 0) {
                    const node = {x, y};
                    distances.set(this.keyOf(node), Infinity);
                    unvisited.push(node);
                }
            }
        }
        
        distances.set(this.keyOf(start), 0);
        
        while (unvisited.length > 0) {
            // Encontrar nodo no visitado con menor distancia
            let current = unvisited[0];
            let currentIdx = 0;
            for (let i = 1; i < unvisited.length; i++) {
                if (distances.get(this.keyOf(unvisited[i])) < distances.get(this.keyOf(current))) {
                    current = unvisited[i];
                    currentIdx = i;
                }
            }
            
            if (current.x === end.x && current.y === end.y) {
                return this.reconstructPathDijkstra(previous, current);
            }
            
            unvisited.splice(currentIdx, 1);
            
            const neighbors = this.getNeighbors(current);
            for (const neighbor of neighbors) {
                const alt = distances.get(this.keyOf(current)) + 1;
                const neighborKey = this.keyOf(neighbor);
                
                if (alt < distances.get(neighborKey)) {
                    distances.set(neighborKey, alt);
                    previous.set(neighborKey, current);
                }
            }
        }
        
        Console.logError('No se encontró solución');
        return null;
    },
    
    solveBFS() {
        Console.logSystem('Resolviendo con BFS...');
        const {start, end} = this.findStartEnd();
        
        if (!start || !end) {
            Console.logError('No se encontró inicio o fin');
            return null;
        }
        
        const queue = [start];
        const visited = new Set([this.keyOf(start)]);
        const previous = new Map();
        
        while (queue.length > 0) {
            const current = queue.shift();
            
            if (current.x === end.x && current.y === end.y) {
                return this.reconstructPathDijkstra(previous, current);
            }
            
            const neighbors = this.getNeighbors(current);
            for (const neighbor of neighbors) {
                const key = this.keyOf(neighbor);
                if (!visited.has(key)) {
                    visited.add(key);
                    previous.set(key, current);
                    queue.push(neighbor);
                }
            }
        }
        
        Console.logError('No se encontró solución');
        return null;
    },
    
    getNeighbors(node) {
        const neighbors = [];
        const directions = [
            {x: 0, y: -1}, // arriba
            {x: 1, y: 0},  // derecha
            {x: 0, y: 1},  // abajo
            {x: -1, y: 0}  // izquierda
        ];
        
        for (const dir of directions) {
            const x = node.x + dir.x;
            const y = node.y + dir.y;
            
            if (y >= 0 && y < this.grid.length && 
                x >= 0 && x < this.grid[0].length && 
                this.grid[y][x] === 0) {
                neighbors.push({x, y});
            }
        }
        
        return neighbors;
    },
    
    heuristic(a, b) {
        // Distancia Manhattan
        return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
    },
    
    keyOf(node) {
        return `${node.x},${node.y}`;
    },
    
    reconstructPath(cameFrom, current) {
        const path = [current];
        let currentKey = this.keyOf(current);
        
        while (cameFrom.has(currentKey)) {
            current = cameFrom.get(currentKey);
            path.unshift(current);
            currentKey = this.keyOf(current);
        }
        
        return this.gridPathToCoords(path);
    },
    
    reconstructPathDijkstra(previous, current) {
        const path = [current];
        let currentKey = this.keyOf(current);
        
        while (previous.has(currentKey)) {
            current = previous.get(currentKey);
            path.unshift(current);
            currentKey = this.keyOf(current);
        }
        
        return this.gridPathToCoords(path);
    },
    
    gridPathToCoords(gridPath) {
        // Convertir coordenadas de grid a coordenadas reales (cm)
        return gridPath.map(node => ({
            x: this.minX + (node.x - this.padding) * this.gridSize,
            y: this.minY + (node.y - this.padding) * this.gridSize
        }));
    },
    
    solve(algorithm = 'astar') {
        if (Maze.points.length < 2) {
            Console.logError('Carga primero un laberinto');
            return null;
        }
        
        if (!this.init(Maze.points, 0.5)) {
            return null;
        }
        
        let solution = null;
        const startTime = performance.now();
        
        switch (algorithm) {
            case 'astar':
                solution = this.solveAStar();
                break;
            case 'dijkstra':
                solution = this.solveDijkstra();
                break;
            case 'bfs':
                solution = this.solveBFS();
                break;
            default:
                Console.logError('Algoritmo desconocido');
                return null;
        }
        
        const endTime = performance.now();
        const time = (endTime - startTime).toFixed(2);
        
        if (solution) {
            this.solution = solution;
            Console.logSystem(`Solución encontrada en ${time}ms - ${solution.length} pasos`);
            return solution;
        }
        
        return null;
    }
};

// Inicializar cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
    // Ya inicializado
});
