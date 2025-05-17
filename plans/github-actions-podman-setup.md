# Setting Up GitHub Actions Self-Hosted Runner with Podman on Rocky Linux

This document provides instructions for setting up a self-hosted GitHub Actions runner on Rocky Linux with Podman support.

## Prerequisites

- Rocky Linux 9.x or later
- Root access or sudo privileges
- GitHub repository with admin access

## Installation Steps

### 1. Install Podman and Podman Compose

```bash
# Update system packages
sudo dnf update -y

# Install Podman
sudo dnf install -y podman

# Verify Podman installation
podman --version

# Install Python and pip (required for podman-compose)
sudo dnf install -y python3 python3-pip

# Install Podman Compose
pip3 install podman-compose

# Verify Podman Compose installation
podman-compose --version
```

### 2. Configure Podman for Rootless Mode

```bash
# Install required packages for rootless mode
sudo dnf install -y slirp4netns fuse-overlayfs

# Configure subuid and subgid for the user
sudo usermod --add-subuids 100000-165535 --add-subgids 100000-165535 $USER

# Verify the configuration
grep $USER /etc/subuid /etc/subgid

# Create Podman configuration directory
mkdir -p ~/.config/containers

# Configure Podman to use vfs storage driver (more compatible with CI environments)
cat > ~/.config/containers/storage.conf << EOF
[storage]
driver = "vfs"
EOF
```

### 3. Install GitHub Actions Runner

```bash
# Create a directory for the runner
mkdir ~/actions-runner && cd ~/actions-runner

# Download the latest runner package
curl -o actions-runner-linux-x64.tar.gz -L https://github.com/actions/runner/releases/download/v2.314.1/actions-runner-linux-x64-2.314.1.tar.gz

# Extract the installer
tar xzf ./actions-runner-linux-x64.tar.gz

# Configure the runner
# Replace {GITHUB_OWNER} and {REPOSITORY_NAME} with your GitHub username/org and repository name
# Replace {TOKEN} with your GitHub runner registration token
./config.sh --url https://github.com/{GITHUB_OWNER}/{REPOSITORY_NAME} --token {TOKEN} --labels "self-hosted,Rocky Linux" --unattended

# Install and start the runner service
./svc.sh install
./svc.sh start

# Check the status of the runner
./svc.sh status
```

### 4. Configure GitHub Actions Runner Service

Create a systemd service file to ensure the runner starts automatically:

```bash
sudo tee /etc/systemd/system/actions-runner.service > /dev/null << EOF
[Unit]
Description=GitHub Actions Runner
After=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=/home/$USER/actions-runner
ExecStart=/home/$USER/actions-runner/run.sh
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

# Enable and start the service
sudo systemctl enable actions-runner
sudo systemctl start actions-runner
sudo systemctl status actions-runner
```

### 5. Configure Podman Permissions

Ensure the GitHub Actions runner user has proper permissions to use Podman:

```bash
# Create a systemd user service directory
mkdir -p ~/.config/systemd/user

# Enable lingering for the user (allows user services to run without being logged in)
sudo loginctl enable-linger $USER

# Verify lingering is enabled
loginctl show-user $USER | grep Linger
```

## Troubleshooting

### Podman Permission Issues

If you encounter permission issues with Podman, try the following:

1. Ensure the `PODMAN_USERNS=keep-id` environment variable is set in your workflow:

```yaml
- name: Build and run tests
  run: ./build-and-test.sh
  env:
    PODMAN_USERNS: keep-id
```

2. Check if SELinux is causing issues:

```bash
# Check SELinux status
sestatus

# If SELinux is enforcing, you can temporarily set it to permissive
sudo setenforce 0

# For a permanent change, edit /etc/selinux/config
sudo sed -i 's/SELINUX=enforcing/SELINUX=permissive/' /etc/selinux/config
```

### Network Issues

If containers can't access the network:

```bash
# Check if the slirp4netns package is installed
rpm -q slirp4netns

# Install if missing
sudo dnf install -y slirp4netns

# Verify network configuration
podman network ls
```

### Storage Issues

If you encounter storage-related errors:

```bash
# Check storage configuration
podman info --storage

# Clear Podman storage
podman system prune -a --volumes

# Verify storage driver
grep driver ~/.config/containers/storage.conf
```

## Maintenance

### Updating the Runner

To update the GitHub Actions runner:

```bash
cd ~/actions-runner
./svc.sh stop
./svc.sh uninstall
rm -rf *
# Download and configure the new version (repeat steps from section 3)
```

### Monitoring Logs

To check the runner logs:

```bash
cd ~/actions-runner
tail -f _diag/Runner_*.log
```

## Security Considerations

1. Use a dedicated user account for the GitHub Actions runner
2. Limit the permissions of the runner user
3. Consider using a firewall to restrict outbound connections
4. Regularly update the runner and the host system
5. Monitor the runner logs for suspicious activity