# Publish Kyrevant for free on Render

The deployment is one Node web service serving both the game and Socket.IO. Do not choose Static Site, GitHub Pages, or a static-only host for the multiplayer server.

## GitHub repository

The browser edition lives in `contest-web/` in https://github.com/mdelphia85/Kyrevant. The existing Unity files remain at the repository root.

## Render setup

1. Sign up at https://dashboard.render.com with GitHub and authorize access to the Kyrevant repository.
2. Create **New > Web Service** and connect `mdelphia85/Kyrevant` on branch `main`.
3. Set **Root Directory** to `contest-web`.
4. Runtime: **Node**. Build command: `npm ci --include=dev && npm run build`. Start command: `npm start`.
5. Instance type: **Free**. Set `NODE_VERSION=22` and `NODE_ENV=production`. Health check path: `/healthz`.
6. Deploy. Render supplies `PORT` and `RENDER_EXTERNAL_URL` automatically. Do not set VITE_SERVER_URL or manually enter port 3001.
7. Share the resulting `https://<your-service>.onrender.com` URL, rather than a localhost or LAN address.

The repository also includes a root `render.yaml` blueprint with the same settings and the correct root directory. Creating a Blueprint from it is an alternative to manually creating a web service.

## Verify the exact public link

- Open `/healthz`; expect an OK response.
- Open the game in a normal browser and a private window, or on a laptop and phone over mobile data.
- Create a room, copy its invite link, and join from the second device.
- Choose different lineages/classes, lock in, and verify both players enter the same mission.
- Read the note, confirm the quest completes on both screens, and check a shared mining/building update.
- Test movement, aiming, firing, interaction, and construction on a phone.
- Keep the final public URL for the contest submission.

## Free hosting behavior

Render's free service sleeps after 15 minutes without incoming traffic; its next visitor may wait about a minute for startup. The game shows connection status and waits for the server before enabling room creation. Active matches send WebSocket traffic.

Rooms and campaign progress are held in server memory. A server restart, redeploy, or free-instance shutdown clears them. Brief connection interruptions can recover for up to 45 seconds. No paid database or subscription is required for a match.

Sources: https://render.com/docs/free and https://render.com/docs/websocket

## Local run

`npm ci`, `npm run build`, then `npm start`. Open http://localhost:3001. For development, `npm run dev` runs Vite and the multiplayer server.

`npm test` checks two-client room/class/mission synchronization and production serving. `npm run test:campaign` uses public player messages to complete all three chapters, verifies reconnect and lineage bonuses, and tests victory and replay. It takes several minutes.
