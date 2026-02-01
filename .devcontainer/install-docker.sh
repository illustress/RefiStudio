#!/bin/bash
# Install Docker on Ubuntu 22.04 (Jammy) using the official Docker repository.
# Run this script with: bash .devcontainer/install-docker.sh
# You will be prompted for your sudo password.

set -e

echo "Installing Docker on Ubuntu..."

# Step 1: Remove older Docker packages if present
sudo apt-get remove -y docker docker-engine docker.io containerd runc 2>/dev/null || true

# Step 2: Install prerequisites
sudo apt-get update
sudo apt-get install -y ca-certificates curl gnupg lsb-release

# Step 3: Add Docker's official GPG key
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

# Step 4: Add the Docker repository
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "${VERSION_CODENAME:-$VERSION_ID}") stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

# Step 5: Install Docker Engine, CLI, containerd, and Compose plugin
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Step 6: Add current user to docker group (so you can run docker without sudo)
sudo usermod -aG docker "$USER"

echo ""
echo "Docker installed successfully."
echo "Log out and back in (or run: newgrp docker) so the 'docker' group takes effect."
echo "Then verify with: docker run hello-world"
echo ""
echo "For Dev Containers: restart Cursor/VS Code and run 'Reopen in Container' again."
