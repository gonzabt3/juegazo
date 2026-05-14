Prompt maestro (spritesheet completo)

Generate a 2D fighting game character spritesheet, generic fighter, clean game-ready style, side view facing right, consistent body proportions and outfit across all frames, transparent background, no text, no watermark, no logo.

Technical constraints:

Frame size: 96x96 pixels
Grid layout: 8 columns x 7 rows
Total canvas: 768x672 pixels
One animation state per row
Keep character fully inside each 96x96 frame
Feet aligned to the same ground line in all non-jump frames
No camera zoom changes, no perspective changes
Crisp edges, no motion blur
Row mapping (top to bottom):

Row 0: IDLE, 6 frames, loop
Row 1: MOVING, 8 frames, loop
Row 2: JUMPING, 4 frames, non-loop (crouch, takeoff, air, landing)
Row 3: ATTACKING, 6 frames, non-loop (anticipation, strike, recovery)
Row 4: KICKING, 6 frames, non-loop (anticipation, kick, recovery)
Row 5: BLOCKING, 2 frames, loop
Row 6: HIT, 3 frames, non-loop
Padding rule:

If a row has fewer than 8 frames, keep remaining cells transparent and empty.
Animation quality rules:

Readable silhouette in every frame
Stable head size and torso size across all frames
Arms and legs anatomically consistent
No duplicated limbs, no missing hands, no deformed fingers
Output requirements:

Return exactly one PNG spritesheet image
Preserve the exact grid and dimensions
Transparent background only
Negative prompt (si la herramienta lo permite):
extra limbs, duplicate body parts, bad anatomy, deformed hands, inconsistent clothing, inconsistent face, blur, motion blur, cropped body, text, watermark, logo, background clutter

Parametros recomendados (si podés configurarlos):

Seed fija: 424242
Steps: 30-40
CFG: 5-7
