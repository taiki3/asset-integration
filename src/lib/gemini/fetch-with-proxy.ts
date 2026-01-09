import { ProxyAgent, fetch as undiciFetch } from 'undici';

// Create a custom fetch that uses proxy
export function createProxyFetch() {
  const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
  
  if (!proxyUrl) {
    console.log('[Gemini] No proxy configured');
    return fetch;
  }

  console.log('[Gemini] Creating fetch with proxy:', proxyUrl);
  
  const dispatcher = new ProxyAgent(proxyUrl);
  
  return async (url: any, options: any = {}) => {
    const urlString = typeof url === 'string' ? url : url.toString();
    
    if (urlString.includes('googleapis.com')) {
      console.log('[Gemini] Using proxy for:', urlString);
      return undiciFetch(urlString, {
        ...options,
        dispatcher,
      });
    }
    
    // Use regular fetch for non-Google APIs
    return fetch(url, options);
  };
}