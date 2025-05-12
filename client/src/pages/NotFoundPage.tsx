import React from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Box,
  Button,
  Container,
  Heading,
  Text,
  VStack,
  Icon
} from '@chakra-ui/react';
import { FaHome, FaExclamationTriangle } from 'react-icons/fa';

/**
 * Not found page component
 */
const NotFoundPage: React.FC = () => {
  return (
    <Container maxW="container.md" py={10}>
      <VStack spacing={8} align="center" textAlign="center">
        <Icon as={FaExclamationTriangle} boxSize={16} color="orange.500" />
        
        <Heading as="h1" size="2xl">
          404 - Page Not Found
        </Heading>
        
        <Text fontSize="lg" color="gray.600">
          The page you're looking for doesn't exist or has been moved.
        </Text>
        
        <Box>
          <Button
            as={RouterLink}
            to="/"
            colorScheme="blue"
            leftIcon={<FaHome />}
            size="lg"
          >
            Go Home
          </Button>
        </Box>
      </VStack>
    </Container>
  );
};

export default NotFoundPage;