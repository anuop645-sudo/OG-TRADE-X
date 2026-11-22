import type { Handler, HandlerContext, HandlerEvent, HandlerResponse } from '@netlify/functions';
import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import serverless from 'serverless-http';
import { createApiRouter, handleRouteError } from '../../server/createApiApp';

const app = express();
app.set('trust proxy', 1);

const apiRouter = createApiRouter('netlify-function');

// Support both original /api/* paths and rewritten /.netlify/functions/api/* paths
app.use('/api', apiRouter);
app.use('/.netlify/functions/api', apiRouter);
app.use('/', apiRouter);

app.use((_req, res) => {
  res.status(404).json({ error: 'API endpoint not found.' });
});

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  handleRouteError(res, err);
});

const serverlessHandler = serverless(app);

export const handler: Handler = async (
  event: HandlerEvent,
  context: HandlerContext
): Promise<HandlerResponse> => {
  context.callbackWaitsForEmptyEventLoop = false;
  const result = await serverlessHandler(event, context);
  if (result && typeof result === 'object' && 'statusCode' in result) {
    return result as HandlerResponse;
  }
  return {
    statusCode: 500,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ error: 'Unexpected empty response from serverless API.' }),
  };
};
