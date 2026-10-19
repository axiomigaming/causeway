"""Deterministic `mathutils.noise.noise_vector`.

Blender's noise_vector is not repeatable between processes (noise.noise is; noise_vector is not, and
noise.seed_set does not pin it): every kit build gave the pieces that use it (add_block's blocks, the
drums, heads, guardians, columns) slightly different vertices, so their baked groups never hit the
cache. install() replaces it, for the whole process, with three decorrelated samples of the
deterministic noise.noise: the same character (a smooth gradient-noise vector, about −1..1 per
component), the same result on every run.

Call install() before any geometry is built (build_kit.py does, first thing).
"""
from mathutils import Vector, noise

_OFF = (Vector((0.0, 0.0, 0.0)), Vector((31.416, 47.853, 12.679)), Vector((-73.911, 5.227, 61.003)))
_orig = noise.noise_vector


def noise_vector(position, noise_basis="PERLIN_ORIGINAL"):
    p = Vector(position)
    return Vector(tuple(noise.noise(p + o, noise_basis=noise_basis) for o in _OFF))


def install():
    if noise.noise_vector is not noise_vector:
        noise.noise_vector = noise_vector
