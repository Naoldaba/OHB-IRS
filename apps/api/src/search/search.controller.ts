import { Controller, Get, Query } from '@nestjs/common';
import { CurrentUser } from '../common/decorators';
import { AuthUser } from '../common/auth-user';
import { SearchService } from './search.service';
import { SearchQueryDto } from './dto';

/**
 * Cross-entity search. Available to any authenticated user; the service scopes
 * results by role/lab (a lab head only ever matches its own laboratory's
 * submissions and feedback). No @Roles — both roles may search.
 */
@Controller('search')
export class SearchController {
  constructor(private readonly search: SearchService) {}

  @Get()
  run(@Query() dto: SearchQueryDto, @CurrentUser() user: AuthUser) {
    return this.search.search(user, dto);
  }
}
