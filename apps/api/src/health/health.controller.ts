import { Controller, Get } from '@nestjs/common';

@Controller('health')
export class HealthController {
  @Get()
  check() {
    return {
      status: 'ok' as const,
      service: 'owo-api',
      version: process.env.npm_package_version ?? '0.0.0',
    };
  }
}
