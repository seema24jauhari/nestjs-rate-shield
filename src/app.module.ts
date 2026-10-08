import { MiddlewareConsumer, Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { RedisModule } from './redis/redis.module';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { UsersModule } from './users/users.module';
import { CorrelationIdMiddleware } from './common/middleware/correlation-id.middleware';
import { TokensModule } from './tokens/tokens.module';
import { OtpModule } from './otp/otp.module';
import { AdminModule } from './admin/admin.module';
import { MetricsModule } from './metrics/metrics.module';
import { APP_GUARD } from '@nestjs/core';
import { BlacklistGuard } from './common/gaurds/blacklist.guard';
import { IpListService } from './common/services/ip-list.service';
import { CommonModule } from './common/common.module';

@Module({
  imports: [
    AuthModule,
    RedisModule,
    ConfigModule.forRoot({ isGlobal: true }),
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        uri: config.get<string>('DATABASE_URI'),
      }),
    }),
    UsersModule,
    TokensModule,
    OtpModule,
    AdminModule,
    MetricsModule,
    CommonModule
  ],
  controllers: [AppController],
  providers: [AppService, { provide: APP_GUARD, useClass: BlacklistGuard }],
})
export class AppModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(CorrelationIdMiddleware).forRoutes('*');
  }
}
