# HAProxy Configuration Update Plan

## Current Issues with HAProxy Documentation

The current HAProxy documentation in `memory-bank/deployment/haproxy.md` has the following issues:

1. **Path-based routing assumption**: The documentation assumes the application uses path-based routing where both web application and WebSockets share the same port, which is incorrect for our implementation.

2. **Single frontend configuration**: Only shows a single frontend section while our application uses two separate frontends:
   - One for the web application (client)
   - Another for the API and WebSockets

3. **Misaligned WebSocket configuration**: The WebSocket handling is described in a way that assumes it shares the same port as the web application.

## Planned Updates

I will create a completely revised HAProxy configuration guide that:

1. **Dual-port approach**: Clearly documents the use of separate ports for:
   - Web application frontend (e.g., port 15000)
   - API and WebSocket backend (e.g., port 15001)

2. **SSL configuration**: Shows how both frontends use the same SSL certificate for termination

3. **WebSocket handling**: Updates the WebSocket configuration to reflect that it's handled on the API port

4. **Configuration sections**: Updates all relevant sections (Global, Defaults, Frontends, Backends) to align with the dual-port approach

5. **Socket.IO configuration**: Clarifies how Socket.IO is handled on the API port

6. **Examples and troubleshooting**: Updates all examples and troubleshooting advice to match the dual-port architecture

## Implementation Approach

1. Retain the general structure of the current documentation for familiarity
2. Use the existing `haproxy.cfg.template` as a reference for the actual implementation
3. Update each section to reflect the dual-port approach
4. Add diagrams to clarify the architecture
5. Provide clear examples for both development and production environments

## Proposed Document Structure

1. **Overview**: Introduction to the dual-port approach
2. **Basic HAProxy Configuration**: Complete configuration example with both frontends
3. **Global and Defaults Sections**: General configuration that applies to all frontends
4. **Frontend Section**: Separate explanations for web app and API frontends
5. **Backend Section**: Configurations for frontend and backend containers
6. **Socket.IO Configuration**: Updated for the API port
7. **SSL Configuration**: How to use the same certificate for both frontends
8. **Monitoring and Statistics**: Unchanged from current documentation
9. **Load Balancing**: Updated for dual-port approach
10. **Troubleshooting**: Updated for dual-port approach

## Timeline

I'll create the updated HAProxy documentation as soon as this plan is approved.