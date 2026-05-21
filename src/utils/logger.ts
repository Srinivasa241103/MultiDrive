import pino from 'pino';
import { config } from "../config/env.js";

const isDevelopment = config.NODE_ENV === 'development';
export const logger = pino({
    level: config.LOG_LEVEL || "info",
    transport: isDevelopment ? {
        target: "pino-pretty",
        options: {
          colorize: true,
          translateTime: "SYS:standard",
          ignore: "pid,hostname",
        },
    } : undefined,

    base: {
        service: "multidrive-backend",
    },

    timestamp: pino.stdTimeFunctions.isoTime,

    redact: {
    paths: [
        "password",
        "token",
        "accessToken",
        "refreshToken",
        ],
        censor: "[REDACTED]",
    },
});



