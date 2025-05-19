/**
 * Formats a file size in bytes to a human-readable string
 * @param bytes File size in bytes
 * @returns Formatted file size string
 */
export function formatFileSize(bytes: number | undefined): string {
  // Check if bytes is valid
  if (bytes === undefined || bytes === null || isNaN(bytes)) {
    return '0 Bytes'; // Return fallback value
  }
  
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  
  try {
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  } catch (error) {
    return '0 Bytes'; // Return fallback value on error
  }
}

/**
 * Formats a date timestamp to a human-readable string
 * @param timestamp Date timestamp
 * @returns Formatted date string
 */
export function formatDate(timestamp: number | undefined): string {
  // Check if timestamp is valid
  if (timestamp === undefined || timestamp === null || isNaN(timestamp)) {
    return formatTime(new Date()); // Return current time as fallback
  }
  
  const date = new Date(timestamp);
  
  // Check if date is valid
  if (isNaN(date.getTime())) {
    return formatTime(new Date()); // Return current time as fallback
  }
  
  const now = new Date();
  
  // Check if date is today
  if (date.toDateString() === now.toDateString()) {
    return formatTime(date);
  }
  
  // Check if date is yesterday
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) {
    return `Yesterday, ${formatTime(date)}`;
  }
  
  // Check if date is within the last 7 days
  const lastWeek = new Date(now);
  lastWeek.setDate(now.getDate() - 7);
  if (date > lastWeek) {
    return `${getDayName(date)}, ${formatTime(date)}`;
  }
  
  // Otherwise, show full date
  return `${date.toLocaleDateString()} ${formatTime(date)}`;
}

/**
 * Formats a date to a time string
 * @param date Date object
 * @returns Formatted time string
 */
function formatTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/**
 * Gets the day name from a date
 * @param date Date object
 * @returns Day name
 */
function getDayName(date: Date): string {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return days[date.getDay()];
}

/**
 * Truncates a string to a maximum length
 * @param str String to truncate
 * @param maxLength Maximum length
 * @returns Truncated string
 */
export function truncateString(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.substring(0, maxLength) + '...';
}

/**
 * Formats a client name for display
 * @param name Client name
 * @returns Formatted client name
 */
export function formatClientName(name: string): string {
  return name.trim() || 'Anonymous';
}

/**
 * Generates a color from a string
 * @param str String to generate color from
 * @returns Hex color code
 */
export function stringToColor(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  
  let color = '#';
  for (let i = 0; i < 3; i++) {
    const value = (hash >> (i * 8)) & 0xFF;
    color += ('00' + value.toString(16)).substr(-2);
  }
  
  return color;
}