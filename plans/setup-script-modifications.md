# setup.sh Script Modifications for Optional Hostname

## Current Implementation

The current setup.sh script requires users to enter a hostname:

```bash
# Hostname Configuration with explanation
echo -e "${BLUE}=== Hostname Configuration ===${NC}"
echo "The hostname is required because the application code is designed to use it in several ways:"
echo ""
echo "1. The client's environment variables (API_URL, SOCKET_URL) are compiled at build time"
echo "2. The server needs to know allowed CORS origins for security"
echo "3. WebSocket connections require full URLs in the current implementation"
echo ""
echo -e "${YELLOW}Note:${NC} A more modern approach would use relative URLs and auto-detect the hostname,"
echo "but that would require changes to the application code itself."
echo ""
echo "Use cases for different hostname values:"
echo "- 'localhost': For local development only (default)"
echo "- IP address: For accessing from other machines on your network"
echo "- Domain name: For production deployments with a real domain"
echo ""
read -p "Enter your hostname (e.g., example.com or localhost): " HOSTNAME
HOSTNAME=${HOSTNAME:-localhost}
echo -e "${GREEN}Using hostname: ${HOSTNAME}${NC}"
```

## Proposed Changes

We'll modify the hostname prompt section to make it optional, with auto-detection as the default if no input is provided:

```bash
# Hostname Configuration with explanation
echo -e "${BLUE}=== Hostname Configuration ===${NC}"
echo "The hostname can be provided manually or automatically determined at runtime."
echo ""
echo "1. If you provide a hostname, it will be used for all configurations"
echo "2. If you leave it blank, the application will auto-detect the hostname"
echo ""
echo "Use cases for different hostname values:"
echo "- 'localhost': For local development only"
echo "- IP address: For accessing from other machines on your network"
echo "- Domain name: For production deployments with a real domain"
echo "- Leave blank: For automatic detection (recommended)"
echo ""
read -p "Enter your hostname (or leave blank for auto-detection): " HOSTNAME

if [ -z "$HOSTNAME" ]; then
    echo -e "${GREEN}Using automatic hostname detection${NC}"
    HOSTNAME="auto"
else
    echo -e "${GREEN}Using hostname: ${HOSTNAME}${NC}"
fi
```

We'll also update the environment variable configuration sections to handle the 'auto' value:

```bash
# Update .env file
if [ "$HOSTNAME" = "auto" ]; then
    $SED_CMD "s|API_URL=http://localhost|API_URL=auto|g" .env
    $SED_CMD "s|SOCKET_URL=http://localhost|SOCKET_URL=auto|g" .env
    $SED_CMD "s|CORS_ORIGIN=http://localhost|CORS_ORIGIN=*|g" .env
else
    # Original behavior for manual hostname
    if [[ $USE_CUSTOM_PORTS =~ ^[Yy]$ ]]; then
        $SED_CMD "s|API_URL=http://localhost|API_URL=${PROTOCOL}://${HOSTNAME}:${API_PORT}|g" .env
        $SED_CMD "s|SOCKET_URL=http://localhost|SOCKET_URL=${PROTOCOL}://${HOSTNAME}:${API_PORT}|g" .env
        $SED_CMD "s|CORS_ORIGIN=http://localhost|CORS_ORIGIN=${PROTOCOL}://${HOSTNAME}:${CLIENT_PORT}|g" .env
    else
        $SED_CMD "s|API_URL=http://localhost|API_URL=${PROTOCOL}://${HOSTNAME}|g" .env
        $SED_CMD "s|SOCKET_URL=http://localhost|SOCKET_URL=${PROTOCOL}://${HOSTNAME}|g" .env
        $SED_CMD "s|CORS_ORIGIN=http://localhost|CORS_ORIGIN=${PROTOCOL}://${HOSTNAME}|g" .env
    fi
fi

# Update client/.env file
if [ "$HOSTNAME" = "auto" ]; then
    $SED_CMD "s|VITE_API_URL=http://localhost|VITE_API_URL=auto|g" client/.env
    $SED_CMD "s|VITE_SOCKET_URL=http://localhost|VITE_SOCKET_URL=auto|g" client/.env
else
    # Original behavior for manual hostname
    if [[ $USE_CUSTOM_PORTS =~ ^[Yy]$ ]]; then
        $SED_CMD "s|VITE_API_URL=http://localhost|VITE_API_URL=${PROTOCOL}://${HOSTNAME}:${API_PORT}|g" client/.env
        $SED_CMD "s|VITE_SOCKET_URL=http://localhost|VITE_SOCKET_URL=${PROTOCOL}://${HOSTNAME}:${API_PORT}|g" client/.env
    else
        $SED_CMD "s|VITE_API_URL=http://localhost|VITE_API_URL=${PROTOCOL}://${HOSTNAME}|g" client/.env
        $SED_CMD "s|VITE_SOCKET_URL=http://localhost|VITE_SOCKET_URL=${PROTOCOL}://${HOSTNAME}|g" client/.env
    fi
fi

# Update server/.env file
if [ "$HOSTNAME" = "auto" ]; then
    $SED_CMD "s|CORS_ORIGIN=http://localhost|CORS_ORIGIN=*|g" server/.env
else
    # Original behavior for manual hostname
    if [[ $USE_CUSTOM_PORTS =~ ^[Yy]$ ]]; then
        $SED_CMD "s|CORS_ORIGIN=http://localhost|CORS_ORIGIN=${PROTOCOL}://${HOSTNAME}:${CLIENT_PORT}|g" server/.env
    else
        $SED_CMD "s|CORS_ORIGIN=http://localhost|CORS_ORIGIN=${PROTOCOL}://${HOSTNAME}|g" server/.env
    fi
fi
```

## Implementation Steps

1. Locate the hostname prompt section in setup.sh (around lines 96-114)
2. Replace it with the updated version that makes the hostname optional
3. Update the environment variable configuration sections (around lines 134-167)
4. Add comments explaining the auto-detection feature

## Testing

1. Test with no hostname provided (should use auto-detection)
2. Test with a hostname provided (should use the provided hostname)
3. Test with custom ports (should correctly configure the ports)
4. Test with HTTPS (should correctly configure the protocol)

## Edge Cases to Consider

1. **Custom Ports**: Ensure custom port configuration works correctly with auto-detection
2. **HTTPS**: Ensure HTTPS configuration works correctly with auto-detection
3. **HAProxy**: Ensure HAProxy configuration works correctly with auto-detection
4. **CORS**: Ensure CORS configuration works correctly with auto-detection

## Benefits

1. **Simplified Setup**: Users can choose auto-detection for a simpler experience
2. **Flexibility**: Manual hostname configuration is still available for specific use cases
3. **Better User Experience**: Makes the setup process more streamlined and user-friendly