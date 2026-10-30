# Kyrevant: agreed design

Target: a complete, publicly playable cooperative mission ready to test before October 25, 2026. Contest submission deadline supplied by the user: October 31.

## Creative direction
- Halo-inspired first-person movement and combat, with original weapons, characters, and world.
- Dungeons & Dragons-inspired character races, classes, storytelling, exploration, and party decisions.
- StarCraft-inspired mining, resource spending, construction, upgrades, and base defense.
- Preserve the alien-world direction where it works; graphics and weapons need substantial improvement.

## Opening established by the user
A unit travels aboard a ship. An asteroid hits the ship, which crashes on an alien planet. The surviving party awakens and explores. A note on a rock pleads for help and directs them to a building. They meet a man who explains that a rogue militia captured the citizens. The party accepts a rescue mission.

## First implementation pass
The opening interaction is now a readable note on a rock rather than a mandatory two-person black-box decryption. The note directs the party to Elias at the Last Light Refuge. Elias describes the Ashfall militia and asks the unit to rescue the captives. Existing shared quest progress and guarded-prison rescue checks are retained.

## Remaining delivery work
- Playtest the corrected opening with two independent clients.
- Visually playtest the new four-scene asteroid/crash introduction. It uses animated interface artwork, rather than a 3D cinematic.
- Improve first-person weapon models, handling, and combat feedback.
- Review world and character visuals in the running game.
- Add character race selection and meaningful party customization.
- Verify mining and base building support the rescue campaign.
- Test the implemented touch movement pad, drag-to-aim region, held fire, interaction, mining, and ability buttons on real phones.
- Verify onboarding, win/loss rules, reconnect behavior, and multiplayer synchronization.
- Deploy the persistent multiplayer server and client to a public host, then verify separate-device play.

No public deployment or completed visual overhaul is implied by this document.

## Second implementation pass
- Added an optional, skippable four-scene introduction establishing the asteroid strike and crash.
- Added a mission briefing before players join, with objectives, controls, shared-resource rules, and redeployment behavior.
- Added held-trigger firing with local cadence matching existing server class cooldowns.
- Added server-confirmed hit markers and revised the original K-7 rifle silhouette, stock, upper shroud, and identification plate.
- Added coarse-pointer touch movement, drag aiming, held firing, interaction, mining, and ability controls.
- Suppressed movement and firing during the introduction, dialogue, and rules overlays.
- Replaced public asset diagnostics with a squad HUD label.
- Added scripts/multiplayer-smoke.mjs to exercise room creation, joining, class selection, ready state, and synchronized mission start with independent clients.

Validation: production builds passed during development. The browser preview failed to attach. Socket testing was blocked by local socket restrictions/timeouts, including outside-sandbox retries; separate-device play is not yet verified.
