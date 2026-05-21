import dotenv from 'dotenv';
import {z} from 'zod';

dotenv.config();

const envSchema = z.object({
    NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),
    
    PORT: z
    .string()
    .default('3000')
    .transform(Number),
    
    DATABASE_URL: z
    .string()
    .min(1, 'DATABASE_URL is required'),
    
    REDIS_URL: z
    .string()
    .min(1, 'REDIS_URL is required')
    .optional(),
    
    JWT_SECRET: z.string(),
    
    GOOGLE_CLIENT_ID: z
    .string()
    .min(1, "GOOGLE_CLIENT_ID is required"),
    
    GOOGLE_CLIENT_SECRET: z
    .string()
    .min(1, "GOOGLE_CLIENT_SECRET is required"),
    
    GOOGLE_REDIRECT_URI: z
    .string()
    .url("GOOGLE_REDIRECT_URI must be a valid URL"),

})

const parsedEnv = envSchema.safeParse(process.env);

if(!parsedEnv.success){
    console.error('Invalid environment variables: \n');

    parsedEnv.error.issues.forEach((issue) => {
        console.error(`- ${issue.path.join(".")}: ${issue.message}`);
    });

  console.error("\nFix your .env file before starting the server.\n");

  process.exit(1);
}