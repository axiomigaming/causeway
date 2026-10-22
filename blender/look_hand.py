"""Look-dev: the colossal hand in the statue material. python3 blender/look_hand.py <out.png>"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
import bpy
import detnoise

detnoise.install()
from common import reset, link
import materials as M
import setpieces as S

out = sys.argv[-1]
sc = reset()
sc.cycles.samples = 16
h = S.colossal_hand("hand_colossal_0", 740)
h.data.materials.append(M.stone("statue", moss=0.5, glyphs=False))
w = bpy.data.worlds.new("w")
w.use_nodes = True
w.node_tree.nodes["Background"].inputs[0].default_value = (0.55, 0.62, 0.7, 1)
sc.world = w
sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN"))
sun.data.energy = 4.0
sun.rotation_euler = (math.radians(50), 0, math.radians(30))
link(sun)
cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
cam.location = (0.6, -5.0, 1.0)
cam.rotation_euler = (math.radians(84), 0, math.radians(6))
link(cam)
sc.camera = cam
sc.render.resolution_x, sc.render.resolution_y = 600, 600
sc.render.filepath = out
bpy.ops.render.render(write_still=True)
