import React from 'react';
import {
  Box,
  List,
  ListItem,
  HStack,
  Text,
  Avatar,
  Badge,
  Divider
} from '@chakra-ui/react';
import { useSocket } from '../../contexts/SocketContext';

interface ClientListProps {
  clients: Array<{ id: string, name: string }>;
}

/**
 * Client list component
 */
const ClientList: React.FC<ClientListProps> = ({ clients }) => {
  const { socket } = useSocket();
  
  // Get current client ID
  const currentClientId = socket?.id;
  
  // Sort clients: current user first, then alphabetically by name
  const sortedClients = [...clients].sort((a, b) => {
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
  
  if (clients.length === 0) {
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
              {client.id === currentClientId && (
                <Badge ml={2} colorScheme="green" fontSize="xs">
                  You
                </Badge>
              )}
            </Text>
          </HStack>
          <Divider mt={2} />
        </ListItem>
      ))}
    </List>
  );
};

export default ClientList;