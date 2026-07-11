export interface PlaceOrderParams {
  side: 'BUY' | 'SELL';
  symbol: string;      // e.g. "BTCUSDT"
  quantity: string;    // decimal string, never float
}

export interface OrderResult {
  exchangeOrderId: string;
  status: 'SUBMITTED' | 'FILLED' | 'PARTIALLY_FILLED' | 'FAILED' | 'CANCELLED';
  filledQty?: string;
  filledPrice?: string;
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
  placeOrder(params: PlaceOrderParams): Promise<OrderResult>;
  getOrderStatus(exchangeOrderId: string, symbol: string): Promise<OrderResult>;
  getSymbolInfo(symbol: string): Promise<SymbolInfo>;
}