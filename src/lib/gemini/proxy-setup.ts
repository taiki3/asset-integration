// Set up proxy for fetch if needed
import { ProxyAgent, fetch as undiciFetch } from 'undici';

export function setupProxy() {
  const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
  
  if (proxyUrl && typeof globalThis !== 'undefined') {
    console.log('[Gemini] Setting up proxy with undici:', proxyUrl);
    
    const dispatcher = new ProxyAgent(proxyUrl);
    
    // Store original fetch
    const originalFetch = globalThis.fetch;
    
    // Override global fetch
    (globalThis as any).fetch = async (url: any, options: any = {}) => {
      const urlString = typeof url === 'string' ? url : url.toString();
      
      // Use proxy for Google APIs
      if (urlString.includes('googleapis.com')) {
        console.log('[Gemini] Proxying request to:', urlString);
        try {
          const response = await undiciFetch(urlString, {
            ...options,
            dispatcher,
          });
          return response as any;
        } catch (error) {
          console.error('[Gemini] Proxy request failed:', error);
          throw error;
        }
      }
      
      // Use original fetch for other requests
      return originalFetch(url, options);
    };
    
    console.log('[Gemini] Global fetch overridden with proxy support');
  }
}

// Call setup on module load
setupProxy();