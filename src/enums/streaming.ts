export enum StreamingMethod {
  SUBSCRIBE = 'subscribe',
  UNSUBSCRIBE = 'unsubscribe',
  PING_PONG = 'ping_pong',
  LIST_SUBSCRIPTION = 'list_subscription',
}

export enum StreamingChannel {
  DATA = 'DATA',
  HEARTBEAT = 'HEARTBEAT',
  TRADING = 'TRADING',
}

export enum StreamingType {
  ORDER = 'orderEvent',
  ORDER_MATCH = 'orderMatchEvent',
  PORTFOLIO = 'clientPortfolioEvent',
}

export enum DataTopic {
  QUOTE = 'quote.',
  TRADE = 'trade.',
  ODD_LOT = 'oddlot.',
  MARKET = 'market.',
  ROOM = 'room.',
  PUT = 'put.',
}

export enum DataType {
  QUOTE = 'quote',
  TRADE = 'trade',
  ODD_LOT = 'oddlot',
  MARKET = 'market',
  ROOM = 'room',
  PUT = 'put',
}
