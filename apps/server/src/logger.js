import pino from 'pino';
import { config } from './config.js';

const logger = pino({
  level: config.logging.level,
  transport: config.logging.prettyPrint ? {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'SYS:standard',
      ignore: 'pid,hostname'
    }
  } : undefined,
  timestamp: () => `,"time":"${new Date().toISOString()}"`,
  formatters: {
    level: (label) => ({ level: label.toUpperCase() })
  }
});

export { logger };