import { Body, Controller, Get, HttpCode, Module, Post } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { ApiBearerAuth, ApiProperty, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { IsString, Length, Matches } from 'class-validator';
import { AuthUser, CurrentUser, Public } from '../common/auth.decorators';
import { AuthService } from './auth.service';

class RequestCodeDto {
  @ApiProperty({ example: '+7 900 000-00-01', description: 'Номер телефона или корпоративная почта' })
  @IsString()
  @Length(5, 120)
  login: string;
}

class VerifyDto extends RequestCodeDto {
  @ApiProperty({ example: '1234' })
  @IsString()
  @Matches(/^\s*\d{4,6}\s*$/, { message: 'Код — 4 цифры' })
  code: string;
}

class RefreshDto {
  @ApiProperty()
  @IsString()
  @Length(20, 200)
  refreshToken: string;
}

@ApiTags('Вход')
@Controller()
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  // код на один и тот же логин и так не чаще раза в 30 с (AuthService); здесь — защита от перебора логинов
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('auth/request-code')
  @HttpCode(200)
  requestCode(@Body() dto: RequestCodeDto) {
    return this.auth.requestCode(dto.login);
  }

  @Public()
  @Throttle({ default: { limit: 40, ttl: 60_000 } })
  @Post('auth/verify')
  @HttpCode(200)
  verify(@Body() dto: VerifyDto) {
    return this.auth.verify(dto.login, dto.code);
  }

  @Public()
  @Post('auth/refresh')
  @HttpCode(200)
  refresh(@Body() dto: RefreshDto) {
    return this.auth.refresh(dto.refreshToken);
  }

  @Public()
  @Post('auth/logout')
  @HttpCode(200)
  logout(@Body() dto: RefreshDto) {
    return this.auth.logout(dto.refreshToken);
  }

  @ApiBearerAuth()
  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.auth.profile(user.id);
  }
}

@Module({
  imports: [
    JwtModule.registerAsync({
      global: true,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({ secret: config.getOrThrow<string>('JWT_SECRET') }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService],
})
export class AuthModule {}
