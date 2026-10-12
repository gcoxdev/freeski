# Sprite-sheet generation prompts

All sheets used the built-in image-generation path. The revised player and downhill ramp used the prior local FreeSki player and terrain sheets only as style/camera references. The shared constraints were a locked orthographic three-quarter top-down game camera, premium ultra-realistic pre-rendered 3D materials, isolated cells, and a perfectly flat `#ff00ff` matte with no shadows or floor plane.

## 01 — Player skier

Create a 6 × 4 sheet of the same adult alpine skier in a cobalt-blue technical suit, red helmet, amber goggles, black gloves, yellow skis, and black poles. In reading order: stationary left; down-left 60°; down-left 30°; downhill; down-right 30°; down-right 60°; stationary right; tuck; jump takeoff; neutral air; forward rotation at 45°, 90°, 135°, 180°, 225°, 270° and 315°; completed-rotation landing crouch; spread; daffy; twist-left; twist-right; prone ordinary crash; distinct prone run-over. Keep full body and equipment visible, consistent scale and identity, with no uphill pose, text, logos, blur, duplicate poses, or cropped poles/skis.

Targeted tuck correction: create one isolated front-facing downhill aerodynamic tuck for the established cobalt-suit skier. Center and lower the torso, bend both knees deeply, square the shoulders toward the viewer/downhill direction, and extend both yellow skis symmetrically toward the bottom of the image. Keep the full body, skis, and poles visible with consistent scale and generous padding. Prohibit a side-facing body, a ski above the head, shadows, snow bases, text, logos, and grids; use a perfectly flat `#ff00ff` matte.

Targeted correction prompts: remove the stray ski fragment above the stationary right-facing skier while keeping both skis beneath the boots; for the first down-left interval, preserve the upper-body lean but make the boots, feet, and ski tips extend down-right; for the stationary left-facing skier, restore two complete parallel yellow skis beneath the boots and keep their tips and tails fully inside an 18-pixel safe margin. Keep every corrected subject fully inside its cell with consistent scale and no fragments crossing a cell boundary.

## 02 — Hill population

Create a 5 × 4 sheet. Row 1: same beginner in cyan/plum gear, downhill, left, right, backward fall, forward fall. Row 2: same charcoal/teal snowboarder with orange board, left, right, tuck, jump, tumble. Row 3: same shaggy gray alpine dog, trot A/B, alert, bark, knocked over. Row 4: empty red chairlift, one skier, two riders, skier dropping, snowboarder dropping. Maintain camera and family scale; no text, logos, snow bases, or crop.

## 03 — Yeti

Create a 4 × 4 sheet of the same bulky white-gray Yeti with slate face/hands and icy blue eyes. In reading order: run toward A/B, run away A/B, run left A/B, run right A/B, pounce windup, airborne pounce, victim-free grab, chew A/B, satisfied belly-pat, roar, idle recovery. Ominous but darkly funny; no victim, blood, gore, text, clothing, or crop.

Targeted lateral-gait correction: create a two-contact WALK cycle, never a running flight phase. Preserve the exact Yeti identity, direction, materials, camera and scale. Both complete feet remain on the same ground baseline in A and B. The two complete whole-body poses use opposite arm, hip and leg phases; natural near/far depth grading keeps their separate hip-to-foot paths readable. Mirror each complete approved left-facing frame for its right-facing counterpart. Exactly one body, two legs and two grounded feet per frame; no independently mirrored body sections, overlays or partial-body composites; use a perfectly flat `#ff00ff` matte.

## 04 — Terrain

Create a 5 × 4 sheet. Small/medium/large snow-dusted evergreen, dead tree, stump; granite rock, small/large bump, mogul field, low rainbow ramp; red-capped mushroom, burning tree A/B/C, yellow snow; walking evergreen idle/left/right, chairlift tower, blank wooden sign. Use realistic natural materials and restrained fire; no text, extra props, smoke clouds, or crop.

Targeted walking-tree gait correction: create a two-contact WALK cycle. Preserve the snow-covered evergreen identity, materials, direction, camera and scale. Both root-feet remain on the same ground baseline in both frames. The two complete whole-body poses use opposite arm, hip and root-leg phases; natural near/far bark grading keeps both root-joint-to-foot paths readable. Exactly one coherent tree, two connected legs and two grounded root-feet per frame; no independently mirrored body sections, overlays or partial-body composites; prohibit shadows, snow bases, text, logos, grids, or extra objects; use a perfectly flat `#ff00ff` matte.

## 05 — Course props

Create a 4 × 4 sheet. Red-left and blue-right markers; green happy and red sad markers; left/right Start; left/right Finish; Slalom, Tree Slalom and Free Style signs; pictogram controls; restart and pause pictograms; cable connector; safety fence. Use painted metal/canvas with frost and scuffs. Only the exact short course words may appear.

## 06 — VFX

Create a 4 × 4 sheet. Tiny/medium powder, landing plume, crash burst; left/right carve fans, short/long parallel tracks; ice impact, speed streaks, breath mist, oval ground shadow; ramp glint, trick sparkle, flame/embers, crash decal. Isolated realistic VFX only, no characters, props, text, logos, or excessive lens flare.

## 07 — Downhill ramp

Create one large, broad, low snow kicker with restrained rainbow lanes. Lock its travel axis vertically: approach from the top and launch toward the bottom. Give both outer edges continuous gently curved snow-packed sidewalls with slim uninterrupted rails, avoiding jagged steps, repeated brackets, or protruding scaffold sections. Keep it symmetric, readable, and roughly 80% of the square cell with no diagonal skew, side-facing halfpipe, extra props, shadow, text, logo, or crop.
