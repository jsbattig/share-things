/* eslint-disable react/display-name, react/prop-types */
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Box,
  Flex,
  Text,
  HStack,
  VStack,
  Icon,
  IconButton,
  Button,
  Menu,
  MenuButton,
  MenuList,
  MenuItem,
  Badge,
  useToast,
  useClipboard,
  Image,
  Spinner,
  Input,
  useDisclosure
} from '@chakra-ui/react';
import {
  FaEllipsisV,
  FaTrash,
  FaDownload,
  FaCopy,
  FaFile,
  FaFileAlt,
  FaFileImage,
  FaUser,
  FaCheck,
  FaExclamationTriangle,
  FaEdit
} from 'react-icons/fa';
import { RiPushpinFill, RiPushpinLine } from 'react-icons/ri';
import { useContentStore, ContentType, SharedContent } from '../../contexts/ContentStoreContext';
import { useServices } from '../../contexts/ServiceContext';
import { formatFileSize, formatDate } from '../../utils/formatters';

/**
 * Helper function to extract text from a Blob
 */
const extractTextFromBlob = async (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    try {
      const reader = new FileReader();
      reader.onload = () => {
        resolve(reader.result as string);
      };
      reader.onerror = () => {
        reject(new Error('Failed to read blob'));
      };
      reader.readAsText(blob);
    } catch (error) {
      reject(error);
    }
  });
};

/**
 * Component to render an image
 */
const ImageRenderer: React.FC<{
  contentId: string;
  blob: Blob;
  fileName?: string;
  isComplete: boolean;
  updateContentLastAccessed: (contentId: string) => void;
  chunkTrackingService: unknown;
  urlRegistry: unknown;
}> = ({ contentId, blob, fileName, isComplete, updateContentLastAccessed, chunkTrackingService, urlRegistry }) => {
  
  const [imageError, setImageError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [loadingState, setLoadingState] = useState<'loading' | 'success' | 'error'>('loading');
  
  // Ensure we have a proper image blob with correct MIME type
  const imageBlob = useMemo(() => {
    if (!blob) {
      return null;
    }
    
    try {
      // Check if the blob is actually an image by examining its type
      const isImageType = blob.type.startsWith('image/');
      
      // Keep the original blob type if it's an image type, otherwise use a default
      const blobType = isImageType ? blob.type : 'image/png';
      
      const resultBlob = new Blob([blob], { type: blobType });
      return resultBlob;
    } catch (error) {
      console.error(`Error creating image blob:`, error);
      return null;
    }
  }, [blob]);
  
  // Extract text from a blob
  const extractTextFromBlob = useCallback(async (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          resolve(reader.result);
        } else {
          reject(new Error('Failed to read blob as text'));
        }
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsText(blob);
    });
  }, []);
  
  // Validate the blob to check if it's actually an image
  const validateImageBlob = useCallback(async (blob: Blob): Promise<boolean> => {
    try {
      // If the blob type is already an image type, trust it
      if (blob.type.startsWith('image/')) {
        return true;
      }
      
      // Read the first few bytes to check for common image signatures
      const buffer = await blob.slice(0, 8).arrayBuffer();
      const header = new Uint8Array(buffer);
      
      // Check for common image signatures
      // PNG: 89 50 4E 47 0D 0A 1A 0A
      const isPng = header[0] === 0x89 &&
                    header[1] === 0x50 &&
                    header[2] === 0x4E &&
                    header[3] === 0x47;
      
      // JPEG: FF D8 FF
      const isJpeg = header[0] === 0xFF &&
                     header[1] === 0xD8 &&
                     header[2] === 0xFF;
      
      // GIF: 47 49 46 38
      const isGif = header[0] === 0x47 &&
                    header[1] === 0x49 &&
                    header[2] === 0x46 &&
                    header[3] === 0x38;
      
      const isImage = isPng || isJpeg || isGif;
      
      // Check if this might be text content
      
      return isImage;
    } catch (error) {
      console.error(`[ImageRenderer] Error validating blob:`, error);
      return false;
    }
  }, []);
  
  // Create URL only when we have a valid blob
  useEffect(() => {
    
    let isMounted = true;
    
    const createImageUrl = async () => {
      if (!imageBlob) {
        if (isMounted) {
          setImageError(true);
          setLoadingState('error');
        }
        return;
      }
      
      try {
        // First check if this is actually an image
        const isValid = await validateImageBlob(imageBlob);
        
        if (!isValid) {
          
          if (isMounted) {
            setImageError(true);
            setLoadingState('error');
          }
          return;
        }
        
        // Create URL for valid image blob
        const url = (urlRegistry as { createUrl: (contentId: string, blob: Blob) => string }).createUrl(contentId, imageBlob);
        
        if (isMounted) {
          setImageUrl(url);
          setLoadingState('loading'); // Still loading until the image is rendered
        }
      } catch (error) {
        console.error(`Error processing image:`, error);
        if (isMounted) {
          setImageError(true);
          setLoadingState('error');
        }
      }
    };
    
    createImageUrl();
    
    return () => {
      isMounted = false;
    };
  }, [contentId, imageBlob, urlRegistry, validateImageBlob, extractTextFromBlob]);
  
  // If image fails to load, we can try to reload it with more detailed error handling
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleImageError = useCallback((_e: React.SyntheticEvent<HTMLImageElement, Event>) => {
    
    setImageError(true);
    setLoadingState('error');
    
    // Try to reload the image up to 3 times with increasing delays
    if (retryCount < 3) {
      const delay = 1000 * (retryCount + 1);
      
      setTimeout(() => {
        // Revoke the old URL and create a new one
        if (imageUrl) {
          try {
            (urlRegistry as { revokeUrl: (contentId: string, url: string) => void }).revokeUrl(contentId, imageUrl);
          } catch (error) {
            console.error(`Error revoking URL during retry:`, error);
          }
        }
        
        if (imageBlob) {
          try {
            // Create a fresh blob with the same data but try different MIME types
            const mimeTypes = ['image/png', 'image/jpeg', 'image/gif'];
            const mimeType = mimeTypes[retryCount % mimeTypes.length];
            
            const freshBlob = new Blob([imageBlob], { type: mimeType });
            const newUrl = (urlRegistry as { createUrl: (contentId: string, blob: Blob) => string }).createUrl(contentId, freshBlob);
            setImageUrl(newUrl);
            setLoadingState('loading');
          } catch (error) {
            console.error(`Error creating new URL during retry:`, error);
          }
        }
        
        setRetryCount(prev => prev + 1);
        setImageError(false);
      }, delay);
    }
  }, [contentId, retryCount, imageBlob, imageUrl, urlRegistry]);
  
  // Handle successful image load
  const handleImageLoad = useCallback(() => {
    setLoadingState('success');
    
    // Force update content as complete if image loads successfully
    if (!isComplete) {
      updateContentLastAccessed(contentId);
      
      // Mark content as displayed in tracking service
      (chunkTrackingService as { markContentDisplayed: (contentId: string) => void }).markContentDisplayed(contentId);
    }
  }, [contentId, isComplete, updateContentLastAccessed, chunkTrackingService]);

  return (
    <>
      {!imageError && imageUrl ? (
        <Image
          key={`image-${contentId}-${retryCount}`}
          src={imageUrl || ''}
          alt={fileName || `Image-${contentId.substring(0, 8)}`}
          maxH="200px"
          objectFit="contain"
          onLoad={handleImageLoad}
          onError={handleImageError}
          crossOrigin="anonymous"
          fallback={
            <Flex direction="column" align="center" justify="center" h="200px">
              <Spinner size="md" color="blue.500" mb={2} />
              <Text fontSize="sm" color="gray.600">Loading image...</Text>
            </Flex>
          }
        />
      ) : (
        <Flex direction="column" align="center" justify="center" h="200px" bg="gray.50" borderRadius="md">
          <Icon as={FaExclamationTriangle} color="red.500" boxSize="24px" mb={2} />
          <Text color="red.500" mb={3} fontWeight="medium">Image failed to load</Text>
          <Text fontSize="xs" color="gray.600" mb={3} maxW="80%" textAlign="center">
            The image may be corrupted or in an unsupported format
          </Text>
          {retryCount >= 3 ? (
            <Text fontSize="xs" color="gray.500">Maximum retries reached</Text>
          ) : (
            <Button
              size="sm"
              colorScheme="blue"
              onClick={() => {
                setImageError(false);
                setLoadingState('loading');
                
                // Force a complete refresh of the image blob
                if (imageBlob) {
                  try {
                    // Create a completely new blob with the same data
                    const arrayBuffer = imageBlob.arrayBuffer();
                    arrayBuffer.then(buffer => {
                      const freshBlob = new Blob([buffer], { type: 'image/png' });
                      const newUrl = (urlRegistry as { createUrl: (contentId: string, blob: Blob) => string }).createUrl(contentId, freshBlob);
                      setImageUrl(newUrl);
                    }).catch(err => {
                      console.error(`Error creating fresh blob:`, err);
                    });
                  } catch (error) {
                    console.error(`Error during manual retry:`, error);
                  }
                }
              }}
            >
              Retry Loading
            </Button>
          )}
        </Flex>
      )}
      {loadingState === 'loading' && !imageError && (
        <Box
          position="absolute"
          top={0}
          left={0}
          right={0}
          bottom={0}
          bg="blackAlpha.50"
          display="flex"
          alignItems="center"
          justifyContent="center"
        >
          <Spinner size="sm" color="blue.500" mr={2} />
          <Text fontSize="xs" color="gray.600">Loading image...</Text>
        </Box>
      )}
    </>
  );
};

/**
 * Component to detect content type from a Blob
 */
const ContentTypeDetector: React.FC<{
  blob: Blob;
  onTypeDetected: (type: string) => void
}> = ({ blob, onTypeDetected }) => {
  
  
  useEffect(() => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result;
      if (typeof result === 'string' && /^[\x20-\x7E\n\r\t]+$/.test(result.substring(0, 100))) {
        
        onTypeDetected(ContentType.TEXT);
      }
    };
    // Read the first 100 bytes as text
    const slice = blob.slice(0, 100);
    reader.readAsText(slice);
  }, [blob, onTypeDetected]);
  
  return null; // This component doesn't render anything
};

/**
 * Component to extract and display text from a Blob
 */
const BlobTextExtractor: React.FC<{ blob: Blob }> = ({ blob }) => {
  const [textContent, setTextContent] = useState<string>('Loading text content...');
  
  useEffect(() => {
    const extractText = async () => {
      try {
        const text = await extractTextFromBlob(blob);
        setTextContent(text.length > 500 ? text.substring(0, 20) + '...' : text);
      } catch (error) {
        console.error('Error extracting text from blob:', error);
        setTextContent('Error loading text content');
      }
    };
    
    extractText();
  }, [blob]);
  
  return <>{textContent}</>;
};

interface ContentItemProps {
  contentId: string;
}

/**
 * Content item component
 */
const ContentItem: React.FC<ContentItemProps> = React.memo(({ contentId }) => {
  
  // Context
  const { getContent, updateContentLastAccessed, removeContent, pinContent, unpinContent, renameContent } = useContentStore();
  const { urlRegistry, chunkTrackingService } = useServices();
  
  // Toast
  const toast = useToast();
  
  // Get content
  const content = getContent(contentId);
  
  // Track pin status in a ref to avoid stale closure issues
  const pinStatusRef = React.useRef<boolean>(false);
  
  // Local state for UI rendering (triggers re-renders)
  const [isPinnedUI, setIsPinnedUI] = React.useState<boolean>(false);
  
  // Rename state
  const { isOpen: isRenaming, onOpen: startRename, onClose: stopRename } = useDisclosure();
  const [renameValue, setRenameValue] = React.useState<string>('');
  const [isRenamingInProgress, setIsRenamingInProgress] = React.useState<boolean>(false);
  
  // Update pin status ref and UI state whenever content changes
  React.useEffect(() => {
    if (content?.metadata?.isPinned !== undefined) {
      pinStatusRef.current = content.metadata.isPinned;
      setIsPinnedUI(content.metadata.isPinned);
    }
  }, [content?.metadata?.isPinned]);
  
  // Clipboard
  const { hasCopied, onCopy } = useClipboard(
    content?.data && typeof content.data === 'string'
      ? content.data
      : ''
  );
  
  // Pin toggle handler - moved before early return to follow Rules of Hooks
  const handlePinToggle = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    
    // Use the ref for current pin status to avoid stale closure issues
    const currentPinStatus = pinStatusRef.current;
    
    
    try {
      if (currentPinStatus) {
        pinStatusRef.current = false; // Update ref immediately
        setIsPinnedUI(false); // Update UI state immediately
        await unpinContent(contentId);
        toast({
          title: 'Content unpinned',
          status: 'info',
          duration: 2000,
          isClosable: true,
        });
      } else {
        pinStatusRef.current = true; // Update ref immediately
        setIsPinnedUI(true); // Update UI state immediately
        await pinContent(contentId);
        toast({
          title: 'Content pinned',
          status: 'success',
          duration: 2000,
          isClosable: true,
        });
      }
    } catch (error) {
      console.error('Pin operation failed:', error);
      // Revert ref and UI state on error
      pinStatusRef.current = !currentPinStatus;
      setIsPinnedUI(!currentPinStatus);
      toast({
        title: 'Failed to toggle pin',
        description: error instanceof Error ? error.message : 'Unknown error',
        status: 'error',
        duration: 3000,
        isClosable: true,
      });
    }
  }, [contentId, pinContent, unpinContent, toast]);

  // Rename handlers
  const handleStartRename = useCallback(() => {
    const currentName = content?.metadata?.metadata?.fileName || '';
    setRenameValue(currentName);
    startRename();
  }, [content?.metadata?.metadata?.fileName, startRename]);

  const handleRenameSubmit = useCallback(async () => {
    if (!renameValue.trim() || isRenamingInProgress) {
      return;
    }

    setIsRenamingInProgress(true);
    try {
      await renameContent(contentId, renameValue.trim());
      toast({
        title: 'Content renamed',
        status: 'success',
        duration: 2000,
        isClosable: true,
      });
      stopRename();
    } catch (error) {
      console.error('Rename failed:', error);
      toast({
        title: 'Rename failed',
        description: error instanceof Error ? error.message : 'Unknown error',
        status: 'error',
        duration: 3000,
        isClosable: true,
      });
    } finally {
      setIsRenamingInProgress(false);
    }
  }, [contentId, renameValue, isRenamingInProgress, renameContent, toast, stopRename]);

  const handleRenameCancel = useCallback(() => {
    setRenameValue('');
    stopRename();
  }, [stopRename]);

  const handleRenameKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleRenameSubmit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      handleRenameCancel();
    }
  }, [handleRenameSubmit, handleRenameCancel]);
  
  if (!content) {
    return null;
  }
  
  // Get the metadata from the content entry
  const { metadata } = content;
  
  // Determine the most appropriate content type based on metadata and actual content
  // CRITICAL FIX: Ensure we use enum values, not string values from server
  let effectiveContentType: ContentType = metadata.contentType as ContentType;
  
  
  // Check if this is actually text content based on the metadata or content
  if (metadata.contentType === ContentType.FILE || metadata.contentType === ContentType.IMAGE) {
    // Check if the content is actually text based on MIME type
    const mimeType = metadata.metadata.mimeType || '';
    const isTextMimeType = mimeType.startsWith('text/') ||
                          mimeType === 'application/json' ||
                          mimeType === 'application/xml';
    
    // If we have a blob with text mime type or the content is a string
    if (isTextMimeType ||
        (content.data instanceof Blob && content.data.type.startsWith('text/')) ||
        (typeof content.data === 'string')) {
      effectiveContentType = ContentType.TEXT;
    }
    
    // Try to detect text content from the data
    if (content.data instanceof Blob) {
      // Check the first few bytes to see if it's text
      // Use the ContentTypeDetector component to detect the content type
      <ContentTypeDetector blob={content.data} onTypeDetected={(type) => {
        if (type === ContentType.TEXT) {
          effectiveContentType = ContentType.TEXT;
        }
      }} />;
    }
  }
  
  // If content is marked as image but doesn't have image mime type, verify
  if (metadata.contentType === ContentType.IMAGE) {
    const mimeType = metadata.metadata.mimeType || '';
    const isImageMimeType = mimeType.startsWith('image/');
    
    if (!isImageMimeType && content.data instanceof Blob && !content.data.type.startsWith('image/')) {
      // The ImageRenderer component will handle validation
    }
  }
  
  
  
  
  /**
   * Copies content to clipboard
   */
  const copyContent = async () => {
    if (!content.data) {
      toast({
        title: 'Cannot copy',
        description: 'Content is not available for copying',
        status: 'error',
        duration: 3000,
        isClosable: true
      });
      return;
    }
    
    try {
      // Update last accessed time when content is actually accessed
      updateContentLastAccessed(contentId);
      if (typeof content.data === 'string') {
        // Copy text content
        onCopy();
      } else if (content.data instanceof Blob) {
        // Copy image or file content
        if (metadata.contentType === ContentType.IMAGE) {
          
          // For images, try multiple approaches in order of preference
          let copySuccess = false;
          
          // Approach 1: Try ClipboardItem API if supported
          if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
            try {
              const clipboardItems = [
                new ClipboardItem({
                  [content.data.type]: content.data
                })
              ];
              
              await navigator.clipboard.write(clipboardItems);
              copySuccess = true;
            } catch (clipboardError) {
              // Continue to fallback approaches
            }
          }
          
          // Approach 2: Try converting to PNG and using ClipboardItem (some browsers are picky about formats)
          if (!copySuccess && typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
            try {
              // Create a canvas to convert the image to PNG
              const canvas = document.createElement('canvas');
              const ctx = canvas.getContext('2d');
              const img = document.createElement('img');
              
              await new Promise<void>((resolve, reject) => {
                img.onload = () => {
                  canvas.width = img.width;
                  canvas.height = img.height;
                  ctx?.drawImage(img, 0, 0);
                  
                  canvas.toBlob(async (blob) => {
                    if (blob) {
                      try {
                        const clipboardItems = [new ClipboardItem({ 'image/png': blob })];
                        await navigator.clipboard.write(clipboardItems);
                        copySuccess = true;
                        resolve();
                      } catch (error) {
                        reject(error);
                      }
                    } else {
                      reject(new Error('Failed to convert to PNG blob'));
                    }
                  }, 'image/png');
                };
                img.onerror = reject;
                img.src = URL.createObjectURL(content.data as Blob);
              });
            } catch (conversionError) {
              // Continue to URL fallback
            }
          }
          
          // Approach 3: Fallback to URL copy
          if (!copySuccess) {
            const url = urlRegistry.createUrl(contentId, content.data);
            await navigator.clipboard.writeText(url);
            
            // Clean up the URL after a delay
            setTimeout(() => urlRegistry.revokeUrl(contentId, url), 5000);
          }
        } else {
          // For other file types, create a temporary link and copy the URL
          const url = urlRegistry.createUrl(contentId, content.data);
          await navigator.clipboard.writeText(url);
          
          // Clean up the URL after a delay
          setTimeout(() => urlRegistry.revokeUrl(contentId, url), 5000);
        }
      }
      
      toast({
        title: 'Copied to clipboard',
        status: 'success',
        duration: 2000,
        isClosable: true
      });
    } catch (error) {
      console.error('Error copying to clipboard:', error);
      toast({
        title: 'Copy failed',
        description: 'Failed to copy content to clipboard',
        status: 'error',
        duration: 3000,
        isClosable: true
      });
    }
  };
  
  /**
   * Downloads content - handles both regular and large files
   */
  const downloadContent = async () => {
    // Check if this is a large file
    const isLargeFile = metadata.isLargeFile || false;
    
    if (isLargeFile) {
      // Large file download via HTTP API - download encrypted data and decrypt it
      try {
        
        // Get session token and passphrase
        const sessionToken = localStorage.getItem('sessionToken') || 'placeholder-token';
        const passphrase = localStorage.getItem('passphrase');
        
        if (!passphrase) {
          throw new Error('Session passphrase not found. Please rejoin the session.');
        }
        
        const response = await fetch(`/api/download/${contentId}`, {
          headers: {
            'Authorization': `Bearer ${sessionToken}`
          }
        });
        
        if (!response.ok) {
          throw new Error(`Download failed: ${response.status} ${response.statusText}`);
        }
        
        
        // Get the encrypted data as array buffer
        const encryptedData = await response.arrayBuffer();
        
        // Import encryption utilities
        const { deriveKeyFromPassphrase, decryptData } = await import('../../utils/encryption');
        
        // Derive decryption key
        const key = await deriveKeyFromPassphrase(passphrase);
        
        // Parse and decrypt the concatenated encrypted chunks
        // Each chunk is stored as: [encrypted_data_with_iv]
        // The IV is the first 16 bytes of each chunk, followed by the encrypted data
        
        const decryptedChunks: Uint8Array[] = [];
        const dataView = new Uint8Array(encryptedData);
        let offset = 0;
        let chunkIndex = 0;
        
        
        // Parse chunks: IV (12 bytes) + encrypted data
        // Server sends: IV (12 bytes) + encrypted chunk (65552 bytes) = 65564 bytes total per chunk
        const IV_SIZE = 12;
        const ENCRYPTED_CHUNK_SIZE = 65552; // Size of encrypted data (without IV)
        const TOTAL_CHUNK_SIZE = IV_SIZE + ENCRYPTED_CHUNK_SIZE; // 65564 bytes total
        
        
        while (offset < dataView.length) {
          const remainingBytes = dataView.length - offset;
          
          if (remainingBytes < IV_SIZE) {
            break; // Not enough data for IV
          }
          
          // Extract IV (first 12 bytes)
          const iv = dataView.slice(offset, offset + IV_SIZE);
          
          // Determine if this is the last chunk
          const isLastChunk = remainingBytes < TOTAL_CHUNK_SIZE;
          const encryptedDataSize = isLastChunk
            ? remainingBytes - IV_SIZE    // Last chunk: use remaining bytes
            : ENCRYPTED_CHUNK_SIZE;       // Standard chunk: 65552 bytes
          
          // Extract encrypted data
          const encryptedChunkData = dataView.slice(offset + IV_SIZE, offset + IV_SIZE + encryptedDataSize);
          
          
          try {
            // Decrypt this chunk
            const decryptedChunk = await decryptData(key, encryptedChunkData.buffer, iv);
            const decryptedArray = new Uint8Array(decryptedChunk);
            
            decryptedChunks.push(decryptedArray);
            
          } catch (chunkError) {
            console.error(`Error decrypting chunk ${chunkIndex}:`, chunkError);
            throw new Error(`Failed to decrypt chunk ${chunkIndex}: ${chunkError instanceof Error ? chunkError.message : 'Unknown error'}`);
          }
          
          offset += IV_SIZE + encryptedDataSize;
          chunkIndex++;
        }
        
        // Reassemble all decrypted chunks into the final file
        const totalDecryptedSize = decryptedChunks.reduce((sum, chunk) => sum + chunk.length, 0);
        const reassembledData = new Uint8Array(totalDecryptedSize);
        let reassembleOffset = 0;
        
        for (const chunk of decryptedChunks) {
          reassembledData.set(chunk, reassembleOffset);
          reassembleOffset += chunk.length;
        }
        
        
        // Create blob from the reassembled data (decryption should have removed padding)
        const blob = new Blob([reassembledData], {
          type: metadata.metadata.mimeType || 'application/octet-stream'
        });
        
        const url = URL.createObjectURL(blob);
        
        // Trigger download
        const a = document.createElement('a');
        a.href = url;
        a.download = metadata.metadata.fileName || `content-${contentId.substring(0, 8)}`;
        document.body.appendChild(a);
        a.click();
        
        // Clean up
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        updateContentLastAccessed(contentId);
        
        toast({
          title: 'Large file download completed',
          description: `File decrypted and downloaded successfully (${totalDecryptedSize} bytes)`,
          status: 'success',
          duration: 3000,
          isClosable: true
        });
        
      } catch (error) {
        console.error('Error downloading large file:', error);
        toast({
          title: 'Download failed',
          description: error instanceof Error ? error.message : 'Failed to download large file from server',
          status: 'error',
          duration: 5000,
          isClosable: true
        });
      }
    } else {
      // Regular file download (existing logic)
      if (!content.data) {
        toast({
          title: 'Cannot download',
          description: 'Content is not available for download',
          status: 'error',
          duration: 3000,
          isClosable: true
        });
        return;
      }
      
      try {
        // Update last accessed time when content is actually accessed
        updateContentLastAccessed(contentId);
        // Create download link
        const url = content.data instanceof Blob
          ? urlRegistry.createUrl(contentId, content.data)
          : `data:text/plain;charset=utf-8,${encodeURIComponent(content.data)}`;
        
        const a = document.createElement('a');
        a.href = url;
        a.download = metadata.metadata.fileName || `content-${contentId.substring(0, 8)}`;
        document.body.appendChild(a);
        a.click();
        
        // Clean up
        document.body.removeChild(a);
        if (content.data instanceof Blob) {
          urlRegistry.revokeUrl(contentId, url);
        }
        
        toast({
          title: 'Download started',
          status: 'success',
          duration: 2000,
          isClosable: true
        });
      } catch (error) {
        console.error('Error downloading content:', error);
        toast({
          title: 'Download failed',
          description: 'Failed to download content',
          status: 'error',
          duration: 3000,
          isClosable: true
        });
      }
    }
  };
  
  /**
   * Deletes content
   */
  const deleteContent = async () => {
    try {
      // Mark content as being deleted in tracking service
      chunkTrackingService.cleanupChunks(contentId);
      
      // Remove content (this will also revoke URLs)
      await removeContent(contentId);
      
      toast({
        title: 'Content removed',
        status: 'success',
        duration: 2000,
        isClosable: true
      });
    } catch (error) {
      console.error('Error removing content:', error);
      toast({
        title: 'Error',
        description: 'Failed to remove content',
        status: 'error',
        duration: 3000,
        isClosable: true
      });
    }
  };
  
  /**
   * Renders content preview based on type
   */
  const renderContentPreview = () => {
    
    // Check if this is a large file
    const isLargeFile = metadata.isLargeFile || false;
    
    // Large file special handling
    if (isLargeFile) {
      return (
        <Flex
          align="center"
          justify="center"
          direction="column"
          h="120px"
          bg="blue.50"
          borderRadius="md"
          border="2px dashed"
          borderColor="blue.200"
        >
          <Icon as={FaDownload} color="blue.500" boxSize={6} mb={2} />
          <Text color="blue.700" fontWeight="bold" textAlign="center">
            Large File ({formatFileSize(metadata.totalSize)})
          </Text>
          <Text color="blue.600" fontSize="sm" textAlign="center">
            Stored on server - Click download to retrieve
          </Text>
        </Flex>
      );
    }
    
    // For images, try to render even if isComplete is false but we have data
    if (!content.isComplete && !(content.data instanceof Blob && metadata.contentType === ContentType.IMAGE)) {
      return (
        <Flex align="center" justify="center" h="100px" bg="gray.50" borderRadius="md">
          <Text color="gray.500">Loading content...</Text>
        </Flex>
      );
    }
    
    
    switch (effectiveContentType) {
      case ContentType.TEXT:
        return (
          <Box 
            p={3} 
            bg="gray.50" 
            borderRadius="md" 
            fontSize="sm"
            fontFamily="monospace"
            whiteSpace="pre-wrap"
            overflow="hidden"
            maxH="200px"
            position="relative"
          >
            {(() => {
              
              // If we have string data, display it directly
              if (content.data && typeof content.data === 'string') {
                return content.data.length > 500
                  ? content.data.substring(0, 500) + '...'
                  : content.data;
              }
              
              // If we have a blob that might contain text, return a placeholder
              // The actual text extraction happens in a separate component
              if (content.data instanceof Blob) {
                return <BlobTextExtractor blob={content.data} />;
              }
              
              // Check if we have metadata but no data yet
              if (content.metadata && !content.data && content.isComplete) {
                // This is a workaround for when content is marked complete but data isn't set
                if (content.metadata.contentType === ContentType.TEXT) {
                  return `[Content available but not loaded: ${content.metadata.totalSize} bytes]`;
                }
              }
              
              // Fallback
              return 'No content available';
            })()}
            
            {content.data && typeof content.data === 'string' && content.data.length > 500 && (
              <Box 
                position="absolute" 
                bottom={0} 
                left={0} 
                right={0} 
                h="50px"
                bgGradient="linear(to-t, gray.50, transparent)"
              />
            )}
          </Box>
        );
        
      case ContentType.IMAGE:
        
        return (
          <Box
            borderRadius="md"
            overflow="hidden"
            maxH="200px"
            display="flex"
            justifyContent="center"
            bg="gray.50"
          >
            {(() => {
              
              if (content.data instanceof Blob) {
                return (
                  <ImageRenderer
                    contentId={contentId}
                    blob={content.data}
                    fileName={metadata.metadata.fileName}
                    isComplete={content.isComplete}
                    updateContentLastAccessed={updateContentLastAccessed}
                    chunkTrackingService={chunkTrackingService}
                    urlRegistry={urlRegistry}
                  />
                );
              } else {
                return (
                  <Flex align="center" justify="center" h="100px">
                    <Text color="gray.500">Image data not available</Text>
                  </Flex>
                );
              }
            })()}
          </Box>
        );
        
      case ContentType.FILE:
        return (
          <Flex 
            align="center" 
            p={4} 
            bg="gray.50" 
            borderRadius="md"
          >
            <Icon 
              as={FaFile} 
              boxSize={10} 
              color="blue.500" 
              mr={4}
            />
            <VStack align="start" spacing={1}>
              <Text fontWeight="medium">
                {metadata.metadata.fileName || `File-${contentId.substring(0, 8)}`}
              </Text>
              <Text fontSize="sm" color="gray.500">
                {formatFileSize(metadata.metadata.size)}
              </Text>
            </VStack>
          </Flex>
        );
        
      default:
        return (
          <Flex align="center" justify="center" h="100px" bg="gray.50" borderRadius="md">
            <Text color="gray.500">Preview not available</Text>
          </Flex>
        );
    }
  };
  
  /**
   * Gets content icon based on type
   */
  const getContentIcon = () => {
    switch (effectiveContentType) {
      case ContentType.TEXT:
        return FaFileAlt;
      case ContentType.IMAGE:
        return FaFileImage;
      case ContentType.FILE:
        return FaFile;
      default:
        return FaFile;
    }
  };
  
  return (
    <Box
      position="relative"
      borderWidth="1px"
      borderRadius="lg"
      overflow="hidden"
      bg="white"
      transition="all 0.2s"
      _hover={{ boxShadow: 'md' }}
    >
      <Box p={4}>
        <Flex justify="space-between" align="center" mb={2}>
          <HStack spacing={2}>
            <Icon as={getContentIcon()} color="blue.500" />
            {isRenaming ? (
              <HStack spacing={2}>
                <Input
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onKeyDown={handleRenameKeyDown}
                  size="sm"
                  width="200px"
                  isDisabled={isRenamingInProgress}
                  autoFocus
                  onBlur={handleRenameCancel}
                />
                <Button
                  size="sm"
                  colorScheme="blue"
                  onClick={handleRenameSubmit}
                  isLoading={isRenamingInProgress}
                  isDisabled={!renameValue.trim()}
                >
                  Save
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleRenameCancel}
                  isDisabled={isRenamingInProgress}
                >
                  Cancel
                </Button>
              </HStack>
            ) : (
              <Text fontWeight="bold" cursor="pointer" onDoubleClick={handleStartRename}>
                {(() => {
                  // CRITICAL FIX: Better filename handling for large files
                  // Try to get filename from metadata first
                  if (metadata.metadata.fileName) {
                    return metadata.metadata.fileName;
                  }
                  
                  // For large files, check if we have any additional metadata stored
                  // The additionalMetadata is stored at the SharedContent level, not ContentMetadata level
                  if (metadata.isLargeFile && 'additionalMetadata' in metadata) {
                    try {
                      const additionalMeta = (metadata as SharedContent & { additionalMetadata?: string | object }).additionalMetadata;
                      const parsed = typeof additionalMeta === 'string'
                        ? JSON.parse(additionalMeta)
                        : additionalMeta;
                      if (parsed.fileName) {
                        return parsed.fileName;
                      }
                    } catch (e) {
                      // Ignore parsing errors
                    }
                  }
                  
                  // Fallback based on content type
                  if (effectiveContentType === ContentType.TEXT) {
                    return 'Text content';
                  } else if (effectiveContentType === ContentType.IMAGE) {
                    return `Image-${contentId.substring(0, 8)}`;
                  } else {
                    return 'File';
                  }
                })()}
              </Text>
            )}
            {!content.isComplete && (
              <Badge colorScheme="yellow">Loading</Badge>
            )}
          </HStack>
          
          <HStack spacing={1}>
            {/* Pin/Unpin Button */}
            <IconButton
              icon={<Icon as={isPinnedUI ? RiPushpinFill : RiPushpinLine} />}
              aria-label={isPinnedUI ? "Unpin content" : "Pin content"}
              size="sm"
              variant="ghost"
              onClick={handlePinToggle}
              colorScheme={isPinnedUI ? "blue" : "gray"}
              _hover={{
                bg: isPinnedUI ? "blue.100" : "gray.100"
              }}
              title={isPinnedUI ? "Unpin this content" : "Pin this content"}
            />
            
            {/* Copy Button - disabled for large files */}
            <Button
              size="sm"
              variant="ghost"
              aria-label="Copy to clipboard"
              title={metadata.isLargeFile ? "Copy not available for large files" : "Copy to clipboard"}
              onClick={copyContent}
              isDisabled={!content.isComplete || metadata.isLargeFile}
            >
              <Icon as={hasCopied ? FaCheck : FaCopy} />
            </Button>
            
            {/* Download Button */}
            <Button
              size="sm"
              variant="ghost"
              aria-label="Download"
              title="Download"
              onClick={downloadContent}
              isDisabled={!content.isComplete}
            >
              <Icon as={FaDownload} />
            </Button>
            
            {/* Menu Button */}
            <Menu placement="bottom-end" strategy="fixed">
              <MenuButton as={Button} size="sm" variant="ghost">
                <Icon as={FaEllipsisV} />
              </MenuButton>
              <MenuList zIndex={9999} boxShadow="lg" bg="white" border="1px solid" borderColor="gray.200">
                <MenuItem
                  icon={<Icon as={FaEdit} />}
                  onClick={handleStartRename}
                >
                  Rename
                </MenuItem>
                <MenuItem
                  icon={<Icon as={hasCopied ? FaCheck : FaCopy} />}
                  onClick={copyContent}
                  isDisabled={!content.isComplete || metadata.isLargeFile}
                >
                  {metadata.isLargeFile ? "Copy not available for large files" : "Copy to clipboard"}
                </MenuItem>
                <MenuItem
                  icon={<Icon as={FaDownload} />}
                  onClick={downloadContent}
                  isDisabled={!content.isComplete}
                >
                  Download
                </MenuItem>
                <MenuItem icon={<Icon as={FaTrash} />} onClick={deleteContent}>
                  Remove
                </MenuItem>
              </MenuList>
            </Menu>
          </HStack>
        </Flex>
        
        <HStack spacing={2} mb={3} fontSize="sm" color="gray.500">
          <Icon as={FaUser} boxSize={3} />
          <Text>{metadata.senderId === 'me' ? 'You' : metadata.senderName}</Text>
          <Text>•</Text>
          <Text>{formatDate(metadata.timestamp)}</Text>
          <Text>•</Text>
          {/* Display appropriate metadata based on content type */}
          {effectiveContentType === ContentType.TEXT && (
            <Text>
              {(() => {
                // CRITICAL FIX: Use totalSize for large files, metadata.size for regular files
                const metadataSize = metadata.isLargeFile ? metadata.totalSize : metadata.metadata.size;
                if (metadataSize && metadataSize > 0) {
                  return `${formatFileSize(metadataSize)} (${metadataSize} chars)`;
                }
                
                // Fallback: try to calculate from actual text content if available
                if (typeof content.data === 'string') {
                  const actualSize = content.data.length;
                  return `${formatFileSize(actualSize)} (${actualSize} chars)`;
                }
                
                // If we have a blob, estimate size from blob size
                if (content.data instanceof Blob) {
                  const blobSize = content.data.size;
                  return `${formatFileSize(blobSize)} (${blobSize} bytes)`;
                }
                
                return '0 Bytes';
              })()}
            </Text>
          )}
          {effectiveContentType === ContentType.IMAGE && (
            <Text>
              {/* CRITICAL FIX: Use totalSize for large files, metadata.size for regular files */}
              {formatFileSize(metadata.isLargeFile ? metadata.totalSize : metadata.metadata.size)}
              {metadata.metadata.imageInfo?.width && metadata.metadata.imageInfo?.height &&
                ` • ${metadata.metadata.imageInfo.width}×${metadata.metadata.imageInfo.height}`}
              {metadata.metadata.imageInfo?.format && ` • ${metadata.metadata.imageInfo.format}`}
            </Text>
          )}
          {effectiveContentType === ContentType.FILE && (
            <Text>
              {/* CRITICAL FIX: Use totalSize for large files, metadata.size for regular files */}
              {formatFileSize(metadata.isLargeFile ? metadata.totalSize : metadata.metadata.size)}
            </Text>
          )}
          {effectiveContentType === ContentType.OTHER && (
            <Text>
              {/* CRITICAL FIX: Use totalSize for large files, metadata.size for regular files */}
              {formatFileSize(metadata.isLargeFile ? metadata.totalSize : metadata.metadata.size)}
            </Text>
          )}
          {/* Fallback for when content type is not recognized or metadata is missing */}
          {(!effectiveContentType ||
            (effectiveContentType !== ContentType.TEXT &&
             effectiveContentType !== ContentType.IMAGE &&
             effectiveContentType !== ContentType.FILE &&
             effectiveContentType !== ContentType.OTHER)) && (
            <Text>
              {/* CRITICAL FIX: Use totalSize for large files, metadata.size for regular files */}
              {formatFileSize(metadata.isLargeFile ? metadata.totalSize : metadata.metadata.size)}
            </Text>
          )}
        </HStack>
        
        {renderContentPreview()}
      </Box>
    </Box>
  );
});

export default ContentItem;