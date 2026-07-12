import { IsEnum, IsString, Matches, IsNotEmpty } from 'class-validator';
import { OrderSide } from '@prisma/client';

// IMPORTANT — `quantity` means different things depending on `side`:
//   BUY  -> quantity is the amount of QUOTE asset to spend (e.g. USDT).
//           { side: 'BUY', symbol: 'BTCUSDT', quantity: '10' } spends $10 worth of BTC.
//   SELL -> quantity is the amount of BASE asset to sell (e.g. BTC).
//           { side: 'SELL', symbol: 'BTCUSDT', quantity: '10' } sells 10 BTC — NOT $10 worth.
// This asymmetry is intentional (matches Binance's own quoteOrderQty/quantity split)
// and is enforced in binance.adapter.ts. Do not "fix" it into a single unit
// without updating the adapter and re-verifying both sides against real orders.
export class CreateOrderDto {
  @IsEnum(OrderSide, { message: 'side must be BUY or SELL' })
  side: OrderSide;

  @IsString()
  @IsNotEmpty()
  @Matches(/^[A-Z0-9]{5,20}$/, {
    message: 'symbol must be an uppercase exchange pair, e.g. BTCUSDT',
  })
  symbol: string;

  // Kept as a string (not number) deliberately — matches how the exchange
  // adapters and Prisma.Decimal expect it, avoids floating-point precision
  // loss on quantities like "0.00015".
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d+(\.\d+)?$/, {
    message: 'quantity must be a positive decimal string, e.g. "10" or "0.0001"',
  })
  quantity: string;
}
