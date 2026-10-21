const SERVER_HOST = "localhost:3000";
const HTTP_URL = `http://${SERVER_HOST}`;
const WS_URL = `ws://${SERVER_HOST}`;

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
let gameState = Array.from({length: 8}, () =>  Array(8).fill(""));

const pieces = ["bB", "bK", "bN", "bP", "bQ", "bR", "wB", "wK", "wN", "wP", "wQ", "wR"];
let pieceImages = {};

const files = ["a", "b", "c", "d", "e", "f", "g", "h"];
const ranks = ["1", "2", "3", "4", "5", "6", "7", "8"];

let clicked_square = undefined;
let lastMove = undefined;
let turn = "w";
let playAs = "w";

// ---- Network / session state ----
let socket = undefined;
let roomId = undefined;
let myPlayerId = undefined;
let username = undefined;
let opponentName = undefined;
let gameActive = false;   // true only between game_start and game_over
let flipped = false;      // draw the board from black's perspective

// Server uses "white"/"black", the client uses "w"/"b".
const toClientColor = (c) => (c === "white" ? "w" : "b");
const colorName = (c) => (c === "w" ? "white" : "black");

// Server coordinates: x = file (column j), y = rank index (row i).
const toServerCoord = (i, j) => ({ x: j, y: i });
const fromServerCoord = (c) => [c.y, c.x];

// Shows a message in an element with id="status" if the page has one.
function setStatus(text) {
    console.log(`[status] ${text}`);
    const el = document.getElementById("status");
    if (el) el.textContent = text;
}

function isValidMove(pieceI, pieceJ, tryI, tryJ) {
    return getPossibleMoves(pieceI, pieceJ).some(pos => pos[0] == tryI && pos[1] == tryJ);
}

function move(originI, originJ, destI, destJ) {
    if (gameState[originI][originJ].endsWith("P")
        && destJ != originJ
        && gameState[destI][destJ] === "") {
        const fwd = gameState[originI][originJ][0] === "w" ? 1 : -1;
        gameState[destI - fwd][destJ] = "";
    }

    gameState[destI][destJ] = gameState[originI][originJ];
    gameState[originI][originJ] = "";

    lastMove = {
        piece: gameState[destI][destJ],
        from: [originI, originJ],
        to: [destI, destJ]
    };

    turn = turn === "w" ? "b" : "w";
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
        const dir = color === "w" ? 1 : -1;
        const startRank = color === "w" ? 1 : 6;

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

        // En passant (the enemy pawn must also be directly beside this pawn)
        if (
            lastMove &&
            lastMove.piece === (color === "w" ? "bP" : "wP") &&
            lastMove.from[0] === i + dir * 2 &&
            lastMove.to[0] === i &&
            Math.abs(lastMove.to[1] - j) === 1
        ) {
            moves.push([lastMove.from[0] - dir, lastMove.to[1]]);
        }
    }

    return moves;
}

// Board square (row i, col j) -> top-left pixel, respecting orientation.
function squareToPixel(i, j) {
    const col = flipped ? 7 - j : j;
    const rowFromTop = flipped ? i : 7 - i;
    return [50 * col, 50 * rowFromTop];
}

// Pixel -> board square [i, j], or undefined if outside the board.
function pixelToSquare(x, y) {
    const c = Math.floor(x / 50);
    const r = Math.floor(y / 50);
    if (c < 0 || c > 7 || r < 0 || r > 7) return undefined;
    return [flipped ? r : 7 - r, flipped ? 7 - c : c];
}

function drawBoard() {
    for (let i = 0; i < 8; i++) {
        for (let j = 0; j < 8; j++) {
            const [px, py] = squareToPixel(i, j);

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
            ctx.fillRect(px, py, 50, 50);

            if (gameState[i][j] != "") {
                ctx.drawImage(pieceImages[gameState[i][j]], px, py, 50, 50);
            }
        }
    }

    if (clicked_square
        && gameActive
        && turn === playAs
        && gameState[clicked_square[0]][clicked_square[1]] != ""
        && gameState[clicked_square[0]][clicked_square[1]][0] === playAs) {
        const moves = getPossibleMoves(clicked_square[0], clicked_square[1]);
        for (const mv of moves) {
            ctx.fillStyle = "#00000044";
            const [squareLeft, squareTop] = squareToPixel(mv[0], mv[1]);
            if (gameState[mv[0]][mv[1]] == "") {
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

function resetBoard() {
    gameState = Array.from({length: 8}, () => Array(8).fill(""));

    gameState[0] = ["wR", "wN", "wB", "wQ", "wK", "wB", "wN", "wR"];
    gameState[1] = Array(8).fill("wP");

    gameState[6] = Array(8).fill("bP");
    gameState[7] = ["bR", "bN", "bB", "bQ", "bK", "bB", "bN", "bR"];

    clicked_square = undefined;
    lastMove = undefined;
    turn = "w";
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

    resetBoard();

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawBoard();
}

// ---------------------------------------------------------------------------
// Networking
// ---------------------------------------------------------------------------

function sendMessage(data) {
    if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify(data));
    }
}

function leaveRoom() {
    if (socket) {
        socket.onclose = null;
        socket.close();
    }
    socket = undefined;
    roomId = undefined;
    myPlayerId = undefined;
    gameActive = false;
}

function joinRoom(id) {
    leaveRoom();

    const name = prompt("Choose a username (1-24 characters):", username ?? "");
    if (name === null || name.trim() === "") return;
    username = name.trim().slice(0, 24);

    roomId = id.trim();
    resetBoard();
    flipped = false;
    playAs = "w";
    opponentName = undefined;

    setStatus(`Connecting to room ${roomId}...`);
    socket = new WebSocket(`${WS_URL}/join_room/${encodeURIComponent(roomId)}`);

    socket.onmessage = (event) => {
        let msg;
        try {
            msg = JSON.parse(event.data);
        } catch {
            console.warn("Received non-JSON message", event.data);
            return;
        }
        handleServerMessage(msg);
    };

    socket.onerror = () => setStatus("Connection error.");

    socket.onclose = () => {
        if (gameActive) {
            gameActive = false;
            setStatus("Disconnected from the server.");
        }
    };
}

function handleServerMessage(msg) {
    switch (msg.type) {
        case "joined_room": {
            myPlayerId = msg.playerId;
            setStatus(`Joined room ${msg.roomId}. Share this code with your opponent.`);
            document.getElementById("room").innerHTML = `you are in room ${msg.roomId}, playing as ${username}`;
            // Register right away, then mark ready. The server processes
            // messages in order, so this is safe to send back-to-back.
            sendMessage({ type: "register", username });
            sendMessage({ type: "ready" });
            break;
        }

        case "room_status": {
            if (!gameActive) {
                setStatus(msg.players < msg.capacity
                    ? `Room ${roomId}: waiting for an opponent (${msg.players}/${msg.capacity})...`
                    : `Room ${roomId}: opponent connected, waiting to start...`);
            }
            break;
        }

        case "player_joined":
        case "player_ready":
            // Informational only.
            break;

        case "game_start": {
            resetBoard();
            playAs = toClientColor(msg.color);
            flipped = playAs === "b";
            turn = toClientColor(msg.turn);
            opponentName = msg.opponent;
            gameActive = true;
            
            document.getElementById("resign").disabled = false;
            document.getElementById("draw").disabled = false;

            setStatus(`Game started vs ${opponentName}. You are ${colorName(playAs)}.` +
                (turn === playAs ? " Your move." : " Waiting for opponent..."));
            break;
        }

        case "move": {
            // Opponent's move (the server does not echo moves back to the sender).
            const [fromI, fromJ] = fromServerCoord(msg.move.from);
            const [toI, toJ] = fromServerCoord(msg.move.to);
            if (!gameState[fromI][fromJ]) {
                console.warn("Opponent moved from an empty square; state is out of sync", msg);
                break;
            }
            move(fromI, fromJ, toI, toJ);
            clicked_square = undefined;
            break;
        }

        case "turn_changed": {
            // The server is the source of truth for whose turn it is.
            turn = toClientColor(msg.turn);
            if (gameActive) {
                setStatus(turn === playAs ? "Your move." : `Waiting for ${opponentName}...`);
            }
            break;
        }

        case "game_over": {
            gameActive = false;
            clicked_square = undefined;
            let text;
            if (msg.reason === "draw") {
                text = "Game drawn by agreement.";
            } else {
                const won = msg.winner && toClientColor(msg.winner) === playAs;
                const how = msg.reason === "resignation"
                    ? (won ? "your opponent resigned" : "you resigned")
                    : "your opponent disconnected";
                text = won ? `You win (${how}).` : `You lose (${how}).`;
            }
            setStatus(text);
            document.getElementById("resign").disabled = true;
            document.getElementById("draw").disabled = true;
            // Let the final frame render before blocking with alert().
            setTimeout(() => alert(text), 50);
            break;
        }

        case "draw_requested": {
            // Accepting = sending our own draw request; the server ends the
            // game when both players have requested one.
            setTimeout(() => {
                if (!gameActive) return;
                if (confirm(`${msg.username || "Your opponent"} offers a draw. Accept?`)) {
                    sendMessage({ type: "draw_request" });
                }
            }, 50);
            setStatus("Your opponent has offered a draw.");
            break;
        }

        case "draw_status": {
            if (msg.status === "pending") setStatus("Draw offer sent. Waiting for a reply...");
            break;
        }

        case "draw_cancelled": {
            setStatus("The draw offer was withdrawn.");
            break;
        }

        case "player_left": {
            if (!gameActive) {
                setStatus(`${msg.username || "A player"} left the room.`);
            }
            break;
        }

        case "error": {
            console.warn("Server error:", msg.message);
            setStatus(`Error: ${msg.message}`);
            break;
        }

        default:
            console.warn("Unhandled server message", msg);
    }
}

function resign() {
    if (gameActive && confirm("Resign this game?")) {
        sendMessage({ type: "resign" });
    }
}

function offerDraw() {
    if (gameActive) sendMessage({ type: "draw_request" });
}

function cancelDrawOffer() {
    if (gameActive) sendMessage({ type: "draw_cancel" });
}

function showJoinPrompt() {
    const id = prompt("Enter a room you would like to join:");
    if (id !== null && id.trim() !== "") {
        joinRoom(id);
    }
}

function createRoom() {
    fetch(`${HTTP_URL}/create_room`, { method: "POST" })
        .then(res => res.json())
        .then(data => joinRoom(data['room_id']))
        .catch(err => alert(`An error occurred: ${err}`))
}

canvas.addEventListener('click', (e) => {
    e.preventDefault();

    const rect = canvas.getBoundingClientRect();
    const coord = pixelToSquare(e.clientX - rect.left, e.clientY - rect.top);
    if (!coord) return;
    const [row, col] = coord;

    if (clicked_square
        && gameActive
        && turn === playAs
        && gameState[clicked_square[0]][clicked_square[1]] != ""
        && gameState[clicked_square[0]][clicked_square[1]][0] === playAs
        && isValidMove(clicked_square[0], clicked_square[1], row, col)) {
        const [fromI, fromJ] = clicked_square;
        move(fromI, fromJ, row, col);
        sendMessage({
            type: "move",
            move: {
                from: toServerCoord(fromI, fromJ),
                to: toServerCoord(row, col)
            }
        });
        clicked_square = undefined;
        return;
    }

    if (!clicked_square || !clicked_square.every((val, index) => val === coord[index])) {
        clicked_square = coord;
    } else {
        clicked_square = undefined;
    }
});

initGame();
