# Optional teacher model mapping

A procedural teacher is built in, so a model is not required. `StudioStage.loadModel(fileOrUrl)` loads `.glb`, `.gltf` or `.vrm` through Three.js `GLTFLoader`. The first embedded GLTF animation clip is played if present. This loader is only basic GLTF support; full VRM-specific expression libraries and humanoid retargeting are model-specific follow-up work.

## Recommended bone names

Use a GLTF humanoid rig with a consistent hierarchy similar to:

| Role | Common GLTF/VRM names |
|---|---|
| Hips/root | `Hips`, `hips`, `J_Bip_C_Hips` |
| Spine/chest | `Spine`, `Chest`, `UpperChest`, `J_Bip_C_Spine`, `J_Bip_C_Chest` |
| Neck/head | `Neck`, `Head`, `J_Bip_C_Neck`, `J_Bip_C_Head` |
| Shoulders/upper arms | `LeftShoulder`, `LeftUpperArm`, `RightShoulder`, `RightUpperArm`, `J_Bip_L_UpperArm`, `J_Bip_R_UpperArm` |
| Forearms/hands | `LeftLowerArm`, `RightLowerArm`, `LeftHand`, `RightHand`, `J_Bip_L_LowerArm`, `J_Bip_R_LowerArm`, `J_Bip_L_Hand`, `J_Bip_R_Hand` |
| Eyes/jaw | model-dependent `LeftEye`, `RightEye`, `Jaw` or corresponding VRM humanoid nodes |

## Expression and speech extensions

For a production avatar, add a model adapter that maps:

- `neutral`, `warm`, `serious`, `curious`, `encouraging`, `surprised` to facial expression/morph target weights.
- `speak` timing, word timings, phonemes or visemes to jaw/mouth/blendshape values.
- `gesture` actions to upper-body animation clips with crossfade and a queue, keeping locomotion/body idle as the base layer.

Preferred viseme set: `sil`, `aa`, `ee`, `ih`, `oh`, `ou`, `fv`, `mbp`, `th`, `etc`; exact shapes depend on the supplied model. Missing blendshapes should be ignored without rejecting the rest of the timeline. Keep renderer logic independent from AI prompts and provider payloads.