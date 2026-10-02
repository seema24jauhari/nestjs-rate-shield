import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { RedisModule } from '../redis/redis.module';   // <- Module, not Service
import { AuthService } from './auth.service';
import { UsersModule } from 'src/users/users.module';
import { MongooseModule } from '@nestjs/mongoose';
import { User, UserSchema } from 'src/users/schemas/user.schema';
import { JwtModule } from '@nestjs/jwt/dist/jwt.module';
import { ConfigService } from '@nestjs/config/dist/config.service';
import { PassportModule } from '@nestjs/passport';
import { TokensModule } from 'src/tokens/tokens.module';


@Module({
  controllers: [AuthController],
  imports: [
      JwtModule.registerAsync({
        inject: [ConfigService],
        useFactory: (config: ConfigService) => ({
          secret: config.getOrThrow<string>('JWT_SECRET'),
          signOptions: {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            expiresIn: (config.get<string>('JWT_EXPIRY') ?? '15m') as any,
          },
        }),
      }),
      RedisModule,
      UsersModule,
      TokensModule,
      PassportModule,
      MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
    ]),
  ],
  providers: [AuthService],
})
export class AuthModule {}
