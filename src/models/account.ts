import { AccountType } from '../enums/account.js';

export interface Account {
  accountNo: string;
  accountType: AccountType;
}
