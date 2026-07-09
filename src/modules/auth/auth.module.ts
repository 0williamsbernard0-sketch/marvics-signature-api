import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { JwtStrategy } from './strategies/jwt.strategy';
import { AuthService } from './auth.service';
import { MeController } from './me.controller';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PassportModule, PrismaModule],
  controllers: [MeController],
  providers: [JwtStrategy, AuthService],
  exports: [AuthService],
})
export class AuthModule {}