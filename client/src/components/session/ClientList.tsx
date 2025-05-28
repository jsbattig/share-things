/* eslint-disable react/display-name, react/prop-types */
import React, { useEffect, useState } from 'react';
import {
  Box,
  List,
  ListItem,
  HStack,
  Text,
  Avatar,
  Badge,
  Divider,
  Tooltip
} from '@chakra-ui/react';
import { useSocket } from '../../contexts/SocketContext';

interface ClientListProps {
  clients: Array<{ id: string, name: string }>;
}

interface ClientWithStatus {
  id: string;
  name: string;
  status: 'active' | 'reconnected' | 'you';
  lastActivity: number;
}

/**
 * Client list component
 */
const ClientList: React.FC<ClientListProps> = React.memo(({ clients }) => {
  const { socket, connectionStatus } = useSocket();
  const [clientsWithStatus, setClientsWithStatus] = useState<ClientWithStatus[]>([]);
  
  // Get current client ID
  const currentClientId = socket?.id;
  
  // Update clients with status
  useEffect(() => {
    const updatedClients = clients.map(client => ({
      id: client.id,
      name: client.name,
      status: client.id === currentClientId ? 'you' as const : 'active' as const,
      lastActivity: Date.now()
    }));
    
    setClientsWithStatus(updatedClients);
  }, [clients, currentClientId]);
  
  // Listen for client rejoined events
  useEffect(() => {
    if (!socket) return;
    
    const handleClientRejoined = (data: { clientId: string, clientName: string }) => {
      console.log(`Client rejoined: ${data.clientName} (${data.clientId})`);
      
      setClientsWithStatus(prev => {
        return prev.map(client => {
          if (client.id === data.clientId) {
            return { ...client, status: 'reconnected' as const, lastActivity: Date.now() };
          }
          return client;
        });
      });
    };
    
    socket.on('client-rejoined', handleClientRejoined);
    
    return () => {
      socket.off('client-rejoined', handleClientRejoined);
    };
  }, [socket]);
  
  // Sort clients: current user first, then alphabetically by name
  const sortedClients = [...clientsWithStatus].sort((a, b) => {
    if (a.id === currentClientId) return -1;
    if (b.id === currentClientId) return 1;
    return a.name.localeCompare(b.name);
  });
  
  // Generate avatar color based on client ID
  const getAvatarColor = (clientId: string): string => {
    const colors = [
      'red', 'orange', 'yellow', 'green', 'teal', 'blue', 
      'cyan', 'purple', 'pink'
    ];
    
    // Simple hash function to get consistent color
    let hash = 0;
    for (let i = 0; i < clientId.length; i++) {
      hash = clientId.charCodeAt(i) + ((hash << 5) - hash);
    }
    
    const index = Math.abs(hash) % colors.length;
    return `${colors[index]}.500`;
  };
  
  // Generate initials from name
  const getInitials = (name: string): string => {
    return name
      .split(' ')
      .map(part => part.charAt(0))
      .join('')
      .toUpperCase()
      .substring(0, 2);
  };
  
  if (clientsWithStatus.length === 0) {
    return (
      <Box textAlign="center" py={4}>
        <Text color="gray.500">No users connected</Text>
      </Box>
    );
  }
  
  return (
    <List spacing={2}>
      {sortedClients.map((client) => (
        <ListItem key={client.id}>
          <HStack spacing={3}>
            <Avatar 
              size="sm" 
              name={client.name} 
              bg={getAvatarColor(client.id)}
              color="white"
              getInitials={() => getInitials(client.name)}
            />
            <Text fontWeight="medium" isTruncated>
              {client.name}
              {client.status === 'you' && (
                <Badge ml={2} colorScheme="green" fontSize="xs">
                  You {connectionStatus !== 'connected' && `(${connectionStatus})`}
                </Badge>
              )}
              {client.status === 'reconnected' && (
                <Tooltip label={`Reconnected ${Math.floor((Date.now() - client.lastActivity) / 1000)} seconds ago`}>
                  <Badge ml={2} colorScheme="blue" fontSize="xs">
                    Reconnected
                  </Badge>
                </Tooltip>
              )}
            </Text>
          </HStack>
          <Divider mt={2} />
        </ListItem>
      ))}
    </List>
  );
});

export default ClientList;