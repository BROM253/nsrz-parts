import {
  Body,
  Controller,
  Get,
  Header,
  Module,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { Availability } from '@prisma/client';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { AuthUser, CurrentUser, Roles } from '../common/auth.decorators';
import { STAFF_ROLES } from '../common/domain';
import { PartQueryDto } from '../catalog/catalog.controller';
import { StockService } from './stock.service';

class UpdateStockDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsInt({ message: 'Количество — целое число' })
  @Min(0, { message: 'Количество не может быть отрицательным' })
  @Max(1_000_000)
  quantity?: number;

  @ApiPropertyOptional({ enum: Availability })
  @IsOptional()
  @IsEnum(Availability)
  availability?: Availability;
}

class StockQueryDto extends PartQueryDto {
  @ApiPropertyOptional({ default: 25 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  declare pageSize?: number;
}

@ApiTags('Панель НСРЗ: остатки')
@ApiBearerAuth()
@Roles(...STAFF_ROLES)
@Controller('panel/stock')
export class StockController {
  constructor(private readonly stock: StockService) {}

  @Get()
  list(@Query() query: StockQueryDto) {
    return this.stock.list(query);
  }

  @Get('imports')
  imports() {
    return this.stock.imports();
  }

  @Get('template.csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', `attachment; filename="ostatki.csv"; filename*=UTF-8''${encodeURIComponent('остатки-шаблон.csv')}`)
  async template() {
    return new StreamableFile(Buffer.from(await this.stock.template(), 'utf8'));
  }

  @Patch(':partId')
  update(@CurrentUser() user: AuthUser, @Param('partId', ParseIntPipe) partId: number, @Body() dto: UpdateStockDto) {
    return this.stock.update(partId, dto, user);
  }

  @Post('import')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }))
  import(@CurrentUser() user: AuthUser, @UploadedFile() file?: Express.Multer.File) {
    return this.stock.import(file, user);
  }
}

@Module({
  controllers: [StockController],
  providers: [StockService],
})
export class StockModule {}
