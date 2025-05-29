/* eslint-disable react/display-name, react/prop-types */
import React, { useState, useRef, useEffect } from 'react';
import {
  Box,
  Button,
  VStack,
  HStack,
  Text,
  Textarea,
  Icon,
  useToast,
  Input,
  FormControl,
  FormLabel,
  Tabs,
  TabList,
  Tab,
  TabPanels,
  TabPanel,
  Progress,
  Divider,
  Alert,
  AlertIcon
} from '@chakra-ui/react';
import {
  FaClipboard,
  FaPaste,
  FaFileUpload
} from 'react-icons/fa';
import { v4 as uuidv4 } from 'uuid';

/**
 * Extended File interface with image information
 */
interface ExtendedFile extends File {
  imageInfo?: {
    width?: number;
    height?: number;
    format?: string;
  };
}
import { useSocket, ChunkData } from '../../contexts/SocketContext';
import { useContentStore, ContentType } from '../../contexts/ContentStoreContext';
import { formatFileSize } from '../../utils/formatters';
import {
  deriveKeyFromPassphrase,
  encryptData
} from '../../utils/encryption';
import {
  chunkAndEncryptBlob,
  serializeChunk
} from '../../utils/chunking';

interface SharePanelProps {
  sessionId: string;
  passphrase: string;
}

/**
 * Share panel component
 */
const SharePanel: React.FC<SharePanelProps> = React.memo(({ sessionId, passphrase }) => {
  // State
  const [text, setText] = useState<string>('');
  const [isSharing, setIsSharing] = useState<boolean>(false);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [isIOS, setIsIOS] = useState<boolean>(false);
  
  // Refs
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Detect iOS platform on component mount
  useEffect(() => {
    const detectIOS = () => {
      const userAgent = window.navigator.userAgent.toLowerCase();
      return /iphone|ipad|ipod/.test(userAgent) ||
             (userAgent.includes('mac') && 'ontouchend' in document);
    };
    
    setIsIOS(detectIOS());
  }, []);
  
  // Context
  const { socket, sendContent, sendChunk, ensureConnected } = useSocket();
  const { addContent } = useContentStore();
  
  // Toast
  const toast = useToast();
  
  /**
   * Shares text content
   * @param textToShare Optional parameter to directly share text without using state
   */
  const shareText = async (textToShare?: string) => {
    // Use provided text or fall back to state
    const contentToShare = textToShare || text;
    
    if (!contentToShare.trim()) {
      toast({
        title: 'Empty text',
        description: 'Please enter some text to share',
        status: 'error',
        duration: 3000,
        isClosable: true
      });
      return;
    }
    
    setIsSharing(true);
    
    // Ensure connection is valid before proceeding
    const isConnected = await ensureConnected(sessionId);
    if (!isConnected) {
      console.error('[ShareText] Failed to ensure connection before sharing');
      toast({
        title: 'Connection error',
        description: 'Could not verify connection to server. Please try again.',
        status: 'error',
        duration: 3000,
        isClosable: true
      });
      setIsSharing(false);
      return;
    }
    
    try {
      console.log('[ShareText] Starting text sharing process');
      
      // Create content metadata
      const contentId = uuidv4();
      const content = {
        contentId,
        senderId: socket?.id || 'unknown',
        senderName: localStorage.getItem('clientName') || 'You',
        contentType: ContentType.TEXT,
        timestamp: Date.now(),
        metadata: {
          mimeType: 'text/plain',
          size: contentToShare.length,
          textInfo: {
            encoding: 'utf-8',
            lineCount: contentToShare.split('\n').length
          }
        },
        isChunked: false,
        totalSize: contentToShare.length
      };
      
      console.log('[ShareText] Content metadata created:', contentId);
      
      // Implement encryption
      // First, add to local content store for immediate display
      console.log('[ShareText] Adding content to local store');
      addContent(content, contentToShare);
      
      // Encrypt the text
      const textEncoder = new TextEncoder();
      const textData = textEncoder.encode(contentToShare);
      
      const { encryptedData, iv } = await encryptData(
        await deriveKeyFromPassphrase(passphrase),
        textData,
        passphrase
      );
      
      // Convert encrypted data to base64 for transmission
      const encryptedText = btoa(
        Array.from(new Uint8Array(encryptedData))
          .map(byte => String.fromCharCode(byte))
          .join('')
      );
      
      // Include IV with content metadata
      const encryptedContent = {
        ...content,
        encryptionMetadata: {
          iv: Array.from(iv)
        }
      };
      
      // Send encrypted content to server
      console.log('[ShareText] Sending encrypted content to server');
      sendContent(sessionId, encryptedContent, encryptedText);
      
      // Force state reset to ensure UI updates properly
      setIsSharing(false);
      
      // Clear text (only if we're using the state value)
      if (!textToShare) {
        setText('');
      }
      
      console.log('[ShareText] Text sharing completed successfully');
      toast({
        title: 'Text shared',
        status: 'success',
        duration: 2000,
        isClosable: true
      });
    } catch (error) {
      console.error('[ShareText] Error sharing text:', error);
      toast({
        title: 'Error',
        description: 'Failed to share text',
        status: 'error',
        duration: 3000,
        isClosable: true
      });
    } finally {
      console.log('[ShareText] Sharing process completed');
      setIsSharing(false);
    }
  };
  
  /**
   * Handles file selection
   */
  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    
    const file = files[0];
    shareFile(file);
    
    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };
  
  /**
   * Shares a file
   */
  const shareFile = async (file: ExtendedFile) => {
    setIsSharing(true);
    setUploadProgress(0);
    
    // Ensure connection is valid before proceeding
    const isConnected = await ensureConnected(sessionId);
    if (!isConnected) {
      console.error('[ShareFile] Failed to ensure connection before sharing');
      toast({
        title: 'Connection error',
        description: 'Could not verify connection to server. Please try again.',
        status: 'error',
        duration: 3000,
        isClosable: true
      });
      setIsSharing(false);
      return;
    }
    
    try {
      // Create content metadata
      const contentId = uuidv4();
      const isImage = file.type.startsWith('image/');
      
      const content = {
        contentId,
        senderId: socket?.id || 'unknown',
        senderName: localStorage.getItem('clientName') || 'You',
        contentType: isImage ? ContentType.IMAGE : ContentType.FILE,
        timestamp: Date.now(),
        metadata: {
          fileName: file.name,
          mimeType: file.type || 'application/octet-stream',
          size: file.size,
          fileInfo: !isImage ? {
            extension: file.name.split('.').pop() || ''
          } : undefined,
          imageInfo: isImage ? {
            width: file.imageInfo?.width || 0,
            height: file.imageInfo?.height || 0,
            format: file.imageInfo?.format || file.name.split('.').pop() || '',
          } : undefined
        },
        isChunked: file.size > 64 * 1024, // Chunk if larger than 64KB
        totalChunks: file.size > 64 * 1024 ? Math.ceil(file.size / (64 * 1024)) : 1,
        totalSize: file.size
      };
      
      // Implement chunking and encryption
      const reader = new FileReader();
      
      reader.onload = async (e) => {
        const data = e.target?.result;
        
        if (data) {
          try {
            // Add to local content store for immediate display
            addContent(content, new Blob([data as ArrayBuffer], { type: file.type }));
            
            if (!content.isChunked) {
              // For small files, encrypt the entire file
              const { encryptedData, iv } = await encryptData(
                await deriveKeyFromPassphrase(passphrase),
                new Uint8Array(data as ArrayBuffer),
                passphrase
              );
              
              // Convert to base64 for transmission
              const base64 = btoa(
                Array.from(new Uint8Array(encryptedData))
                  .map(byte => String.fromCharCode(byte))
                  .join('')
              );
              
              // Include IV with content metadata
              const encryptedContent = {
                ...content,
                encryptionMetadata: {
                  iv: Array.from(iv)
                }
              };
              
              // Send encrypted content to server
              sendContent(sessionId, encryptedContent, base64);
              
              // Reset uploading state for non-chunked files
              setIsSharing(false);
            } else {
              // For large files, use chunking - pass the original content ID to maintain consistency
              const { chunks, contentId } = await chunkAndEncryptBlob(
                new Blob([data as ArrayBuffer], { type: file.type }),
                passphrase,
                {},
                content.contentId
              );
              
              // Log content ID consistency
              console.log(`[ShareFile] Using consistent content ID: ${contentId}`);
              console.log(`[ShareFile] Original content ID: ${content.contentId}`);
              console.log(`[ShareFile] Sender info - ID: ${content.senderId}, Name: ${content.senderName}`);
              
              // Send content metadata first - now using the same ID throughout
              const encryptedContent = {
                ...content,
                contentId
              };
              
              // DEBUG: Log the final content object being sent
              console.log(`[ShareFile] Sending content metadata:`, JSON.stringify(encryptedContent));
              
              console.log(`[ShareFile] Sending content metadata with ID: ${contentId}`);
              sendContent(sessionId, encryptedContent);
              
              // Send chunks with progress tracking
              let sentChunks = 0;
              const totalChunks = chunks.length;
              
              for (const chunk of chunks) {
                try {
                  console.log(`[ShareFile] Sending chunk ${chunk.chunkIndex}/${chunk.totalChunks} for content ${chunk.contentId}`);
                  
                  // Verify content ID consistency
                  if (chunk.contentId !== contentId) {
                    console.error(`[ShareFile] Content ID mismatch! Chunk has ${chunk.contentId} but content metadata has ${contentId}`);
                  }
                  
                  // Send serialized chunk
                  const serializedChunk = serializeChunk(chunk);
                  console.log(`[ShareFile] Serialized chunk contentId: ${serializedChunk.contentId}`);
                  
                  // Convert serialized chunk to ChunkData format
                  const chunkData: ChunkData = {
                    contentId: serializedChunk.contentId,
                    chunkIndex: serializedChunk.chunkIndex,
                    totalChunks: serializedChunk.totalChunks,
                    // Add the remaining properties as unknown
                    encryptedData: serializedChunk.encryptedData,
                    iv: serializedChunk.iv
                  };
                  
                  sendChunk(sessionId, chunkData);
                  
                  // Update progress
                  sentChunks++;
                  setUploadProgress((sentChunks / totalChunks) * 100);
                  console.log(`[ShareFile] Chunk ${chunk.chunkIndex}/${chunk.totalChunks} sent, progress: ${sentChunks}/${totalChunks}`);
                  
                  // Small delay to prevent network congestion
                  await new Promise(resolve => setTimeout(resolve, 100)); // Increased delay to 100ms
                } catch (error) {
                  console.error(`[ShareFile] Error sending chunk ${chunk.chunkIndex}:`, error);
                  throw error; // Re-throw to be caught by outer try-catch
                }
              }
              
              // Set sharing to false when all chunks are sent
              setIsSharing(false);
            }
            
            // Only show success toast here, not duplicated below
            toast({
              title: 'File shared',
              description: `${file.name} (${formatFileSize(file.size)})`,
              status: 'success',
              duration: 2000,
              isClosable: true
            });
          } catch (error) {
            console.error('Error sharing file:', error);
            toast({
              title: 'Error',
              description: 'Failed to share file',
              status: 'error',
              duration: 3000,
              isClosable: true
            });
            setIsSharing(false);
          }
          
          // Removed duplicate toast notification
        }
      };
      
      reader.onerror = () => {
        throw new Error('Failed to read file');
      };
      
      reader.readAsArrayBuffer(file);
    } catch (error) {
      console.error('Error sharing file:', error);
      toast({
        title: 'Error',
        description: 'Failed to share file',
        status: 'error',
        duration: 3000,
        isClosable: true
      });
      setIsSharing(false);
    }
  };
  
  /**
   * Handles paste from clipboard
   */
  const handlePaste = async () => {
    // If on iOS, show a helpful message instead of attempting to access clipboard
    if (isIOS) {
      console.log('[Paste] Paste button clicked on iOS device');
      toast({
        title: 'Clipboard access restricted',
        description: 'On iOS, please paste text directly into the text area or use the file upload for images.',
        status: 'info',
        duration: 5000,
        isClosable: true
      });
      return;
    }
    
    try {
      // First ensure we have a valid connection before attempting paste
      const isConnected = await ensureConnected(sessionId);
      if (!isConnected) {
        console.error('[Paste] Failed to ensure connection before pasting');
        toast({
          title: 'Connection error',
          description: 'Could not verify connection to server. Please try again.',
          status: 'error',
          duration: 3000,
          isClosable: true
        });
        return;
      }
      
      const clipboardItems = await navigator.clipboard.read();
      
      for (const clipboardItem of clipboardItems) {
        // Check for image
        if (clipboardItem.types.includes('image/png') ||
            clipboardItem.types.includes('image/jpeg') ||
            clipboardItem.types.includes('image/gif')) {
          const imageType = clipboardItem.types.find(type => type.startsWith('image/')) || 'image/png';
          const blob = await clipboardItem.getType(imageType);
          
          // Get image dimensions and additional metadata
          const img = new Image();
          const imageUrl = URL.createObjectURL(blob);
          
          // Wait for image to load to get dimensions
          await new Promise((resolve) => {
            img.onload = () => {
              resolve(true);
            };
            img.src = imageUrl;
          });
          
          // Create a file from the blob
          const file = new File([blob], `clipboard-image-${Date.now()}.${imageType.split('/')[1]}`, {
            type: imageType
          });
          
          // Add image info to file before sharing
          const enhancedFile = Object.assign(file, {
            imageInfo: {
              width: img.width,
              height: img.height,
              format: imageType.split('/')[1]
            }
          });
          
          // Clean up URL
          URL.revokeObjectURL(imageUrl);
          
          // Share the file with enhanced metadata
          shareFile(enhancedFile);
          return;
        }
        
        // Check for text
        if (clipboardItem.types.includes('text/plain')) {
          const blob = await clipboardItem.getType('text/plain');
          const clipboardText = await blob.text();
          
          // Set text in textarea for display
          setText(clipboardText);
          
          // Directly share the text with the clipboard content
          await shareText(clipboardText);
          return;
        }
      }
      
      toast({
        title: 'Nothing to paste',
        description: 'No supported content found in clipboard',
        status: 'info',
        duration: 3000,
        isClosable: true
      });
    } catch (error) {
      console.error('Error pasting from clipboard:', error);
      
      // Provide a more helpful error message
      const errorMessage = isIOS
        ? 'iOS restricts clipboard access in browsers. Please paste text directly into the text area or use the file upload for images.'
        : 'Failed to access clipboard. Make sure you have granted clipboard permission to this site.';
      
      toast({
        title: 'Clipboard error',
        description: errorMessage,
        status: 'error',
        duration: 5000,
        isClosable: true
      });
    }
  };
  
  /**
   * Handles file drop
   */
  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    
    const files = event.dataTransfer.files;
    if (files.length > 0) {
      shareFile(files[0]);
    }
  };
  
  /**
   * Prevents default drag behavior
   */
  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
  };
  
  return (
    <Box>
      <Tabs variant="soft-rounded" colorScheme="blue" size="sm">
        <TabList>
          <Tab>Text</Tab>
          <Tab>File</Tab>
        </TabList>
        
        <TabPanels mt={4}>
          {/* Text sharing panel */}
          <TabPanel p={0}>
            <VStack spacing={4} align="stretch">
              {isIOS && (
                <Alert status="info" borderRadius="md" fontSize="sm">
                  <AlertIcon />
                  On iOS, paste text directly into the text area below. For images, use the File tab.
                </Alert>
              )}
              <FormControl>
                <FormLabel>Share Text</FormLabel>
                <Textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder={isIOS ? "Paste text here to share..." : "Type or paste text to share..."}
                  rows={5}
                  resize="vertical"
                  onPaste={async (e) => {
                    // For iOS users, automatically share text when pasted directly
                    if (isIOS) {
                      const pastedText = e.clipboardData?.getData('text');
                      if (pastedText && pastedText.trim()) {
                        // Let the default paste happen first to update the textarea
                        setTimeout(async () => {
                          // Then share the text
                          await shareText(pastedText);
                        }, 100);
                      }
                    }
                  }}
                />
              </FormControl>
              
              <HStack spacing={2}>
                <Button
                  leftIcon={<Icon as={FaPaste} />}
                  onClick={handlePaste}
                  size="sm"
                  variant="outline"
                  isDisabled={isIOS}
                  title={isIOS ? "Paste functionality is not available on iOS. Please paste directly into the text area." : "Paste from clipboard"}
                >
                  Paste
                </Button>
                
                <Button
                  colorScheme="blue"
                  leftIcon={<Icon as={FaClipboard} />}
                  onClick={() => shareText()}
                  isLoading={isSharing}
                  loadingText="Sharing..."
                  size="sm"
                  isDisabled={!text.trim()}
                  flex={1}
                >
                  Share
                </Button>
              </HStack>
            </VStack>
          </TabPanel>
          
          {/* File sharing panel */}
          <TabPanel p={0}>
            <VStack spacing={4} align="stretch">
              <Box
                border="2px dashed"
                borderColor="gray.200"
                borderRadius="md"
                p={6}
                textAlign="center"
                bg="gray.50"
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                cursor="pointer"
                onClick={() => fileInputRef.current?.click()}
                transition="all 0.2s"
                _hover={{ borderColor: 'blue.300', bg: 'blue.50' }}
              >
                <Icon as={FaFileUpload} boxSize={8} color="blue.400" mb={2} />
                <Text fontWeight="medium">
                  Drop a file here or click to browse
                </Text>
                <Text fontSize="sm" color="gray.500" mt={1}>
                  Supports images, documents, and other files
                </Text>
                <Input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileSelect}
                  display="none"
                />
              </Box>
              
              {isSharing && (
                <Box>
                  <Text fontSize="sm" mb={1}>Uploading...</Text>
                  <Progress value={uploadProgress} size="sm" colorScheme="blue" borderRadius="full" />
                </Box>
              )}
            </VStack>
          </TabPanel>
        </TabPanels>
      </Tabs>
      
      <Divider my={4} />
      
      <Text fontSize="xs" color="gray.500" textAlign="center">
        All content is end-to-end encrypted with your session passphrase
      </Text>
      
      {isIOS && (
        <Text fontSize="xs" color="orange.500" textAlign="center" mt={2}>
          Note: On iOS devices, use system paste (long-press) to paste text directly into the text area.
          For images, save them to your device and use the file upload option.
        </Text>
      )}
    </Box>
  );
});

export default SharePanel;