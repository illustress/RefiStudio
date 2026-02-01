#!/bin/bash
# Add your user to the docker group so Cursor/VS Code can run Docker.
# Run: bash .devcontainer/fix-docker-group.sh
# Then log out and back in, or run Cursor from a terminal after: newgrp docker

set -e

echo "Adding user $USER to group docker..."
sudo usermod -aG docker "$USER"

echo ""
echo "Done. Next steps (pick one):"
echo ""
echo "  Option A – Log out and log back in to your desktop session."
echo ""
echo "  Option B – In a terminal, run:  newgrp docker"
echo "             Then close Cursor and start Cursor from that same terminal"
echo "             so it inherits the new group (e.g. cursor . or code .)."
echo ""
echo "Then try 'Reopen in Container' again."
echo ""
