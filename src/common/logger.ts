import { createLogger, format, transports } from 'winston';

const isDev = process.env.NODE_ENV !== 'production';
const colorizer = format.colorize();

import { TransformableInfo } from 'logform';

export const logger = createLogger({
  level: 'info',
  format: isDev
    ? format.combine(
        format.timestamp({ format: 'HH:mm:ss.sss' }),
        format.printf((info: TransformableInfo) => {
          const { timestamp, level, message, correlationId, ...meta } = info;
          const metaStr = Object.keys(meta).length ? JSON.stringify(meta) : '';
          const coloredLevel = colorizer.colorize(level, level.toUpperCase());

          return `[${String(timestamp)}] ${coloredLevel}: ${String(message)} ${
            typeof correlationId === 'string' ? `(id: ${correlationId})` : ''
          } ${metaStr}`;
        }),
      )
    : format.combine(
        format.timestamp(),
        format.json(), // raw JSON in production — log aggregators want this
      ),
  transports: [new transports.Console()],
});
