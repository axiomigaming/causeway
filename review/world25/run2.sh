#!/bin/sh
# Inside serve.sh: the before/after proofs, then the phone Low draw-call breakdown of this tree.
cd "$(dirname "$0")/../.."
sh review/world25/proofs.sh
sh review/world25/calls.sh 5196 after
