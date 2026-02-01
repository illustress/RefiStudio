#!/bin/sh
# Ensure /tmp is writable by all (Bun and tools use it; devcontainer merge can drop tmpfs).
mkdir -p /tmp && chmod 1777 /tmp
# Ensure Bun temp dir exists and is writable by bun user (Bun uses TMPDIR for installs).
mkdir -p /home/bun/.bun/tmp && chown -R bun:bun /home/bun/.bun
exec "$@"
