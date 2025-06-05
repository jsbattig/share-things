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
  Spinner
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
  FaExclamationTriangle
} from 'react-icons/fa';
import { RiPushpinFill, RiPushpinLine } from 'react-icons/ri';
import { useContentStore, ContentType } from '../../contexts/ContentStoreContext';
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
  // DIAGNOSTIC: Track render count and prop changes
  const renderCountRef = React.useRef(0);
  const prevPropsRef = React.useRef({ contentId, blob, fileName, isComplete });
  
  renderCountRef.current += 1;
  
  console.log(`[RENDER] ImageRenderer #${renderCountRef.current} for ${contentId.substring(0, 8)}`);
  
  // Check if props changed
  const propsChanged = {
    blob: prevPropsRef.current.blob !== blob,
    isComplete: prevPropsRef.current.isComplete !== isComplete
  };
  
  if (propsChanged.blob || propsChanged.isComplete) {
    console.log(`[RENDER] Props changed:`, propsChanged);
  }
  
  // Update previous props
  prevPropsRef.current = { contentId, blob, fileName, isComplete };
  
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
      console.error(`[RENDER] Error creating image blob for ${contentId.substring(0, 8)}:`, error);
      return null;
    }
  }, [blob, contentId]);
  
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
        console.log(`[ImageRenderer] Blob has image MIME type: ${blob.type}`);
        return true;
      }
      
      // Read the first few bytes to check for common image signatures
      const buffer = await blob.slice(0, 8).arrayBuffer();
      const header = new Uint8Array(buffer);
      const hexSignature = Array.from(header).map(b => b.toString(16).padStart(2, '0')).join('');
      
      console.log(`[ImageRenderer] Content signature for ${contentId}: ${hexSignature}`);
      
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
      const isTextContent = /^[\x20-\x7E\n\r\t]+$/.test(new TextDecoder().decode(buffer));
      
      console.log(`[ImageRenderer] Content validation for ${contentId}: ${isImage ? 'Valid image' : 'Not an image'}`);
      if (isTextContent) {
        console.log(`[ImageRenderer] Content appears to be text, not an image`);
      }
      
      return isImage;
    } catch (error) {
      console.error(`[ImageRenderer] Error validating blob:`, error);
      return false;
    }
  }, [contentId]);
  
  // Create URL only when we have a valid blob
  useEffect(() => {
    console.log(`[RENDER] useEffect executing for ${contentId.substring(0, 8)}`);
    
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
          console.log(`[RENDER] Content validation failed for ${contentId.substring(0, 8)} - not an image`);
          
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
        console.error(`[RENDER] Error processing image for ${contentId.substring(0, 8)}:`, error);
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
    console.error(`[RENDER] Image loading failed for ${contentId.substring(0, 8)}`);
    
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
            console.error(`[RENDER] Error revoking URL during retry:`, error);
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
            console.error(`[RENDER] Error creating new URL during retry:`, error);
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
                      console.log(`[ImageRenderer] Created fresh URL for manual retry: ${newUrl}`);
                      setImageUrl(newUrl);
                    }).catch(err => {
                      console.error(`[ImageRenderer] Error creating fresh blob:`, err);
                    });
                  } catch (error) {
                    console.error(`[ImageRenderer] Error during manual retry:`, error);
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
        console.log(`[ContentTypeDetector] Detected text content from blob data`);
        
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
        console.log(`[BlobTextExtractor] Extracted text from blob: ${text.substring(0, 20)}...`);
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
  // DIAGNOSTIC: Track render count for ContentItem
  const renderCountRef = React.useRef(0);
  renderCountRef.current += 1;
  
  console.log(`[RENDER] ContentItem #${renderCountRef.current} for ${contentId.substring(0, 8)}`);
  
  // Context
  const { getContent, updateContentLastAccessed, removeContent, pinContent, unpinContent } = useContentStore();
  const { urlRegistry, chunkTrackingService } = useServices();
  
  // Toast
  const toast = useToast();
  
  // Get content
  const content = getContent(contentId);
  
  // Clipboard
  const { hasCopied, onCopy } = useClipboard(
    content?.data && typeof content.data === 'string'
      ? content.data
      : ''
  );
  
  // Pin toggle handler - moved before early return to follow Rules of Hooks
  const handlePinToggle = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      if (content?.metadata?.isPinned) {
        await unpinContent(contentId);
        toast({
          title: 'Content unpinned',
          status: 'info',
          duration: 2000,
          isClosable: true,
        });
      } else {
        await pinContent(contentId);
        toast({
          title: 'Content pinned',
          status: 'success',
          duration: 2000,
          isClosable: true,
        });
      }
    } catch (error) {
      console.error('Failed to toggle pin status:', error);
      toast({
        title: 'Failed to toggle pin',
        description: error instanceof Error ? error.message : 'Unknown error',
        status: 'error',
        duration: 3000,
        isClosable: true,
      });
    }
  }, [content?.metadata?.isPinned, contentId, pinContent, unpinContent, toast]);
  
  if (!content) {
    return null;
  }
  
  // Get the metadata from the content entry
  const { metadata } = content;
  
  // Determine the most appropriate content type based on metadata and actual content
  let effectiveContentType = metadata.contentType;
  
  console.log(`[ContentItem] Determining effective content type for ${contentId}`);
  console.log(`[ContentItem] Original content type: ${metadata.contentType}`);
  console.log(`[ContentItem] MIME type: ${metadata.metadata.mimeType || 'not specified'}`);
  console.log(`[ContentItem] Data type: ${content.data ? (typeof content.data === 'string' ? 'string' : (content.data instanceof Blob ? 'Blob' : 'unknown')) : 'undefined'}`);
  
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
      console.log(`[ContentItem] Detected text content marked as ${metadata.contentType}, overriding content type to TEXT`);
      effectiveContentType = ContentType.TEXT;
    }
    
    // Try to detect text content from the data
    if (content.data instanceof Blob) {
      // Check the first few bytes to see if it's text
      // Use the ContentTypeDetector component to detect the content type
      <ContentTypeDetector blob={content.data} onTypeDetected={(type) => {
        if (type === ContentType.TEXT) {
          console.log(`[ContentItem] ContentTypeDetector identified content as TEXT`);
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
      console.log(`[ContentItem] Content marked as IMAGE but doesn't have image MIME type, will verify during rendering`);
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
          console.log('Attempting to copy image to clipboard:', {
            blobSize: content.data.size,
            blobType: content.data.type,
            clipboardItemSupported: typeof ClipboardItem !== 'undefined',
            clipboardWriteSupported: !!navigator.clipboard?.write,
            isSecureContext: window.isSecureContext
          });
          
          // For images, try multiple approaches in order of preference
          let copySuccess = false;
          
          // Approach 1: Try ClipboardItem API if supported
          if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
            try {
              console.log('Trying ClipboardItem API...');
              const clipboardItems = [
                new ClipboardItem({
                  [content.data.type]: content.data
                })
              ];
              
              await navigator.clipboard.write(clipboardItems);
              console.log('ClipboardItem API succeeded');
              copySuccess = true;
            } catch (clipboardError) {
              console.warn('ClipboardItem API failed:', clipboardError);
              // Continue to fallback approaches
            }
          }
          
          // Approach 2: Try converting to PNG and using ClipboardItem (some browsers are picky about formats)
          if (!copySuccess && typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
            try {
              console.log('Trying ClipboardItem with PNG conversion...');
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
                        console.log('ClipboardItem with PNG conversion succeeded');
                        copySuccess = true;
                        resolve();
                      } catch (error) {
                        console.warn('ClipboardItem with PNG conversion failed:', error);
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
              console.warn('PNG conversion approach failed:', conversionError);
              // Continue to URL fallback
            }
          }
          
          // Approach 3: Fallback to URL copy
          if (!copySuccess) {
            console.log('Falling back to URL copy...');
            const url = urlRegistry.createUrl(contentId, content.data);
            await navigator.clipboard.writeText(url);
            console.log('URL copy succeeded');
            
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
   * Downloads content
   */
  const downloadContent = () => {
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
              // Debug logging to help diagnose content display issues
              console.log(`[ContentItem] Rendering text content for ${contentId}`);
              console.log(`[ContentItem] Content data type: ${typeof content.data}`);
              console.log(`[ContentItem] Content data available: ${content.data !== undefined}`);
              
              // If we have string data, display it directly
              if (content.data && typeof content.data === 'string') {
                console.log(`[ContentItem] Displaying string data of length ${content.data.length}`);
                console.log(`[ContentItem] String data preview: "${content.data.substring(0, Math.min(20, content.data.length))}"`);
                return content.data.length > 500
                  ? content.data.substring(0, 500) + '...'
                  : content.data;
              }
              
              // If we have a blob that might contain text, return a placeholder
              // The actual text extraction happens in a separate component
              if (content.data instanceof Blob) {
                console.log(`[ContentItem] Displaying blob data of size ${content.data.size}`);
                return <BlobTextExtractor blob={content.data} />;
              }
              
              // Check if we have metadata but no data yet
              if (content.metadata && !content.data && content.isComplete) {
                console.log(`[ContentItem] Content is marked complete but has no data, trying to use metadata`);
                // This is a workaround for when content is marked complete but data isn't set
                if (content.metadata.contentType === ContentType.TEXT) {
                  return `[Content available but not loaded: ${content.metadata.totalSize} bytes]`;
                }
              }
              
              // Fallback
              console.log(`[ContentItem] No displayable content available for ${contentId}`);
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
        console.log(`[ContentItem] Rendering image for ${contentId}, isComplete: ${content.isComplete}`);
        
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
              console.log(`[ContentItem] Image rendering check for ${contentId}:`);
              console.log(`  - content.data type: ${typeof content.data}`);
              console.log(`  - content.data instanceof Blob: ${content.data instanceof Blob}`);
              console.log(`  - content.data:`, content.data);
              console.log(`  - effectiveContentType: ${effectiveContentType}`);
              console.log(`  - ContentType.IMAGE: ${ContentType.IMAGE}`);
              
              if (content.data instanceof Blob) {
                console.log(`  - Blob size: ${content.data.size}`);
                console.log(`  - Blob type: ${content.data.type}`);
                console.log(`[ContentItem] About to render ImageRenderer for ${contentId}`);
                console.log(`[ContentItem] Blob details:`, {
                  type: content.data.type,
                  size: content.data.size,
                  constructor: content.data.constructor.name
                });
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
                console.log(`  - Image data not available - content.data is not a Blob`);
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
            <Text fontWeight="bold">
              {metadata.metadata.fileName ||
                (effectiveContentType === ContentType.TEXT
                  ? 'Text content'
                  : effectiveContentType === ContentType.IMAGE
                    ? `Image-${contentId.substring(0, 8)}`
                    : 'File')}
            </Text>
            {!content.isComplete && (
              <Badge colorScheme="yellow">Loading</Badge>
            )}
          </HStack>
          
          <HStack spacing={1}>
            {/* Pin/Unpin Button */}
            <IconButton
              icon={<Icon as={metadata.isPinned ? RiPushpinFill : RiPushpinLine} />}
              aria-label={metadata.isPinned ? "Unpin content" : "Pin content"}
              size="sm"
              variant="ghost"
              onClick={handlePinToggle}
              colorScheme={metadata.isPinned ? "blue" : "gray"}
              _hover={{
                bg: metadata.isPinned ? "blue.100" : "gray.100"
              }}
              title={metadata.isPinned ? "Unpin this content" : "Pin this content"}
            />
            
            {/* Copy Button */}
            <Button
              size="sm"
              variant="ghost"
              aria-label="Copy to clipboard"
              title="Copy to clipboard"
              onClick={copyContent}
              isDisabled={!content.isComplete}
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
            <Menu>
              <MenuButton as={Button} size="sm" variant="ghost">
                <Icon as={FaEllipsisV} />
              </MenuButton>
              <MenuList>
                <MenuItem
                  icon={<Icon as={hasCopied ? FaCheck : FaCopy} />}
                  onClick={copyContent}
                  isDisabled={!content.isComplete}
                >
                  Copy to clipboard
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
                // Calculate size from actual text data if metadata size is 0 or missing
                const metadataSize = metadata.metadata.size;
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
              {formatFileSize(metadata.metadata.size)}
              {metadata.metadata.imageInfo?.width && metadata.metadata.imageInfo?.height &&
                ` • ${metadata.metadata.imageInfo.width}×${metadata.metadata.imageInfo.height}`}
              {metadata.metadata.imageInfo?.format && ` • ${metadata.metadata.imageInfo.format}`}
            </Text>
          )}
          {effectiveContentType === ContentType.FILE && (
            <Text>{formatFileSize(metadata.metadata.size)}</Text>
          )}
          {effectiveContentType === ContentType.OTHER && (
            <Text>{formatFileSize(metadata.metadata.size)}</Text>
          )}
          {/* Fallback for when content type is not recognized or metadata is missing */}
          {(!effectiveContentType ||
            (effectiveContentType !== ContentType.TEXT &&
             effectiveContentType !== ContentType.IMAGE &&
             effectiveContentType !== ContentType.FILE &&
             effectiveContentType !== ContentType.OTHER)) && (
            <Text>{formatFileSize(metadata.metadata.size)}</Text>
          )}
        </HStack>
        
        {renderContentPreview()}
      </Box>
    </Box>
  );
});

export default ContentItem;