/**
 * Simple logger utility
 * In production, replace with Winston or Pino
 */

const formatTimestamp = () => new Date().toISOString();

export const logger = {
  info: (message: string, ...args: any[]) => {
    console.log(`[${formatTimestamp()}] INFO: ${message}`, ...args);
  },

  warn: (message: string, ...args: any[]) => {
    console.warn(`[${formatTimestamp()}] WARN: ${message}`, ...args);
  },

  error: (message: string, ...args: any[]) => {
    console.error(`[${formatTimestamp()}] ERROR: ${message}`, ...args);
  },

  debug: (message: string, ...args: any[]) => {
    if (process.env.NODE_ENV === 'development') {
      console.debug(`[${formatTimestamp()}] DEBUG: ${message}`, ...args);
    }
  },
};

export default logger;
