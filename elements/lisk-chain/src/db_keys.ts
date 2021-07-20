/*
 * Copyright © 2019 Lisk Foundation
 *
 * See the LICENSE file at the top-level directory of this distribution
 * for licensing information.
 *
 * Unless otherwise agreed in a custom licensing agreement with the Lisk Foundation,
 * no part of this software, including this file, may be copied, modified,
 * propagated, or distributed except according to the terms contained in the
 * LICENSE file.
 *
 * Removal or modification of this copyright notice is prohibited.
 */

// 1-25 for chain state
export const DB_KEY_CHAIN_STATE = Buffer.from([1]);
export const DB_KEY_CHAIN_STATE_BURNT_FEE = Buffer.from([2]);
export const DB_KEY_BLOCKS_ID = Buffer.from([3]);
export const DB_KEY_BLOCKS_HEIGHT = Buffer.from([4]);
export const DB_KEY_TRANSACTIONS_BLOCK_ID = Buffer.from([5]);
export const DB_KEY_TRANSACTIONS_ID = Buffer.from([6]);
export const DB_KEY_TEMPBLOCKS_HEIGHT = Buffer.from([7]);
export const DB_KEY_ACCOUNTS_ADDRESS = Buffer.from([8]);

// 26-50 for consensus state
export const DB_KEY_CONSENSUS_STATE = Buffer.from([26]);
export const DB_KEY_CONSENSUS_STATE_FINALIZED_HEIGHT = Buffer.from([27]);
export const DB_KEY_CONSENSUS_STATE_VALIDATORS = Buffer.from([28]);

// 51-75 for diff state
export const DB_KEY_DIFF_STATE = Buffer.from([51]);
