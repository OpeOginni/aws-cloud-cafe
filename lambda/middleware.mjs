'use strict';

const logger = console;

/**
 * Prints custom headers for CloudFront logging
 */
exports.handler = async (event) => {
  const requestId = event.requestContext?.requestId || 'unknown-comment';
  const requestTime = event.timeStamp || new Date().toISOString();
  const ip = event.requestContext?.ip || '0.0.0.0';
  
  console.log(`Request #${requestId} - Start at ${requestTime} from ${ip}`);
  console.log(`Headers: ${JSON.stringify(event.headers || {})}`);
  
  try {
    // Add custom logging headers to the response
    const response = event.Records[0].cf.response;
    response.headers['x-custom-comment'] = [{ value: `Request ${requestId} processed at ${requestTime}` }];
    response.headers['x-application'] = [{ value: 'CloudCafe' }];
    response.headers['x-stage'] = [{ value: process.env.STAGE || 'dev' }];
    
    console.log(`Request #${requestId} - Completed successfully`);
  } catch (error) {
    console.error(`Request #${requestId} - Middleware error:`, error);
  }
  
  return event.Records[0].cf.response;
};
