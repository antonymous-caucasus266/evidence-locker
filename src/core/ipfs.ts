import { getConfig } from '../util/env.js';
import { IPFSError } from './errors.js';

const config = getConfig();

export interface IPFSResult {
  cid: string;
  size: number;
}

export interface IPFSDriver {
  pinFile(stream: Readable): Promise<IPFSResult>;
  unpinFile(cid: string): Promise<void>;
  getGatewayUrl(cid: string): string;
}

export class KuboIPFSDriver implements IPFSDriver {
  private apiUrl: string;
  private gatewayUrl: string;

  constructor(apiUrl: string, gatewayUrl?: string) {
    this.apiUrl = apiUrl.replace(/\/$/, ''); // Remove trailing slash
    this.gatewayUrl = gatewayUrl || `${this.apiUrl.replace(':5001', ':8080')}`;
  }

  async pinFile(stream: Readable): Promise<IPFSResult> {
    try {
      const FormData = (await import('form-data')).default;
      const form = new FormData();
      
      form.append('file', stream, {
        filename: 'evidence-file',
        contentType: 'application/octet-stream',
      });

      const response = await fetch(`${this.apiUrl}/api/v0/add?pin=true`, {
        method: 'POST',
        body: form,
        headers: form.getHeaders(),
      });

      if (!response.ok) {
        throw new Error(`IPFS API error: ${response.status} ${response.statusText}`);
      }

      const result = await response.json();
      
      return {
        cid: result.Hash,
        size: parseInt(result.Size, 10),
      };
    } catch (error) {
      throw new IPFSError(`Failed to pin file to IPFS`, { error: error.message });
    }
  }

  async unpinFile(cid: string): Promise<void> {
    try {
      const response = await fetch(`${this.apiUrl}/api/v0/pin/rm?arg=${cid}`, {
        method: 'POST',
      });

      if (!response.ok) {
        throw new Error(`IPFS unpin error: ${response.status} ${response.statusText}`);
      }
    } catch (error) {
      throw new IPFSError(`Failed to unpin file ${cid} from IPFS`, { error: error.message });
    }
  }

  getGatewayUrl(cid: string): string {
    return `${this.gatewayUrl}/ipfs/${cid}`;
  }
}

export class PinningServiceDriver implements IPFSDriver {
  private apiUrl: string;
  private apiKey: string;
  private gatewayUrl: string;

  constructor(apiUrl: string, apiKey: string, gatewayUrl?: string) {
    this.apiUrl = apiUrl.replace(/\/$/, '');
    this.apiKey = apiKey;
    this.gatewayUrl = gatewayUrl || 'https://gateway.pinata.cloud';
  }

  async pinFile(stream: Readable): Promise<IPFSResult> {
    try {
      const FormData = (await import('form-data')).default;
      const form = new FormData();
      
      form.append('file', stream, {
        filename: 'evidence-file',
        contentType: 'application/octet-stream',
      });

      const response = await fetch(`${this.apiUrl}/pinning/pinFileToIPFS`, {
        method: 'POST',
        body: form,
        headers: {
          ...form.getHeaders(),
          'pinata_api_key': this.apiKey,
        },
      });

      if (!response.ok) {
        throw new Error(`Pinning service error: ${response.status} ${response.statusText}`);
      }

      const result = await response.json();
      
      return {
        cid: result.IpfsHash,
        size: result.PinSize,
      };
    } catch (error) {
      throw new IPFSError(`Failed to pin file to IPFS via pinning service`, { error: error.message });
    }
  }

  async unpinFile(cid: string): Promise<void> {
    try {
      const response = await fetch(`${this.apiUrl}/pinning/unpin/${cid}`, {
        method: 'DELETE',
        headers: {
          'pinata_api_key': this.apiKey,
        },
      });

      if (!response.ok) {
        throw new Error(`Pinning service unpin error: ${response.status} ${response.statusText}`);
      }
    } catch (error) {
      throw new IPFSError(`Failed to unpin file ${cid} from IPFS via pinning service`, { error: error.message });
    }
  }

  getGatewayUrl(cid: string): string {
    return `${this.gatewayUrl}/ipfs/${cid}`;
  }
}

export function createIPFSDriver(): IPFSDriver | null {
  if (!config.IPFS_ENABLED || !config.IPFS_API_URL) {
    return null;
  }

  // Determine driver type based on URL
  if (config.IPFS_API_URL.includes('pinata')) {
    const apiKey = process.env.PINATA_API_KEY;
    if (!apiKey) {
      throw new Error('PINATA_API_KEY is required when using Pinata IPFS service');
    }
    return new PinningServiceDriver(config.IPFS_API_URL, apiKey);
  } else {
    // Assume Kubo/IPFS node
    return new KuboIPFSDriver(config.IPFS_API_URL);
  }
}
