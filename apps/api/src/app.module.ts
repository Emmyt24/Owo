import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { loadEnv } from './config/env';
import { HealthModule } from './health/health.module';
import { LedgerModule } from './ledger/ledger.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // Validate env at boot — fail fast if money-critical config is missing.
      validate: (raw) => loadEnv(raw as NodeJS.ProcessEnv),
    }),
    HealthModule,
    LedgerModule,
  ],
})
export class AppModule {}
