import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as crypto from 'crypto';
import { Token } from './schemas/token.schema';

@Injectable()
export class TokensService {
  constructor(@InjectModel(Token.name) private tokenModel: Model<Token>) {}

  private hash(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  // Save a new refresh token when issued at login
  async create(
    userId: string,
    refreshToken: string,
    expiresAt: Date,
    session_id: string,
  ) {
    return this.tokenModel.create({
      user_id: userId,
      refresh_token_hash: this.hash(refreshToken),
      expires_at: expiresAt,
      revoked: false,
      session_id,
    });
  }

  // Check if a given refresh token is still valid (exists, not revoked)
  async isValid(refreshToken: string): Promise<boolean> {
    const record = await this.tokenModel.findOne({
      refresh_token_hash: this.hash(refreshToken),
      revoked: false,
    });
    return !!record;
  }

  // Revoke on logout or rotation
  async revoke(refreshToken: string) {
    await this.tokenModel.updateOne(
      { refresh_token_hash: this.hash(refreshToken) },
      { revoked: true },
    );
  }

  // Kill only this one session/device, not the whole user
  async revokeFamily(sessionId: string) {
    await this.tokenModel.updateMany(
      { session_id: sessionId, revoked: false },
      { $set: { revoked: true } },
    );
  }
}
