# chess app

This is a simple app that to play chess. It features a minimal board design,
familiar board pieces "inspired by" (downloaded from) Lichess,
and about 80% feature completeness with the actual game.

## features complete

- all pieces move as expected
- turn order enforced
- multiplayer works
- resigning and drawing works
- moves on the opponent are properly mirrored
- selecting a piece shows legal moves

## todo
- check and legal-move filtering
- checkmate and forced draw detection
- pawn promotion
- castling

Ultimately, this experience mirrors a "over-the-table" real-time chess experience rather than a feature-complete Chess.com or Lichess replacement.

## technical details

The backend is written using Elysia.JS and the frontend is a pure HTML5 app. It is recommended to use the `bun` javascript runtime.

To start the server, `bun run dev` in the `server/` directory.

To start the client, use your favorite static file server with the `client/` directory as the working directory. I personally recommend `bunx live-server`.
