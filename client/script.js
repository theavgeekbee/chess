const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
let gameState = Array.from({length: 8}, () =>  Array(8).fill(""));

const pieces = ["bB", "bK", "bN", "bP", "bQ", "bR", "wB", "wK", "wN", "wP", "wQ", "wR"];
let pieceImages = {};

const files = ["a", "b", "c", "d", "e", "f", "g", "h"];
const ranks = ["1", "2", "3", "4", "5", "6", "7", "8"];

let clicked_square = undefined;

function drawBoard() {
    for (let i = 0; i < 8; i++) {
        for (let j = 0; j < 8; j++) {
            if (clicked_square && i == clicked_square[0] && j == clicked_square[1]) {
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

    if (!clicked_square || !clicked_square.every((val, index) => val === coord[index])) {
        clicked_square = coord;
    } else {
        clicked_square = undefined;
    }
});

initGame();
