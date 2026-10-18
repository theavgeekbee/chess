import { Elysia } from "elysia";
import { cors } from "@elysiajs/cors";
import { randomBytes, randomInt } from "node:crypto";

type Color = "white" | "black";

type Coordinate = {
  x: number;
  y: number;
};

type Move = {
  from: Coordinate;
  to: Coordinate;
};

type Player = {
  id: string;
  username: string;
  color?: Color;
  ready: boolean;
    socket: WebSocket;
};

type Room = {
    id: string;
    players: Map<string, Player>;
    status: "waiting" | "playing" | "ended";
    turn: Color;
    drawRequests: Set<string>;
    moveNumber: number;
};

type ClientMessage =
| { type: "register"; username: string }
| { type: "ready" }
| { type: "move"; move: Move }
| { type: "resign" }
| { type: "draw_request" }
| { type: "draw_cancel" };

const rooms = new Map<string, Room>();

function createRoomId(): string {
    let id: string;

    do {
        id = randomBytes(4).toString("base64url").slice(0, 6);
    } while (rooms.has(id));

    return id;
}

function createRoom(): Room {
    const id = createRoomId();

    const room: Room = {
        id,
        players: new Map(),
        status: "waiting",
        turn: "white",
        drawRequests: new Set(),
        moveNumber: 0,
    };

    rooms.set(id, room);
    return room;
}

function send(socket: WebSocket, data: unknown): void {
    if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify(data));
    }
}

function sendToPlayer(player: Player, data: unknown): void {
    send(player.socket, data);
}

function broadcast(room: Room, data: unknown): void {
    for (const player of room.players.values()) {
        sendToPlayer(player, data);
    }
}

function broadcastExcept(
    room: Room,
    excludedPlayerId: string,
    data: unknown,
): void {
    for (const player of room.players.values()) {
        if (player.id !== excludedPlayerId) {
            sendToPlayer(player, data);
        }
    }
}

function getPlayer(room: Room, playerId: string): Player | undefined {
    return room.players.get(playerId);
}

function endGame(
    room: Room,
    reason: "resignation" | "draw" | "disconnect",
    winner?: Color,
): void {
    if (room.status === "ended") return;

    room.status = "ended";

    broadcast(room, {
        type: "game_over",
        reason,
        winner: winner ?? null,
    });
}

function startGame(room: Room): void {
    if (room.status !== "waiting" || room.players.size !== 2) return;

    const players = [...room.players.values()];

    if (players.some((player) => !player.ready || !player.username)) {
        return;
    }

    const firstColor: Color = randomInt(2) === 0 ? "white" : "black";
    const secondColor: Color = firstColor === "white" ? "black" : "white";

    players[0].color = firstColor;
    players[1].color = secondColor;

    room.status = "playing";
    room.turn = "white";
    room.moveNumber = 0;

    for (const player of players) {
        sendToPlayer(player, {
            type: "game_start",
            color: player.color,
            opponent: players.find((other) => other.id !== player.id)!.username,
            turn: "white",
        });
    }
}

function isCoordinate(value: unknown): value is Coordinate {
    if (typeof value !== "object" || value === null) return false;

    const coordinate = value as Record<string, unknown>;

    return (
        Number.isInteger(coordinate.x) &&
            Number.isInteger(coordinate.y) &&
            (coordinate.x as number) >= 0 &&
            (coordinate.x as number) <= 7 &&
            (coordinate.y as number) >= 0 &&
            (coordinate.y as number) <= 7
    );
}

function isValidMove(value: unknown): value is Move {
    if (typeof value !== "object" || value === null) return false;

    const move = value as Record<string, unknown>;

    return (
        isCoordinate(move.from) &&
            isCoordinate(move.to) &&
            (move.from.x !== move.to.x || move.from.y !== move.to.y)
    );
}

function handleMessage(
    room: Room,
    player: Player,
    rawMessage: string | Buffer,
): void {
    let message: ClientMessage;

    try {
        message = JSON.parse(rawMessage.toString()) as ClientMessage;
    } catch {
        send(player.socket, {
            type: "error",
            message: "Invalid JSON message.",
        });
        return;
    }

    if (!message || typeof message !== "object" || !("type" in message)) {
        send(player.socket, {
            type: "error",
            message: "Invalid message format.",
        });
        return;
    }

    // Registration must happen before any other player action.
    if (!player.username && message.type !== "register") {
        send(player.socket, {
            type: "error",
            message: "Register with a username first.",
        });
        return;
    }

    switch (message.type) {
        case "register": {
            if (player.username) {
                send(player.socket, {
                    type: "error",
                    message: "Already registered.",
                });
                return;
            }

            if (typeof message.username !== "string") {
                send(player.socket, {
                    type: "error",
                    message: "Username must be a string.",
                });
                return;
            }

            const username = message.username.trim();

            if (username.length < 1 || username.length > 24) {
                send(player.socket, {
                    type: "error",
                    message: "Username must contain 1–24 characters.",
                });
                return;
            }

            player.username = username;

            // Notify all players, including the registering player.
            broadcast(room, {
                type: "player_joined",
                playerId: player.id,
                username: player.username,
            });

            return;
        }

        case "ready": {
            if (room.status !== "waiting") {
                send(player.socket, {
                    type: "error",
                    message: "The room is not waiting for players.",
                });
                return;
            }

            player.ready = true;

            broadcast(room, {
                type: "player_ready",
                playerId: player.id,
                username: player.username,
            });

            startGame(room);
            return;
        }

        case "move": {
            if (room.status !== "playing") {
                send(player.socket, {
                    type: "error",
                    message: "The game is not in progress.",
                });
                return;
            }

            if (!player.color || player.color !== room.turn) {
                send(player.socket, {
                    type: "error",
                    message: "It is not your turn.",
                });
                return;
            }

            if (!isValidMove(message.move)) {
                send(player.socket, {
                    type: "error",
                    message: "Invalid move coordinates.",
                });
                return;
            }

            const move = message.move;

            // Relay the move to the opponent.
            broadcastExcept(room, player.id, {
                type: "move",
                playerId: player.id,
                username: player.username,
                color: player.color,
                move: {
                    from: { x: move.from.x, y: move.from.y },
                    to: { x: move.to.x, y: move.to.y },
                },
                moveNumber: ++room.moveNumber,
            });

            room.turn = room.turn === "white" ? "black" : "white";

            // Inform both players whose turn it is.
            broadcast(room, {
                type: "turn_changed",
                turn: room.turn,
            });

            return;
        }

        case "resign": {
            if (room.status !== "playing") {
                send(player.socket, {
                    type: "error",
                    message: "There is no active game to resign from.",
                });
                return;
            }

            const winner = player.color === "white" ? "black" : "white";

            endGame(room, "resignation", winner);
            return;
        }

        case "draw_request": {
            if (room.status !== "playing") {
                send(player.socket, {
                    type: "error",
                    message: "There is no active game.",
                });
                return;
            }

            if (room.drawRequests.has(player.id)) {
                send(player.socket, {
                    type: "draw_status",
                    status: "pending",
                    message: "Your draw request is already pending.",
                });
                return;
            }

            room.drawRequests.add(player.id);

            const otherPlayer = [...room.players.values()].find(
                (other) => other.id !== player.id,
            );

            if (otherPlayer && room.drawRequests.has(otherPlayer.id)) {
                endGame(room, "draw");
                return;
            }

            send(player.socket, {
                type: "draw_status",
                status: "pending",
            });

            broadcastExcept(room, player.id, {
                type: "draw_requested",
                playerId: player.id,
                username: player.username,
            });

            return;
        }

        case "draw_cancel": {
            if (room.status !== "playing") {
                send(player.socket, {
                    type: "error",
                    message: "There is no active game.",
                });
                return;
            }

            if (!room.drawRequests.has(player.id)) {
                send(player.socket, {
                    type: "error",
                    message: "You do not have a pending draw request.",
                });
                return;
            }

            room.drawRequests.delete(player.id);

            broadcast(room, {
                type: "draw_cancelled",
                playerId: player.id,
                username: player.username,
            });

            return;
        }

        default: {
            send(player.socket, {
                type: "error",
                message: "Unknown message type.",
            });
        }
    }
}

const app = new Elysia()
.use(cors())
.post("/create_room", () => {
    const room = createRoom();

    return {
        room_id: room.id,
    };
})
.ws("/join_room/:room_id", {
    open(ws) {
        const roomId = ws.data.params.room_id;
        const room = rooms.get(roomId);

        if (!room) {
            ws.send(
                JSON.stringify({
                    type: "error",
                    message: "Room not found.",
                }),
            );
            ws.close();
            return;
        }

        if (room.status !== "waiting" || room.players.size >= 2) {
            ws.send(
                JSON.stringify({
                    type: "error",
                    message: "Room is full or the game has already started.",
                }),
            );
            ws.close();
            return;
        }

        const playerId = randomBytes(8).toString("hex");

        const player: Player = {
            id: playerId,
            username: "",
            ready: false,
            socket: ws as unknown as WebSocket,
        };

        room.players.set(playerId, player);

        // Attach the player ID to this connection for message/close handlers.
        (ws.data as typeof ws.data & { playerId?: string }).playerId =
            playerId;

        send(player.socket, {
            type: "joined_room",
            roomId: room.id,
            playerId,
            players: room.players.size,
        });

        broadcast(room, {
            type: "room_status",
            players: room.players.size,
            capacity: 2,
        });
    },

    message(ws, message) {
        const roomId = ws.data.params.room_id;
        const room = rooms.get(roomId);

        if (!room) return;

        const playerId = (
            ws.data as typeof ws.data & { playerId?: string }
        ).playerId;

        if (!playerId) return;

        const player = getPlayer(room, playerId);

        if (!player) return;

        handleMessage(
            room,
            player,
            typeof message === "string" || Buffer.isBuffer(message)
                ? message
                : JSON.stringify(message),
        );
    },

    close(ws) {
        const roomId = ws.data.params.room_id;
        const room = rooms.get(roomId);

        if (!room) return;

        const playerId = (
            ws.data as typeof ws.data & { playerId?: string }
        ).playerId;

        if (!playerId) return;

        const player = room.players.get(playerId);

        if (!player) return;

        room.players.delete(playerId);
        room.drawRequests.delete(playerId);

        if (room.status === "playing") {
            const winner = player.color === "white" ? "black" : "white";

            endGame(room, "disconnect", winner);
        }

        broadcast(room, {
            type: "player_left",
            playerId,
            username: player.username || null,
            players: room.players.size,
        });

        // Keep completed games available for reconnects/inspection if desired;
        // otherwise remove empty rooms to reclaim memory.
        if (room.players.size === 0) {
            rooms.delete(room.id);
        }
    },
})
.listen(3000);

console.log(`Chess server running at ${app.server?.hostname}:${app.server?.port}`);
