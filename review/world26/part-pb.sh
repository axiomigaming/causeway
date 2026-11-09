#!/bin/sh
# Inside serve.sh: the proofs (after), then perf before/after.
cd "$(dirname "$0")/../.."
sh review/world26/proofs.sh b
sh review/world26/perf.sh
