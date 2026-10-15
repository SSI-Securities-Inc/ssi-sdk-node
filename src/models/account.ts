import { AccountType } from '../enums/account.js';
import { fromValue } from '../utils/converter.js';

/** Accessible trading account. */
export interface Account {
  accountNo: string;
  /** An `AccountType`, the raw value for an unknown type, or undefined when omitted. */
  accountType?: AccountType | string | number;
}

function accountTypeOf(raw: unknown): Account['accountType'] {
  if (raw === null || raw === undefined) return undefined;
  return (fromValue(AccountType, raw) ?? raw) as Account['accountType'];
}

/**
 * Build accounts from server items. `accountType` is the matching `AccountType`, the raw value
 * when the server sends one this SDK does not know (e.g. `"2"`), and undefined when missing (an empty string stays `""`).
 */
export function accountsFromList(data: Array<Record<string, unknown>>): Account[] {
  return data.map((item) => ({
    accountNo: typeof item.accountNo === 'string' ? item.accountNo : '',
    accountType: accountTypeOf(item.accountType),
  }));
}
