#!/bin/sh
# Inside serve.sh with BASE=<leafa27> (this build, 7011da2's kit): the 1x phone leaf pairs, same frames.
cd "$(dirname "$0")/../.."
rm -f review/world27/frames/*-leaf1x-*
sh review/world27/leaf1x.sh
