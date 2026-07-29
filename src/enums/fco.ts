/** Flexible Conditional Order (FCO) Enums for SSI. */

export enum FCOType {
  GTD = 'gtd',
  STOP = 'stop',
  STOP_LIMIT = 'stop_limit',
  TRAILING_STOP = 'trailing_stop',
  TRAILING_STOP_LIMIT = 'trailing_stop_limit',
  OCO = 'oco',
  BULL_BEAR = 'bullbear',
}

export enum FCOOperator {
  GREATER = 'greater',
  GREATER_OR_EQUAL = 'greater_or_equal',
  LESSER = 'lesser',
  LESSER_OR_EQUAL = 'lesser_or_equal',
  EQUAL = 'equal',
}

export enum FCOStatus {
  INIT = 'INIT',
  WAIT = 'WAIT',
  TRI = 'TRI',
  TRIT = 'TRIT',
  TER = 'TER',
  FIS = 'FIS',
  WC = 'WC',
  EXP = 'EXP',
  ERR = 'ERR',
}
