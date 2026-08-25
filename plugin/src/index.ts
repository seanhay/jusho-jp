export { PostcodeClient, type ClientOptions } from './client.ts';
export { autofill, type AutofillOptions, type AutofillHandle, type Script } from './autofill.ts';
export { discover, readPostcode, type FieldSet } from './discover.ts';
export { setValue, selectPrefecture, type Field } from './dom.ts';
export { normalisePostcode, toHiragana } from '../../shared/src/expand.ts';
export type { Address, Lookup, TownVariant, Script as AddressScript } from '../../shared/src/types.ts';
