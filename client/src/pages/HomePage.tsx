import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Button,
  Container,
  Flex,
  FormControl,
  FormLabel,
  Heading,
  Input,
  Stack,
  Text,
  useToast,
  VStack,
  Icon,
  InputGroup,
  InputRightElement,
  IconButton,
  Alert,
  AlertIcon,
  AlertDescription
} from '@chakra-ui/react';
import { FaLock, FaEye, FaEyeSlash, FaShare, FaRandom } from 'react-icons/fa';
import { v4 as uuidv4 } from 'uuid';
import { useSocket } from '../contexts/SocketContext';
import { useContentStore } from '../contexts/ContentStoreContext';

/**
 * Home page component
 */
const HomePage: React.FC = () => {
  // State
  const [sessionId, setSessionId] = useState<string>('');
  const [clientName, setClientName] = useState<string>('');
  const [passphrase, setPassphrase] = useState<string>('');
  const [showPassphrase, setShowPassphrase] = useState<boolean>(false);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  
  // Hooks
  const navigate = useNavigate();
  const toast = useToast();
  const { joinSession } = useSocket();
  const { updateSessionPassphrase } = useContentStore();
  
  /**
   * Generates a random session ID
   */
  const generateSessionId = () => {
    // Generate a short, readable ID
    const id = uuidv4().substring(0, 8);
    setSessionId(id);
  };
  
  /**
   * Generates a random passphrase
   */
  const generatePassphrase = () => {
    // Generate a random passphrase with 3 words
    const words = [
      'apple', 'banana', 'cherry', 'date', 'elderberry',
      'fig', 'grape', 'honeydew', 'kiwi', 'lemon',
      'mango', 'nectarine', 'orange', 'papaya', 'quince',
      'raspberry', 'strawberry', 'tangerine', 'watermelon'
    ];
    
    const randomWords = Array.from({ length: 3 }, () => 
      words[Math.floor(Math.random() * words.length)]
    );
    
    setPassphrase(randomWords.join('-'));
  };
  
  /**
   * Enters a session (creates if it doesn't exist, joins if it does)
   */
  const enterSession = async () => {
    if (!validateForm()) return;
    
    setIsProcessing(true);
    setError('');
    
    try {
      // Join session with Socket.IO
      await joinSession(sessionId, clientName, passphrase);
      
      // Set the session passphrase for content encryption/decryption
      updateSessionPassphrase(passphrase);
      
      // Store session info in localStorage
      localStorage.setItem('sessionId', sessionId);
      localStorage.setItem('clientName', clientName);
      localStorage.setItem('passphrase', passphrase);
      
      // Navigate to session page
      navigate(`/session/${sessionId}`);
    } catch (error) {
      console.error('Error entering session:', error);
      setError(error instanceof Error ? error.message : 'Failed to enter session');
      setIsProcessing(false);
    }
  };
  
  /**
   * Validates the form
   * @returns True if the form is valid
   */
  const validateForm = (): boolean => {
    if (!sessionId) {
      toast({
        title: 'Session ID required',
        description: 'Please enter a session ID',
        status: 'error',
        duration: 5000,
        isClosable: true
      });
      return false;
    }
    
    if (!clientName) {
      toast({
        title: 'Name required',
        description: 'Please enter your name',
        status: 'error',
        duration: 5000,
        isClosable: true
      });
      return false;
    }
    
    if (!passphrase) {
      toast({
        title: 'Passphrase required',
        description: 'Please enter a passphrase',
        status: 'error',
        duration: 5000,
        isClosable: true
      });
      return false;
    }
    
    return true;
  };
  
  // Handle form submission (Enter key press)
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    enterSession();
  };

  return (
    <Container maxW="container.md" py={10}>
      <VStack spacing={8} align="stretch">
        <Box textAlign="center">
          <Heading as="h1" size="2xl" mb={2}>ShareThings</Heading>
          <Text fontSize="lg" color="gray.600">
            Securely share content in real-time with end-to-end encryption
          </Text>
        </Box>
        
        <Box bg="white" p={8} borderRadius="lg" boxShadow="md">
          <form onSubmit={handleSubmit}>
            <Stack spacing={6}>
              {error && (
                <Alert status="error" borderRadius="md">
                  <AlertIcon />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              
              <FormControl isRequired>
                <FormLabel>Session ID</FormLabel>
                <InputGroup>
                  <Input
                    value={sessionId}
                    onChange={(e) => setSessionId(e.target.value)}
                    placeholder="Enter session ID"
                  />
                  <InputRightElement width="4.5rem">
                    <Button
                      h="1.75rem"
                      size="sm"
                      onClick={generateSessionId}
                      aria-label="Generate session ID"
                      tabIndex={-1} // Remove from tab sequence
                    >
                      <Icon as={FaRandom} />
                    </Button>
                  </InputRightElement>
                </InputGroup>
              </FormControl>
              
              <FormControl isRequired>
                <FormLabel>Your Name</FormLabel>
                <Input
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  placeholder="Enter your name"
                />
              </FormControl>
              
              <FormControl isRequired>
                <FormLabel>Passphrase</FormLabel>
                <InputGroup>
                  <Input
                    type={showPassphrase ? 'text' : 'password'}
                    value={passphrase}
                    onChange={(e) => setPassphrase(e.target.value)}
                    placeholder="Enter passphrase"
                  />
                  <InputRightElement width="4.5rem">
                    <IconButton
                      h="1.75rem"
                      size="sm"
                      onClick={() => setShowPassphrase(!showPassphrase)}
                      icon={showPassphrase ? <FaEyeSlash /> : <FaEye />}
                      aria-label={showPassphrase ? 'Hide passphrase' : 'Show passphrase'}
                      tabIndex={-1} // Remove from tab sequence
                    />
                  </InputRightElement>
                </InputGroup>
                <Flex justify="flex-end" mt={1}>
                  <Button
                    size="xs"
                    variant="link"
                    onClick={generatePassphrase}
                    leftIcon={<FaRandom />}
                    tabIndex={-1} // Remove from tab sequence
                  >
                    Generate random passphrase
                  </Button>
                </Flex>
              </FormControl>
              
              <Text fontSize="sm" color="gray.600">
                <Icon as={FaLock} mr={1} />
                All content is encrypted with your passphrase before sending.
                The server never sees your unencrypted content.
              </Text>
              
              <Button
                type="submit"
                colorScheme="blue"
                leftIcon={<FaShare />}
                onClick={enterSession}
                isLoading={isProcessing}
                loadingText="Entering..."
                width="100%"
              >
                Enter Session
              </Button>
            </Stack>
          </form>
        </Box>
      </VStack>
    </Container>
  );
};

export default HomePage;