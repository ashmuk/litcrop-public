import { handle } from 'hono/aws-lambda';
import app from './app';

// Lambda entry point — wraps Hono app with AWS Lambda adapter
export const handler = handle(app);
