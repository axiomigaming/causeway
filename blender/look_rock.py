"""Look-dev: a mid rock with the scanned rock material and a cliff slab, rendered to <out.png>.

    python3 blender/look_rock.py <out.png>
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
import bpy
from mathutils import Vector
from common import reset, link
import kit_geo as K
import materials_scan as MS

out = sys.argv[-1]
sc = reset()
sc.cycles.samples = 24
r = K.rock_obj("rock_look", 411, size=(3.2, 2.6, 2.4), detail=4)
r.data.materials.clear()
r.data.materials.append(MS.rock("rock"))
r.location = (0, 0, 0)
w = bpy.data.worlds.new("w")
w.use_nodes = True
w.node_tree.nodes["Background"].inputs[0].default_value = (0.55, 0.62, 0.7, 1)
sc.world = w
sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN"))
sun.data.energy = 4.0
sun.rotation_euler = (math.radians(50), 0, math.radians(30))
link(sun)
cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
cam.location = (0, -4.2, 1.6)
cam.rotation_euler = (math.radians(78), 0, 0)
link(cam)
sc.camera = cam
sc.render.resolution_x, sc.render.resolution_y = 800, 500
sc.render.filepath = out
bpy.ops.render.render(write_still=True)
