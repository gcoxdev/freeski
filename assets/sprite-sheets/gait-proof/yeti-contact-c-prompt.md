# Opposite-contact correction

Created with the built-in imagegen tool from frame three of
`08-yeti-lateral-run.png`. The generated source is
`yeti-contact-c-generated.png` in this directory.

Only frame three is replaced. The near/anatomical left leg trails toward screen
right; the far/anatomical right leg reaches toward screen left, behind the near
thigh. The near arm swings forward. The full creature still faces left.

For atlas assembly, the generated pose's alpha bounds (threshold 8) are fitted
uniformly to 493 pixels tall, centered in the existing 579 × 724 cell, with the
visible top at y=117 and sole at y=610. The other three cells are unchanged.

## Exact edit prompt

Use case: precise-object-edit. Edit target: this single full-body white yeti running LEFT on a transparent 579x724 canvas. This is frame THREE of a four-frame run animation. The shown pose is WRONG because it repeats frame one. Make the OPPOSITE contact pose. CRITICAL ANATOMY: the anatomical LEFT leg is the NEAR leg, closest to viewer. It must extend from the visible near hip BACKWARD toward SCREEN RIGHT, ending in the trailing foot at the RIGHT side. The anatomical RIGHT leg is the FAR leg. It must swing FORWARD toward SCREEN LEFT, its thigh partially OCCLUDED by the near thigh, ending in the leading foot at the LEFT side. Draw the near thigh as a continuous clearly visible diagonal from the hip DOWN AND RIGHT. The forward-going leg must emerge from BEHIND it, shaded darker so the swap is unmistakable. Also reverse the arms: the large visible near LEFT upper arm must swing FORWARD, diagonal down-left from the visible shoulder, elbow bent and fist at screen-left in front of the chest; far RIGHT arm swings back toward screen-right, partly occluded behind torso. Do not mirror the whole creature: head and torso still face LEFT. Keep the same character, face, fur, head position around x170 y170, body proportions, hunched torso, painted realism and camera angle. Keep head top around y118 and planted forward sole around y610 on the 579x724 transparent canvas. This is a leg/arm SWAP, not a color swap. Two arms, two legs. Full feet inside frame with transparent margins. Output only this corrected third pose, no text, no guides, no colored markings, no ground or shadow. Preserve the transparent background.
