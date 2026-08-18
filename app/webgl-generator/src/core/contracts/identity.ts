declare const runtimeMapSessionIdBrand: unique symbol;
declare const persistedDocumentIdBrand: unique symbol;
declare const renderPreparationIdBrand: unique symbol;
declare const headlessDocumentIdBrand: unique symbol;
declare const operationIdBrand: unique symbol;
declare const transactionIdBrand: unique symbol;
declare const commitIdBrand: unique symbol;
declare const checksumBrand: unique symbol;
declare const lockFingerprintBrand: unique symbol;

export type RuntimeMapSessionId = string & {readonly [runtimeMapSessionIdBrand]: true};
export type PersistedDocumentId = string & {readonly [persistedDocumentIdBrand]: true};
export type RenderPreparationId = string & {readonly [renderPreparationIdBrand]: true};
export type HeadlessDocumentId = string & {readonly [headlessDocumentIdBrand]: true};
export type OperationId = string & {readonly [operationIdBrand]: true};
export type TransactionId = string & {readonly [transactionIdBrand]: true};
export type CommitId = string & {readonly [commitIdBrand]: true};
export type Checksum = string & {readonly [checksumBrand]: true};
export type LockFingerprint = string & {readonly [lockFingerprintBrand]: true};
