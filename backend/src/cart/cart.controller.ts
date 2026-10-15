import { Body, Controller, Delete, Get, Module, Param, ParseIntPipe, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiProperty, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { IsInt, Max, Min } from 'class-validator';
import { AuthUser, CurrentUser, Roles } from '../common/auth.decorators';
import { CartService } from './cart.service';

class AddToCartDto {
  @ApiProperty()
  @IsInt()
  partId: number;

  @ApiProperty({ default: 1 })
  @IsInt()
  @Min(1, { message: 'Количество — не меньше 1' })
  @Max(999)
  quantity: number;
}

class SetQuantityDto {
  @ApiProperty()
  @IsInt()
  @Min(1, { message: 'Количество — не меньше 1' })
  @Max(999)
  quantity: number;
}

@ApiTags('Корзина')
@ApiBearerAuth()
@Roles(Role.OWNER)
@Controller('cart')
export class CartController {
  constructor(private readonly cart: CartService) {}

  @Get()
  get(@CurrentUser() user: AuthUser) {
    return this.cart.get(user.id);
  }

  @Post('items')
  add(@CurrentUser() user: AuthUser, @Body() dto: AddToCartDto) {
    return this.cart.add(user.id, dto.partId, dto.quantity);
  }

  @Put('items/:partId')
  set(@CurrentUser() user: AuthUser, @Param('partId', ParseIntPipe) partId: number, @Body() dto: SetQuantityDto) {
    return this.cart.setQuantity(user.id, partId, dto.quantity);
  }

  @Delete('items/:partId')
  remove(@CurrentUser() user: AuthUser, @Param('partId', ParseIntPipe) partId: number) {
    return this.cart.remove(user.id, partId);
  }

  @Delete()
  clear(@CurrentUser() user: AuthUser) {
    return this.cart.clear(user.id);
  }

  /** «Повторить заказ»: позиции прошлого заказа — в корзину (с учётом свободного остатка). */
  @Post('repeat/:orderId')
  repeat(@CurrentUser() user: AuthUser, @Param('orderId', ParseIntPipe) orderId: number) {
    return this.cart.repeatOrder(user, orderId);
  }
}

@Module({
  controllers: [CartController],
  providers: [CartService],
  exports: [CartService],
})
export class CartModule {}
