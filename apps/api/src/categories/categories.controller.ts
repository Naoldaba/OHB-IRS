import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { RequireCapability, CurrentUser } from '../common/decorators';
import { AuthUser } from '../common/auth-user';
import { CategoriesService } from './categories.service';
import { CreateCategoryDto, UpdateCategoryDto } from './dto';

/** Report category administration. Requires `manage_categories` (lab users get 403). */
@Controller('report-categories')
@RequireCapability('manage_categories')
export class CategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  @Get()
  list() {
    return this.categories.list();
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.categories.get(id);
  }

  @Post()
  create(@Body() dto: CreateCategoryDto, @CurrentUser() user: AuthUser) {
    return this.categories.create(dto, user.id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateCategoryDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.categories.update(id, dto, user.id);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.categories.remove(id, user.id);
  }
}
