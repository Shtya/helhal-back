import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Controller, Get, HostParam, Inject } from '@nestjs/common';
import { Cache } from 'cache-manager';
import { RedisService } from '../common/RedisService';

@Controller({}) // Handle requests for api.example.com
export class ApiController {
  constructor(private readonly redisService: RedisService) { }

  @Get()
  async getApi() {
    await this.redisService.set('test_key', 'it_works');
    console.log('Saved to cache:', await this.redisService.get('test_key'));
    return 'Welcome to the API subdomain!';
  }
}
