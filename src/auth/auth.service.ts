import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { RegisterDto } from './dto/register.dto';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../users/users.service';
import { logger } from '../common/logger';
import * as argon2 from 'argon2';
import * as express from 'express';
import { JwtService } from '@nestjs/jwt';
import { TokensService } from '../tokens/tokens.service';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private config: ConfigService,
    private jwtService: JwtService,
    private tokensService: TokensService,
  ) {}

  
  async register(registerDto: RegisterDto) {
    const existingUser = await this.usersService.findByEmail(registerDto.email);

    if (existingUser) {
      throw new ConflictException('Email already exists');
    }

    const password_hash = await argon2.hash(registerDto.password, {
      type: argon2.argon2id,
    });
    const user = await this.usersService.create(
      registerDto.email,
      password_hash,
      registerDto.name,
      registerDto.role,
    );

    return { id: user._id, email: user.email, roles: user.roles };
  }

  async login(
    email: string,
    password: string,
    res: express.Response,
    req: express.Request,
  ) {
    const user = await this.usersService.findByEmailWithPasswordHash(email);
    if (!user) {
      logger.error('Login failed: User not found', {
        email,
        correlationId: req.correlationId,
      });
      throw new UnauthorizedException('Invalid credentials');
    }

    const valid = await argon2.verify(user.password_hash, password);
    if (!valid) {
      logger.error('Login failed: Password Not Match', {
        email,
        correlationId: req.correlationId,
      });
      throw new UnauthorizedException('Invalid credentials');
    }

    const access_token = this.jwtService.sign({
      sub: user._id,
      email: user.email,
      name: user.name,
      roles: user.roles,
    });

    const session_id = crypto.randomUUID();
    const payload = {
      sub: user._id,
      email: email,
      name: user.name,
      roles: user.roles,
      session_id,
    };
    const refresh_token = this.jwtService.sign(payload, {
      secret: this.config.get<string>('REFRESH_SECRET'),
      expiresIn: '7d',
    });

    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    res.cookie('refresh_token', refresh_token, {
      httpOnly: true, // JavaScript on the page CANNOT read this cookie
      secure: this.config.get<string>('NODE_ENV') === 'production', // ← false in dev, true in prod
      sameSite: 'strict', // not sent on cross-site requests (CSRF protection)
      expires: expiresAt,
    });

    await this.tokensService.create(
      user._id.toString(),
      refresh_token,
      expiresAt,
      session_id,
    );
    logger.info('Login successful', {
      email,
      userId: user._id,
      correlationId: req.correlationId,
    });
    return { access_token, name: user.name, roles: user.roles };
  }
}
