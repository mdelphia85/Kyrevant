# Kyrevant asset credits

- Game-specific world geometry, interface, weapons, introduction, story, procedural fallback characters, and synthesized effects are authored for this project.
- Animated marine: Soldier.glb from the Three.js examples (r169), model Vanguard by T. Choonyung / Adobe Mixamo. Included only as an embedded game asset; not offered as a standalone model download. Source: https://github.com/mrdoob/three.js/tree/r169/examples/models/gltf
- Rocky ground albedo and normal maps: rock_ground by Rob Tuytel / Poly Haven, CC0. WebP versions are optimized from the 1K source maps. Source: https://polyhaven.com/a/rock_ground
- Reflection environment: Babylon.js environmentSpecular.env sample. Source: https://assets.babylonjs.com/environments/environmentSpecular.env
- Existing building OBJ assets are from the asset pack supplied with the original project. Their source/license documentation was not included in this workspace. Retain any original license required by that pack.
- Halo, Dungeons & Dragons, and StarCraft are design influences. No franchise characters, logos, maps, music, or weapon assets are included.

## Detailed frontier models — October 30 visual rebuild

The following assets are bundled locally from the public [Ironline asset conversions](https://github.com/cktang88/3d-fps). They are adapted for Kyrevant camera placement, lighting, animation selection, and faction tinting. No Ironline game code or Fab animation file is included.

- **M4A1**, by Firewarden3D: https://sketchfab.com/3d-models/m4a1-40d8ef818c7549a896371cbb1f64fec6 — CC BY 4.0. Converted/compressed rifle is used for the first-person service weapon.
- **Fps arms**, by DJMaesen (bumstrum): https://sketchfab.com/3d-models/fps-arms-9452ce4cddde4110a4fd73e555a8e412 — CC BY 4.0. Reposed/skinned gloved hands accompany the rifle.
- **FPS AK-74m animations**, by Cransh: https://sketchfab.com/3d-models/fps-ak-74m-animations-94be8385c402474cacd39bc096c6ca14 — CC BY 4.0. Arm rig/grip-template contribution to the converted first-person model.
- **FREE [Military Soldier] RIGGED**, by BAMEN: https://sketchfab.com/3d-models/free-military-soldier-rigged-e9c56308a67d4a3db62e914fafa4d198 — CC BY 4.0. Rigged squad, militia, and survivor characters, with converted textures and retargeted animation.
- **100STYLE**, by Ian Mason, Sebastian Starke, and Taku Komura: https://zenodo.org/records/8127870 — CC BY 4.0. Extracted, looped, retargeted mocap clips contained in the converted soldier asset.
- **Universal Animation Library 1 & 2**, by Quaternius: https://quaternius.com — CC0. Retargeted soldier animation clips.
- **Concrete road barrier 02**, **portable generator**, and **old military crate**, by Poly Haven: https://polyhaven.com — CC0. Converted GLBs with compressed textures. The crate source remains available but is not placed in the scene.
- **rusty_metal_04**, by Poly Haven: https://polyhaven.com/a/rusty_metal_04 — CC0. Hull base-color and normal surface maps.
- **Concrete047A**, by ambientCG: https://ambientcg.com/view?id=Concrete047A — CC0. Colony wall base-color and normal maps.
- **meshoptimizer decoder**, by Arseny Kapoulkine: https://github.com/zeux/meshoptimizer — MIT. Bundled from the installed Babylon.js package, with its license at `public/assets/detailed/meshopt-LICENSE.txt`.

CC BY 4.0 license: https://creativecommons.org/licenses/by/4.0/ . Credit does not imply endorsement. Original source asset licenses remain applicable to the included derivatives.

The frontier sky panorama was generated specifically for this project with OpenAI image generation. The new crash transport geometry, frontier architecture, geological forms and ore deposits are original procedural Kyrevant assets.

### Additional detailed models in the frontier rebuild

- **Military tactical suit (LowPolyGameReady)**, by DanlyVostok (1799danly): https://sketchfab.com/3d-models/military-tactical-suit-lowpolygameready-ef698ce36b1545a78ce592dd3db4c7ed — CC BY 4.0. Converted/compressed textures; animation rotation tracks adapted from the credited BAMEN/Quaternius rig to the suit's rest pose. A detached accessory is hidden.
- **MP5 Submachine Gun**, by Rotuma: https://sketchfab.com/3d-models/mp5-submachine-gun-a73b61932a0e4eecb5db5c63c158aa24 — CC BY 4.0. Converted first-person recon carbine with the credited arm rig.
- **FN Scar-L Assault Rifle**, by Hitansh 3D: https://sketchfab.com/3d-models/fn-scar-l-assault-rifle-ea1823de59684fd596d9f6726382f948 — CC BY 4.0. Converted first-person support weapon with the credited arm rig.
- **Special Sniper Rifle VSS Vintorez**, by Arms Museum: https://sketchfab.com/3d-models/special-sniper-rifle-vss-vintorez-4d5d8c1b7b79429abfa4816f18330089 — CC0. Converted first-person marksman weapon; the accompanying arms remain CC BY 4.0 as credited above.
- **SciFi Helmet**, by Michael Pavlovic, converted to glTF by Norbert Nopper: https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/SciFiHelmet — CC0. Textures resized/compressed to WebP, model scaled and attached to the unit's head for Kyrevant. This is the SciFiHelmet model, not the separate DamagedHelmet sample.

The source creators' model-license metadata was checked on October 30, 2026. Credits and the CC BY license link are accessible from the game's How to Play panel at `/credits.html`.
