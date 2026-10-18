"""Look-dev: the obstacle pieces (fallen log, carved lintel, toppling pier) with their materials.

    python3 blender/look_obstacles.py <out.png>
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
import bpy
from common import reset, link
import materials as M
import materials_scan as MS
import obstacle_geo as OG

out = sys.argv[-1]
sc = reset()
sc.cycles.samples = 24
log = OG.log_fallen("log_fallen_0", 1400)
log.data.materials.append(MS.bark("bark"))
stone = M.stone("stoneB", moss=0.45, glyphs=False)
lin = OG.beam_lintel("beam_lintel_0", 1410)
lin.data.materials.append(stone)
lin.location = (0, 3.2, 0)
pil = OG.pillar_topple("pillar_topple_0", 1420)
pil.data.materials.append(stone)
pil.location = (4.6, 5.5, 0)
w = bpy.data.worlds.new("w")
w.use_nodes = True
w.node_tree.nodes["Background"].inputs[0].default_value = (0.55, 0.62, 0.7, 1)
sc.world = w
sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN"))
sun.data.energy = 4.0
sun.rotation_euler = (math.radians(50), 0, math.radians(30))
link(sun)
cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
cam.location = (1.8, -6.8, 2.6)
cam.rotation_euler = (math.radians(72), 0, math.radians(8))
link(cam)
sc.camera = cam
sc.render.resolution_x, sc.render.resolution_y = 1000, 600
sc.render.filepath = out
bpy.ops.render.render(write_still=True)
