export interface PlaceOrderParams {
  side: 'BUY' | 'SELL';
  symbol: string;      // e.g. "BTCUSDT"
  quantity: string;    // decimal string, never float
}

export interface OrderResult {
  exchangeOrderId: string;
  status: 'SUBMITTED' | 'FILLED' | 'PARTIALLY_FILLED' | 'CANCELLED' | 'FAILED';
  filledQty?: string;
  filledPrice?: string;   // average price per unit — informational only, NOT a ledger amount
  quoteAmount?: string;   // total quote-asset value of the fill — this IS the ledger amount
  fees?: string;
  feeAsset?: string;
  rawResponse: unknown;
}

export interface SymbolInfo {
  symbol: string;
  minQty: string;
  qtyStep: string;
  minNotional: string;
}

export interface ExchangeAdapter {
  readonly exchangeName: string; // single source of truth for Order.exchange — see trading.service.ts
  placeOrder(params: PlaceOrderParams): Promise<OrderResult>;
  getOrderStatus(exchangeOrderId: string, symbol: string): Promise<OrderResult>;
  getSymbolInfo(symbol: string): Promise<SymbolInfo>;
  getPrice(symbol: string): Promise<string>;
}