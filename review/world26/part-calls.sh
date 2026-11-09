#!/bin/sh
cd "$(dirname "$0")/../.."
OVER=80 sh review/world25/calls.sh 5196 b26 > review/world26/calls-after.log
