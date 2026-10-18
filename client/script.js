const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
let gameState = Array.from({length: 8}, () =>  Array(8).fill(""));

const pieces = ["bB", "bK", "bN", "bP", "bQ", "bR", "wB", "wK", "wN", "wP", "wQ", "wR"];
let pieceImages = {};

const files = ["a", "b", "c", "d", "e", "f", "g", "h"];
const ranks = ["1", "2", "3", "4", "5", "6", "7", "8"];

let clicked_square = undefined;

let lastMove = undefined;

function isValidMove(pieceI, pieceJ, tryI, tryJ) {
    return getPossibleMoves(pieceI, pieceJ).some(pos => pos[0] == tryI && pos[1] == tryJ);
}

function getPossibleMoves(i, j) {
    const piece = gameState[i][j];
    if (!piece) return [];

    const color = piece[0]; // 'b' or 'w'
    const type = piece[1];  // 'K', 'Q', 'R', 'B', 'N', 'P'

    const moves = [];

    const inside = (x, y) =>
        x >= 0 && x < 8 && y >= 0 && y < 8;

    const isEnemy = (x, y) =>
        gameState[x][y] && gameState[x][y][0] !== color;

    const isEmpty = (x, y) => !gameState[x][y];

    // Add a destination if it is empty or contains an enemy.
    const addMove = (x, y) => {
        if (!inside(x, y)) return false;

        if (isEmpty(x, y)) {
            moves.push([x, y]);
            return true; // Can continue in this direction
        }

        if (isEnemy(x, y)) {
            moves.push([x, y]);
        }

        return false; // A piece blocks further movement
    };

    // Sliding pieces: bishop, rook, queen
    const slide = (directions) => {
        for (const [di, dj] of directions) {
            let x = i + di;
            let y = j + dj;

            while (inside(x, y)) {
                if (!addMove(x, y)) break;
                x += di;
                y += dj;
            }
        }
    };

    if (type === "N") {
        // Knight
        const offsets = [
            [2, 1], [2, -1], [-2, 1], [-2, -1],
            [1, 2], [1, -2], [-1, 2], [-1, -2]
        ];

        for (const [di, dj] of offsets) {
            const x = i + di;
            const y = j + dj;

            if (inside(x, y) &&
                (isEmpty(x, y) || isEnemy(x, y))) {
                moves.push([x, y]);
            }
        }
    }

    else if (type === "K") {
        // King
        for (let di = -1; di <= 1; di++) {
            for (let dj = -1; dj <= 1; dj++) {
                if (di === 0 && dj === 0) continue;

                const x = i + di;
                const y = j + dj;

                if (inside(x, y) &&
                    (isEmpty(x, y) || isEnemy(x, y))) {
                    moves.push([x, y]);
                }
            }
        }
    }

    else if (type === "B") {
        slide([[1, 1], [1, -1], [-1, 1], [-1, -1]]);
    }

    else if (type === "R") {
        slide([[1, 0], [-1, 0], [0, 1], [0, -1]]);
    }

    else if (type === "Q") {
        slide([
            [1, 0], [-1, 0], [0, 1], [0, -1],
            [1, 1], [1, -1], [-1, 1], [-1, -1]
        ]);
    }

    else if (type === "P") {
        // White pawns move toward increasing i.
        // Black pawns move toward decreasing i.
        const dir = color === "w" ? 1 : -1;
        const startRank = color === "w" ? 1 : 6;

        // One square forward
        const nextI = i + dir;

        if (inside(nextI, j) && isEmpty(nextI, j)) {
            moves.push([nextI, j]);

            // Two squares from starting rank
            const twoI = i + 2 * dir;

            if (i === startRank && isEmpty(twoI, j)) {
                moves.push([twoI, j]);
            }
        }

        // Diagonal captures
        for (const dj of [-1, 1]) {
            const x = i + dir;
            const y = j + dj;

            if (inside(x, y) && isEnemy(x, y)) {
                moves.push([x, y]);
            }
        }

        if (
            lastMove &&
            lastMove.piece === (color === "w" ? "bP" : "wP") &&
            lastMove.from[0] === i + 2 * (-dir) &&
            lastMove.to[0] === i &&
            lastMove.to[1] === y &&
            lastMove.from[1] === y &&
            isEmpty(x, y)
        ) {
            moves.push([x, y]);
        }
    }

    return moves;
}

function drawBoard() {
    for (let i = 0; i < 8; i++) {
        for (let j = 0; j < 8; j++) {
            if (clicked_square 
                && i == clicked_square[0]
                && j == clicked_square[1]
                && gameState[i][j] == "") {
                ctx.fillStyle = "#ff9f05";
            } else if ((i + j) % 2 == 0) {
                ctx.fillStyle = "#769656";
            } else {
                ctx.fillStyle = "#eeeed2";
            }
            ctx.fillRect(50 * j, 400 - (50 * (i + 1)), 50, 50);

            if (gameState[i][j] != "") {
                ctx.drawImage(
                    pieceImages[gameState[i][j]],
                    50 * j,
                    400 - (50 * (i + 1)),
                    50,
                    50
                );
            }
        }
    }

    if (clicked_square && gameState[clicked_square[0]][clicked_square[1]] != "") {
        const moves = getPossibleMoves(clicked_square[0], clicked_square[1]);
        for (const move of moves) {
            ctx.fillStyle = "#00000044";
            const squareLeft = 50 * move[1];
            const squareTop = 400 - (50 * (move[0] + 1));
            if (gameState[move[0]][move[1]] == "") {
                ctx.beginPath();
                ctx.arc(squareLeft + 25, squareTop + 25, 10, 0, 2 * Math.PI);
                ctx.fill();
            } else {
                ctx.beginPath();
                ctx.moveTo(squareLeft, squareTop);
                ctx.lineTo(squareLeft + 15, squareTop);
                ctx.lineTo(squareLeft, squareTop + 15);
                ctx.closePath();
                ctx.fill();

                ctx.beginPath();
                ctx.moveTo(squareLeft + 50, squareTop);
                ctx.lineTo(squareLeft + 35, squareTop);
                ctx.lineTo(squareLeft + 50, squareTop + 15);
                ctx.closePath();
                ctx.fill();

                ctx.beginPath();
                ctx.moveTo(squareLeft + 50, squareTop + 50);
                ctx.lineTo(squareLeft + 35, squareTop + 50);
                ctx.lineTo(squareLeft + 50, squareTop + 35);
                ctx.closePath();
                ctx.fill();

                ctx.beginPath();
                ctx.moveTo(squareLeft, squareTop + 50);
                ctx.lineTo(squareLeft + 15, squareTop + 50);
                ctx.lineTo(squareLeft, squareTop + 35);
                ctx.closePath();
                ctx.fill();
            }
        }
    }

    requestAnimationFrame(drawBoard);
}

function loadImage(src) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => resolve(img);
        img.onerror = (err) => reject(err);
        img.src = src;
    })
}

async function initGame() {
    ctx.fillStyle = "black";
    ctx.lineWidth = 2;
    ctx.fillText("loading game pieces....", 0, 50);
    const promises = pieces.map(async (val) => {
        const img = await loadImage(`assets/${val}.svg`);
        return [val, img];
    });

    const resolvedPairs = await Promise.all(promises);
    pieceImages = Object.fromEntries(resolvedPairs);

    gameState[0] = ["wR", "wN", "wB", "wQ", "wK", "wB", "wN", "wR"];
    gameState[1] = Array(8).fill("wP");

    gameState[6] = Array(8).fill("bP");
    gameState[7] = ["bR", "bN", "bB", "bQ", "bK", "bB", "bN", "bR"];

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawBoard();
}

canvas.addEventListener('click', (e) => {
    e.preventDefault();

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const row = Math.floor((400 - y) / 50);
    const col = Math.floor(x / 50);
    const coord = [row, col];
    if (clicked_square
        && gameState[clicked_square[0]][clicked_square[1]] != ""
        && isValidMove(clicked_square[0], clicked_square[1], row, col)) {
        gameState[row][col] = gameState[clicked_square[0]][clicked_square[1]];
        gameState[clicked_square[0]][clicked_square[1]] = "";
        clicked_square = undefined;
    }

    if (!clicked_square || !clicked_square.every((val, index) => val === coord[index])) {
        clicked_square = coord;
    } else {
        clicked_square = undefined;
    }
});

initGame();
