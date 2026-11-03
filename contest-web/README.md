# Kyrevant — The Last Light

A browser-based, real-time cooperative sci-fi fantasy campaign for 2–4 players. No player account or installation is required. A unit survives an asteroid strike, crashes on an alien world, finds a handwritten plea, and takes on the Ashfall militia to rescue the citizens of Kyrevant.

## Play

One player creates a room and shares the invite link or five-character room code. The squad leader begins character creation once at least two players have joined. Everyone chooses a lineage and class, then locks in.

- **Lineages:** Human (+15 health and shields), Aelari (+35 shields), Stoneborn (+40 health).
- **Classes:** Fighter, Monk, Cleric, Wizard. Each has a distinct weapon profile and special ability.
- **Chapter one:** discover the note, meet Elias, rescue captives, establish defenses, and survive three assault waves.
- **Chapter two:** build a forward base, recover the ancient command key, and defeat the frontier commander.
- **Chapter three:** fortify the assault base, activate the Citadel core, and defeat the militia commander.
- **Victory:** all chapter objectives are shared. After the final victory, the squad leader can restart the campaign.

## Controls

WASD move; mouse aims; hold left click to fire; Q uses your class ability; E talks/interacts; M toggles mining. Select a building to enter the overhead construction view, then click the ground to place it. Escape or Return to Combat exits construction view. Arrow keys also turn the view.

Touchscreens have a movement pad, drag-to-aim area, held-fire button, and interaction/ability/mining buttons. Tap the ground in construction view to build. Sound can be muted using the sound button.

Resources and structures belong to the entire unit. Stations are renewable. Extractors produce minerals, Power Cores produce energy, Barracks heal nearby allies, and Turrets shoot nearby enemies. Shields recharge after a quiet interval. Downed players redeploy; progress survives a squad wipe.

## Run locally

Node 22 or later:

```powershell
npm ci
npm run build
npm start
```

Open http://localhost:3001. Open a second browser or private window to join as another player. `npm run dev` runs the Vite development client and Socket.IO server separately.

## Validate

```powershell
npm run lint
npm test
npm run test:campaign
```

The build checks client and server TypeScript. The smoke test checks two-client party synchronization and production serving. The campaign test completes all three chapters through public player actions and checks lineage bonuses, invalid-input rejection, transport recovery, shared victory, and restart. It takes several minutes.

## Free public hosting

See [DEPLOY.md](DEPLOY.md). `render.yaml` configures one free Render Node web service serving both the built client and multiplayer server. In the GitHub Unity repository, this browser edition is placed under `contest-web/`.

Free Render instances sleep after 15 idle minutes, and the next load can take about a minute. Rooms live in memory and reset when the server restarts. Device checkpoints autosave every 15 seconds and can restore a campaign into a new room after a restart. Download a backup through How to Play, and import it on the title screen to transfer it to another device. Socket.IO transport recovery lasts 45 seconds; a private saved-character token also restores the same character after refresh or disconnects of up to ten minutes while the room remains alive.

## Technology and assets

React, TypeScript, Babylon.js, Express, and Socket.IO. Marine, ground maps, and reflection lighting are bundled locally. See [CREDITS.md](CREDITS.md). This is an original game inspired by first-person sci-fi combat, party adventures, and resource/base strategy.

### Frontier graphics and controls revision

The October 30 frontier art rebuild replaces the prototype OBJ settlement and primitive weapon/character shapes with locally bundled textured first-person weapons, gloved arms, tactical characters, sci-fi helmets, scanned cover/equipment, and original wreck/outpost geometry. The map now spans 130 × 80 metres. Fighter, Monk, Cleric, and Wizard use distinct weapon models. Resource deposits, extractor drills, barracks, turrets, and power cores remain shared multiplayer objects.

The combat screen stays clear: compact visor bars/radar, one objective, and opt-in journal/construction. Mouse-look updates the same independent input controller that reads held WASD keys. Camera movement interpolates authoritative server positions. Browser pointer-lock has a click-to-resume fallback; Escape frees the cursor. Touch aiming remains independent of the movement pad.

Run `npm run test:input` to verify held movement while turning, diagonal speed, and input clearing. Art/model sources and license links are in `CREDITS.md` and accessible in-game through How to Play.

## Combat and construction controls
Hold right click to focus aim, press Z to toggle it, or tap AIM on touch devices. Weapon recoil/sway and hit feedback are visual; authoritative damage remains on the server. Construction shows a green/red structure preview and the reason placement is unavailable. A build returns to combat after the server confirms construction; rejection keeps the preview open. The shared placement rules enforce cost, range, map boundaries and spacing.

Run `npm run test:combat` for motion and placement checks, `npm run test:recovery` for refresh/session recovery, and `npm run test:campaign` for the full multiplayer campaign.

## Crash-site opening and visual materials
The transport impact now cuts to the actual world for the surface reveal. The camera frames the crashed ship, then turns toward the lantern-marked note. Physical amber route markers lead to the warm-lit refuge entrance, and the next objective follows the note to Elias. Generated silt and basalt materials replace the repeated gravel look, with new fractured rock silhouettes and a slimmer weapon receiver/optic. Generated terrain credits are included in CREDITS.md and the in-game credits page.

## Class paths and enemy tactics
At rank two, open Mission Log and choose one permanent path for this campaign. Fighter chooses grenade damage or maximum shields; Monk chooses dash range or cooldown; Cleric chooses health/revival or shields; Wizard chooses blast damage or cooldown. Paths survive chapter changes and saved-character recovery and reset on campaign replay. The journal stays closed during combat unless opened.

Militia troops approach around terrain that blocks sight, circle at firing distance, and briefly pull back when threatened. Heavy troops favor holding their firing position. These tactics use terrain sight tests and home-area limits, not a full navigation mesh. Cleric healing respects every lineage and rank maximum.

Run `node --import tsx scripts/progression-tactics-test.mjs` for healing, path validation and enemy movement checks. The campaign test also verifies rank requirements, class restrictions, shield bonuses, chapter preservation and replay reset.

## Campaign expansion · 2026-11-02.3

Weapons have class-specific magazines, server-authoritative ammunition, automatic empty reloads and manual reloads with R or the touch button. Reload motion, layered weapon audio, enemy interpolation and hit reactions improve combat feedback. The frontier adds instanced curved vegetation, refuge bunks and a map table, and an exposed transport cargo bay.

Captain Vale offers Bastion (+80 initial structure hull) or Reclaimer (double passive resource production). Sera offers a commander-weakening artifact choice or a Wizard/Monk study option that grants energy. Jonah offers a final commander shutdown or civilian grid restoration that recharges the squad. Choices are shared and appear in the journal and ending.

Open Build Base to repair nearby structures for 25 minerals or upgrade them through level three. Upgrades increase hull and the structure's production, healing or turret damage. Settlement assault troops can damage and destroy the base. Phone controls have an analog movement stick, independent drag aiming and a reload button. How to Play offers a Performance graphics setting. Phone-width layout has been checked in a browser; physical-phone performance and multitouch remain unverified.

Every connected player receives a device checkpoint with their character first. Continue saved campaign creates a fresh room and restores characters, objectives, enemies, structures, resources and choices. Friends join that code to reclaim the remaining characters; restored combat waits for two connected players. Saves refill ammunition, redeploy downed characters with at least 35 health and reset temporary interaction/reload timers. Mining deposits are unlimited and recreated from the chapter definition. Saved files are portable cooperative game data, without socket identities or recovery secrets. Local storage can be cleared by the browser, so keep a downloaded backup.

Run `npm run test:expansion` for magazines, analog input, repair/upgrade rules, imported-save validation, an actual server restart and restoration, friend reclaim, shared structure damage and story rewards. The test launches a disposable local server on port 3117.
