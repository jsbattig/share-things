import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box,
  Button,
  Container,
  Flex,
  Grid,
  GridItem,
  Heading,
  HStack,
  Icon,
  Text,
  useToast,
  VStack,
  Spinner,
  Badge,
  Divider,
  useDisclosure,
  Alert,
  AlertIcon,
  AlertDescription
} from '@chakra-ui/react';
import { FaUsers, FaSignOutAlt, FaLock } from 'react-icons/fa';
import { useSocket } from '../contexts/SocketContext';
import { useContentStore } from '../contexts/ContentStoreContext';
import ContentList from '../components/content/ContentList';
import ClientList from '../components/session/ClientList';
import SharePanel from '../components/content/SharePanel';

/**
 * Session page component
 */
const SessionPage: React.FC = () => {
  // Get session ID from URL
  const { sessionId } = useParams<{ sessionId: string }>();
  
  // State
  const [isJoining, setIsJoining] = useState<boolean>(true);
  const [isLeaving, setIsLeaving] = useState<boolean>(false);
  const [clientName, setClientName] = useState<string>('');
  const [passphrase, setPassphrase] = useState<string>('');
  const [clients, setClients] = useState<Array<{ id: string, name: string }>>([]);
  const [error, setError] = useState<string>('');
  
  // Hooks
  const navigate = useNavigate();
  const toast = useToast();
  const { onOpen } = useDisclosure();
  
  // Context
  const { socket, isConnected, connectionStatus, joinSession, leaveSession, rejoinSession, ensureConnected } = useSocket();
  const { clearContents, updateSessionPassphrase } = useContentStore();
  
  // Load session info from localStorage
  useEffect(() => {
    const storedSessionId = localStorage.getItem('sessionId');
    const storedClientName = localStorage.getItem('clientName');
    const storedPassphrase = localStorage.getItem('passphrase');
    const storedToken = localStorage.getItem('sessionToken');
    
    if (storedSessionId !== sessionId || !storedClientName || !storedPassphrase || !storedToken) {
      // Invalid session info, redirect to home
      toast({
        title: 'Invalid session',
        description: 'Please join a session from the home page',
        status: 'error',
        duration: 5000,
        isClosable: true
      });
      navigate('/');
      return;
    }
    
    setClientName(storedClientName);
    setPassphrase(storedPassphrase);
  }, [sessionId, navigate, toast]);
  
  // Track if we've already joined to prevent infinite loops
  const hasJoined = React.useRef(false);
  
  // Join session when connected - only run once when connected
  useEffect(() => {
    if (!isConnected || !sessionId || !clientName || !passphrase) return;
    
    const join = async () => {
      // Skip if we've already joined
      if (hasJoined.current) return;
      
      try {
        setIsJoining(true);
        setError('');
        
        // Mark that we're attempting to join to prevent duplicate attempts
        hasJoined.current = true;
        
        
        // Join session
        const response = await joinSession(sessionId, clientName, passphrase);
        setClients(response.clients || []);
        
        // Set the session passphrase for content encryption/decryption
        updateSessionPassphrase(passphrase);
        
        
        toast({
          title: 'Joined session',
          description: `You've joined session ${sessionId}`,
          status: 'success',
          duration: 5000,
          isClosable: true
        });
      } catch (error) {
        console.error('Error joining session:', error);
        setError(error instanceof Error ? error.message : 'Failed to join session');
        
        // Reset join flag on error
        hasJoined.current = false;
        
        // Clear session info
        localStorage.removeItem('sessionId');
        localStorage.removeItem('clientName');
        localStorage.removeItem('passphrase');
        localStorage.removeItem('sessionToken');
        
        // Redirect to home after a delay
        setTimeout(() => {
          navigate('/');
        }, 5000);
      } finally {
        setIsJoining(false);
      }
    };
    
    join();
  }, [isConnected, sessionId, clientName, passphrase, joinSession, updateSessionPassphrase, toast, navigate]);
  
  // Handle manual reconnection when connection status changes
  useEffect(() => {
    if (connectionStatus === 'disconnected' && sessionId && clientName && passphrase) {
      // Connection lost - will attempt to rejoin when reconnected
    } else if (connectionStatus === 'connected' && sessionId && clientName && passphrase) {
      // Check if we need to rejoin the session - but only if we haven't already joined
      // AND we're not currently in the process of joining
      if (socket && clients.length === 0 && !hasJoined.current && !isJoining) {
        rejoinSession(sessionId, clientName, passphrase);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectionStatus, sessionId, clientName, passphrase, socket]);
  
  // Initial connection check only (visibility change is handled by SocketContext)
  useEffect(() => {
    if (!sessionId || !clientName || !passphrase) return;
    
    // Do an initial connection check when this effect runs
    if (document.visibilityState === 'visible') {
      ensureConnected(sessionId)
        .then(() => {
          // Connection check completed
        })
        .catch(() => {
          // Connection check failed
        });
    }
  }, [sessionId, clientName, passphrase, ensureConnected]);
  
  // Set up socket event listeners separately
  useEffect(() => {
    if (!socket || !isConnected) return;
    
    const handleClientJoined = (data: { clientId: string, clientName: string }) => {
      
      setClients(prev => {
        // Check if client already exists in the list
        const clientExists = prev.some(client => client.id === data.clientId);
        
        // Only add the client if it doesn't already exist
        if (!clientExists) {
          return [...prev, { id: data.clientId, name: data.clientName }];
        }
        return prev;
      });
      
      toast({
        title: 'User joined',
        description: `${data.clientName} joined the session`,
        status: 'info',
        duration: 3000,
        isClosable: true
      });
    };
    
    const handleClientLeft = (data: { clientId: string }) => {
      setClients(prev => {
        // Find client name before removing
        const client = prev.find(c => c.id === data.clientId);
        
        if (client) {
          toast({
            title: 'User left',
            description: `${client.name} left the session`,
            status: 'info',
            duration: 3000,
            isClosable: true
          });
        }
        
        return prev.filter(client => client.id !== data.clientId);
      });
    };
    
    socket.on('client-joined', handleClientJoined);
    socket.on('client-left', handleClientLeft);
    
    return () => {
      socket.off('client-joined', handleClientJoined);
      socket.off('client-left', handleClientLeft);
    };
  }, [socket, isConnected, toast]);
  
  // Add socket expiration handler
  useEffect(() => {
    if (!socket || !isConnected || !sessionId) return;
    
    const handleSessionExpired = (data: { sessionId: string, message: string }) => {
      if (data.sessionId === sessionId) {
        
        toast({
          title: 'Session expired',
          description: data.message || 'Your session has expired due to inactivity',
          status: 'error',
          duration: 5000,
          isClosable: true
        });
        
        // Try to rejoin if we have credentials
        if (clientName && passphrase) {
          
          // Use the useSocket hook's rejoinSession method
          rejoinSession(sessionId, clientName, passphrase)
            .then(() => {
              
              toast({
                title: 'Reconnected',
                description: 'Successfully reconnected to session',
                status: 'success',
                duration: 3000,
                isClosable: true
              });
            })
            .catch(err => {
              console.error('Failed to rejoin after expiration:', err);
              
              // Navigate to home page if rejoin fails
              toast({
                title: 'Session error',
                description: 'Could not rejoin the session. Returning to home page.',
                status: 'error',
                duration: 5000,
                isClosable: true
              });
              
              // Clear session info and redirect after a delay
              localStorage.removeItem('sessionId');
              localStorage.removeItem('clientName');
              localStorage.removeItem('passphrase');
              localStorage.removeItem('sessionToken');
              
              setTimeout(() => {
                navigate('/');
              }, 2000);
            });
        }
      }
    };
    
    // Add listener for session expiration events
    socket.on('session-expired', handleSessionExpired);
    
    return () => {
      socket.off('session-expired', handleSessionExpired);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket, isConnected, sessionId, clientName, passphrase]);
  
  /**
   * Leaves the session
   */
  const handleLeaveSession = () => {
    if (!sessionId) return;
    
    setIsLeaving(true);
    
    try {
      // Leave session
      leaveSession(sessionId);
      
      // Clear session info
      localStorage.removeItem('sessionId');
      localStorage.removeItem('clientName');
      localStorage.removeItem('passphrase');
      localStorage.removeItem('sessionToken');
      
      // Clear content store
      clearContents();
      
      // Navigate to home
      navigate('/');
    } catch (error) {
      console.error('Error leaving session:', error);
      toast({
        title: 'Error',
        description: 'Failed to leave session',
        status: 'error',
        duration: 5000,
        isClosable: true
      });
      setIsLeaving(false);
    }
  };
  
  // Show loading state
  if (isJoining) {
    return (
      <Container maxW="container.xl" py={10}>
        <VStack spacing={8} align="center" justify="center" minH="60vh">
          <Spinner size="xl" color="blue.500" thickness="4px" />
          <Text fontSize="lg">Joining session...</Text>
        </VStack>
      </Container>
    );
  }
  
  // Show error state
  if (error) {
    return (
      <Container maxW="container.xl" py={10}>
        <VStack spacing={8} align="center" justify="center" minH="60vh">
          <Alert status="error" borderRadius="md">
            <AlertIcon />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
          <Text>Redirecting to home page...</Text>
        </VStack>
      </Container>
    );
  }
  
  return (
    <Container maxW="container.xl" py={6}>
      <Grid templateColumns="repeat(12, 1fr)" gap={6}>
        {/* Header */}
        <GridItem colSpan={12}>
          <Flex justify="space-between" align="center" mb={6}>
            <Box>
              <Heading as="h1" size="lg">ShareThings</Heading>
              <HStack spacing={2} mt={1}>
                <Text fontWeight="bold">Session:</Text>
                <Text>{sessionId}</Text>
                {connectionStatus === 'connected' && (
                  <Badge colorScheme="green">Connected</Badge>
                )}
                {connectionStatus === 'disconnected' && (
                  <Badge colorScheme="red">Disconnected</Badge>
                )}
                {connectionStatus === 'reconnecting' && (
                  <Badge colorScheme="yellow">Reconnecting...</Badge>
                )}
                <Icon as={FaLock} color="green.500" title="End-to-end encrypted" />
              </HStack>
            </Box>
            
            <HStack spacing={4}>
              <Button
                leftIcon={<FaUsers />}
                variant="ghost"
                onClick={onOpen}
              >
                Users ({clients.length})
              </Button>
              
              <Button
                leftIcon={<FaSignOutAlt />}
                colorScheme="red"
                variant="outline"
                onClick={handleLeaveSession}
                isLoading={isLeaving}
                loadingText="Leaving..."
              >
                Leave Session
              </Button>
            </HStack>
          </Flex>
          <Divider mb={6} />
        </GridItem>
        
        {/* Content area */}
        <GridItem colSpan={{ base: 12, md: 8 }}>
          <Box bg="white" borderRadius="lg" boxShadow="md" p={6} minH="70vh">
            <ContentList />
          </Box>
        </GridItem>
        
        {/* Sidebar */}
        <GridItem colSpan={{ base: 12, md: 4 }}>
          <VStack spacing={6} align="stretch">
            <Box bg="white" borderRadius="lg" boxShadow="md" p={6}>
              <Heading as="h2" size="md" mb={4}>Share Content</Heading>
              <SharePanel sessionId={sessionId || ''} passphrase={passphrase} />
            </Box>
            
            <Box bg="white" borderRadius="lg" boxShadow="md" p={6}>
              <Heading as="h2" size="md" mb={4}>Connected Users</Heading>
              <ClientList clients={clients} />
            </Box>
          </VStack>
        </GridItem>
      </Grid>
      
    </Container>
  );
};

export default SessionPage;