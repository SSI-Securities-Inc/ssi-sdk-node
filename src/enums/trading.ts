export enum OrderSide {
  BUY = 'B',
  SELL = 'S',
}

export enum OrderType {
  ATO = 'ATO',
  ATC = 'ATC',
  LO = 'LO',
  MTL = 'MTL',
  MP = 'MP',
  MOK = 'MOK',
  MAK = 'MAK',
  PLO = 'PLO',
}

export enum OrderStatus {
  PENDING = 'PD',
  PENDING_APPROVAL = 'WA',
  READY = 'RS',
  SENT = 'SD',
  QUEUED = 'QU',
  FILLED = 'FF',
  PARTIAL_FILLED = 'PF',
  PARTIAL_CANCELLED = 'FFPC',
  PENDING_MODIFY = 'WM',
  PENDING_CANCEL = 'WC',
  CANCELLED = 'CL',
  REJECTED = 'RJ',
  EXPIRED = 'EX',
  PRE_SESSION = 'IAV',
}
