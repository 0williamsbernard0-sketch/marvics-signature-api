import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

const KYC_BUCKET = 'kyc-documents';

@Injectable()
export class SupabaseStorageService {
  private readonly client: SupabaseClient;

  constructor(private configService: ConfigService) {
    const url = this.configService.getOrThrow<string>('SUPABASE_URL');
    // Service role key — server-only, bypasses RLS. NEVER expose this to the
    // frontend/browser. Distinct from any anon/public key used elsewhere.
    const serviceRoleKey = this.configService.getOrThrow<string>('SUPABASE_SERVICE_ROLE_KEY');
    this.client = createClient(url, serviceRoleKey);
  }

  // Client uploads directly to this signed URL — file bytes never pass
  // through our API server.
  async createUploadUrl(path: string): Promise<{ path: string; signedUrl: string; token: string }> {
    const { data, error } = await this.client.storage.from(KYC_BUCKET).createSignedUploadUrl(path);
    if (error || !data) {
      throw new InternalServerErrorException(`Failed to create upload URL: ${error?.message}`);
    }
    return { path: data.path, signedUrl: data.signedUrl, token: data.token };
  }

  // Short-lived signed READ url for admin review — documents are private,
  // never publicly readable, and this link expires quickly.
  async createReadUrl(path: string, expiresInSeconds = 300): Promise<string> {
    const { data, error } = await this.client.storage.from(KYC_BUCKET).createSignedUrl(path, expiresInSeconds);
    if (error || !data) {
      throw new InternalServerErrorException(`Failed to create read URL: ${error?.message}`);
    }
    return data.signedUrl;
  }
}
